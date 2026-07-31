import test from "node:test";
import assert from "node:assert/strict";
import {
  collapseWhitespace,
  isUuid,
  pickKnownFields,
  readJsonBody,
  rejectUnknownFields,
  truncateUtf8,
  validateCoordinates,
  validateLocationName,
  validateSearchQuery
} from "../../worker/validation.js";

function jsonRequest(body, { contentType = "application/json", declaredLength } = {}) {
  const headers = new Headers({ "content-type": contentType });
  if (declaredLength !== undefined) headers.set("content-length", String(declaredLength));
  return new Request("https://example.test/api", {
    method: "POST",
    headers,
    body
  });
}

test("isUuid accepts a canonical UUID and rejects everything else", () => {
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isUuid("ABCDEF01-2345-6789-abcd-ef0123456789"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(42), false);
});

test("readJsonBody rejects the wrong content type as 415", async () => {
  const result = await readJsonBody(jsonRequest("{}", { contentType: "text/plain" }));
  assert.deepEqual(result, { error: "UNSUPPORTED_MEDIA_TYPE" });
});

test("readJsonBody rejects an oversized declared content length as 413", async () => {
  const result = await readJsonBody(jsonRequest("{}", { declaredLength: 999_999 }), { maxBytes: 16 });
  assert.deepEqual(result, { error: "PAYLOAD_TOO_LARGE" });
});

test("readJsonBody rejects a body that exceeds the byte cap", async () => {
  const big = "x".repeat(100);
  const result = await readJsonBody(jsonRequest(JSON.stringify({ big })), { maxBytes: 10 });
  assert.deepEqual(result, { error: "PAYLOAD_TOO_LARGE" });
});

test("readJsonBody rejects empty and invalid JSON with a stable code", async () => {
  const empty = await readJsonBody(new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" }
  }));
  assert.deepEqual(empty, { error: "INVALID_JSON" });

  const invalid = await readJsonBody(jsonRequest("{oops"));
  assert.deepEqual(invalid, { error: "INVALID_JSON" });
});

test("readJsonBody parses a valid JSON body", async () => {
  const parsed = await readJsonBody(jsonRequest(JSON.stringify({ ok: true })));
  assert.deepEqual(parsed, { value: { ok: true } });
});

test("validateLocationName trims and rejects bad shapes", () => {
  assert.deepEqual(validateLocationName("  Beach  "), { ok: true, value: "Beach" });
  assert.deepEqual(validateLocationName(""), { ok: false });
  assert.deepEqual(validateLocationName("   "), { ok: false });
  assert.deepEqual(validateLocationName(42), { ok: false });
  assert.deepEqual(validateLocationName("a".repeat(121)), { ok: false });
  assert.deepEqual(validateLocationName("Line 1\nLine 2"), { ok: false });
  assert.deepEqual(validateLocationName("has\u0000null"), { ok: false });
});

test("validateCoordinates enforces WGS84 bounds and finite numbers", () => {
  assert.deepEqual(validateCoordinates(0, 0), { ok: true, latitude: 0, longitude: 0 });
  assert.deepEqual(validateCoordinates(90, 180), { ok: true, latitude: 90, longitude: 180 });
  assert.deepEqual(validateCoordinates(-90, -180), { ok: true, latitude: -90, longitude: -180 });
  assert.deepEqual(validateCoordinates(91, 0), { ok: false });
  assert.deepEqual(validateCoordinates(0, 181), { ok: false });
  assert.deepEqual(validateCoordinates(Number.NaN, 0), { ok: false });
  assert.deepEqual(validateCoordinates(Number.POSITIVE_INFINITY, 0), { ok: false });
  assert.deepEqual(validateCoordinates("nope", 0), { ok: false });
});

test("validateSearchQuery trims and rejects control characters", () => {
  assert.deepEqual(validateSearchQuery("New York"), { ok: true, value: "New York" });
  assert.deepEqual(validateSearchQuery(""), { ok: false });
  assert.deepEqual(validateSearchQuery("a".repeat(201)), { ok: false });
  assert.deepEqual(validateSearchQuery(null), { ok: false });
  assert.deepEqual(validateSearchQuery("bad\u0001char"), { ok: false });
});

test("rejectUnknownFields signals every unexpected field", () => {
  const allowed = new Set(["a", "b"]);
  assert.deepEqual(rejectUnknownFields({ a: 1, b: 2 }, allowed), { ok: true });
  assert.deepEqual(rejectUnknownFields({ a: 1, c: 3 }, allowed), { ok: false, unknown: "c" });
  assert.deepEqual(rejectUnknownFields(null, allowed), { ok: false, unknown: "__root__" });
  assert.deepEqual(rejectUnknownFields([1], allowed), { ok: false, unknown: "__root__" });
  assert.deepEqual(rejectUnknownFields({ a: 1 }, ["a"]), { ok: true });
});

test("pickKnownFields returns only the allowed keys", () => {
  const allowed = new Set(["a", "b"]);
  assert.deepEqual(pickKnownFields({ a: 1, b: 2, c: 3 }, allowed), { a: 1, b: 2 });
  assert.deepEqual(pickKnownFields(null, allowed), {});
  assert.deepEqual(pickKnownFields({ a: 1 }, ["a"]), { a: 1 });
  assert.deepEqual(pickKnownFields("no", allowed), {});
});

test("truncateUtf8 never splits a code point", () => {
  assert.equal(truncateUtf8("hello", 100), "hello");
  assert.equal(truncateUtf8("hello", 3), "hel");
  assert.equal(truncateUtf8("", 10), "");
  assert.equal(truncateUtf8("abc", 0), "");

  // The pizza emoji U+1F355 is 4 bytes in UTF-8. Truncating to 3 bytes must
  // drop the whole code point rather than emit half of it.
  const pizza = "\u{1F355}";
  assert.equal(new TextEncoder().encode(pizza).byteLength, 4);
  assert.equal(truncateUtf8(pizza, 3), "");
  assert.equal(truncateUtf8(`a${pizza}`, 3), "a");
});

test("collapseWhitespace folds newlines into a single space", () => {
  assert.equal(collapseWhitespace("Line 1\r\nLine 2"), "Line 1 Line 2");
  assert.equal(collapseWhitespace("  spaced  "), "spaced");
  assert.equal(collapseWhitespace(42), "");
});
