import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../worker/index.js";
import { createTestJwks, setAuthDependencies } from "../../worker/auth.js";
import { baseEnv, createAccessToken, getLocalJwks, makeRequest } from "../helpers.mjs";

test.before(async () => {
  const jwks = createTestJwks(await getLocalJwks());
  setAuthDependencies({ getJwks: async () => jwks });
});

test.after(() => {
  setAuthDependencies(null);
});

function silenceConsole(fn) {
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => Object.assign(console, original));
}

test("an unexpected downstream failure becomes a generic 500", async () => {
  const env = baseEnv({
    DB: {
      prepare() {
        throw new Error("D1_ERROR: connection reset");
      }
    }
  });
  const token = await createAccessToken();

  const response = await silenceConsole(() =>
    worker.fetch(
      makeRequest("/api/locations", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      env,
      {}
    )
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /D1_ERROR|connection reset/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a thrown non-AuthError in the auth middleware becomes a generic 500", async () => {
  // A configuration store that faults on read is not an AuthError, so it must not
  // be reported as an authentication outcome.
  const env = { AUTHORIZED_EMAIL: "owner@example.com", POLICY_AUD: "aud" };
  Object.defineProperty(env, "TEAM_DOMAIN", {
    enumerable: true,
    get() {
      throw new Error("configuration store unavailable");
    }
  });

  const response = await silenceConsole(() =>
    worker.fetch(
      makeRequest("/api/locations", { headers: { "Cf-Access-Jwt-Assertion": "x" } }),
      env,
      {}
    )
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /configuration store/);
});

test("the scheduled handler runs through waitUntil and needs no HTTP request", async () => {
  const scheduled = [];
  const ctx = {
    waitUntil(promise) {
      scheduled.push(promise);
    }
  };

  await silenceConsole(async () => {
    worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, baseEnv(), ctx);
    assert.equal(scheduled.length, 1);
    await scheduled[0];
  });
});

test("misconfigured production authentication fails closed with 401", async () => {
  const token = await createAccessToken();
  const response = await silenceConsole(() =>
    worker.fetch(
      makeRequest("/api/locations", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      { AUTHORIZED_EMAIL: "owner@example.com" },
      {}
    )
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "MISCONFIGURED");
  assert.doesNotMatch(JSON.stringify(body), /cloudflareaccess|audience|POLICY_AUD|TEAM_DOMAIN/i);
});
