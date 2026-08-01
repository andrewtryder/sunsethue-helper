#!/usr/bin/env node
/**
 * Upload Worker secrets.
 *
 * Targets:
 *   --target=main (default): Access + application config secrets for
 *                            wrangler.worker.toml. Provider transport
 *                            credentials (Gmail / Pushover) live in
 *                            Cloudflare Secrets Store and are managed by
 *                            the credential-administration Worker, so they
 *                            are intentionally NOT uploaded here.
 *   --target=admin: CLOUDFLARE_API_TOKEN only for
 *                   wrangler.credential-admin.toml.
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
  "CONTACT_EMAIL",
  "WEBAPP_URL"
];

const ADMIN_REQUIRED = ["CLOUDFLARE_API_TOKEN"];

function collect(names) {
  const payload = {};
  const missing = [];
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined || value === "") {
      missing.push(name);
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
  if (required.missing.length > 0) {
    console.error(
      `Missing required Worker secret${required.missing.length === 1 ? "" : "s"}: ${required.missing.join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  const status = upload("wrangler.worker.toml", required.payload);
  if (status !== 0) {
    process.exitCode = status;
    return;
  }
  console.log(
    JSON.stringify({
      ok: true,
      target: "main",
      uploaded: Object.keys(required.payload).sort(),
      note: "Provider transport credentials live in Cloudflare Secrets Store; the main Worker no longer receives Gmail or Pushover secrets."
    })
  );
}

main();
