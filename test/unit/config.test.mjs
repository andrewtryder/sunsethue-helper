import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);

async function read(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, ROOT)), "utf8");
}

test("the Worker stays private and keeps its cron trigger", async () => {
  const config = await read("wrangler.worker.toml");
  assert.match(config, /^workers_dev\s*=\s*false$/m, "workers.dev must stay disabled");
  assert.match(config, /^preview_urls\s*=\s*false$/m, "Worker preview URLs must stay disabled");
  assert.match(config, /^crons\s*=\s*\[/m);
  assert.match(config, /^binding\s*=\s*"DB"$/m);
  assert.match(config, /^migrations_dir\s*=\s*"migrations"$/m);
});

test("the Pages project binds the Worker as a private service", async () => {
  const config = await read("wrangler.toml");
  assert.match(config, /^pages_build_output_dir\s*=/m);
  assert.match(config, /^binding\s*=\s*"API_SERVICE"$/m);
  assert.match(config, /^service\s*=\s*"sunsethue-helper-worker"$/m);
  assert.match(config, /\[env\.preview\]/, "preview keeps its own binding so /api fails closed");
});

test("no secret is committed as a plaintext Wrangler var", async () => {
  const configs = await Promise.all([read("wrangler.toml"), read("wrangler.worker.toml")]);
  const forbidden = [
    "SUNSETHUE_API_KEY",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "EMAIL_TO",
    "AUTHORIZED_EMAIL",
    "TEAM_DOMAIN",
    "POLICY_AUD"
  ];

  for (const config of configs) {
    for (const name of forbidden) {
      assert.doesNotMatch(
        config,
        new RegExp(`^\\s*${name}\\s*=`, "m"),
        `${name} must be a Worker secret, not a committed var`
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
  const appJs = await read("public/app.js");
  assert.match(appJs, /const API_BASE = ""/);
  assert.doesNotMatch(appJs, /workers\.dev/);
});

test("no tracked source or config references a public workers.dev API origin", async () => {
  const files = [
    "public/app.js",
    "public/_routes.json",
    "wrangler.toml",
    "wrangler.worker.toml",
    "package.json",
    ".dev.vars.example",
    "scripts/dev.sh",
    "scripts/validate-wrangler.sh",
    ".github/workflows/validate.yml",
    ".github/workflows/production.yml",
    ".github/workflows/rollback.yml",
    ".github/workflows/zero-trust.yml"
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

  for (const workflow of ["validate.yml", "production.yml", "rollback.yml", "zero-trust.yml"]) {
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

test("versioned migrations replaced the unrestricted schema script", async () => {
  const rootEntries = await readdir(fileURLToPath(ROOT));
  assert.equal(rootEntries.includes("schema.sql"), false, "schema.sql must not be reintroduced");

  const migrations = await readdir(fileURLToPath(new URL("migrations/", ROOT)));
  assert.ok(migrations.some((entry) => entry.endsWith(".sql")));
});

test("the local development example uses placeholders only", async () => {
  const example = await read(".dev.vars.example");
  assert.match(example, /DEV_AUTH_BYPASS/);
  assert.doesNotMatch(example, /eyJ[A-Za-z0-9_-]{10,}\./, "no JWT may be committed");
  assert.doesNotMatch(example, /[0-9a-f]{32,}/, "no real audience tag or token may be committed");
});
