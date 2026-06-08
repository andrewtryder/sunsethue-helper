const test = require("node:test");
const assert = require("node:assert");
const { isAuthorizedEmail, parseBearerToken } = require("../lib/auth");
const { handleTriggerReport, handleSearchCoordinates, handleGetApiCredits } = require("../lib/handlers");
const { createMockResponse } = require("./test-utils");

test("auth helpers enforce the authorized email and bearer token format", () => {
  assert.strictEqual(isAuthorizedEmail("owner@example.com"), true);
  assert.strictEqual(isAuthorizedEmail("other@gmail.com"), false);
  assert.strictEqual(parseBearerToken("Bearer abc123"), "abc123");
  assert.strictEqual(parseBearerToken("Basic abc123"), null);
  assert.strictEqual(parseBearerToken(undefined), null);
});

test("handleTriggerReport rejects unsupported methods and missing auth", async () => {
  const runCalls = [];

  let res = createMockResponse();
  await handleTriggerReport({ method: "GET" }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    runAndSendReport: async () => runCalls.push("called")
  });
  assert.strictEqual(res.statusCode, 405);

  res = createMockResponse();
  await handleTriggerReport({ method: "POST", headers: {} }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    runAndSendReport: async () => runCalls.push("called")
  });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(runCalls.length, 0);
});

test("handleTriggerReport rejects unauthorized users and runs report for authorized user", async () => {
  const runCalls = [];

  let res = createMockResponse();
  await handleTriggerReport({
    method: "POST",
    headers: { authorization: "Bearer valid-token" }
  }, res, {
    verifyIdToken: async () => ({ email: "other@gmail.com" }),
    runAndSendReport: async (triggerType) => runCalls.push(triggerType)
  });
  assert.strictEqual(res.statusCode, 403);

  res = createMockResponse();
  await handleTriggerReport({
    method: "POST",
    headers: { authorization: "Bearer valid-token" }
  }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    runAndSendReport: async (triggerType) => runCalls.push(triggerType)
  });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, {
    success: true,
    message: "Report processed and email sent."
  });
  assert.deepStrictEqual(runCalls, ["Manual Test"]);
});

test("handleSearchCoordinates validates auth, query, and proxy responses", async () => {
  let res = createMockResponse();
  await handleSearchCoordinates({
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: {}
  }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    fetch: async () => ({ ok: true, json: async () => [] })
  });
  assert.strictEqual(res.statusCode, 400);

  res = createMockResponse();
  await handleSearchCoordinates({
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: { query: "Paris" }
  }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    fetch: async (url, options) => {
      assert.match(url, /Paris/);
      assert.strictEqual(options.headers["User-Agent"], "SunsethueHelper/1.0 (owner@example.com)");
      return {
        ok: true,
        json: async () => [{ lat: "48.8566", lon: "2.3522", display_name: "Paris, France" }]
      };
    }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body[0].display_name, "Paris, France");

  res = createMockResponse();
  await handleSearchCoordinates({
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: { query: "Paris" }
  }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    fetch: async () => ({ ok: false, status: 503, json: async () => [] })
  });
  assert.strictEqual(res.statusCode, 500);
  assert.match(res.body.error, /503/);
});

test("handleGetApiCredits validates auth and returns normalized credits", async () => {
  let res = createMockResponse();
  await handleGetApiCredits({ method: "POST" }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    fetch: async () => ({}),
    env: { SUNSETHUE_API_KEY: "test-key" }
  });
  assert.strictEqual(res.statusCode, 405);

  res = createMockResponse();
  await handleGetApiCredits({
    method: "GET",
    headers: { authorization: "Bearer valid-token" }
  }, res, {
    verifyIdToken: async () => ({ email: "other@gmail.com" }),
    fetch: async () => ({}),
    env: { SUNSETHUE_API_KEY: "test-key" }
  });
  assert.strictEqual(res.statusCode, 403);

  res = createMockResponse();
  await handleGetApiCredits({
    method: "GET",
    headers: { authorization: "Bearer valid-token" }
  }, res, {
    verifyIdToken: async () => ({ email: "owner@example.com" }),
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          const values = {
            "content-type": "application/json",
            "x-ratelimit-limit": "50",
            "x-ratelimit-remaining": "41",
            "x-ratelimit-reset": "1780885606"
          };
          return values[name.toLowerCase()] ?? null;
        }
      },
      json: async () => ({ data: { type: "sunrise" } })
    }),
    env: { SUNSETHUE_API_KEY: "test-key" }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.remaining, 41);
  assert.strictEqual(res.body.limit, 50);
});
