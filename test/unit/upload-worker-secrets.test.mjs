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

test("upload-worker-secrets treats Pushover credentials as optional on main target", () => {
  const source = readFileSync(resolve(ROOT, "scripts/upload-worker-secrets.mjs"), "utf8");
  assert.match(source, /MAIN_OPTIONAL = \["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"\]/);
  assert.match(source, /wrangler\.worker\.toml/);
  assert.match(source, /wrangler\.credential-admin\.toml/);
  assert.match(source, /ADMIN_REQUIRED = \["CLOUDFLARE_API_TOKEN"\]/);
  assert.match(source, /secret", "bulk"/);
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
