import test from "node:test";
import assert from "node:assert/strict";
import { generateVapidKeyPair } from "../../scripts/lib/webpush-vapid.mjs";
import { parseArgs, verifyRemote } from "../../scripts/webpush-verify.mjs";

test("parseArgs reads --url and --expected", () => {
  assert.deepEqual(parseArgs(["--url", "https://example.com", "--expected", "Bkey"]), { url: "https://example.com", expected: "Bkey" });
  assert.deepEqual(parseArgs(["--help"]), { url: "", expected: "", help: true });
});

test("verifyRemote rejects non-https URLs", async () => {
  await assert.rejects(() => verifyRemote("http://example.com"), /https/);
  await assert.rejects(() => verifyRemote(""), /https/);
});

test("verifyRemote rejects non-2xx HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  try {
    await assert.rejects(() => verifyRemote("https://example.com"), /VERIFY_HTTP_500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyRemote rejects configured:false or missing publicKey", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false }) });
  try {
    await assert.rejects(() => verifyRemote("https://example.com"), /VERIFY_NOT_CONFIGURED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyRemote rejects an invalid public key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: true, publicKey: "invalid" }) });
  try {
    await assert.rejects(() => verifyRemote("https://example.com"), /VERIFY_INVALID_PUBLIC_KEY/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyRemote accepts a valid public key and returns its shape", async () => {
  const { publicKeyBase64Url } = await generateVapidKeyPair();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: true, publicKey: publicKeyBase64Url }) });
  try {
    const result = await verifyRemote("https://example.com/");
    assert.equal(result.configured, true);
    assert.equal(result.publicKey, publicKeyBase64Url);
    assert.match(result.endpoint, /https:\/\/example.com\/api\/web-push\/vapid-public-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
