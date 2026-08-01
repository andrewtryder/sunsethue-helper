import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("production uploads Worker secrets via dedicated script against worker config", () => {
  const production = readFileSync(resolve(ROOT, ".github/workflows/production.yml"), "utf8");
  assert.match(production, /scripts\/upload-worker-secrets\.mjs/);
  assert.match(production, /--target=main/);
  assert.match(production, /--target=admin/);
  assert.match(production, /secrets-store:preflight/);
  assert.match(production, /wrangler\.credential-admin\.toml/);
  assert.doesNotMatch(
    production,
    /secrets:\s*\|\s*\n\s*AUTHORIZED_EMAIL/,
    "wrangler-action must not bulk-upload secrets against the Pages wrangler.toml"
  );
  assert.match(production, /deploy --minify --keep-vars --config wrangler\.worker\.toml/);
});

test("production Worker secrets env block never carries Gmail, EMAIL_TO/FROM, or Pushover", () => {
  const production = readFileSync(resolve(ROOT, ".github/workflows/production.yml"), "utf8");
  // Extract the "Upload main Worker secrets" step's env: block and confirm it
  // does not pass Gmail/EMAIL_TO/EMAIL_FROM/Pushover credentials.
  const stepMatch = production.match(/Upload main Worker secrets[\s\S]*?run: node scripts\/upload-worker-secrets\.mjs --target=main/);
  assert.ok(stepMatch, "expected the main Worker secret upload step to be present");
  const block = stepMatch[0];
  for (const forbidden of [
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "EMAIL_TO",
    "EMAIL_FROM",
    "PUSHOVER_APP_TOKEN",
    "PUSHOVER_USER_KEY"
  ]) {
    assert.doesNotMatch(
      block,
      new RegExp(`\\b${forbidden}\\b`),
      `${forbidden} must not be uploaded to the main Worker`
    );
  }
});

test("upload-worker-secrets requires only Access + app config on the main target", () => {
  const source = readFileSync(resolve(ROOT, "scripts/upload-worker-secrets.mjs"), "utf8");
  assert.match(
    source,
    /MAIN_REQUIRED = \[\s*"AUTHORIZED_EMAIL",\s*"TEAM_DOMAIN",\s*"POLICY_AUD",\s*"SUNSETHUE_API_KEY",\s*"CONTACT_EMAIL",\s*"WEBAPP_URL"\s*\]/
  );
  for (const forbidden of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO", "EMAIL_FROM", "PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${forbidden}\\b`),
      `${forbidden} must not appear in upload-worker-secrets.mjs`
    );
  }
  assert.match(source, /wrangler\.worker\.toml/);
  assert.match(source, /wrangler\.credential-admin\.toml/);
  assert.match(source, /ADMIN_REQUIRED = \["CLOUDFLARE_API_TOKEN"\]/);
  assert.match(source, /secret", "bulk"/);
  assert.doesNotMatch(source, /Stage 1|Stage 2/i, "no staged rollout language remains");
});

test("main Worker template never assigns CLOUDFLARE_API_TOKEN and has Secrets Store bindings", () => {
  const worker = readFileSync(resolve(ROOT, "wrangler.worker.example.toml"), "utf8");
  const admin = readFileSync(resolve(ROOT, "wrangler.credential-admin.example.toml"), "utf8");
  assert.doesNotMatch(worker, /^[[:space:]]*CLOUDFLARE_API_TOKEN[[:space:]]*=/m);
  assert.match(worker, /CREDENTIAL_ADMIN/);
  assert.match(worker, /EMAIL_TRANSPORT_SECRET/);
  assert.match(worker, /PUSHOVER_TRANSPORT_SECRET/);
  assert.match(admin, /workers_dev = false/);
  assert.match(admin, /preview_urls = false/);
  assert.match(admin, /worker\/credential-admin\/index\.js/);
});
