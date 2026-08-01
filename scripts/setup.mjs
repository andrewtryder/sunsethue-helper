#!/usr/bin/env node
/**
 * Interactive setup orchestrator. Never collects Gmail/Pushover secrets.
 *
 * Usage:
 *   node scripts/setup.mjs
 *   node scripts/setup.mjs --yes   # use non-secret defaults already in env
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const YES = process.argv.includes("--yes");

function run(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    ...opts
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
  }
}

async function prompt(rl, question, { defaultValue = "", secret = false } = {}) {
  if (YES && defaultValue) return defaultValue;
  if (secret) {
    throw new Error("Setup never collects provider secrets in the terminal. Configure Gmail/Pushover in the UI.");
  }
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function ensureEnv(rl) {
  const envPath = resolve(ROOT, ".env");
  let existing = "";
  if (existsSync(envPath)) {
    existing = await readFile(envPath, "utf8");
  }
  const get = (name) => {
    const match = existing.match(new RegExp(`^${name}=(.*)$`, "m"));
    return match ? match[1].trim() : process.env[name] || "";
  };

  const values = {
    CLOUDFLARE_ACCOUNT_ID: await prompt(rl, "Cloudflare account id", { defaultValue: get("CLOUDFLARE_ACCOUNT_ID") }),
    PAGES_PROJECT_NAME: await prompt(rl, "Pages project name", { defaultValue: get("PAGES_PROJECT_NAME") || "sunsethue-helper" }),
    WORKER_NAME: await prompt(rl, "API Worker name", { defaultValue: get("WORKER_NAME") || "sunsethue-helper-worker" }),
    CREDENTIAL_ADMIN_WORKER_NAME: await prompt(rl, "Credential-admin Worker name", {
      defaultValue: get("CREDENTIAL_ADMIN_WORKER_NAME") || "sunsethue-helper-credential-admin"
    }),
    D1_DATABASE_NAME: await prompt(rl, "D1 database name", { defaultValue: get("D1_DATABASE_NAME") || "sunsethue-db" }),
    PRODUCTION_HOSTNAME: await prompt(rl, "Production hostname", { defaultValue: get("PRODUCTION_HOSTNAME") }),
    AUTHORIZED_EMAIL: await prompt(rl, "Authorized Access email", { defaultValue: get("AUTHORIZED_EMAIL") }),
    CONTACT_EMAIL: await prompt(rl, "Contact email (Nominatim UA)", { defaultValue: get("CONTACT_EMAIL") || get("AUTHORIZED_EMAIL") })
  };

  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`Missing required value: ${key}`);
    process.env[key] = value;
  }
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Set CLOUDFLARE_API_TOKEN in the environment before running setup.");
  }

  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  if (process.env.SECRETS_STORE_ID) lines.push(`SECRETS_STORE_ID=${process.env.SECRETS_STORE_ID}`);
  if (process.env.D1_DATABASE_ID) lines.push(`D1_DATABASE_ID=${process.env.D1_DATABASE_ID}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
  console.log("Wrote .env (no provider secrets).");
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 24) throw new Error("Node.js 24+ is required.");

  const wrangler = spawnSync("npx", ["--no", "wrangler", "--version"], { cwd: ROOT, encoding: "utf8" });
  if (wrangler.status !== 0) throw new Error("Wrangler is not available via npx.");

  const rl = createInterface({ input, output });
  try {
    await ensureEnv(rl);
  } finally {
    rl.close();
  }

  run("npm", ["run", "secrets-store:bootstrap"]);
  run("npm", ["run", "config:generate:strict"]);
  run("npm", ["run", "db:schema:remote"]);
  run("npm", ["run", "secrets-store:preflight"]);

  run("npx", ["--no", "wrangler", "deploy", "--config", "wrangler.credential-admin.toml"]);
  run("npx", ["--no", "wrangler", "deploy", "--config", "wrangler.worker.toml"]);
  run("npx", ["--no", "wrangler", "pages", "deploy", "public", "--project-name", process.env.PAGES_PROJECT_NAME]);

  run("npm", ["run", "access:apply"]);
  run("npm", ["run", "secrets:upload"]);
  run("npm", ["run", "secrets:upload:admin"]);
  run("npm", ["run", "verify:production"]);

  console.log(`
Setup complete.

Next steps in the UI (never paste these into the terminal):
  1. Open https://${process.env.PRODUCTION_HOSTNAME}/
  2. Settings → save Gmail app password credentials
  3. Settings → save Pushover credentials
  4. Optional: enable browser push and/or webhook
  5. Run npm run doctor to re-check the deployment
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
