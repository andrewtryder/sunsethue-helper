import { REQUIRED_D1_TABLES } from "../../shared/schema-manifest.js";
import { getZonedParts } from "../../shared/time-format.js";
import { getApplicationSettings } from "../notifications/application-settings.js";
import { emailTransportSource } from "../notifications/resolve-email-transport.js";
import { pushoverTransportSource } from "../notifications/resolve-pushover-transport.js";
import { hasWebhookTransportAsync } from "../notifications/webhook.js";
import { hasWebPushConfiguredAsync, resolveWebPushConfig } from "../notifications/webpush.js";
import * as db from "../db.js";

export function buildSelfTestOccurrenceKey(scheduleTimezone, parts) {
  return `SELFTEST:${scheduleTimezone}:${parts.dateKey}`;
}

export function isSelfTestDue(settings, now) {
  if (!settings || !settings.weeklySelfTestEnabled) return false;
  const tz = settings.scheduleTimezone || "America/New_York";
  const parts = getZonedParts(now, tz);
  if (parts.minute > 10) return false;
  if (Number(parts.weekday) !== Number(settings.weeklySelfTestDay)) return false;
  const slot = `${String(parts.hour).padStart(2, "0")}:00`;
  return slot === String(settings.weeklySelfTestTime || "10:00");
}

export async function runPassiveSelfTest(env, deps = {}) {
  const startedAt = deps.now ?? Date.now();
  const present = new Set(
    ((await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()).results || [])
      .map((row) => row.name)
  );
  const missingTables = REQUIRED_D1_TABLES.filter((name) => !present.has(name));
  const checks = [
    {
      name: "required_tables",
      ok: missingTables.length === 0,
      code: missingTables.length === 0 ? "OK" : "MISSING_TABLES"
    }
  ];

  try {
    const settings = await getApplicationSettings(env);
    checks.push({
      name: "schedule_config",
      ok: Array.isArray(settings.scheduleTimes) && settings.scheduleTimes.length > 0,
      code: "OK"
    });
  } catch {
    checks.push({ name: "schedule_config", ok: false, code: "SCHEDULE_UNREADABLE" });
  }

  const emailSrc = await emailTransportSource(env);
  const pushoverSrc = await pushoverTransportSource(env);
  checks.push({ name: "email_transport", ok: true, code: emailSrc === "not_configured" ? "NOT_CONFIGURED" : "READY" });
  checks.push({ name: "pushover_transport", ok: true, code: pushoverSrc === "not_configured" ? "NOT_CONFIGURED" : "READY" });
  checks.push({
    name: "webhook_transport",
    ok: true,
    code: (await hasWebhookTransportAsync(env)) ? "READY" : "NOT_CONFIGURED"
  });
  const vapid = await resolveWebPushConfig(env);
  checks.push({ name: "webpush_vapid", ok: true, code: vapid.configured ? "READY" : "NOT_CONFIGURED" });

  const subs = await db.listWebPushSubscriptions(env, { enabledOnly: true });
  const structuralOk = subs.every((s) => typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.p256dh && s.auth);
  checks.push({
    name: "webpush_subscriptions",
    ok: structuralOk,
    code: structuralOk ? "OK" : "INVALID_SUBSCRIPTION",
    detail: { enabledCount: subs.length }
  });

  const failed = checks.filter((c) => c.ok === false);
  const completedAt = deps.now ?? Date.now();
  const row = {
    id: crypto.randomUUID(),
    checkType: "weekly_passive",
    provider: "system",
    status: failed.length === 0 ? "pass" : "fail",
    code: failed[0] ? failed[0].code : "PASS",
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    details: JSON.stringify({ checks })
  };
  await db.insertHealthCheckRun(env, row);
  return row;
}

export async function runActiveSelfTest(env, deps = {}) {
  const startedAt = deps.now ?? Date.now();
  const settings = await db.getNotificationSettingsRow(env);
  const emailReady = (await emailTransportSource(env)) !== "not_configured";
  const pushoverReady = (await pushoverTransportSource(env)) !== "not_configured";
  const webhookReady = await hasWebhookTransportAsync(env);
  const webpushReady = await hasWebPushConfiguredAsync(env);
  const pushSubs = await db.listWebPushSubscriptions(env, { enabledOnly: true });

  const effectiveSettings = {
    ...settings,
    emailEnabled: Number(settings && settings.emailEnabled) === 1 && emailReady,
    pushoverEnabled: Number(settings && settings.pushoverEnabled) === 1 && pushoverReady,
    webhookEnabled: Number(settings && settings.webhookEnabled) === 1 && webhookReady ? 1 : 0
  };

  const enqueue = deps.enqueueNotifications || (await import("./report.js")).enqueueNotifications;
  const dispatch = deps.dispatchPendingNotifications
    || (await import("../notifications/dispatcher.js")).dispatchPendingNotifications;
  const jobs = await enqueue({
    runId: crypto.randomUUID(),
    triggerType: "WEEKLY_SELF_TEST",
    generatedAt: startedAt,
    dashboardUrl: env.WEBAPP_URL || null,
    locationsCount: 0,
    results: []
  }, env, {
    ...deps,
    settings: effectiveSettings,
    webPushSubscriptions: webpushReady ? pushSubs : [],
    webhookConfigured: webhookReady
  });
  const outcomes = await dispatch(env, { ...deps, now: startedAt });
  const completedAt = deps.now ?? Date.now();
  const failed = outcomes.filter((o) => o.status === "failed");
  const row = {
    id: crypto.randomUUID(),
    checkType: "weekly_active",
    provider: "system",
    status: failed.length === 0 ? "pass" : "fail",
    code: failed[0] ? failed[0].code : "PASS",
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    details: JSON.stringify({
      jobCount: jobs.length,
      outcomes: outcomes.map((o) => ({ channel: o.channel, status: o.status, code: o.code || null }))
    })
  };
  await db.insertHealthCheckRun(env, row);
  return row;
}

export async function maybeRunWeeklySelfTest(env, deps = {}) {
  const now = deps.now === undefined ? new Date() : new Date(deps.now);
  const loadSettings = deps.getApplicationSettings || getApplicationSettings;
  const claimOccurrence = deps.claimScheduledOccurrence || db.claimScheduledOccurrence;
  let settings;
  try {
    settings = await loadSettings(env);
  } catch {
    return null;
  }
  if (!isSelfTestDue(settings, now)) return null;
  const tz = settings.scheduleTimezone || "America/New_York";
  const parts = getZonedParts(now, tz);
  const key = buildSelfTestOccurrenceKey(tz, parts);
  const claimed = await claimOccurrence(env, key, now.getTime(), null);
  if (!claimed) return null;
  if (settings.weeklySelfTestMode === "active") {
    return runActiveSelfTest(env, { ...deps, now: now.getTime() });
  }
  return runPassiveSelfTest(env, { ...deps, now: now.getTime() });
}
