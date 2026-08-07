import test from "node:test";
import assert from "node:assert/strict";
import { handleHttpRequest } from "../../worker/api.js";
import * as db from "../../worker/db.js";
import { saveSettings } from "../../worker/notifications/settings.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import {
  createFetchFake,
  createMailerFake,
  jsonOk,
  sunsethueForecast,
  transportBindings
} from "../support/fakes.mjs";
import { makeRequest } from "../helpers.mjs";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const AUTH_CONTEXT = { authenticated: true, authorized: true, email: "owner@example.com" };
const LOCATION_ID_A = "10000000-0000-0000-0000-00000000000a";
const LOCATION_ID_B = "10000000-0000-0000-0000-00000000000b";

async function withApi(fn, { locations = [], routes = {}, envOverrides = {}, transportOverrides = {}, emailSettings = { emailEnabled: true, emailTo: "owner@example.com" } } = {}) {
  const local = await createLocalD1();
  const fetchFake = createFetchFake(routes);
  const mailer = createMailerFake();
  const env = {
    SUNSETHUE_API_KEY: "fake-sunsethue-key",
    CONTACT_EMAIL: "contact@example.com",
    ...transportBindings(transportOverrides),
    DB: local.DB,
    ...envOverrides
  };
  for (const location of locations) {
    await db.addLocation(env, location);
  }
  if (emailSettings) {
    // Configure D1 notification settings so tests can trigger email delivery
    // via the outbox. Pass `emailSettings: false` to leave the ship-safe
    // default (channels disabled) in place.
    await saveSettings(env, {
      emailEnabled: Boolean(emailSettings.emailEnabled),
      emailTo: emailSettings.emailTo ?? null,
      pushoverEnabled: false,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null
    }, NOW);
  }

  const call = (path, options) =>
    handleHttpRequest(makeRequest(path, options), env, AUTH_CONTEXT, {
      fetch: fetchFake,
      loadMailer: mailer.loadMailer,
      now: NOW
    });

  try {
    return await fn({ call, env, fetchFake, mailer, local });
  } finally {
    local.close();
  }
}

function assertHardened(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("x-request-id"), "every response carries a request id");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
}

test("GET /api/locations returns stored locations", async () => {
  await withApi(
    async ({ call }) => {
      const response = await call("/api/locations");
      assert.equal(response.status, 200);
      assertHardened(response);
      const body = await response.json();
      assert.deepEqual(body.map((row) => row.name), ["Beach"]);
    },
    { locations: [{ id: LOCATION_ID_A, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 }] }
  );
});

test("POST /api/locations validates required fields", async () => {
  await withApi(async ({ call, env }) => {
    for (const body of [{}, { name: "X" }, { name: "X", latitude: 1 }, { latitude: 1, longitude: 2 }]) {
      const response = await call("/api/locations", { method: "POST", body });
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.error.code, "BAD_REQUEST");
    }
    assert.deepEqual(await db.getLocations(env), []);
  });
});

test("POST /api/locations rejects unknown fields and out-of-range coordinates", async () => {
  await withApi(async ({ call }) => {
    const unknown = await call("/api/locations", { method: "POST", body: { name: "Summit", latitude: 44, longitude: -71, extra: "no" } });
    assert.equal(unknown.status, 400);
    const outOfRange = await call("/api/locations", { method: "POST", body: { name: "Summit", latitude: 91, longitude: -71 } });
    assert.equal(outOfRange.status, 400);
    const controlChars = await call("/api/locations", { method: "POST", body: { name: "line\u0000break", latitude: 44, longitude: -71 } });
    assert.equal(controlChars.status, 400);
  });
});

test("POST /api/locations creates a location with a generated id", async () => {
  await withApi(async ({ call, env }) => {
    const response = await call("/api/locations", {
      method: "POST",
      body: { name: "Summit", latitude: 44.2, longitude: -71.3 }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.match(payload.location.id, /^[0-9a-f-]{36}$/);

    const stored = await db.getLocations(env);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, "Summit");
  });
});

test("POST /api/locations enforces the 10-location cap atomically", async () => {
  const locations = Array.from({ length: 10 }, (_, index) => ({
    id: `20000000-0000-0000-0000-0000000000${index.toString(16).padStart(2, "0")}`,
    name: `Spot ${index}`,
    latitude: 40 + index * 0.1,
    longitude: -74,
    createdAt: index
  }));
  await withApi(
    async ({ call }) => {
      const response = await call("/api/locations", { method: "POST", body: { name: "Overflow", latitude: 41, longitude: -74 } });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "LOCATION_LIMIT_REACHED");
    },
    { locations }
  );
});

test("PUT and DELETE /api/locations/:id mutate the addressed row", async () => {
  await withApi(
    async ({ call, env }) => {
      const updated = await call(`/api/locations/${LOCATION_ID_A}`, {
        method: "PUT",
        body: { name: "Beach North", latitude: 43, longitude: -71 }
      });
      assert.equal(updated.status, 200);
      assert.equal((await db.getLocations(env))[0].name, "Beach North");

      const deleted = await call(`/api/locations/${LOCATION_ID_A}`, { method: "DELETE" });
      assert.equal(deleted.status, 200);
      assert.deepEqual(await db.getLocations(env), []);
    },
    { locations: [{ id: LOCATION_ID_A, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 }] }
  );
});

test("PUT /api/locations/:id/schedule sets and clears custom check times", async () => {
  await withApi(
    async ({ call }) => {
      const listed = await call("/api/locations");
      assert.equal(listed.status, 200);
      const before = await listed.json();
      assert.equal(before[0].scheduleTimes, null);

      const setCustom = await call(`/api/locations/${LOCATION_ID_A}/schedule`, {
        method: "PUT",
        body: { scheduleTimes: ["09:00", "15:00"] }
      });
      assert.equal(setCustom.status, 200);
      assert.deepEqual((await setCustom.json()).scheduleTimes, ["09:00", "15:00"]);

      const afterSet = await (await call("/api/locations")).json();
      assert.deepEqual(afterSet[0].scheduleTimes, ["09:00", "15:00"]);

      const invalid = await call(`/api/locations/${LOCATION_ID_A}/schedule`, {
        method: "PUT",
        body: { scheduleTimes: ["09:30"] }
      });
      assert.equal(invalid.status, 400);

      const clear = await call(`/api/locations/${LOCATION_ID_A}/schedule`, {
        method: "PUT",
        body: { scheduleTimes: null }
      });
      assert.equal(clear.status, 200);
      const afterClear = await (await call("/api/locations")).json();
      assert.equal(afterClear[0].scheduleTimes, null);
    },
    { locations: [{ id: LOCATION_ID_A, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 }] }
  );
});

test("PUT /api/locations/:id validates the body and 404s a missing row", async () => {
  await withApi(async ({ call }) => {
    const invalid = await call(`/api/locations/${LOCATION_ID_A}`, { method: "PUT", body: { name: "Only name" } });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "BAD_REQUEST");
    const missing = await call(`/api/locations/${LOCATION_ID_A}`, { method: "PUT", body: { name: "Beach", latitude: 42, longitude: -71 } });
    assert.equal(missing.status, 404);
  });
});

test("DELETE /api/locations/:id 404s when the row is not present", async () => {
  await withApi(async ({ call }) => {
    const response = await call(`/api/locations/${LOCATION_ID_A}`, { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

test("location routes reject non-UUID ids", async () => {
  await withApi(async ({ call }) => {
    for (const method of ["PUT", "DELETE"]) {
      const response = await call("/api/locations/not-a-uuid", { method, body: method === "PUT" ? { name: "X", latitude: 0, longitude: 0 } : undefined });
      assert.equal(response.status, 400, method);
    }
  });
});

test("unsupported methods return 405 with an Allow header", async () => {
  const expectations = [
    { path: "/api/locations", method: "DELETE", allow: "GET, POST" },
    { path: `/api/locations/${LOCATION_ID_A}`, method: "GET", allow: "PUT, DELETE" },
    { path: "/api/runs", method: "POST", allow: "GET" },
    { path: "/api/getApiCredits", method: "POST", allow: "GET" },
    { path: "/api/searchCoordinates", method: "GET", allow: "POST" },
    { path: "/api/triggerReport", method: "GET", allow: "POST" }
  ];

  await withApi(async ({ call }) => {
    for (const expectation of expectations) {
      const response = await call(expectation.path, { method: expectation.method });
      assert.equal(response.status, 405, `${expectation.method} ${expectation.path}`);
      assert.equal(response.headers.get("allow"), expectation.allow);
      assert.equal((await response.json()).error.code, "METHOD_NOT_ALLOWED");
    }
  });
});

test("unknown and retired routes return a generic 404", async () => {
  await withApi(async ({ call }) => {
    for (const path of ["/api/nope", "/api/config", "/api/getAppConfig"]) {
      const response = await call(path);
      assert.equal(response.status, 404);
      const body = await response.json();
      assert.equal(body.error.code, "NOT_FOUND");
      assert.equal(body.authorizedEmail, undefined);
      assert.equal(body.teamDomain, undefined);
    }
  });
});

test("GET /api/runs returns parsed run history", async () => {
  await withApi(async ({ call, env }) => {
    await db.addRun(env, {
      id: "run-1",
      timestamp: 10,
      triggerType: "AM",
      status: "success",
      locationsCount: 1,
      results: [{ name: "Beach", status: "success" }],
      error: null
    });

    const response = await call("/api/runs");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body[0].results, [{ name: "Beach", status: "success" }]);
  });
});

test("GET /api/notification-health and setup-status stay non-sensitive", async () => {
  await withApi(async ({ call }) => {
    const healthRes = await call("/api/notification-health");
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.ok(["healthy", "degraded", "action_required", "disabled"].includes(health.state));
    assert.ok(Array.isArray(health.channels));
    assert.equal(health.secretNames, undefined);
    assert.equal(health.WEBHOOK_TRANSPORT_SECRET, undefined);
    const setupRes = await call("/api/setup-status");
    assert.equal(setupRes.status, 200);
    const setup = await setupRes.json();
    assert.ok(["ready", "missing", "not_configured", "unknown"].includes(setup.databaseTables) || setup.databaseTables === "ready");
    assert.equal(setup.SUNSETHUE_API_KEY, undefined);
  });
});

test("history export and clear keep pending jobs and write audit", async () => {
  await withApi(async ({ call, env }) => {
    await db.addRun(env, {
      id: "run-hist",
      timestamp: 1,
      triggerType: "TEST",
      status: "success",
      locationsCount: 0,
      results: [],
      error: null
    });
    await env.DB.prepare(
      `INSERT INTO notification_outbox
        (id, runId, channel, status, payload, attempts, nextAttemptAt, createdAt)
       VALUES ('pending-h', 'run-hist', 'email', 'pending', '{}', 0, 1, 1)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO notification_outbox
        (id, runId, channel, status, payload, attempts, nextAttemptAt, createdAt, sentAt)
       VALUES ('sent-h', 'run-hist', 'pushover', 'sent', '{}', 1, 1, 1, 2)`
    ).run();
    const exportRes = await call("/api/history/export?scopes=deliveries_completed");
    assert.equal(exportRes.status, 200);
    const denied = await call("/api/history/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["all"], confirm: "nope" })
    });
    assert.equal(denied.status, 400);
    const cleared = await call("/api/history/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["all"], confirm: "CLEAR" })
    });
    assert.equal(cleared.status, 200);
    const pending = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM notification_outbox WHERE id = 'pending-h'`
    ).first();
    assert.equal(Number(pending.c), 1);
    const audit = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM admin_audit_events WHERE eventType = 'history_cleared'`
    ).first();
    assert.equal(Number(audit.c), 1);
  });
});

test("GET /api/getApiCredits reads usage from the faked Sunsethue API", async () => {
  await withApi(
    async ({ call, fetchFake }) => {
      const response = await call("/api/getApiCredits");
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.remaining, 42);
      assert.equal(body.limit, 100);
      assert.ok(fetchFake.calls.every((entry) => entry.host === "api.sunsethue.com"));
    },
    {
      routes: {
        "api.sunsethue.com": () => jsonOk({ remaining: 42, limit: 100 })
      }
    }
  );
});

test("a missing Sunsethue key maps to a generic 500", async () => {
  await withApi(
    async ({ call }) => {
      const response = await call("/api/getApiCredits");
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.error.code, "INTERNAL_ERROR");
      assert.doesNotMatch(JSON.stringify(body), /SUNSETHUE_API_KEY|stack|at Module/i);
    },
    { envOverrides: { SUNSETHUE_API_KEY: "" } }
  );
});

test("POST /api/searchCoordinates requires a query", async () => {
  await withApi(async ({ call, fetchFake }) => {
    const response = await call("/api/searchCoordinates", { method: "POST", body: {} });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BAD_REQUEST");
    assert.equal(fetchFake.calls.length, 0, "no upstream call for an invalid request");
  });
});

test("POST /api/searchCoordinates rejects control characters in the query", async () => {
  await withApi(async ({ call, fetchFake }) => {
    const response = await call("/api/searchCoordinates", { method: "POST", body: { query: "Portsmouth\u0000NH" } });
    assert.equal(response.status, 400);
    assert.equal(fetchFake.calls.length, 0);
  });
});

test("POST /api/searchCoordinates uses CONTACT_EMAIL for the Nominatim User-Agent", async () => {
  let seenUserAgent = null;
  await withApi(
    async ({ call }) => {
      const response = await call("/api/searchCoordinates", {
        method: "POST",
        body: { query: "Portsmouth NH" }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body[0].display_name, "Portsmouth, NH");
      assert.equal(seenUserAgent, "SunsethueHelper/1.0 (contact@example.com)");
    },
    {
      routes: {
        "nominatim.openstreetmap.org": (url, init) => {
          seenUserAgent = new Headers(init.headers).get("user-agent");
          assert.equal(url.searchParams.get("q"), "Portsmouth NH");
          return jsonOk([{ display_name: "Portsmouth, NH", lat: "43.07", lon: "-70.76" }]);
        }
      }
    }
  );
});

test("POST /api/searchCoordinates falls back to a public identifier when CONTACT_EMAIL is unset", async () => {
  let seenUserAgent = null;
  await withApi(
    async ({ call }) => {
      const response = await call("/api/searchCoordinates", {
        method: "POST",
        body: { query: "somewhere" }
      });
      assert.equal(response.status, 200);
      assert.equal(seenUserAgent, "SunsethueHelper/1.0 (https://github.com/andrewtryder/sunsethue-helper)");
    },
    {
      envOverrides: { CONTACT_EMAIL: "" },
      routes: {
        "nominatim.openstreetmap.org": (url, init) => {
          seenUserAgent = new Headers(init.headers).get("user-agent");
          return jsonOk([]);
        }
      }
    }
  );
});

test("a Nominatim outage maps to 502 without leaking upstream detail", async () => {
  await withApi(
    async ({ call }) => {
      const response = await call("/api/searchCoordinates", {
        method: "POST",
        body: { query: "anywhere" }
      });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.error.code, "UPSTREAM_ERROR");
      assert.doesNotMatch(JSON.stringify(body), /nominatim|openstreetmap/i);
    },
    {
      routes: {
        "nominatim.openstreetmap.org": () => new Response("rate limited", { status: 429 })
      }
    }
  );
});

test("malformed JSON bodies are rejected with a stable 400 error", async () => {
  await withApi(async ({ call }) => {
    const response = await call("/api/searchCoordinates", { method: "POST", body: "{not json" });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.doesNotMatch(JSON.stringify(body), /token|position|SyntaxError/i);
  });
});

test("POST /api/autocomplete proxies Photon through the Worker", async () => {
  let seenUserAgent = null;
  await withApi(
    async ({ call, fetchFake }) => {
      const response = await call("/api/autocomplete", { method: "POST", body: { query: "New York" } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.features.length, 1);
      assert.equal(body.features[0].properties.name, "New York");
      assert.match(seenUserAgent, /^SunsethueHelper\/1\.0 \(.+\)$/);
      assert.equal(fetchFake.calls[0].host, "photon.komoot.io");
    },
    {
      routes: {
        "photon.komoot.io": (url, init) => {
          seenUserAgent = new Headers(init.headers).get("user-agent");
          assert.equal(url.searchParams.get("q"), "New York");
          return jsonOk({ features: [{ properties: { name: "New York" }, geometry: { coordinates: [-74, 40.7] } }] });
        }
      }
    }
  );
});

test("POST /api/autocomplete validates the query and rate-limits repeat requests", async () => {
  await withApi(async ({ call, fetchFake }) => {
    const invalid = await call("/api/autocomplete", { method: "POST", body: { query: "" } });
    assert.equal(invalid.status, 400);
    assert.equal(fetchFake.calls.length, 0);
  });
});

test("POST /api/autocomplete returns 502 when Photon fails", async () => {
  await withApi(
    async ({ call }) => {
      const response = await call("/api/autocomplete", { method: "POST", body: { query: "somewhere" } });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.error.code, "UPSTREAM_ERROR");
    },
    {
      routes: {
        "photon.komoot.io": () => new Response("no", { status: 500 })
      }
    }
  );
});

test("POST /api/triggerReport runs a manual report through the faked mailer", async () => {
  await withApi(
    async ({ call, mailer, env }) => {
      const response = await call("/api/triggerReport", { method: "POST" });
      assert.equal(response.status, 200);
      assertHardened(response);
      const body = await response.json();
      assert.equal(body.success, true);

      assert.equal(mailer.sent.length, 1);
      const runs = await db.getRuns(env);
      assert.equal(runs[0].triggerType, "Manual Test");
      assert.match(mailer.sent[0].subject, /On-Demand Test/);
    },
    {
      locations: [{ id: LOCATION_ID_A, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 }],
      routes: {
        "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW }))
      }
    }
  );
});

test("with the email channel disabled in settings the report enqueues no delivery jobs", async () => {
  await withApi(
    async ({ call }) => {
      const response = await call("/api/triggerReport", { method: "POST" });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.deepEqual(body.jobs, []);
    },
    {
      locations: [{ id: LOCATION_ID_B, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 }],
      // Leave the ship-safe defaults (email disabled) so no outbox job is
      // enqueued regardless of Secrets Store state.
      emailSettings: false
    }
  );
});

test("a D1 outage maps to a generic 500", async () => {
  const response = await handleHttpRequest(
    makeRequest("/api/locations"),
    {
      DB: {
        prepare() {
          throw new Error("D1_ERROR: no such table: locations");
        }
      }
    },
    AUTH_CONTEXT,
    {}
  );
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /D1_ERROR|no such table/i);
});

test("GET/PUT /api/application-settings round-trip schedule preferences", async () => {
  await withApi(async ({ call }) => {
    const getRes = await call("/api/application-settings");
    assert.equal(getRes.status, 200);
    const current = await getRes.json();
    assert.ok(Array.isArray(current.scheduleTimes));
    assert.ok(current.quota);
    assert.equal(current.quotaNotes.manualReportsExcluded, true);

    const putRes = await call("/api/application-settings", {
      method: "PUT",
      body: {
        scheduleTimezone: "America/Denver",
        displayTimezoneMode: "schedule",
        displayTimezone: null,
        scheduleTimes: ["06:00", "18:00"],
        weeklySelfTestEnabled: true,
        weeklySelfTestMode: "passive",
        weeklySelfTestDay: 0,
        weeklySelfTestTime: "10:00"
      }
    });
    assert.equal(putRes.status, 200);
    const saved = await putRes.json();
    assert.equal(saved.scheduleTimezone, "America/Denver");
  });
});

test("location notification rules APIs update and bulk-copy", async () => {
  await withApi(
    async ({ call }) => {
      const list = await call("/api/location-notification-rules");
      assert.equal(list.status, 200);
      const put = await call("/api/location-notification-rules", {
        method: "PUT",
        body: {
          locationId: LOCATION_ID_A,
          channel: "email",
          enabled: true,
          thresholdPercent: 60,
          eventScope: "either"
        }
      });
      assert.equal(put.status, 200);
      const rule = (await put.json()).rule;
      assert.equal(rule.thresholdPercent, 60);

      const copy = await call("/api/location-notification-rules", {
        method: "POST",
        body: { action: "copy-to-all", sourceLocationId: LOCATION_ID_A }
      });
      assert.equal(copy.status, 200);

      const reset = await call("/api/location-notification-rules", {
        method: "POST",
        body: { action: "reset-defaults" }
      });
      assert.equal(reset.status, 200);

      const enableAll = await call("/api/location-notification-rules", {
        method: "POST",
        body: { action: "set-channel-enabled", channel: "pushover", enabled: false }
      });
      assert.equal(enableAll.status, 200);
    },
    {
      locations: [
        { id: LOCATION_ID_A, name: "Beach", latitude: 1, longitude: 2, createdAt: 1 },
        { id: LOCATION_ID_B, name: "Summit", latitude: 3, longitude: 4, createdAt: 2 }
      ]
    }
  );
});

test("web push subscription APIs never return endpoints or keys", async () => {
  await withApi(async ({ call }) => {
    const vapid = await call("/api/web-push/vapid-public-key");
    assert.equal(vapid.status, 200);

    const created = await call("/api/web-push/subscriptions", {
      method: "POST",
      body: {
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
        deviceName: "Laptop"
      }
    });
    assert.equal(created.status, 201);
    const device = (await created.json()).device;
    assert.equal(device.deviceName, "Laptop");
    assert.equal(device.endpoint, undefined);
    assert.equal(device.keys, undefined);

    const listed = await call("/api/web-push/subscriptions");
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.devices[0].endpoint, undefined);

    const patched = await call(`/api/web-push/subscriptions/${device.id}`, {
      method: "PATCH",
      body: { enabled: false, deviceName: "Laptop 2" }
    });
    assert.equal(patched.status, 200);

    const deleted = await call(`/api/web-push/subscriptions/${device.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
  });
});

test("webhook credentials PUT/GET/DELETE use Secrets Store stub", async () => {
  let stored = JSON.stringify({ version: 1, configured: false });
  await withApi(
    async ({ call, env }) => {
      env.WEBHOOK_TRANSPORT_SECRET = {
        get: async () => stored,
        put: async (value) => {
          stored = value;
        }
      };
      const put = await handleHttpRequest(
        makeRequest("/api/webhook-credentials", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            origin: "https://app.example.com",
            "x-sunsethue-admin": "credentials"
          },
          body: {
            url: "https://hooks.example.com/sunsethue",
            signingSecret: "0123456789abcdef"
          }
        }),
        {
          ...env,
          WEBAPP_URL: "https://app.example.com",
          WEBHOOK_TRANSPORT_SECRET: {
            get: async () => stored,
            put: async (value) => {
              stored = value;
            }
          }
        },
        AUTH_CONTEXT,
        { now: NOW, putWebhookSecret: async (value) => { stored = value; } }
      );
      assert.equal(put.status, 200);
      const get = await handleHttpRequest(
        makeRequest("/api/webhook-credentials", {
          method: "GET",
          headers: { origin: "https://app.example.com" }
        }),
        {
          ...env,
          WEBAPP_URL: "https://app.example.com",
          WEBHOOK_TRANSPORT_SECRET: { get: async () => stored }
        },
        AUTH_CONTEXT,
        { now: NOW }
      );
      assert.equal(get.status, 200);
      const status = await get.json();
      assert.equal(status.configured, true);
      assert.equal(status.maskedHostname, "hooks.example.com");
    },
    { envOverrides: { WEBAPP_URL: "https://app.example.com" }, emailSettings: false }
  );
});
