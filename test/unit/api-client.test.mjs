import test from "node:test";
import assert from "node:assert/strict";
import {
  createApiClient,
  createDemoClient,
  API_BASE,
  CREDENTIAL_ADMIN_HEADER
} from "../../public/lib/api-client.js";

test("API_BASE is empty string", () => {
  assert.equal(API_BASE, "");
});

test("CREDENTIAL_ADMIN_HEADER has correct key", () => {
  assert.deepStrictEqual(CREDENTIAL_ADMIN_HEADER, { "X-Sunsethue-Admin": "credentials" });
});

test("createApiClient GET success returns parsed JSON", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ locations: [{ id: "1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  const api = createApiClient();
  const data = await api.get("/api/locations");
  assert.deepStrictEqual(data, { locations: [{ id: "1" }] });
});

test("createApiClient GET failure throws", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => new Response("", { status: 500 });

  const api = createApiClient();
  await assert.rejects(api.get("/api/locations"), {
    message: "Request failed: /api/locations"
  });
});

test("createApiClient send mutation returns raw Response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let capturedUrl;
  let capturedInit;
  globalThis.fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const api = createApiClient();
  const response = await api.send("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "NYC" })
  });
  assert.equal(response.status, 200);
  assert.equal(capturedUrl, "/api/locations");
  assert.equal(capturedInit.method, "POST");
});

test("createApiClient readOnly blocks non-GET mutations", async () => {
  const api = createApiClient({ readOnly: true });
  await assert.rejects(
    api.send("/api/locations", { method: "POST" }),
    { message: "DEMO_READ_ONLY" }
  );
  await assert.rejects(
    api.send("/api/locations/1", { method: "PUT" }),
    { message: "DEMO_READ_ONLY" }
  );
  await assert.rejects(
    api.send("/api/locations/1", { method: "DELETE" }),
    { message: "DEMO_READ_ONLY" }
  );
});

test("createApiClient readOnly allows GET sends", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 });

  const api = createApiClient({ readOnly: true });
  const response = await api.send("/api/locations");
  assert.equal(response.status, 200);
});

test("createDemoClient fixture routing", async () => {
  const fixtures = {
    locations: [{ id: "1", name: "NYC" }],
    runs: [{ id: "r1" }],
    notificationHealth: { state: "healthy" },
    setupStatus: { databaseTables: "ready" },
    applicationSettings: { scheduleTimezone: "UTC" },
    notificationSettings: { emailEnabled: true },
    rules: [{ locationId: "1", channel: "email" }],
    credits: { remaining: 500 },
    providerCredentials: { email: { configured: true } },
    webPush: { subscriptions: [{ id: "s1" }] }
  };

  const api = createDemoClient(fixtures);

  assert.deepStrictEqual(await api.get("/api/locations"), fixtures.locations);
  assert.deepStrictEqual(await api.get("/api/runs"), fixtures.runs);
  assert.deepStrictEqual(await api.get("/api/notification-health"), fixtures.notificationHealth);
  assert.deepStrictEqual(await api.get("/api/setup-status"), fixtures.setupStatus);
  assert.deepStrictEqual(await api.get("/api/application-settings"), fixtures.applicationSettings);
  assert.deepStrictEqual(await api.get("/api/notification-settings"), fixtures.notificationSettings);
  assert.deepStrictEqual(await api.get("/api/location-notification-rules"), fixtures.rules);
  assert.deepStrictEqual(await api.get("/api/getApiCredits"), fixtures.credits);
  assert.deepStrictEqual(await api.get("/api/provider-credentials"), fixtures.providerCredentials);
  assert.deepStrictEqual(await api.get("/api/web-push/subscriptions"), fixtures.webPush);
});

test("createDemoClient returns empty object for unknown paths", async () => {
  const api = createDemoClient({});
  const data = await api.get("/api/unknown-route");
  assert.deepStrictEqual(data, {});
});

test("createDemoClient defaults webPush when fixture missing", async () => {
  const api = createDemoClient({});
  const data = await api.get("/api/web-push/subscriptions");
  assert.deepStrictEqual(data, { subscriptions: [] });
});

test("createDemoClient send throws DEMO_READ_ONLY for non-GET", async () => {
  const api = createDemoClient({});
  await assert.rejects(
    api.send("/api/locations", { method: "POST" }),
    { message: "DEMO_READ_ONLY" }
  );
  await assert.rejects(
    api.send("/api/locations/1", { method: "DELETE" }),
    { message: "DEMO_READ_ONLY" }
  );
});

test("createDemoClient send GET returns fixture as Response", async () => {
  const fixtures = { locations: [{ id: "loc1" }] };
  const api = createDemoClient(fixtures);
  const response = await api.send("/api/locations");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepStrictEqual(data, fixtures.locations);
});

test("createApiClient aborts hanging GET with timeout", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    });
  });

  const api = createApiClient();
  await assert.rejects(
    api.get("/api/locations", { timeoutMs: 30 }),
    { message: "Request timed out: /api/locations" }
  );
});

test("createApiClient uses shorter timeout for credential status GETs", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let capturedSignal;
  globalThis.fetch = (_url, init) => {
    capturedSignal = init.signal;
    return Promise.resolve(new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
  };

  const api = createApiClient();
  await api.send("/api/provider-credentials");
  assert.ok(capturedSignal instanceof AbortSignal);
});
