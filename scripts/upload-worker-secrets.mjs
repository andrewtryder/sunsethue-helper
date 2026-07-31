#!/usr/bin/env node
/**
 * Upload Worker secrets via `wrangler secret bulk` against wrangler.worker.toml.
 *
 * wrangler-action's built-in secrets upload targets the default wrangler.toml,
 * which is the Pages project here and fails with multi-env / Pages detection.
 * Optional secrets (empty string) are omitted so deploy stays green when Pushover
 * is not configured yet.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
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

const OPTIONAL = ["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"];

function main() {
  const payload = {};
  const missing = [];

  for (const name of REQUIRED) {
    const value = process.env[name];
    if (value === undefined || value === "") {
      missing.push(name);
      continue;
    }
    payload[name] = value;
  }

  for (const name of OPTIONAL) {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
      payload[name] = value;
    }
  }

  if (missing.length > 0) {
    console.error(
      `Missing required Worker secret${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  const result = spawnSync(
    "npx",
    ["--no", "wrangler", "secret", "bulk", "--config", "wrangler.worker.toml"],
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

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    console.log(
      JSON.stringify({
        ok: true,
        uploaded: Object.keys(payload).sort(),
        skippedOptional: OPTIONAL.filter((name) => !(name in payload))
      })
    );
  }
}

main();
