import test from "node:test";
import assert from "node:assert/strict";
import { enqueueNotifications, generateReport } from "../../worker/services/report.js";
import * as db from "../../worker/db.js";
import { saveSettings } from "../../worker/notifications/settings.js";
import {
  getApplicationSettings,
  saveApplicationSettings,
  validateApplicationSettingsInput
} from "../../worker/notifications/application-settings.js";
import { NotificationError } from "../../worker/notifications/errors.js";
import { upsertLocationNotificationRule } from "../../worker/repositories/notification-rules.js";
import { parseNotificationPayload } from "../../worker/notifications/payload.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import { createFetchFake, jsonOk, sunsethueForecast, transportBindings } from "../support/fakes.mjs";

const NOW = Date.parse("2026-07-15T10:00:00Z");

async function withEnv(fn) {
  const local = await createLocalD1();
  const env = {
    DB: local.DB,
    SUNSETHUE_API_KEY: "fake-sunsethue-key",
    WEBAPP_URL: "https://dashboard.example.test",
    ...transportBindings()
  };
  try {
    await db.addLocation(env, {
      id: "loc-sandown",
      name: "Sandown",
      latitude: 42.9,
      longitude: -71.1,
      createdAt: NOW
    });
    await db.addLocation(env, {
      id: "loc-portland",
      name: "Portland",
      latitude: 43.65,
      longitude: -70.25,
      createdAt: NOW + 1
    });
    await fn(env);
  } finally {
    local.close();
  }
}

function coreSettings(overrides = {}) {
  return {
    scheduleTimezone: "America/New_York",
    displayTimezoneMode: "schedule",
    displayTimezone: null,
    scheduleTimes: ["06:00", "12:00", "18:00"],
    weeklySelfTestEnabled: true,
    weeklySelfTestMode: "passive",
    weeklySelfTestDay: 0,
    weeklySelfTestTime: "10:00",
    ...overrides
  };
}

function forecastModel({
  runId = "run-1",
  triggerType = "SCHEDULED:06:00",
  locations = [
    {
      locationId: "loc-sandown",
      name: "Sandown",
      sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.4, quality_text: "Fair" },
      sunset: { time: "2026-07-15T23:00:00Z", quality: 0.55, quality_text: "Fair" },
      error: null
    },
    {
      locationId: "loc-portland",
      name: "Portland",
      sunrise: { time: "2026-07-15T09:05:00Z", quality: 0.5, quality_text: "Fair" },
      sunset: { time: "2026-07-15T23:10:00Z", quality: 0.81, quality_text: "Great" },
      error: null
    }
  ]
} = {}) {
  return {
    runId,
    triggerType,
    generatedAt: NOW,
    dashboardUrl: "https://dashboard.example.test",
    locationsCount: locations.length,
    results: locations
  };
}

async function enableChannels(env, { email = true, pushover = true } = {}) {
  await saveSettings(env, {
    emailEnabled: email,
    emailTo: email ? "owner@example.com" : null,
    pushoverEnabled: pushover,
    pushoverDevice: null,
    pushoverPriority: 0,
    pushoverSound: null
  }, NOW);
}

async function setRule(env, locationId, channel, thresholdPercent) {
  await upsertLocationNotificationRule(env, {
    locationId,
    channel,
    enabled: true,
    thresholdPercent,
    eventScope: "either",
    updatedAt: NOW
  });
}

test("scheduled reports default disabled and inherit missing fields on save", async () => {
  await withEnv(async (env) => {
    const defaults = await getApplicationSettings(env);
    assert.equal(defaults.scheduledReportsEnabled, false);
    assert.deepEqual(defaults.scheduledReportTimes, []);
    assert.deepEqual(defaults.scheduledReportChannels, []);

    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00", "18:00"],
      scheduledReportChannels: ["email", "pushover"]
    }, NOW);

    const withoutNewFields = await saveApplicationSettings(env, coreSettings({
      scheduleTimes: ["06:00", "12:00"]
    }), NOW + 1);
    assert.equal(withoutNewFields.scheduledReportsEnabled, true);
    assert.deepEqual(withoutNewFields.scheduledReportTimes, ["06:00"]);
    assert.deepEqual(withoutNewFields.scheduledReportChannels, ["email", "pushover"]);
  });
});

test("stale client zero-overlap disables scheduled reports instead of rejecting", async () => {
  await withEnv(async (env) => {
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00", "18:00"],
      scheduledReportChannels: ["email"]
    }, NOW);

    const reconciled = await saveApplicationSettings(env, coreSettings({
      scheduleTimes: ["09:00", "12:00"]
    }), NOW + 1);
    assert.equal(reconciled.scheduledReportsEnabled, false);
    assert.deepEqual(reconciled.scheduledReportTimes, []);
    assert.deepEqual(reconciled.scheduledReportChannels, ["email"]);
  });
});

test("scheduled report times must be a subset of forecast-check times", () => {
  assert.throws(
    () => validateApplicationSettingsInput({
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["09:00"],
      scheduledReportChannels: ["email"]
    }),
    (error) => error instanceof NotificationError && error.code === "INVALID_SCHEDULED_REPORT_TIME"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: []
    }),
    (error) => error.code === "INVALID_SCHEDULED_REPORT_CONFIGURATION"
  );
});

test("with scheduled reports disabled, below-threshold channels are skipped quality alerts", async () => {
  await withEnv(async (env) => {
    await enableChannels(env);
    await setRule(env, "loc-sandown", "email", 70);
    await setRule(env, "loc-portland", "email", 70);
    await setRule(env, "loc-sandown", "pushover", 70);
    await setRule(env, "loc-portland", "pushover", 70);

    const jobs = await enqueueNotifications(forecastModel({
      locations: [{
        locationId: "loc-sandown",
        name: "Sandown",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.4, quality_text: "Fair" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0.55, quality_text: "Fair" },
        error: null
      }]
    }), env);

    assert.equal(jobs.length, 2);
    assert.ok(jobs.every((job) => job.status === "skipped"));
    assert.ok(jobs.every((job) => job.lastErrorCode === "NO_LOCATION_ABOVE_THRESHOLD"));
    assert.ok(jobs.every((job) => job.deliveryPurpose === "quality_alert"));
  });
});

test("scheduled report sends full run below threshold and does not skip", async () => {
  await withEnv(async (env) => {
    await enableChannels(env, { pushover: false });
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    }, NOW);
    await setRule(env, "loc-sandown", "email", 90);
    await setRule(env, "loc-portland", "email", 90);

    const model = forecastModel();
    const jobs = await enqueueNotifications(model, env);
    const email = jobs.find((job) => job.channel === "email");
    assert.equal(email.status, "pending");
    assert.equal(email.deliveryPurpose, "scheduled_report");

    const row = await env.DB.prepare(
      "SELECT payload, deliveryPurpose FROM notification_outbox WHERE id = ?"
    ).bind(email.id).first();
    assert.equal(row.deliveryPurpose, "scheduled_report");
    const payload = parseNotificationPayload(row.payload);
    assert.equal(payload.locations.length, 2);
    assert.equal(payload.deliveryPurpose, "scheduled_report");
  });
});

test("scheduled report + quality qualify on same channel creates one scheduled_report job", async () => {
  await withEnv(async (env) => {
    await enableChannels(env, { pushover: false });
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    }, NOW);
    await setRule(env, "loc-sandown", "email", 70);
    await setRule(env, "loc-portland", "email", 70);

    const jobs = await enqueueNotifications(forecastModel(), env);
    const emailJobs = jobs.filter((job) => job.channel === "email");
    assert.equal(emailJobs.length, 1);
    assert.equal(emailJobs[0].deliveryPurpose, "scheduled_report");
    assert.equal(emailJobs[0].status, "pending");

    const row = await env.DB.prepare(
      "SELECT payload FROM notification_outbox WHERE id = ?"
    ).bind(emailJobs[0].id).first();
    const payload = parseNotificationPayload(row.payload);
    assert.equal(payload.locations.length, 2);
    const portland = payload.locations.find((loc) => loc.name === "Portland");
    assert.ok(portland.triggeredEvents.includes("sunset"));
  });
});

test("alert-only channel still creates quality_alert when not in scheduled report channels", async () => {
  await withEnv(async (env) => {
    await enableChannels(env);
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    }, NOW);
    await setRule(env, "loc-sandown", "email", 70);
    await setRule(env, "loc-portland", "email", 70);
    await setRule(env, "loc-sandown", "pushover", 60);
    await setRule(env, "loc-portland", "pushover", 60);

    const jobs = await enqueueNotifications(forecastModel(), env);
    const email = jobs.find((job) => job.channel === "email");
    const pushover = jobs.find((job) => job.channel === "pushover");
    assert.equal(email.deliveryPurpose, "scheduled_report");
    assert.equal(pushover.deliveryPurpose, "quality_alert");
    assert.equal(pushover.status, "pending");

    const pushPayload = parseNotificationPayload(
      (await env.DB.prepare("SELECT payload FROM notification_outbox WHERE id = ?").bind(pushover.id).first()).payload
    );
    assert.equal(pushPayload.locations.length, 1);
    assert.equal(pushPayload.locations[0].name, "Portland");
  });
});

test("non-scheduled slot produces quality alerts only", async () => {
  await withEnv(async (env) => {
    await enableChannels(env);
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00", "18:00"],
      scheduledReportChannels: ["email", "pushover"]
    }, NOW);
    await setRule(env, "loc-sandown", "email", 70);
    await setRule(env, "loc-portland", "email", 70);
    await setRule(env, "loc-sandown", "pushover", 60);
    await setRule(env, "loc-portland", "pushover", 60);

    const jobs = await enqueueNotifications(forecastModel({
      runId: "run-noon",
      triggerType: "SCHEDULED:12:00"
    }), env);

    assert.ok(jobs.every((job) => job.deliveryPurpose === "quality_alert"));
    const email = jobs.find((job) => job.channel === "email");
    const pushover = jobs.find((job) => job.channel === "pushover");
    assert.equal(email.status, "pending");
    assert.equal(pushover.status, "pending");

    const emailPayload = parseNotificationPayload(
      (await env.DB.prepare("SELECT payload FROM notification_outbox WHERE id = ?").bind(email.id).first()).payload
    );
    assert.equal(emailPayload.locations.length, 1);
    assert.equal(emailPayload.locations[0].name, "Portland");
  });
});

test("TEST and WEEKLY_SELF_TEST bypass thresholds and set deliveryPurpose", async () => {
  await withEnv(async (env) => {
    await enableChannels(env, { pushover: false });
    await setRule(env, "loc-sandown", "email", 99);

    const testJobs = await enqueueNotifications(forecastModel({
      runId: "run-test",
      triggerType: "TEST",
      locations: [{
        locationId: "loc-sandown",
        name: "Sandown",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.1, quality_text: "Poor" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0.1, quality_text: "Poor" },
        error: null
      }]
    }), env);
    assert.equal(testJobs[0].deliveryPurpose, "test");
    assert.equal(testJobs[0].status, "pending");

    const selfJobs = await enqueueNotifications(forecastModel({
      runId: "run-self",
      triggerType: "WEEKLY_SELF_TEST",
      locations: [{
        locationId: "loc-sandown",
        name: "Sandown",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.1, quality_text: "Poor" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0.1, quality_text: "Poor" },
        error: null
      }]
    }), env);
    assert.equal(selfJobs[0].deliveryPurpose, "self_test");
  });
});

test("below-threshold Manual Test skips with deliveryPurpose test", async () => {
  await withEnv(async (env) => {
    await enableChannels(env, { pushover: false });
    await setRule(env, "loc-sandown", "email", 90);
    await setRule(env, "loc-portland", "email", 90);

    const jobs = await enqueueNotifications(forecastModel({
      runId: "run-manual-skip",
      triggerType: "Manual Test",
      locations: [{
        locationId: "loc-sandown",
        name: "Sandown",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.2, quality_text: "Poor" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0.3, quality_text: "Poor" },
        error: null
      }]
    }), env);

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].channel, "email");
    assert.equal(jobs[0].status, "skipped");
    assert.equal(jobs[0].lastErrorCode, "NO_LOCATION_ABOVE_THRESHOLD");
    assert.equal(jobs[0].deliveryPurpose, "test");
  });
});

test("enqueue plans webhook and webpush channels when configured", async () => {
  await withEnv(async (env) => {
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["webhook", "webpush"]
    }, NOW);

    const jobs = await enqueueNotifications(forecastModel({ runId: "run-multi-channel" }), env, {
      webhookConfigured: true,
      webPushSubscriptions: [{ id: "sub-1" }, { id: "sub-2" }],
      applicationSettings: await getApplicationSettings(env),
      settings: {
        emailEnabled: 0,
        pushoverEnabled: 0,
        webhookEnabled: 1
      }
    });

    const webhook = jobs.filter((job) => job.channel === "webhook");
    const webpush = jobs.filter((job) => job.channel === "webpush");
    assert.equal(webhook.length, 1);
    assert.equal(webhook[0].deliveryPurpose, "scheduled_report");
    assert.equal(webpush.length, 2);
    assert.ok(webpush.every((job) => job.deliveryPurpose === "scheduled_report"));
  });
});

test("globally disabled scheduled-report channel creates no job", async () => {
  await withEnv(async (env) => {
    await enableChannels(env, { email: false, pushover: false });
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email", "pushover"]
    }, NOW);

    const jobs = await enqueueNotifications(forecastModel(), env);
    assert.equal(jobs.length, 0);

    const stored = await getApplicationSettings(env);
    assert.deepEqual(stored.scheduledReportChannels, ["email", "pushover"]);
  });
});

test("legacy NULL deliveryPurpose normalizes on read", async () => {
  await withEnv(async (env) => {
    await env.DB.prepare(
      `INSERT INTO runs (id, timestamp, triggerType, status, locationsCount, results, error)
       VALUES ('legacy-run', ?, 'SCHEDULED:06:00', 'success', 1, '[]', NULL)`
    ).bind(NOW).run();
    await env.DB.prepare(
      `INSERT INTO notification_outbox
        (id, runId, channel, deliveryTargetId, status, payload, attempts, createdAt, nextAttemptAt, lastErrorCode, deliveryPurpose)
       VALUES ('legacy-job', 'legacy-run', 'email', NULL, 'sent', '{}', 1, ?, ?, NULL, NULL)`
    ).bind(NOW, NOW).run();

    const deliveries = await db.getNotificationDeliveries(env, 10);
    const legacy = deliveries.find((row) => row.id === "legacy-job");
    assert.equal(legacy.deliveryPurpose, "quality_alert");
  });
});

test("scheduled report plus quality alert reuses one forecast fetch per location", async () => {
  await withEnv(async (env) => {
    // Remove seeded locations so this case measures exactly one due location.
    await env.DB.prepare("DELETE FROM locations").run();
    await db.addLocation(env, {
      id: "loc-a",
      name: "Harbor",
      latitude: 42.9,
      longitude: -71.1,
      createdAt: NOW
    });
    await enableChannels(env, { pushover: false });
    await saveApplicationSettings(env, {
      ...coreSettings(),
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    }, NOW);
    await setRule(env, "loc-a", "email", 50);

    const fetchFake = createFetchFake({
      "api.sunsethue.com": () => jsonOk(sunsethueForecast({ baseTime: NOW }))
    });
    const model = await generateReport("SCHEDULED:06:00", env, { fetch: fetchFake, now: NOW });
    assert.equal(fetchFake.calls.length, 1);

    const jobs = await enqueueNotifications(model, env, { applicationSettings: await getApplicationSettings(env) });
    assert.equal(fetchFake.calls.length, 1, "enqueue must not fetch forecasts again");
    assert.equal(jobs.filter((job) => job.channel === "email").length, 1);
    assert.equal(jobs[0].deliveryPurpose, "scheduled_report");
  });
});
