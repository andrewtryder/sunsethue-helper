import test from "node:test";
import assert from "node:assert/strict";
import {
  base64UrlToBytes,
  buildVapidSecretDocument,
  generateVapidKeyPair,
  isValidVapidPublicKey,
  isValidVapidSubject
} from "../../scripts/lib/webpush-vapid.mjs";

test("isValidVapidPublicKey accepts a 65-byte uncompressed P-256 key", async () => {
  const { publicKeyBase64Url } = await generateVapidKeyPair();
  assert.equal(isValidVapidPublicKey(publicKeyBase64Url), true);
  const bytes = base64UrlToBytes(publicKeyBase64Url);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
});

test("isValidVapidPublicKey rejects garbage, wrong length, and wrong prefix", () => {
  assert.equal(isValidVapidPublicKey(""), false);
  assert.equal(isValidVapidPublicKey("not-a-key"), false);
  assert.equal(isValidVapidPublicKey(null), false);
  assert.equal(isValidVapidPublicKey(undefined), false);
  // 64 bytes (missing prefix byte) — invalid
  const bad = "A".repeat(86);
  assert.equal(isValidVapidPublicKey(bad), false);
});

test("generateVapidKeyPair produces matching-shape public key and PKCS8 PEM", async () => {
  const { publicKeyBase64Url, privateKeyPem } = await generateVapidKeyPair();
  assert.equal(typeof publicKeyBase64Url, "string");
  assert.ok(publicKeyBase64Url.length > 80 && publicKeyBase64Url.length < 90);
  assert.match(privateKeyPem, /-----BEGIN PRIVATE KEY-----/);
  assert.match(privateKeyPem, /-----END PRIVATE KEY-----/);
  assert.equal(isValidVapidPublicKey(publicKeyBase64Url), true);
});

test("generateVapidKeyPair is non-deterministic across calls", async () => {
  const a = await generateVapidKeyPair();
  const b = await generateVapidKeyPair();
  assert.notEqual(a.publicKeyBase64Url, b.publicKeyBase64Url);
  assert.notEqual(a.privateKeyPem, b.privateKeyPem);
});

test("buildVapidSecretDocument wraps a PEM and marks configured true", async () => {
  const { privateKeyPem } = await generateVapidKeyPair();
  const doc = buildVapidSecretDocument(privateKeyPem);
  const parsed = JSON.parse(doc);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.configured, true);
  assert.equal(parsed.privateKey, privateKeyPem);
});

test("buildVapidSecretDocument refuses non-PEM input", () => {
  assert.throws(() => buildVapidSecretDocument("not a pem"), /privateKey/);
  assert.throws(() => buildVapidSecretDocument(""), /privateKey/);
});

test("isValidVapidSubject accepts mailto and https, rejects others", () => {
  assert.equal(isValidVapidSubject("mailto:ops@example.com"), true);
  assert.equal(isValidVapidSubject("https://example.com"), true);
  assert.equal(isValidVapidSubject("http://example.com"), false);
  assert.equal(isValidVapidSubject("ops@example.com"), false);
  assert.equal(isValidVapidSubject(""), false);
  assert.equal(isValidVapidSubject(null), false);
});
