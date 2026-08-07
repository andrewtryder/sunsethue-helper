import test from "node:test";
import assert from "node:assert/strict";
import { runAndSendReport, buildHtmlEmail } from "../../worker/services/report.js";
import { handleScheduledReport } from "../../worker/services/scheduler.js";
import * as db from "../../worker/db.js";
import { saveSettings } from "../../worker/notifications/settings.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import {
  createFetchFake,
  createMailerFake,
  jsonOk,
  sunsethueForecast,
  transportBindings,
  unconfiguredTransportBinding
} from "../support/fakes.mjs";

const NOW = Date.parse("2026-07-15T12:00:00Z");

function reportEnv({ envOverrides = {}, transportOverrides = {} } = {}) {
  return {
    SUNSETHUE_API_KEY: "fake-sunsethue-key",
    WEBAPP_URL: "https://app.example.com",
    ...transportBindings(transportOverrides),
    ...envOverrides
  };
}

async function withEnv(fn, { locations = [], envOverrides = {}, transportOverrides = {}, emailSettings = { emailEnabled: true, emailTo: "owner@example.com" } } = {}) {
  const local = await createLocalD1();
  const env = { ...reportEnv({ envOverrides, transportOverrides }), DB: local.DB };
  for (const location of locations) {
    await db.addLocation(env, location);
  }
  if (emailSettings) {
    // Configure D1 notification settings so the email channel opts in for the
    // report. Callers wanting to exercise the "unconfigured / disabled" branch
    // pass `emailSettings: false` (and, if needed, `transportOverrides: { email: null }`).
    await saveSettings(env, {
      emailEnabled: Boolean(emailSettings.emailEnabled),
      emailTo: emailSettings.emailTo ?? null,
      pushoverEnabled: false,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null
    }, NOW);
  }
  try {
    return await fn(env, local);
  } finally {
    local.close();
  }
}

function location(id, name, createdAt) {
  return { id, name, latitude: 42.9 + createdAt, longitude: -71.1, createdAt };
}

test("a successful run stores forecasts, sends one email, and logs success", async () => {
  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({
        "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW }))
      });
      const mailer = createMailerFake();

      await runAndSendReport("AM", env, {
        fetch: fetchFake,
        loadMailer: mailer.loadMailer,
        now: NOW
      });

      assert.equal(fetchFake.calls.length, 2, "one forecast request per location");
      assert.equal(mailer.sent.length, 1, "exactly one email per run");
      assert.equal(mailer.connections[0].host, "smtp.gmail.com");
      assert.equal(mailer.connections[0].secure, true);
      assert.equal(mailer.sent[0].to.email, "owner@example.com");
      assert.match(mailer.sent[0].subject, /Morning/);
      assert.match(mailer.sent[0].html, /Beach/);

      const stored = await db.getLocations(env);
      assert.equal(stored[0].latestSunriseQuality, 0.75);
      assert.equal(stored[0].forecastError, null);
      assert.equal(stored[0].lastForecastUpdate, NOW);

      const runs = await db.getRuns(env);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].status, "success");
      assert.equal(runs[0].locationsCount, 2);
      assert.equal(runs[0].results.length, 2);
      assert.equal(runs[0].results[0].forecast.sunrise.quality, 0.75);
    },
    { locations: [location("a", "Beach", 1), location("b", "Summit", 2)] }
  );
});

test("an upstream Sunsethue failure degrades to a warning run", async () => {
  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({
        "api.sunsethue.com": (url) =>
          url.searchParams.get("latitude") === "43.9"
            ? new Response("upstream down", { status: 503 })
            : jsonOk(sunsethueForecast({ baseTime: NOW }))
      });
      const mailer = createMailerFake();

      await runAndSendReport("PM", env, {
        fetch: fetchFake,
        loadMailer: mailer.loadMailer,
        now: NOW
      });

      const runs = await db.getRuns(env);
      assert.equal(runs[0].status, "warning");
      const failed = runs[0].results.find((result) => result.status === "error");
      assert.equal(failed.error, "FORECAST_UNAVAILABLE");

      const stored = await db.getLocations(env);
      const failedRow = stored.find((row) => row.id === "a");
      assert.equal(failedRow.forecastError, "FORECAST_UNAVAILABLE");

      assert.equal(mailer.sent.length, 1, "partial failures still send a report");
      assert.match(mailer.sent[0].html, /Forecast unavailable/);
    },
    { locations: [location("a", "Beach", 1), location("b", "Summit", 2)] }
  );
});

test("a malformed Sunsethue payload is recorded as an error", async () => {
  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({
        "api.sunsethue.com": () => jsonOk({ unexpected: true })
      });
      const mailer = createMailerFake();

      await runAndSendReport("NOON", env, {
        fetch: fetchFake,
        loadMailer: mailer.loadMailer,
        now: NOW
      });

      const runs = await db.getRuns(env);
      assert.equal(runs[0].status, "warning");
      assert.equal(runs[0].results[0].error, "FORECAST_UNAVAILABLE");
    },
    { locations: [location("a", "Beach", 1)] }
  );
});

test("no locations still creates the configured report delivery", async () => {
  await withEnv(async (env) => {
    const fetchFake = createFetchFake({});
    const mailer = createMailerFake();

    await runAndSendReport("AM", env, {
      fetch: fetchFake,
      loadMailer: mailer.loadMailer,
      now: NOW
    });

    assert.equal(fetchFake.calls.length, 0);
    assert.equal(mailer.sent.length, 1);

    const runs = await db.getRuns(env);
    assert.equal(runs[0].locationsCount, 0);
    assert.equal(runs[0].status, "success");
  });
});

test("at most ten locations are queried per run", async () => {
  const locations = Array.from({ length: 14 }, (_, index) =>
    location(`loc-${index}`, `Spot ${index}`, index + 1)
  );

  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({
        "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW }))
      });
      const mailer = createMailerFake();

      await runAndSendReport("AM", env, {
        fetch: fetchFake,
        loadMailer: mailer.loadMailer,
        now: NOW
      });

      assert.equal(fetchFake.calls.length, 10, "execution cap protects the API credit budget");
      const runs = await db.getRuns(env);
      assert.equal(runs[0].locationsCount, 10);
    },
    { locations }
  );
});

test("with delivery disabled in settings the report still generates a run without sending email", async () => {
  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({});
      const mailer = createMailerFake();

      await runAndSendReport("AM", env, { fetch: fetchFake, loadMailer: mailer.loadMailer, now: NOW });
      assert.equal(fetchFake.calls.length, 1);
      assert.equal(mailer.sent.length, 0, "no outbox job is enqueued when the email channel is disabled");
      const runs = await db.getRuns(env);
      assert.equal(runs[0].status, "warning");
    },
    {
      locations: [location("a", "Beach", 1)],
      // Leave D1 notification settings at their ship-safe defaults (email
      // disabled). The report still runs and records forecast state — it
      // simply enqueues no delivery jobs.
      emailSettings: false
    }
  );
});

test("a missing Sunsethue API key fails closed", async () => {
  await withEnv(
    async (env) => {
      await assert.rejects(
        () =>
          runAndSendReport("AM", env, {
            fetch: createFetchFake({}),
            loadMailer: createMailerFake().loadMailer,
            now: NOW
          }),
        /SUNSETHUE_API_KEY/
      );
      const runs = await db.getRuns(env);
      assert.equal(runs[0].status, "failure");
    },
    { envOverrides: { SUNSETHUE_API_KEY: "" } }
  );
});

test("an SMTP send failure remains queued for retry", async () => {
  await withEnv(
    async (env) => {
      const mailer = createMailerFake({ failSend: true });

      await runAndSendReport("AM", env, { fetch: createFetchFake({ "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW })) }), loadMailer: mailer.loadMailer, now: NOW });

      const runs = await db.getRuns(env);
      assert.equal(runs[0].status, "success");
      const deliveries = await db.getNotificationDeliveries(env);
      assert.equal(deliveries[0].status, "pending");
      assert.equal(deliveries[0].lastErrorCode, "SMTP_DELIVERY_FAILED");
    },
    { locations: [location("a", "Beach", 1)] }
  );
});

test("scheduled execution reaches the report runner without any Access token", async () => {
  await withEnv(
    async (env) => {
      const fetchFake = createFetchFake({
        "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW }))
      });
      const mailer = createMailerFake();

      const triggered = await handleScheduledReport({ cron: "0 * * * *" }, env, {
        now: "2026-07-15T22:00:00Z",
        runAndSendReport: (triggerType, scheduledEnv) =>
          runAndSendReport(triggerType, scheduledEnv, {
            fetch: fetchFake,
            loadMailer: mailer.loadMailer,
            now: NOW
          })
      });

      assert.equal(triggered, "SCHEDULED:18:00");
      assert.equal(mailer.sent.length, 1);
      const runs = await db.getRuns(env);
      assert.equal(runs[0].triggerType, "SCHEDULED:18:00");
    },
    { locations: [location("a", "Beach", 1)] }
  );
});

test("email HTML escapes location names and orders columns by trigger type", () => {
  const results = [
    {
      name: '<img src=x onerror="alert(1)">',
      sunrise: { time: "2026-07-15T09:30:00Z", quality: 0.9, quality_text: "Great" },
      sunset: { time: "2026-07-15T23:50:00Z", quality: 0.3, quality_text: "Poor" },
      error: null
    }
  ];

  const morning = buildHtmlEmail(results, "AM", "now", "https://example.test");
  assert.doesNotMatch(morning, /<img src=x/);
  assert.match(morning, /&lt;img src=x/);
  assert.ok(
    morning.indexOf("Next Sunset") < morning.indexOf("Next Sunrise"),
    "AM reports lead with the upcoming sunset"
  );

  const evening = buildHtmlEmail(results, "PM", "now", "https://example.test");
  assert.ok(evening.indexOf("Next Sunrise") < evening.indexOf("Next Sunset"));
});
