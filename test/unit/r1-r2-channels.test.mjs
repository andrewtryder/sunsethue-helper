import test from "node:test";
import assert from "node:assert/strict";
import {
  getApplicationSettings,
  saveApplicationSettings,
  validateApplicationSettingsInput,
  estimateForecastQuota
} from "../../worker/notifications/application-settings.js";
import { NotificationError } from "../../worker/notifications/errors.js";
import {
  publicRule,
  validateRulePatch,
  saveRule,
  filterResultsForChannel,
  listRules
} from "../../worker/notifications/rules.js";
import {
  assertSafeWebhookUrl,
  parseWebhookTransport,
  buildWebhookTransportDocument,
  maskWebhookHostname,
  signWebhookBody
} from "../../worker/notifications/resolve-webhook-transport.js";
import { CredentialError } from "../../worker/lib/transport-schema.js";
import {
  hasWebhookTransportAsync,
  buildWebhookPayload,
  sendWebhook
} from "../../worker/notifications/webhook.js";
import {
  publicVapidConfig,
  resolveWebPushConfig,
  registerWebPushSubscription,
  sendWebPush,
  hasWebPushConfiguredAsync
} from "../../worker/notifications/webpush.js";
import { qualityToPercent } from "../../worker/helpers.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import * as db from "../../worker/db.js";
import {
  getWebPushSubscription,
  publicWebPushSubscriptions,
  updateWebPushSubscriptionMeta
} from "../../worker/repositories/webpush.js";

test("application settings validation rejects bad timezones and schedules", () => {
  assert.throws(
    () => validateApplicationSettingsInput({}),
    (error) => error instanceof NotificationError
  );
  assert.throws(
    () => validateApplicationSettingsInput([]),
    (error) => error.code === "INVALID_SETTINGS"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "Not/AZone",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_TIMEZONE"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "selected",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_DISPLAY_TIMEZONE"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:30"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "SCHEDULE_TIMES_INVALID"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "bogus",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_DISPLAY_TIMEZONE_MODE"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "nope",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00",
      extra: true
    }),
    (error) => error.code === "UNKNOWN_SETTINGS_FIELD"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "nope",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_SELF_TEST_MODE"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 9,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_SELF_TEST_DAY"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:30"
    }),
    (error) => error.code === "INVALID_SELF_TEST_TIME"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: "yes",
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00"
    }),
    (error) => error.code === "INVALID_SETTINGS"
  );
  const clearedDisplay = validateApplicationSettingsInput({
    scheduleTimezone: "America/New_York",
    displayTimezoneMode: "device",
    displayTimezone: "Not/AZone",
    scheduleTimes: ["06:00"],
    weeklySelfTestEnabled: false,
    weeklySelfTestMode: "passive",
    weeklySelfTestDay: 0,
    weeklySelfTestTime: "10:00"
  });
  assert.equal(clearedDisplay.displayTimezone, null);
  const valid = validateApplicationSettingsInput({
    scheduleTimezone: "America/New_York",
    displayTimezoneMode: "selected",
    displayTimezone: "Europe/London",
    scheduleTimes: ["06:00", "18:00"],
    weeklySelfTestEnabled: true,
    weeklySelfTestMode: "passive",
    weeklySelfTestDay: 0,
    weeklySelfTestTime: "10:00"
  });
  assert.deepEqual(valid.scheduleTimes, ["06:00", "18:00"]);
  assert.equal(estimateForecastQuota({ scheduleTimes: ["06:00"], activeLocations: 2 }).estimatedRequestsPerDay, 2);
});

test("notification rules validate disabled and event scopes", () => {
  assert.throws(() => validateRulePatch(null), NotificationError);
  assert.throws(() => validateRulePatch({ channel: "fax", locationId: "x", enabled: true }), NotificationError);
  assert.throws(() => validateRulePatch({ channel: "email", locationId: "", enabled: true }), NotificationError);
  assert.throws(() => validateRulePatch({
    locationId: "loc-1", channel: "email", enabled: "yes", thresholdPercent: 50, eventScope: "either"
  }), NotificationError);
  assert.throws(() => validateRulePatch({
    locationId: "loc-1", channel: "email", enabled: true, thresholdPercent: 101, eventScope: "either"
  }), NotificationError);
  assert.throws(() => validateRulePatch({
    locationId: "loc-1", channel: "email", enabled: true, thresholdPercent: 50, eventScope: "later"
  }), NotificationError);
  const disabled = validateRulePatch({
    locationId: "loc-1", channel: "pushover", enabled: false, thresholdPercent: 80, eventScope: "sunrise"
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.thresholdPercent, null);
  const sunriseOnly = filterResultsForChannel(
    [{ locationId: "loc-1", sunrise: { quality: 0.9 }, sunset: { quality: 0.1 }, error: null }],
    [{ locationId: "loc-1", enabled: true, thresholdPercent: 50, eventScope: "sunrise" }]
  );
  assert.deepEqual(sunriseOnly.locations[0].triggeredEvents, ["sunrise"]);
  const noRule = filterResultsForChannel(
    [{ locationId: "loc-1", sunrise: { quality: 0.9 }, sunset: { quality: 0.9 }, error: null }],
    []
  );
  assert.equal(noRule.qualifies, false);
});

test("application settings persist through D1", async () => {
  const local = await createLocalD1();
  try {
    const env = { DB: local.DB };
    const defaults = await getApplicationSettings(env);
    assert.equal(defaults.scheduleTimezone, "America/New_York");
    const saved = await saveApplicationSettings(env, {
      scheduleTimezone: "America/Chicago",
      displayTimezoneMode: "device",
      displayTimezone: null,
      scheduleTimes: ["06:00", "12:00"],
      weeklySelfTestEnabled: false,
      weeklySelfTestMode: "active",
      weeklySelfTestDay: 1,
      weeklySelfTestTime: "09:00"
    }, 1000);
    assert.equal(saved.scheduleTimezone, "America/Chicago");
    const loaded = await getApplicationSettings(env);
    assert.equal(loaded.weeklySelfTestMode, "active");
    assert.equal(loaded.weeklySelfTestEnabled, false);
  } finally {
    local.close();
  }
});

test("notification rules validate and filter by threshold", async () => {
  assert.throws(() => validateRulePatch({ channel: "fax", locationId: "x", enabled: true }), NotificationError);
  const rule = validateRulePatch({
    locationId: "loc-1",
    channel: "email",
    enabled: true,
    thresholdPercent: 60,
    eventScope: "either"
  });
  assert.equal(rule.thresholdPercent, 60);
  const filtered = filterResultsForChannel(
    [
      { locationId: "loc-1", name: "A", sunrise: { quality: 0.4 }, sunset: { quality: 0.8 }, error: null },
      { locationId: "loc-2", name: "B", sunrise: { quality: 0.1 }, sunset: { quality: 0.2 }, error: null }
    ],
    [{ locationId: "loc-1", enabled: true, thresholdPercent: 60, eventScope: "either" }]
  );
  assert.equal(filtered.qualifies, true);
  assert.equal(filtered.locations.length, 1);
  assert.deepEqual(filtered.locations[0].triggeredEvents, ["sunset"]);
  assert.equal(publicRule({ locationId: "x", channel: "email", enabled: 1, thresholdPercent: null, eventScope: "either", updatedAt: 1 }).enabled, true);

  const local = await createLocalD1();
  try {
    const env = { DB: local.DB };
    await db.addLocation(env, { id: "loc-1", name: "A", latitude: 1, longitude: 2, createdAt: 1 });
    await saveRule(env, {
      locationId: "loc-1",
      channel: "email",
      enabled: true,
      thresholdPercent: 50,
      eventScope: "either"
    }, 2);
    const rules = await listRules(env);
    assert.ok(rules.some((r) => r.channel === "email" && r.thresholdPercent === 50));
  } finally {
    local.close();
  }
  assert.equal(qualityToPercent(0.55), 55);
});

test("webhook transport parse/build and SSRF guards", () => {
  assert.throws(() => parseWebhookTransport("{"), CredentialError);
  assert.deepEqual(parseWebhookTransport(JSON.stringify({ version: 1, configured: false })), { version: 1, configured: false });
  assert.throws(
    () => parseWebhookTransport(JSON.stringify({
      version: 1, configured: true, url: "https://hooks.example.com/x", signingSecret: "short"
    })),
    CredentialError
  );
  const built = buildWebhookTransportDocument({
    url: "https://hooks.example.com/x",
    signingSecret: "0123456789abcdef"
  });
  assert.equal(built.document.configured, true);
  assert.throws(() => buildWebhookTransportDocument({ url: "https://ok.example/x", signingSecret: "x" }), CredentialError);
  assert.equal(maskWebhookHostname("https://hooks.example.com/x"), "hooks.example.com");
  assert.equal(maskWebhookHostname("not-a-url"), null);
  assert.throws(() => assertSafeWebhookUrl("https://192.168.0.1/x"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("http://hooks.example.com/x"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("https://user:pass@127.0.0.1/x"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("https://localhost/x"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("https://[::1]/x"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("not a url"), CredentialError);
  assert.throws(() => assertSafeWebhookUrl("x".repeat(2049)), CredentialError);
});

test("sendWebhook signs and classifies responses", async () => {
  const local = await createLocalD1();
  try {
    const env = {
      DB: local.DB,
      WEBHOOK_TRANSPORT_SECRET: {
        get: async () => JSON.stringify({
          version: 1,
          configured: true,
          url: "https://hooks.example.com/x",
          signingSecret: "0123456789abcdef"
        })
      }
    };
    await db.upsertNotificationSettings(env, {
      emailEnabled: 0,
      emailTo: null,
      pushoverEnabled: 0,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null,
      webhookEnabled: 1,
      updatedAt: 1
    });
    assert.equal(await hasWebhookTransportAsync(env), true);
    const job = {
      id: "del-1",
      payload: JSON.stringify({
        version: 1,
        triggerType: "TEST",
        generatedAt: 1,
        locations: [{ name: "A", triggeredEvents: ["sunset"], sunrise: null, sunset: { time: "t", quality: 0.8 } }]
      })
    };
    assert.equal(buildWebhookPayload(job, "del-1", "2026-01-01T00:00:00Z").event, "forecast.notification");
    let seenAuth = null;
    const result = await sendWebhook(job, env, {
      now: 1_700_000_000_000,
      fetch: async (_url, init) => {
        seenAuth = init.headers["X-Sunsethue-Signature"];
        return {
          status: 204,
          body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {} }) }
        };
      }
    });
    assert.equal(result.providerMessageId, "del-1");
    assert.match(seenAuth, /^v1=[a-f0-9]{64}$/);

    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => ({ status: 500, body: null })
      }),
      (error) => error.code === "WEBHOOK_HTTP_500"
    );
    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => ({ status: 429, body: null })
      }),
      (error) => error.code === "WEBHOOK_HTTP_429"
    );
    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => ({ status: 408, body: null })
      }),
      (error) => error.code === "WEBHOOK_RETRYABLE"
    );
    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => ({ status: 404, body: null })
      }),
      (error) => error.code === "WEBHOOK_TERMINAL"
    );
    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => ({ status: 302, body: null })
      }),
      (error) => error.code === "WEBHOOK_REDIRECT"
    );
    await assert.rejects(
      () => sendWebhook(job, env, {
        fetch: async () => { throw new Error("boom"); }
      }),
      (error) => error.code === "WEBHOOK_NETWORK"
    );
    await assert.rejects(
      () => sendWebhook(job, { ...env, WEBHOOK_TRANSPORT_SECRET: { get: async () => JSON.stringify({ version: 1, configured: false }) } }),
      (error) => error.code === "WEBHOOK_NOT_CONFIGURED"
    );
    assert.equal(await hasWebhookTransportAsync({}), false);
    assert.equal(await hasWebhookTransportAsync({
      WEBHOOK_TRANSPORT_SECRET: { get: async () => { throw new Error("store down"); } }
    }), false);
    assert.throws(
      () => buildWebhookPayload({ payload: "{" }, "id", "t"),
      (error) => error.code === "INVALID_NOTIFICATION_PAYLOAD"
    );
    const withSunrise = buildWebhookPayload({
      payload: JSON.stringify({
        version: 1,
        triggerType: "TEST",
        locations: [{
          id: "1",
          name: "A",
          triggeredEvents: ["sunrise"],
          sunrise: { time: "t", quality: 55 },
          sunset: null
        }]
      })
    }, "id", "t");
    assert.equal(withSunrise.locations[0].sunrise.quality, 55);
  } finally {
    local.close();
  }
});

test("web push registration and send classification", async () => {
  const local = await createLocalD1();
  try {
    const { generateKeyPair, exportPKCS8, exportSPKI } = await import("jose");
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    // Uncompressed public key bytes aren't needed for VAPID JWT path used here.
    await exportSPKI(publicKey);
    const env = {
      DB: local.DB,
      WEB_PUSH_VAPID_PUBLIC_KEY: "BPtestdummykeyforcoverage1234567890",
      WEB_PUSH_SUBJECT: "mailto:owner@example.com",
      WEB_PUSH_VAPID_PRIVATE_KEY: privateKeyPem
    };
    assert.equal(publicVapidConfig(env).configured, true);
    const device = await registerWebPushSubscription(env, {
      endpoint: "https://push.example.com/sub",
      keys: { p256dh: "p256", auth: "auth" },
      deviceName: "Phone"
    }, { userAgent: "TestAgent/1.0" }, 10);
    assert.equal(device.deviceName, "Phone");
    assert.equal((await publicWebPushSubscriptions(env))[0].enabled, true);

    const ok = await sendWebPush(
      { deliveryTargetId: device.id, payload: JSON.stringify({ version: 1, triggerType: "TEST", generatedAt: 1, locations: [] }) },
      env,
      {
        now: 20,
        fetch: async () => ({ status: 201 })
      }
    );
    assert.equal(ok.providerMessageId, device.id);

    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, {
        now: 30,
        fetch: async () => ({ status: 410 })
      }),
      (error) => error.code === "WEBPUSH_SUBSCRIPTION_GONE"
    );
    const gone = await getWebPushSubscription(env, device.id);
    assert.equal(Number(gone.enabled), 0);

    // Re-enable for further classification paths.
    await updateWebPushSubscriptionMeta(env, device.id, { enabled: true, lastSeenAt: 40 });
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, {
        now: 41,
        fetch: async () => ({ status: 403 })
      }),
      (error) => error.code === "WEBPUSH_REVOKED"
    );
    await updateWebPushSubscriptionMeta(env, device.id, { enabled: true, lastSeenAt: 50 });
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, {
        now: 51,
        fetch: async () => ({ status: 503 })
      }),
      (error) => error.code === "WEBPUSH_HTTP_500"
    );
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, {
        now: 52,
        fetch: async () => ({ status: 400 })
      }),
      (error) => error.code === "WEBPUSH_TERMINAL"
    );
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, {
        now: 53,
        fetch: async () => { throw new Error("network"); }
      }),
      (error) => error.code === "WEBPUSH_NETWORK"
    );
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: null, payload: "{}" }, env, { now: 54 }),
      (error) => error.code === "WEB_PUSH_TARGET_MISSING"
    );
    await assert.rejects(
      () => registerWebPushSubscription(env, { endpoint: "http://bad", keys: { p256dh: "a", auth: "b" }, deviceName: "x" }),
      (error) => error.code === "INVALID_PUSH_ENDPOINT"
    );
    await assert.rejects(
      () => registerWebPushSubscription(env, null),
      (error) => error.code === "INVALID_PUSH_SUBSCRIPTION"
    );
    await assert.rejects(
      () => registerWebPushSubscription(env, {
        endpoint: "https://push.example.com/ok",
        keys: { p256dh: "", auth: "auth" },
        deviceName: "Phone"
      }),
      (error) => error.code === "INVALID_PUSH_KEYS"
    );
    await assert.rejects(
      () => registerWebPushSubscription(env, {
        endpoint: "https://push.example.com/ok",
        keys: { p256dh: "p", auth: "a" },
        deviceName: ""
      }),
      (error) => error.code === "INVALID_DEVICE_NAME"
    );
    await updateWebPushSubscriptionMeta(env, device.id, { enabled: false, lastSeenAt: 55 });
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, env, { now: 60 }),
      (error) => error.code === "WEB_PUSH_SUBSCRIPTION_DISABLED"
    );
    await assert.rejects(
      () => sendWebPush({ deliveryTargetId: device.id, payload: "{}" }, { DB: local.DB }, { now: 61 }),
      (error) => error.code === "WEB_PUSH_NOT_CONFIGURED"
    );
    const overridden = await sendWebPush({ deliveryTargetId: "x" }, env, {
      sendWebPush: async () => ({ providerMessageId: "override" })
    });
    assert.equal(overridden.providerMessageId, "override");

    assert.equal(await hasWebPushConfiguredAsync({}), false);
    const cfg = await resolveWebPushConfig({
      WEB_PUSH_VAPID_PUBLIC_KEY: "x",
      WEB_PUSH_SUBJECT: "mailto:owner@example.com",
      WEB_PUSH_VAPID_PRIVATE: { get: async () => JSON.stringify({ privateKey: privateKeyPem }) }
    });
    assert.equal(cfg.configured, true);
    const badStore = await resolveWebPushConfig({
      WEB_PUSH_VAPID_PUBLIC_KEY: "x",
      WEB_PUSH_SUBJECT: "mailto:owner@example.com",
      WEB_PUSH_VAPID_PRIVATE: { get: async () => "not-json" }
    });
    assert.equal(badStore.configured, false);
    assert.equal(publicVapidConfig({}).configured, false);
  } finally {
    local.close();
  }
});

test("webhook HMAC helper is deterministic", async () => {
  const a = await signWebhookBody("secret-secret-secret", 100, "{}");
  const b = await signWebhookBody("secret-secret-secret", 100, "{}");
  assert.equal(a, b);
});

test("db helpers cover scheduled claim and webhook disable", async () => {
  const local = await createLocalD1();
  try {
    const env = { DB: local.DB };
    assert.equal(await db.claimScheduledOccurrence(env, "SELFTEST:1", 1), true);
    assert.equal(await db.claimScheduledOccurrence(env, "SELFTEST:1", 2), false);
    await db.upsertNotificationSettings(env, {
      emailEnabled: 0,
      emailTo: null,
      pushoverEnabled: 0,
      pushoverDevice: null,
      pushoverPriority: 0,
      pushoverSound: null,
      webhookEnabled: 1,
      updatedAt: 1
    });
    await db.disableNotificationChannel(env, "webhook", 2);
    const row = await db.getNotificationSettingsRow(env);
    assert.equal(Number(row.webhookEnabled), 0);
    await db.disableNotificationChannel(env, "email", 3);
    await db.disableNotificationChannel(env, "pushover", 4);
  } finally {
    local.close();
  }
});

test("pushover send covers device sound and retryable statuses", async () => {
  const { sendPushover } = await import("../../worker/notifications/pushover.js");
  const { transportBindings } = await import("../support/fakes.mjs");
  const local = await createLocalD1();
  try {
    const env = { DB: local.DB, ...transportBindings() };
    const base = {
      payload: JSON.stringify({
        version: 1,
        triggerType: "AM",
        generatedAt: 1_700_000_000_000,
        dashboardUrl: "https://dashboard.example.test",
        locations: [{ name: "A", sunrise: null, sunset: null, errorCode: null }]
      }),
      deliveryPushoverPriority: 1,
      deliveryPushoverDevice: "phone",
      deliveryPushoverSound: "pushover",
      settings: { pushoverPriority: 0, pushoverDevice: null, pushoverSound: null }
    };
    const ok = await sendPushover(base, env, {
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "req-1" },
        json: async () => ({ status: 1, request: "req-1" })
      })
    });
    assert.equal(ok.providerMessageId, "req-1");
    await assert.rejects(
      () => sendPushover(base, env, { fetch: async () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) }) }),
      (error) => error.code === "PUSHOVER_HTTP_429"
    );
    await assert.rejects(
      () => sendPushover(base, env, { fetch: async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => { throw new Error("bad json"); } }) }),
      (error) => error.code === "PUSHOVER_HTTP_500"
    );
  } finally {
    local.close();
  }
});

test("frontend helper edge branches", async () => {
  const helpers = await import("../../public/lib/helpers.js");
  assert.equal(helpers.normalizeQualityToUnit(Number.NaN), null);
  assert.equal(helpers.normalizeQualityToUnit(150), null);
  assert.equal(helpers.normalizeQualityToUnit(0.5), 0.5);
  assert.equal(helpers.normalizeQualityToUnit(50), 0.5);
  assert.match(
    helpers.mapGeolocationError(3, { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
    /timed out/
  );
  assert.match(
    helpers.mapGeolocationError(99, { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
    /Failed/
  );
});
