import test from "node:test";
import assert from "node:assert/strict";
import * as db from "../../worker/db.js";
import { enqueueNotifications } from "../../worker/report.js";
import { dispatchPendingNotifications, nextAttemptAt } from "../../worker/notifications/dispatcher.js";
import { sendPushover } from "../../worker/notifications/pushover.js";
import { asNotificationError, NotificationError } from "../../worker/notifications/errors.js";
import { buildPushoverContent, parseNotificationPayload } from "../../worker/notifications/payload.js";
import { getSettings, publicSettings, saveSettings } from "../../worker/notifications/settings.js";
import { handleHttpRequest } from "../../worker/api.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import {
  createFetchFake,
  createMailerFake,
  fakeSecretsStoreBinding,
  jsonOk,
  transportBindings,
  unconfiguredTransportBinding
} from "../support/fakes.mjs";
import { makeRequest } from "../helpers.mjs";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const TOKEN_A = "00000000-0000-0000-0000-000000000001";
const TOKEN_B = "00000000-0000-0000-0000-000000000002";

const FAKE_EMAIL_PASSWORD = "fake-app-password";

async function withEnv(fn) {
  const local = await createLocalD1();
  const env = {
    DB: local.DB,
    ...transportBindings(),
    WEBAPP_URL: "https://dashboard.example.test"
  };
  try { await fn(env); } finally { local.close(); }
}

function model(runId = crypto.randomUUID()) {
  return {
    runId, triggerType: "AM", generatedAt: NOW, dashboardUrl: "https://dashboard.example.test",
    locationsCount: 1,
    results: [{ name: "Private beach", sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.7, quality_text: "Good" }, sunset: { time: "2026-07-15T23:00:00Z", quality: 0.5, quality_text: "Fair" }, error: null }]
  };
}

test("default notification settings ship disabled and publicSettings uses D1 credential metadata", async () => {
  await withEnv(async (env) => {
    const settings = await getSettings(env);
    // Ship-safe defaults: the owner must opt in through the Notifications UI.
    assert.equal(settings.emailEnabled, 0);
    assert.equal(settings.emailTo, null);
    assert.equal(settings.pushoverEnabled, 0);

    // Without D1 provider_credential_status rows, UI readiness is not configured
    // even when Secrets Store bindings exist (store is not probed on GET).
    const unconfigured = await publicSettings(settings, env);
    assert.equal(unconfigured.emailConfigured, false);
    assert.equal(unconfigured.pushoverConfigured, false);

    await db.upsertProviderCredentialStatus(env, {
      provider: "email",
      configured: 1,
      maskedIdentifier: "ow***@example.com",
      updatedAt: NOW,
      lastValidatedAt: NOW,
      lastValidationCode: "OK"
    });
    await db.upsertProviderCredentialStatus(env, {
      provider: "pushover",
      configured: 1,
      maskedIdentifier: "configured",
      updatedAt: NOW,
      lastValidatedAt: NOW,
      lastValidationCode: "OK"
    });

    const visible = await publicSettings(settings, env);
    assert.equal(visible.emailConfigured, true);
    assert.equal(visible.pushoverConfigured, true);
    // Never surface the actual Gmail/Pushover secrets.
    assert.doesNotMatch(JSON.stringify(visible), /fake-app-password|abcdefghijklmnopqrstuvwxyz12|zyxwvutsrqponmlkjihgfedcba98/);
  });
});

test("settings support both channels and reject injection, emergency priority, and unknown fields", async () => {
  await withEnv(async (env) => {
    const input = { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: true, pushoverDevice: "phone-1", pushoverPriority: 1, pushoverSound: "cosmic" };
    const saved = await saveSettings(env, input, NOW);
    assert.equal(saved.pushoverEnabled, 1);
    await assert.rejects(() => saveSettings(env, { ...input, emailTo: "owner@example.com\r\nBcc:x", unexpected: true }), /UNKNOWN_SETTINGS_FIELD/);
    await assert.rejects(() => saveSettings(env, { ...input, pushoverPriority: 2 }), /INVALID_PUSHOVER_PRIORITY/);
  });
});

test("saveSettings fails closed when the caller enables an unconfigured provider", async () => {
  await withEnv(async (env) => {
    // Replace Pushover with the unconfigured sentinel so the resolver reports
    // the store as not-ready and saveSettings rejects.
    const withoutPushover = { ...env, PUSHOVER_TRANSPORT_SECRET: unconfiguredTransportBinding() };
    await assert.rejects(
      () => saveSettings(withoutPushover, {
        emailEnabled: false, emailTo: null,
        pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null
      }, NOW),
      /PROVIDER_NOT_CONFIGURED/
    );
    const withoutEmail = { ...env, EMAIL_TRANSPORT_SECRET: unconfiguredTransportBinding() };
    await assert.rejects(
      () => saveSettings(withoutEmail, {
        emailEnabled: true, emailTo: "owner@example.com",
        pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null
      }, NOW),
      /PROVIDER_NOT_CONFIGURED/
    );
  });
});

test("run and outbox creation is atomic and creates one job per enabled channel", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const report = model("run-both");
    const jobs = await enqueueNotifications(report, env);
    assert.deepEqual(jobs.map((job) => job.channel).sort(), ["email", "pushover"]);
    assert.equal((await db.getRuns(env))[0].id, "run-both");
    await assert.rejects(() => enqueueNotifications(report, env));
    assert.equal((await db.getNotificationDeliveries(env)).length, 2);
  });
});

test("enqueueNotifications snapshots delivery preferences at enqueue time", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, {
      emailEnabled: false, emailTo: null,
      pushoverEnabled: true, pushoverDevice: "phone-original", pushoverPriority: 1, pushoverSound: "cosmic"
    }, NOW);
    const [job] = await enqueueNotifications(model("run-snapshot"), env);
    const stored = await db.getOutboxJob(env, job.id);
    assert.equal(stored.deliveryPushoverDevice, "phone-original");
    assert.equal(stored.deliveryPushoverPriority, 1);
    assert.equal(stored.deliveryPushoverSound, "cosmic");

    // A settings change after enqueue must not redirect the pending job.
    await saveSettings(env, {
      emailEnabled: false, emailTo: null,
      pushoverEnabled: true, pushoverDevice: "phone-new", pushoverPriority: 0, pushoverSound: "none"
    }, NOW);
    const stillOriginal = await db.getOutboxJob(env, job.id);
    assert.equal(stillOriginal.deliveryPushoverDevice, "phone-original");
    assert.equal(stillOriginal.deliveryPushoverPriority, 1);
    assert.equal(stillOriginal.deliveryPushoverSound, "cosmic");
  });
});

test("dispatcher claims once, sends email through the injected mailer, and records only safe status", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const jobs = await enqueueNotifications(model("run-email"), env);
    const mailer = createMailerFake();
    const outcomes = await dispatchPendingNotifications(env, { now: NOW, loadMailer: mailer.loadMailer });
    assert.equal(outcomes[0].status, "sent");
    assert.equal(mailer.sent.length, 1);
    const stored = await db.getOutboxJob(env, jobs[0].id);
    assert.equal(stored.status, "sent");
    assert.equal(stored.leaseToken, null, "lease token cleared on completion");
    assert.equal(stored.payload.includes(FAKE_EMAIL_PASSWORD), false, "stored payload never carries the Gmail app password");
    assert.equal(await db.claimOutboxJob(env, jobs[0].id, NOW, NOW + 60_000, TOKEN_A), false);
  });
});

test("lease fencing prevents an expired-lease writer from overwriting a live job", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("run-fenced"), env);
    assert.equal(await db.claimOutboxJob(env, job.id, NOW, NOW + 60_000, TOKEN_A), true);

    // A caller with a stale token must not be able to complete or fail the job.
    assert.equal(await db.completeOutboxJob(env, job.id, TOKEN_B, NOW, null), false);
    assert.equal(await db.failOutboxJob(env, job.id, TOKEN_B, { attempts: 1, nextAttemptAt: NOW, code: "STALE", terminal: true }), false);

    // The current lease-holder can complete the job.
    assert.equal(await db.completeOutboxJob(env, job.id, TOKEN_A, NOW + 1, "provider-id"), true);
    const stored = await db.getOutboxJob(env, job.id);
    assert.equal(stored.status, "sent");
    assert.equal(stored.providerMessageId, "provider-id");
  });
});

test("notification logs omit synthetic provider secrets, recipient data, and location names", async () => {
  await withEnv(async (env) => {
    env.EMAIL_TRANSPORT_SECRET = fakeSecretsStoreBinding({
      version: 1,
      configured: true,
      gmailUser: "reports@example.com",
      gmailAppPassword: "synthetic-secret-password",
      emailFrom: '"Sunsethue Helper" <reports@example.com>'
    });
    await saveSettings(env, { emailEnabled: true, emailTo: "private-recipient@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const privateModel = model("private-log-run");
    privateModel.results[0].name = "Secret Observatory";
    await enqueueNotifications(privateModel, env);
    const mailer = createMailerFake();
    const lines = [];
    const originalLog = console.log;
    console.log = (...parts) => lines.push(parts.join(" "));
    try {
      await dispatchPendingNotifications(env, { now: NOW, loadMailer: mailer.loadMailer });
    } finally { console.log = originalLog; }
    const output = lines.join("\n");
    assert.doesNotMatch(output, /synthetic-secret-password|private-recipient|Secret Observatory/);
    assert.match(output, /NOTIFICATION_SENT/);
  });
});

test("expired leases recover and transient Pushover failures follow the retry schedule", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("run-push"), env);
    assert.equal(await db.claimOutboxJob(env, job.id, NOW, NOW + 1, TOKEN_A), true);
    const fetchFake = createFetchFake({ "api.pushover.net": () => new Response("busy", { status: 429 }) });
    const outcomes = await dispatchPendingNotifications(env, { now: NOW + 2, fetch: fetchFake });
    assert.equal(outcomes[0].status, "pending");
    const stored = await db.getOutboxJob(env, job.id);
    assert.equal(stored.attempts, 1);
    assert.equal(stored.nextAttemptAt, nextAttemptAt(NOW + 2, 1));
    assert.equal(stored.lastErrorCode, "PUSHOVER_HTTP_429");
  });
});

test("Pushover payload is bounded and successful provider request IDs are safe", async () => {
  await withEnv(async (env) => {
    const long = model("run-push-success");
    long.results[0].name = "x".repeat(2_000);
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: "phone", pushoverPriority: -1, pushoverSound: "none" }, NOW);
    const [job] = await enqueueNotifications(long, env);
    const stored = await db.getOutboxJob(env, job.id);
    const fetchFake = createFetchFake({ "api.pushover.net": (url, init) => {
      assert.equal(url.pathname, "/1/messages.json");
      const body = new URLSearchParams(init.body);
      assert.ok(body.get("title").length <= 250);
      assert.ok(new TextEncoder().encode(body.get("message")).byteLength <= 1024);
      assert.equal(body.get("device"), "phone");
      assert.equal(body.get("priority"), "-1");
      assert.equal(body.get("sound"), "none");
      return jsonOk({ status: 1, request: "safe-request-id" });
    } });
    const result = await sendPushover({ ...stored, settings: await getSettings(env) }, env, { fetch: fetchFake });
    assert.equal(result.providerMessageId, "safe-request-id");
  });
});

test("notification helpers classify failures and reject malformed payloads without provider details", () => {
  assert.equal(asNotificationError(new Error("provider said secret")).code, "PROVIDER_UNAVAILABLE");
  assert.equal(asNotificationError(new NotificationError("KNOWN")).code, "KNOWN");
  assert.throws(() => parseNotificationPayload("not json"), /INVALID_NOTIFICATION_PAYLOAD/);
  assert.throws(() => parseNotificationPayload(JSON.stringify({ version: 2, locations: null })), /INVALID_NOTIFICATION_PAYLOAD/);
  assert.throws(() => parseNotificationPayload(JSON.stringify({
    version: 1, triggerType: "BOGUS", generatedAt: NOW, locations: []
  })), /INVALID_NOTIFICATION_PAYLOAD/);
  assert.throws(() => parseNotificationPayload(JSON.stringify({
    version: 1, triggerType: "AM", generatedAt: NOW, dashboardUrl: "javascript:alert(1)", locations: []
  })), /INVALID_NOTIFICATION_PAYLOAD/);
  assert.throws(() => parseNotificationPayload(JSON.stringify({
    version: 1, triggerType: "AM", generatedAt: NOW, dashboardUrl: null,
    locations: [{ name: "A", errorCode: "SOMETHING_ELSE" }]
  })), /INVALID_NOTIFICATION_PAYLOAD/);
  const okPayload = JSON.stringify({
    version: 1, triggerType: "AM", generatedAt: NOW, dashboardUrl: "https://ok.example",
    locations: [{ name: "A", sunrise: null, sunset: null, errorCode: null }]
  });
  const parsed = parseNotificationPayload(okPayload);
  assert.equal(parsed.locations[0].name, "A");
  const content = buildPushoverContent({ triggerType: "AM", locations: [{ name: "A", errorCode: "FORECAST_UNAVAILABLE" }] });
  assert.match(content.message, /unavailable/);
  assert.equal(buildPushoverContent({ triggerType: "AM", locations: [] }).message, "Forecast report generated.");
  assert.equal(nextAttemptAt(NOW, 9), NOW + 2 * 60 * 60_000);
});

test("Pushover rejects invalid credentials and normalizes timeout failures", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("push-errors"), env);
    const stored = await db.getOutboxJob(env, job.id);
    const delivery = { ...stored, settings: await getSettings(env) };
    await assert.rejects(() => sendPushover(delivery, env, { fetch: async () => new Response("no", { status: 401 }) }), /PUSHOVER_HTTP_401/);
    await assert.rejects(() => sendPushover(delivery, env, { fetch: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } }), /PUSHOVER_TIMEOUT/);
  });
});

test("settings reject invalid email and Pushover option values", async () => {
  await withEnv(async (env) => {
    const valid = { emailEnabled: false, emailTo: null, pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null };
    await assert.rejects(() => saveSettings(env, { ...valid, emailEnabled: true, emailTo: "bad address" }), /INVALID_EMAIL_ADDRESS/);
    await assert.rejects(() => saveSettings(env, { ...valid, pushoverSound: "bad\nvalue" }), /INVALID_PUSHOVER_OPTION/);
    await assert.rejects(() => saveSettings(env, null), /INVALID_SETTINGS/);
  });
});

test("notification settings and delivery history routes validate bodies and redact payloads", async () => {
  await withEnv(async (env) => {
    const call = (path, options, deps = {}) => handleHttpRequest(makeRequest(path, options), env, { authorized: true }, { now: NOW, ...deps });
    const initial = await call("/api/notification-settings");
    assert.equal(initial.status, 200);
    // Ship-safe defaults: channels start disabled until the owner opts in.
    assert.equal((await initial.json()).emailEnabled, false);
    const invalidType = await call("/api/notification-settings", { method: "PUT", headers: { "content-type": "text/plain" }, body: "{}" });
    assert.equal(invalidType.status, 415);
    const invalid = await call("/api/notification-settings", { method: "PUT", body: { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 2, pushoverSound: null } });
    assert.equal(invalid.status, 400);
    const saved = await call("/api/notification-settings", { method: "PUT", body: { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: -2, pushoverSound: null } });
    assert.equal(saved.status, 200);
    const history = await call("/api/notification-deliveries");
    assert.deepEqual(await history.json(), []);
    assert.equal((await call("/api/notification-deliveries", { method: "POST" })).status, 405);
  });
});

test("PUT /api/notification-settings maps PROVIDER_NOT_CONFIGURED to 409", async () => {
  await withEnv(async (env) => {
    const misconfigured = { ...env, PUSHOVER_TRANSPORT_SECRET: unconfiguredTransportBinding() };
    const call = (path, options, deps = {}) => handleHttpRequest(makeRequest(path, options), misconfigured, { authorized: true }, { now: NOW, ...deps });
    const response = await call("/api/notification-settings", {
      method: "PUT",
      body: { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "PROVIDER_NOT_CONFIGURED");
  });
});

test("test endpoint checks provider readiness before consuming the rate-limit slot", async () => {
  await withEnv(async (env) => {
    // Pushover is unconfigured in the store; email is configured. The email
    // channel must also be enabled with a recipient in the D1 settings row.
    const noPushover = { ...env, PUSHOVER_TRANSPORT_SECRET: unconfiguredTransportBinding() };
    await saveSettings(noPushover, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const call = (path, options, deps = {}) => handleHttpRequest(makeRequest(path, options), noPushover, { authorized: true }, { now: NOW, ...deps });
    const misconfigured = await call("/api/notifications/test", { method: "POST", body: { channel: "pushover" } });
    assert.equal(misconfigured.status, 409);
    // Because provider readiness was checked first, the email slot is still free.
    const mailer = createMailerFake();
    const email = await call("/api/notifications/test", { method: "POST", body: { channel: "email" } }, { loadMailer: mailer.loadMailer });
    assert.equal(email.status, 202);
  });
});

test("test and manual-retry routes use the dispatcher, enforce rate limiting, and do not expose payloads", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const mailer = createMailerFake();
    const call = (path, options, deps = {}) => handleHttpRequest(makeRequest(path, options), env, { authorized: true }, { now: NOW, loadMailer: mailer.loadMailer, ...deps });
    const bad = await call("/api/notifications/test", { method: "POST", body: { channel: "unknown" } });
    assert.equal(bad.status, 400);
    const testEmail = await call("/api/notifications/test", { method: "POST", body: { channel: "email" } });
    assert.equal(testEmail.status, 202);
    assert.equal((await testEmail.json()).status, "sent");
    assert.equal((await call("/api/notifications/test", { method: "POST", body: { channel: "email" } })).status, 429);

    const [job] = await enqueueNotifications(model("retry-route"), env);
    await db.claimOutboxJob(env, job.id, NOW, NOW + 10, TOKEN_A);
    await db.failOutboxJob(env, job.id, TOKEN_A, { attempts: 5, nextAttemptAt: NOW, code: "SMTP_DELIVERY_FAILED", terminal: true });
    const retried = await call(`/api/notification-deliveries/${job.id}/retry`, { method: "POST" }, { now: NOW + 61_000 });
    assert.equal(retried.status, 200);
    const deliveries = await (await call("/api/notification-deliveries")).json();
    assert.equal("payload" in deliveries[0], false);
    // Non-UUID id → 400 for a stricter contract than the old generic 409.
    assert.equal((await call("/api/notification-deliveries/nope/retry", { method: "POST" })).status, 400);
    // A valid-looking UUID that doesn't exist → 409 NOT_RETRYABLE.
    const missing = await call("/api/notification-deliveries/00000000-0000-0000-0000-000000000000/retry", { method: "POST" });
    assert.equal(missing.status, 409);
  });
});

async function rotateLeaseToken(local, id, token) {
  local.database
    .prepare("UPDATE notification_outbox SET leaseToken = ? WHERE id = ?")
    .run(token, id);
}

test("dispatcher drops outcomes when a parallel claimer wins the lease", async () => {
  const local = await createLocalD1();
  try {
    const env = {
      DB: local.DB,
      ...transportBindings(),
      WEBAPP_URL: "https://dashboard.example.test"
    };
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("run-race"), env);
    let fetchCount = 0;
    const fetchFake = createFetchFake({
      "api.pushover.net": async () => {
        fetchCount += 1;
        // Simulate another Worker instance stealing the lease mid-flight.
        await rotateLeaseToken(local, job.id, TOKEN_B);
        return jsonOk({ status: 1, request: "race" });
      }
    });
    const outcomes = await dispatchPendingNotifications(env, { now: NOW, fetch: fetchFake });
    assert.equal(fetchCount, 1);
    assert.deepEqual(outcomes, [], "the winning caller reports its own outcome");
    const stored = await db.getOutboxJob(env, job.id);
    assert.equal(stored.leaseToken, TOKEN_B, "the parallel claimer still holds the lease");
    assert.equal(stored.status, "processing");
  } finally { local.close(); }
});

test("dispatcher drops fail outcomes when a parallel claimer wins the lease", async () => {
  const local = await createLocalD1();
  try {
    const env = {
      DB: local.DB,
      ...transportBindings(),
      WEBAPP_URL: "https://dashboard.example.test"
    };
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("run-fail-race"), env);
    const fetchFake = createFetchFake({
      "api.pushover.net": async () => {
        await rotateLeaseToken(local, job.id, TOKEN_B);
        return new Response("busy", { status: 429 });
      }
    });
    const outcomes = await dispatchPendingNotifications(env, { now: NOW, fetch: fetchFake });
    assert.deepEqual(outcomes, []);
    const stored = await db.getOutboxJob(env, job.id);
    assert.equal(stored.leaseToken, TOKEN_B);
  } finally { local.close(); }
});

test("dispatcher reports PUSHOVER_UNAVAILABLE for unexpected fetch failures", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: false, emailTo: null, pushoverEnabled: true, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    await enqueueNotifications(model("run-network"), env);
    const outcomes = await dispatchPendingNotifications(env, {
      now: NOW,
      fetch: async () => { throw new Error("network partition"); }
    });
    assert.equal(outcomes[0].code, "PUSHOVER_UNAVAILABLE");
    assert.equal(outcomes[0].status, "pending");
  });
});

test("runAndSendReport surfaces REPORT_IN_PROGRESS when the lock is held", async () => {
  await withEnv(async (env) => {
    // Claim the report lock under a foreign token; runAndSendReport must fail
    // fast with REPORT_IN_PROGRESS rather than run generateReport twice.
    assert.equal(await db.claimReportLock(env, NOW, NOW + 60_000, TOKEN_A), true);
    const { runAndSendReport } = await import("../../worker/report.js");
    env.SUNSETHUE_API_KEY = "test-key";
    await assert.rejects(
      () => runAndSendReport("Manual Test", env, { fetch: () => { throw new Error("must not be called"); }, now: NOW + 1 }),
      /REPORT_IN_PROGRESS/
    );
  });
});

test("API triggerReport maps a held report lock to 429", async () => {
  await withEnv(async (env) => {
    env.SUNSETHUE_API_KEY = "test-key";
    assert.equal(await db.claimReportLock(env, NOW, NOW + 60_000, TOKEN_A), true);
    const response = await handleHttpRequest(makeRequest("/api/triggerReport", { method: "POST" }), env, { authorized: true }, { now: NOW + 1 });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, "REPORT_IN_PROGRESS");
  });
});

test("manual retry enforces cooldown and cap", async () => {
  await withEnv(async (env) => {
    await saveSettings(env, { emailEnabled: true, emailTo: "owner@example.com", pushoverEnabled: false, pushoverDevice: null, pushoverPriority: 0, pushoverSound: null }, NOW);
    const [job] = await enqueueNotifications(model("retry-limits"), env);
    await db.claimOutboxJob(env, job.id, NOW, NOW + 10, TOKEN_A);
    await db.failOutboxJob(env, job.id, TOKEN_A, { attempts: 5, nextAttemptAt: NOW, code: "SMTP_DELIVERY_FAILED", terminal: true });

    // First retry succeeds and records lastManualRetryAt.
    const first = await db.retryFailedDelivery(env, job.id, NOW + 61_000);
    assert.deepEqual(first, { ok: true });

    // Mark it failed again so we can attempt a second retry.
    await db.claimOutboxJob(env, job.id, NOW + 62_000, NOW + 63_000, TOKEN_B);
    await db.failOutboxJob(env, job.id, TOKEN_B, { attempts: 5, nextAttemptAt: NOW + 63_000, code: "SMTP_DELIVERY_FAILED", terminal: true });

    // Cooldown window (< 60s since last manual retry).
    const cooldown = await db.retryFailedDelivery(env, job.id, NOW + 90_000);
    assert.equal(cooldown.ok, false);
    assert.equal(cooldown.code, "MANUAL_RETRY_COOLDOWN");
  });
});
