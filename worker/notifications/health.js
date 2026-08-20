import { REQUIRED_D1_TABLES } from "../../shared/schema-manifest.js";
import { estimateForecastQuota, getApplicationSettings } from "./application-settings.js";
import { hasWebPushConfiguredAsync } from "./webpush.js";
import * as db from "../db.js";
import { listLocationNotificationRules } from "../repositories/notification-rules.js";
import { listWebPushSubscriptions } from "../repositories/webpush.js";
import { getLatestHealthCheckRun } from "../repositories/health-checks.js";

const STALE_PUSH_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_AGE_ACTION_MS = 6 * 60 * 60 * 1000;
const PENDING_AGE_DEGRADED_MS = 30 * 60 * 1000;

export function deriveHealthState(input) {
  if (!input.requiredTablesPresent) return "action_required";
  if (!input.anyChannelEnabled) return "disabled";
  if (input.missingTransport) return "action_required";
  if (input.failedDeliveries >= 5) return "action_required";
  if (input.oldestPendingAgeMs != null && input.oldestPendingAgeMs >= PENDING_AGE_ACTION_MS) {
    return "action_required";
  }
  if (input.failedDeliveries > 0) return "degraded";
  if (input.oldestPendingAgeMs != null && input.oldestPendingAgeMs >= PENDING_AGE_DEGRADED_MS) {
    return "degraded";
  }
  if (input.stalePushDevices > 0) return "degraded";
  return "healthy";
}

export function nextScheduleSlot(settings, now) {
  const times = Array.isArray(settings.scheduleTimes) ? [...settings.scheduleTimes].sort() : [];
  const tz = settings.scheduleTimezone || "America/New_York";
  if (times.length === 0) return null;
  const hourPart = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).find((p) => p.type === "hour");
  const hourNow = Number(hourPart ? hourPart.value : 0);
  const upcoming = times.find((slot) => Number(slot.slice(0, 2)) > hourNow) || times[0];
  return { slot: upcoming, at: null, timeZone: tz };
}

function isoOrNull(value) {
  if (value == null) return null;
  return new Date(Number(value)).toISOString();
}

/**
 * Aggregate non-sensitive notification health for the authenticated UI.
 */
export async function getNotificationHealth(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const settings = deps.settings || await getApplicationSettings(env);
  const notificationSettings = deps.notificationSettings || await db.getNotificationSettingsRow(env) || {};
  const locations = deps.locations || await db.getLocations(env);
  const rules = deps.rules || await listLocationNotificationRules(env);

  const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
  const present = new Set((tables.results || []).map((row) => row.name));
  const requiredTablesPresent = REQUIRED_D1_TABLES.every((name) => present.has(name));

  const credentialRows = deps.credentialRows || await db.listProviderCredentialStatus(env);
  const byProvider = Object.fromEntries(credentialRows.map((row) => [row.provider, row]));
  const emailTransport = deps.emailTransport
    ?? (Number(byProvider.email?.configured) === 1 ? "secrets_store" : "not_configured");
  const pushoverTransport = deps.pushoverTransport
    ?? (Number(byProvider.pushover?.configured) === 1 ? "secrets_store" : "not_configured");
  const emailConfigured = deps.emailConfigured ?? emailTransport !== "not_configured";
  const pushoverConfigured = deps.pushoverConfigured ?? pushoverTransport !== "not_configured";
  const webhookConfigured = deps.webhookConfigured
    ?? (Number(byProvider.webhook?.configured) === 1 || Boolean(notificationSettings.webhookMaskedHostname));
  const webpushConfigured = deps.webpushConfigured ?? await hasWebPushConfiguredAsync(env);
  const emailEnabled = Number(notificationSettings.emailEnabled) === 1;
  const pushoverEnabled = Number(notificationSettings.pushoverEnabled) === 1;
  const webhookEnabled = Number(notificationSettings.webhookEnabled) === 1;
  const pushSubs = await listWebPushSubscriptions(env);
  const pushEnabled = pushSubs.filter((s) => Number(s.enabled) === 1);
  const pushStale = pushEnabled.filter((s) => now - Number(s.lastSeenAt || s.createdAt || 0) > STALE_PUSH_MS);
  const webpushEnabled = pushEnabled.length > 0;

  const pendingAgg = await env.DB.prepare(
    `SELECT COUNT(*) AS c, MIN(createdAt) AS oldest
     FROM notification_outbox WHERE status IN ('pending', 'processing')`
  ).first();
  const failedAgg = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM notification_outbox WHERE status = 'failed'`
  ).first();
  const oldestPending = pendingAgg && pendingAgg.oldest != null ? Number(pendingAgg.oldest) : null;
  const oldestPendingAgeMs = oldestPending == null ? null : Math.max(0, now - oldestPending);
  const failedDeliveries = Number(failedAgg && failedAgg.c ? failedAgg.c : 0);

  const anyChannelEnabled = emailEnabled || pushoverEnabled || webhookEnabled || webpushEnabled;
  const missingTransport = (emailEnabled && !emailConfigured)
    || (pushoverEnabled && !pushoverConfigured)
    || (webhookEnabled && !webhookConfigured)
    || (webpushEnabled && !webpushConfigured);

  const state = deriveHealthState({
    anyChannelEnabled,
    missingTransport: Boolean(missingTransport),
    requiredTablesPresent,
    failedDeliveries,
    oldestPendingAgeMs,
    stalePushDevices: pushStale.length
  });

  const lastForecastCheck = await env.DB.prepare(
    `SELECT timestamp FROM runs
     WHERE triggerType LIKE 'SCHEDULED:%' OR triggerType IN ('AM', 'NOON', 'PM')
     ORDER BY timestamp DESC LIMIT 1`
  ).first();
  const lastReportAt = lastForecastCheck && lastForecastCheck.timestamp
    ? Number(lastForecastCheck.timestamp)
    : null;

  const lastScheduledReport = await env.DB.prepare(
    `SELECT sentAt, createdAt FROM notification_outbox
     WHERE deliveryPurpose = 'scheduled_report' AND status = 'sent'
     ORDER BY COALESCE(sentAt, createdAt) DESC LIMIT 1`
  ).first();
  const lastQualityAlert = await env.DB.prepare(
    `SELECT o.sentAt, o.createdAt
     FROM notification_outbox o
     LEFT JOIN runs r ON r.id = o.runId
     WHERE o.status = 'sent'
       AND (
         o.deliveryPurpose = 'quality_alert'
         OR (
           o.deliveryPurpose IS NULL
           AND COALESCE(r.triggerType, '') NOT IN ('TEST', 'Manual Test', 'WEEKLY_SELF_TEST')
         )
       )
     ORDER BY COALESCE(o.sentAt, o.createdAt) DESC LIMIT 1`
  ).first();
  const lastScheduledReportAt = lastScheduledReport
    ? Number(lastScheduledReport.sentAt ?? lastScheduledReport.createdAt)
    : null;
  const lastQualityAlertAt = lastQualityAlert
    ? Number(lastQualityAlert.sentAt ?? lastQualityAlert.createdAt)
    : null;

  const skips = await env.DB.prepare(
    `SELECT id, channel, createdAt, lastErrorCode
     FROM notification_outbox
     WHERE status = 'skipped'
       AND lastErrorCode = 'NO_LOCATION_ABOVE_THRESHOLD'
       AND (deliveryPurpose IS NULL OR deliveryPurpose = 'quality_alert')
     ORDER BY createdAt DESC LIMIT 8`
  ).all();

  const latestSelfTest = await getLatestHealthCheckRun(env);
  const qualify = (channel) => rules.filter((r) => r.channel === channel && Number(r.enabled) === 1).length;

  const channels = [
    {
      channel: "email",
      enabled: emailEnabled,
      configured: emailConfigured,
      transport: emailTransport,
      qualifyingLocationCount: qualify("email") || locations.length,
      pending: 0,
      failed: 0
    },
    {
      channel: "pushover",
      enabled: pushoverEnabled,
      configured: pushoverConfigured,
      transport: pushoverTransport,
      qualifyingLocationCount: qualify("pushover") || locations.length,
      pending: 0,
      failed: 0
    },
    {
      channel: "webpush",
      enabled: webpushEnabled,
      configured: webpushConfigured,
      transport: webpushConfigured ? "vapid" : "not_configured",
      qualifyingLocationCount: qualify("webpush") || pushEnabled.length,
      devicesEnabled: pushEnabled.length,
      devicesStale: pushStale.length,
      devicesRevoked: pushSubs.length - pushEnabled.length,
      pending: 0,
      failed: 0
    },
    {
      channel: "webhook",
      enabled: webhookEnabled,
      configured: webhookConfigured,
      transport: webhookConfigured ? "secrets_store" : "not_configured",
      qualifyingLocationCount: qualify("webhook") || locations.length,
      maskedHostname: notificationSettings.webhookMaskedHostname || null,
      signingEnabled: webhookConfigured,
      pending: 0,
      failed: 0
    }
  ];

  const nextForecastCheck = nextScheduleSlot(settings, new Date(now));

  return {
    state,
    // Compatibility aliases — prefer lastForecastCheckAt / nextForecastCheck in new clients.
    lastReportAt: isoOrNull(lastReportAt),
    lastReportAgeSeconds: lastReportAt == null ? null : Math.max(0, Math.floor((now - lastReportAt) / 1000)),
    lastForecastCheckAt: isoOrNull(lastReportAt),
    lastForecastCheckAgeSeconds: lastReportAt == null ? null : Math.max(0, Math.floor((now - lastReportAt) / 1000)),
    nextScheduled: nextForecastCheck,
    nextForecastCheck,
    lastScheduledReportAt: isoOrNull(lastScheduledReportAt),
    lastQualityAlertAt: isoOrNull(lastQualityAlertAt),
    scheduledReports: {
      enabled: settings.scheduledReportsEnabled === true,
      times: Array.isArray(settings.scheduledReportTimes) ? settings.scheduledReportTimes : [],
      channels: Array.isArray(settings.scheduledReportChannels) ? settings.scheduledReportChannels : []
    },
    channels,
    schedule: {
      timeZone: settings.scheduleTimezone,
      times: settings.scheduleTimes,
      quota: estimateForecastQuota({
        scheduleTimes: settings.scheduleTimes,
        locations,
        activeLocations: locations.length
      })
    },
    skips: (skips.results || []).map((row) => ({
      id: row.id,
      channel: row.channel,
      createdAt: isoOrNull(row.createdAt),
      code: row.lastErrorCode
    })),
    selfTest: latestSelfTest
      ? {
        checkType: latestSelfTest.checkType,
        status: latestSelfTest.status,
        code: latestSelfTest.code,
        completedAt: isoOrNull(latestSelfTest.completedAt)
      }
      : null,
    pendingDeliveries: Number(pendingAgg && pendingAgg.c ? pendingAgg.c : 0),
    failedDeliveries,
    requiredTablesPresent
  };
}
