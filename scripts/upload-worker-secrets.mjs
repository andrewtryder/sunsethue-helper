#!/usr/bin/env node
/**
 * Upload Worker secrets.
 *
 * Targets:
 *   --target=main (default): Access + app secrets for wrangler.worker.toml
 *   --target=admin: CLOUDFLARE_API_TOKEN only for wrangler.credential-admin.toml
 *
 * Stage 1 still uploads Gmail/Pushover to the main Worker as fallback.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MAIN_REQUIRED = [
  "AUTHORIZED_EMAIL",
  "TEAM_DOMAIN",
  "POLICY_AUD",
  "SUNSETHUE_API_KEY",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "EMAIL_TO",
  "EMAIL_FROM",
  "CONTACT_EMAIL",
  "WEBAPP_URL"
];

const MAIN_OPTIONAL = ["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"];
const ADMIN_REQUIRED = ["CLOUDFLARE_API_TOKEN"];

function collect(names, { optional = false } = {}) {
  const payload = {};
  const missing = [];
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined || value === "") {
      if (!optional) missing.push(name);
      continue;
    }
    payload[name] = value;
  }
  return { payload, missing };
}

function upload(configPath, payload) {
  const result = spawnSync(
    "npx",
    ["--no", "wrangler", "secret", "bulk", "--config", configPath],
    {
      cwd: ROOT,
      input: JSON.stringify(payload),
      encoding: "utf8",
      shell: false,
      env: process.env
    }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

function main() {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const target = targetArg ? targetArg.slice("--target=".length) : "main";

  if (target === "admin") {
    const { payload, missing } = collect(ADMIN_REQUIRED);
    if (missing.length > 0) {
      console.error(`Missing required admin Worker secret(s): ${missing.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    // Never print token keys beyond names.
    const status = upload("wrangler.credential-admin.toml", payload);
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
    console.log(JSON.stringify({ ok: true, target: "admin", uploaded: Object.keys(payload).sort() }));
    return;
  }

  if (target !== "main") {
    console.error(`Unknown target: ${target}`);
    process.exitCode = 1;
    return;
  }

  const required = collect(MAIN_REQUIRED);
  const optional = collect(MAIN_OPTIONAL, { optional: true });
  if (required.missing.length > 0) {
    console.error(
      `Missing required Worker secret${required.missing.length === 1 ? "" : "s"}: ${required.missing.join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  const payload = { ...required.payload, ...optional.payload };
  const status = upload("wrangler.worker.toml", payload);
  if (status !== 0) {
    process.exitCode = status;
    return;
  }
  console.log(
    JSON.stringify({
      ok: true,
      target: "main",
      uploaded: Object.keys(payload).sort(),
      skippedOptional: MAIN_OPTIONAL.filter((name) => !(name in payload)),
      note: "Stage 1: Gmail/Pushover remain as legacy Worker secret fallback"
    })
  );
}

main();
