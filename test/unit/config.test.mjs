import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWranglerConfig } from "../../scripts/generate-wrangler-config.mjs";
import { PROJECT } from "../../scripts/lib/cloudflare.mjs";
import { REQUIRED_D1_TABLES } from "../../shared/schema-manifest.js";

const ROOT = new URL("../../", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

async function read(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, ROOT)), "utf8");
}

test("deployment preflight uses the shared D1 table manifest", () => {
  assert.equal(PROJECT.requiredD1Tables, REQUIRED_D1_TABLES);
  assert.equal(REQUIRED_D1_TABLES.length, 15);
  assert.ok(REQUIRED_D1_TABLES.includes("autocomplete_limiter"));
  assert.ok(REQUIRED_D1_TABLES.includes("provider_credential_limiter"));
  assert.ok(REQUIRED_D1_TABLES.includes("application_settings"));
  assert.ok(REQUIRED_D1_TABLES.includes("web_push_subscriptions"));
  assert.ok(REQUIRED_D1_TABLES.includes("health_check_runs"));
  assert.ok(REQUIRED_D1_TABLES.includes("admin_audit_events"));
});

test("the Worker template keeps the Worker private with a cron and D1 binding", async () => {
  const config = await read("wrangler.worker.example.toml");
  assert.match(config, /^workers_dev\s*=\s*false$/m, "workers.dev must stay disabled");
  assert.match(config, /^preview_urls\s*=\s*false$/m, "Worker preview URLs must stay disabled");
  assert.match(config, /^crons\s*=\s*\[/m);
  assert.match(config, /^binding\s*=\s*"DB"$/m);
  assert.match(config, /^binding\s*=\s*"CREDENTIAL_ADMIN"$/m);
  assert.match(config, /EMAIL_TRANSPORT_SECRET/);
  assert.match(config, /PUSHOVER_TRANSPORT_SECRET/);
  assert.match(config, /WEBHOOK_TRANSPORT_SECRET/);
  assert.match(config, /WEB_PUSH_VAPID_PRIVATE/);
  assert.match(config, /SUNSETHUE_WEBHOOK_TRANSPORT/);
  assert.match(config, /SUNSETHUE_WEB_PUSH_VAPID/);
  assert.match(config, /database_id\s*=\s*"\{\{D1_DATABASE_ID\}\}"/);
  assert.doesNotMatch(config, /migrations_dir/, "versioned migrations are not used");
  assert.doesNotMatch(config, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test("the credential-admin template stays private with Secrets Store bindings", async () => {
  const config = await read("wrangler.credential-admin.example.toml");
  assert.match(config, /^workers_dev\s*=\s*false$/m);
  assert.match(config, /^preview_urls\s*=\s*false$/m);
  assert.match(config, /worker\/credential-admin\/index\.js/);
  assert.match(config, /EMAIL_TRANSPORT_SECRET/);
  assert.match(config, /PUSHOVER_TRANSPORT_SECRET/);
  assert.doesNotMatch(config, /^[[:space:]]*CLOUDFLARE_API_TOKEN[[:space:]]*=/m);
});
test("the Pages template binds the Worker as a private service", async () => {
  const config = await read("wrangler.example.toml");
  assert.match(config, /^pages_build_output_dir\s*=/m);
  assert.match(config, /^binding\s*=\s*"API_SERVICE"$/m);
  assert.match(config, /^service\s*=\s*"\{\{WORKER_NAME\}\}"$/m);
  assert.match(config, /\[env\.preview\]/, "preview keeps its own binding so /api fails closed");
});

test("generated Wrangler configs satisfy privacy and binding invariants", async () => {
  const temp = await mkdtemp(join(tmpdir(), "sunsethue-config-"));
  try {
    await writeFile(
      join(temp, "wrangler.example.toml"),
      await read("wrangler.example.toml")
    );
    await writeFile(
      join(temp, "wrangler.worker.example.toml"),
      await read("wrangler.worker.example.toml")
    );
    await writeFile(
      join(temp, "wrangler.credential-admin.example.toml"),
      await read("wrangler.credential-admin.example.toml")
    );

    await generateWranglerConfig({ strict: false, root: temp });
    const pages = await readFile(join(temp, "wrangler.toml"), "utf8");
    const worker = await readFile(join(temp, "wrangler.worker.toml"), "utf8");
    const admin = await readFile(join(temp, "wrangler.credential-admin.toml"), "utf8");

    assert.match(worker, /^workers_dev\s*=\s*false$/m);
    assert.match(worker, /^preview_urls\s*=\s*false$/m);
    assert.match(worker, /^binding\s*=\s*"DB"$/m);
    assert.match(worker, /^binding\s*=\s*"CREDENTIAL_ADMIN"$/m);
    assert.match(admin, /^workers_dev\s*=\s*false$/m);
    assert.match(admin, /^preview_urls\s*=\s*false$/m);
    assert.match(pages, /^binding\s*=\s*"API_SERVICE"$/m);
    assert.match(pages, /^service\s*=\s*"sunsethue-helper-worker"$/m);
    assert.doesNotMatch(pages + worker + admin, /\{\{[A-Z0-9_]+\}\}/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("no secret is committed as a plaintext Wrangler var", async () => {
  const configs = await Promise.all([
    read("wrangler.example.toml"),
    read("wrangler.worker.example.toml"),
    read("wrangler.credential-admin.example.toml")
  ]);
  const forbidden = [
    "SUNSETHUE_API_KEY",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "EMAIL_TO",
    "AUTHORIZED_EMAIL",
    "CONTACT_EMAIL",
    "TEAM_DOMAIN",
    "POLICY_AUD",
    "CLOUDFLARE_API_TOKEN"
  ];

  for (const config of configs) {
    for (const name of forbidden) {
      assert.doesNotMatch(
        config,
        new RegExp(`^\\s*${name}\\s*=`, "m"),
        `${name} must not be a plaintext Wrangler var`
      );
    }
  }
});

test("Pages Functions only intercept /api/*", async () => {
  const routes = JSON.parse(await read("public/_routes.json"));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ["/api/*"]);
});

test("the frontend makes same-origin API calls", async () => {
  const clientJs = await read("public/lib/api-client.js");
  assert.match(clientJs, /const API_BASE = ""/);
  assert.doesNotMatch(clientJs, /workers\.dev/);
  const appJs = await read("public/app.js");
  assert.doesNotMatch(appJs, /workers\.dev/);
});

test("no tracked source or config references a public workers.dev API origin", async () => {
  const files = [
    "public/app.js",
    "public/lib/api-client.js",
    "public/_routes.json",
    "wrangler.example.toml",
    "wrangler.worker.example.toml",
    "package.json",
    ".dev.vars.example",
    ".env.example",
    "scripts/dev.sh",
    "scripts/validate-wrangler.sh",
    ".github/workflows/validate.yml",
    ".github/workflows/production.yml",
    ".github/workflows/rollback.yml"
  ];

  for (const file of files) {
    const contents = await read(file);
    assert.doesNotMatch(contents, /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i, file);
  }
});

test("the Node version is consistent across the toolchain", async () => {
  const nvmrc = (await read(".nvmrc")).trim();
  const nodeVersion = (await read(".node-version")).trim();
  const pkg = JSON.parse(await read("package.json"));

  assert.equal(nvmrc, nodeVersion, ".nvmrc and .node-version must agree");
  assert.equal(pkg.engines.node, `>=${nvmrc}`, "package.json engines must match .nvmrc");

  for (const workflow of ["validate.yml", "production.yml", "rollback.yml", "security.yml"]) {
    const contents = await read(`.github/workflows/${workflow}`);
    assert.match(
      contents,
      /node-version-file: \.nvmrc/,
      `${workflow} must read the Node version from .nvmrc`
    );
    assert.doesNotMatch(
      contents,
      /node-version: ['"]?\d/,
      `${workflow} must not hard-code a Node version`
    );
  }
});

test("Wrangler is pinned exactly and every workflow uses that version", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const pinned = pkg.devDependencies.wrangler;
  assert.match(pinned, /^\d+\.\d+\.\d+$/, "wrangler must be pinned to an exact version");

  const production = await read(".github/workflows/production.yml");
  const versionsInWorkflow = [...production.matchAll(/wranglerVersion:\s*"([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.ok(versionsInWorkflow.length > 0, "the deployment workflow must pin wranglerVersion");
  for (const version of versionsInWorkflow) {
    assert.equal(version, pinned, "wrangler-action must use the pinned project version");
  }
});

test("the reusable validation workflow is the only place lint and test commands are defined", async () => {
  const production = await read(".github/workflows/production.yml");
  assert.match(production, /uses: \.\/\.github\/workflows\/validate\.yml/);
  assert.doesNotMatch(production, /npm run lint/, "production must not redefine lint");
  assert.doesNotMatch(production, /npm run test/, "production must not redefine tests");
  assert.doesNotMatch(production, /npm run audit/, "production must not redefine the audit");
});

test("the commit-message fixer and its scripts are gone", async () => {
  const workflows = await readdir(fileURLToPath(new URL(".github/workflows/", ROOT)));
  assert.equal(workflows.includes("fix-commit-messages.yml"), false);

  const scripts = await readdir(fileURLToPath(new URL("scripts/", ROOT)));
  assert.equal(scripts.includes("fix-commit-messages.sh"), false);
  assert.equal(scripts.includes("wrap-commit-message.js"), false);

  for (const workflow of workflows) {
    const contents = await read(`.github/workflows/${workflow}`);
    assert.doesNotMatch(contents, /git push/, `${workflow} must not push`);
    assert.doesNotMatch(contents, /filter-branch|--force-with-lease|push --force/, workflow);
  }
});

test("schema.sql is the single source of schema truth", async () => {
  const rootEntries = await readdir(ROOT_PATH);
  assert.ok(rootEntries.includes("schema.sql"), "schema.sql must exist at the repository root");
  assert.equal(rootEntries.includes("migrations"), false, "migrations/ must not remain");
});

test("local development defaults to fail-closed bypass and uses placeholders only", async () => {
  const example = await read(".dev.vars.example");
  const devScript = await read("scripts/dev.sh");
  assert.match(example, /^DEV_AUTH_BYPASS=false$/m);
  assert.match(devScript, /export DEV_AUTH_BYPASS="\$\{DEV_AUTH_BYPASS:-false\}"/);
  assert.match(example, /AUTHORIZED_EMAIL=owner@example\.com/);
  assert.doesNotMatch(example, /eyJ[A-Za-z0-9_-]{10,}\./, "no JWT may be committed");
  assert.doesNotMatch(example, /[0-9a-f]{32,}/, "no real audience tag or token may be committed");
});

test("generated Wrangler configs are gitignored and not tracked", async () => {
  const gitignore = await read(".gitignore");
  assert.match(gitignore, /^wrangler\.toml$/m);
  assert.match(gitignore, /^wrangler\.worker\.toml$/m);

  const tracked = execFileSync("git", ["ls-files", "wrangler.toml", "wrangler.worker.toml"], {
    cwd: ROOT_PATH,
    encoding: "utf8"
  }).trim();
  assert.equal(tracked, "", "generated Wrangler configs must not be tracked");

  const templates = execFileSync(
    "git",
    ["ls-files", "wrangler.example.toml", "wrangler.worker.example.toml"],
    { cwd: ROOT_PATH, encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(templates, ["wrangler.example.toml", "wrangler.worker.example.toml"]);
});

test("gitignore ignores secrets and preserves intentional examples", async () => {
  const gitignore = await read(".gitignore");
  for (const pattern of [
    ".env*",
    "!.env.example",
    ".dev.vars*",
    "!.dev.vars.example",
    "*.pem",
    "*.key",
    "*.sqlite",
    "cloudflare-state/",
    "rollback-snapshots/"
  ]) {
    assert.match(
      gitignore,
      new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
      `missing gitignore pattern: ${pattern}`
    );
  }

  const ignored = execFileSync("git", ["check-ignore", "-v", ".env", ".dev.vars", "secret.pem"], {
    cwd: ROOT_PATH,
    encoding: "utf8"
  });
  assert.match(ignored, /\.env\*/);
  assert.match(ignored, /\.dev\.vars\*/);
  assert.match(ignored, /\*\.pem/);

  let exampleExit = 0;
  try {
    execFileSync("git", ["check-ignore", "-v", ".env.example", ".dev.vars.example"], {
      cwd: ROOT_PATH,
      encoding: "utf8"
    });
  } catch (error) {
    exampleExit = error.status ?? 1;
  }
  assert.equal(exampleExit, 1, "example env files must not be ignored");
});

test("production generates Wrangler config strictly and keeps the D1 id in secrets", async () => {
  const production = await read(".github/workflows/production.yml");
  assert.match(production, /npm run config:generate:strict/);
  assert.match(production, /secrets\.D1_DATABASE_ID/);
  assert.doesNotMatch(production, /vars\.D1_DATABASE_ID/);
  assert.match(production, /vars\.PAGES_PROJECT_NAME/);
  assert.match(production, /vars\.PRODUCTION_URL/);
  assert.match(production, /vars\.SECRETS_STORE_ID/);
  assert.match(production, /vars\.CREDENTIAL_ADMIN_WORKER_NAME/);
  assert.match(production, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(production, /secrets-store:preflight/);
  assert.match(production, /wrangler\.credential-admin\.toml/);
  assert.match(production, /--target=admin/);
  // Every config:generate:strict step must receive Secrets Store inputs (Pages/verify included).
  const generateBlocks = production.split("npm run config:generate:strict");
  assert.ok(generateBlocks.length >= 5, "expected multiple strict generate steps");
  for (let i = 0; i < generateBlocks.length - 1; i += 1) {
    const envBlock = generateBlocks[i].slice(generateBlocks[i].lastIndexOf("env:"));
    assert.match(envBlock, /SECRETS_STORE_ID/);
    assert.match(envBlock, /CREDENTIAL_ADMIN_WORKER_NAME/);
    assert.match(envBlock, /CLOUDFLARE_ACCOUNT_ID/);
  }
});

test("tracked sources do not embed personal emails or a committed D1 UUID", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT_PATH, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((path) => path && path !== "CHANGELOG.md");

  const personalEmail = /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const committedDatabaseId = /^\s*database_id\s*=\s*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/im;

  for (const path of tracked) {
    // Binary / lock files and package metadata are skipped for the email scan.
    if (
      path.endsWith(".png") ||
      path.endsWith(".lock") ||
      path === "package-lock.json"
    ) {
      continue;
    }
    let contents;
    try {
      contents = await readFile(join(ROOT_PATH, path), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    assert.doesNotMatch(contents, committedDatabaseId, path);
    // smtp.gmail.com is a service host, not a personal mailbox.
    const withoutServiceHosts = contents.replace(/smtp\.gmail\.com/g, "smtp.example.com");
    assert.doesNotMatch(withoutServiceHosts, personalEmail, path);
  }
});

test("package metadata is private, MIT-licensed, and points at the GitHub homepage", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const license = await read("LICENSE");

  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Andrew Tryder/);
  assert.equal(pkg.repository?.url, "git+https://github.com/andrewtryder/sunsethue-helper.git");
  assert.equal(pkg.bugs?.url, "https://github.com/andrewtryder/sunsethue-helper/issues");
  assert.equal(pkg.homepage, "https://github.com/andrewtryder/sunsethue-helper#readme");
  assert.doesNotMatch(pkg.homepage, /\.pages\.dev/);
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
});

test("gitignore ignores the local release-audit needles file", async () => {
  const gitignore = await read(".gitignore");
  assert.match(gitignore, /^\.release-audit\.local\.json$/m);
});
