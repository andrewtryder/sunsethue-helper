import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("production uploads Worker secrets via dedicated script against worker config", () => {
  const production = readFileSync(resolve(ROOT, ".github/workflows/production.yml"), "utf8");
  assert.match(production, /scripts\/upload-worker-secrets\.mjs/);
  assert.doesNotMatch(
    production,
    /secrets:\s*\|\s*\n\s*AUTHORIZED_EMAIL/,
    "wrangler-action must not bulk-upload secrets against the Pages wrangler.toml"
  );
  assert.match(production, /deploy --minify --keep-vars --config wrangler\.worker\.toml/);
});

test("upload-worker-secrets treats Pushover credentials as optional", () => {
  const source = readFileSync(resolve(ROOT, "scripts/upload-worker-secrets.mjs"), "utf8");
  assert.match(source, /OPTIONAL = \["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"\]/);
  assert.match(source, /wrangler\.worker\.toml/);
  assert.match(source, /secret", "bulk"/);
});
