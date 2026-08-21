import test from "node:test";
import assert from "node:assert/strict";
import { runSetup, parseArgs, assertNoPrivateMaterial } from "../../scripts/webpush-setup.mjs";
import { generateVapidKeyPair } from "../../scripts/lib/webpush-vapid.mjs";

function fakeEnv(overrides = {}) {
  return {
    CLOUDFLARE_API_TOKEN: "a".repeat(40),
    CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
    SECRETS_STORE_ID: "0".repeat(32),
    ...overrides
  };
}

function fakeDeps(overrides = {}) {
  return {
    argv: ["--subject", "mailto:ops@example.com"],
    env: fakeEnv(),
    assertToken: () => {},
    verify: async () => {},
    generate: async () => generateVapidKeyPair(),
    findSecret: async () => null,
    create: async ({ value }) => ({ id: "secret-id", value }),
    patch: async (_storeId, _secretId, { value }) => ({ id: "secret-id", value }),
    waitActive: async () => ({ id: "secret-id", name: "SUNSETHUE_WEB_PUSH_VAPID", status: "active" }),
    log: () => {},
    error: () => {},
    ...overrides
  };
}

test("parseArgs reads --subject and --rotate", () => {
  assert.deepEqual(parseArgs(["--subject", "mailto:a@example.com"]), { subject: "mailto:a@example.com", rotate: false });
  assert.deepEqual(parseArgs(["--subject", "https://example.com", "--rotate"]), { subject: "https://example.com", rotate: true });
  assert.deepEqual(parseArgs(["--help"]), { subject: "", rotate: false, help: true });
});

test("assertNoPrivateMaterial throws when a PEM marker appears in text", () => {
  assert.throws(() => assertNoPrivateMaterial("-----BEGIN PRIVATE KEY-----"), /Refusing to print/);
  assert.throws(() => assertNoPrivateMaterial("-----BEGIN EC PRIVATE KEY-----"), /Refusing to print/);
  assert.doesNotThrow(() => assertNoPrivateMaterial("public key only"));
});

test("runSetup creates a secret when none exists", async () => {
  const logs = [];
  const result = await runSetup({
    ...fakeDeps({
      log: (msg) => logs.push(msg)
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.secret.action, "created");
  assert.equal(result.secret.rotation, false);
  assert.ok(result.publicKey);
  assert.ok(result.subject);
  assert.ok(logs.some((msg) => msg.includes(result.publicKey)));
});

test("runSetup refuses to overwrite an existing secret without --rotate", async () => {
  const errors = [];
  const result = await runSetup({
    ...fakeDeps({
      argv: ["--subject", "mailto:ops@example.com"],
      findSecret: async () => ({ id: "existing-id", name: "SUNSETHUE_WEB_PUSH_VAPID" }),
      error: (msg) => errors.push(msg)
    })
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /--rotate/);
  assert.ok(errors.some((msg) => msg.includes("--rotate")));
});

test("runSetup rotates an existing secret when --rotate is supplied", async () => {
  const result = await runSetup({
    ...fakeDeps({
      argv: ["--subject", "mailto:ops@example.com", "--rotate"],
      findSecret: async () => ({ id: "existing-id", name: "SUNSETHUE_WEB_PUSH_VAPID" })
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.secret.action, "rotated");
  assert.equal(result.secret.rotation, true);
});

test("runSetup fails with invalid subject", async () => {
  const result = await runSetup({
    ...fakeDeps({
      argv: ["--subject", "not-a-subject"]
    })
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /subject/);
});

test("runSetup refuses to print a private key", async () => {
  assert.throws(
    () => assertNoPrivateMaterial("-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----"),
    /Refusing to print/
  );
});
