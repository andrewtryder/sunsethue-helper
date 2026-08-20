import * as db from "../db.js";
import {
  buildForecastEventSnapshot,
  normalizeForecastEvent,
  selectNextSunEvents,
  validateReportEnv
} from "../helpers.js";
import { dispatchPendingNotifications } from "../notifications/dispatcher.js";
import { buildNotificationPayload } from "../notifications/payload.js";
import { NotificationError } from "../notifications/errors.js";
import { getSettings } from "../notifications/settings.js";
import { getApplicationSettings } from "../notifications/application-settings.js";
import { filterResultsForChannel } from "../notifications/rules.js";
import { hasWebhookTransportAsync } from "../notifications/webhook.js";
import { listLocationNotificationRules } from "../repositories/notification-rules.js";
import { listWebPushSubscriptions } from "../repositories/webpush.js";
import { resolveDisplayTimeZone } from "../../shared/time-format.js";

export { buildHtmlEmail } from "../notifications/email.js";

const REPORT_LOCK_MS = 5 * 60_000;

function buildRunResult(result) {
  return {
    name: result.name,
    status: result.error ? "error" : "success",
    error: result.error ? "FORECAST_UNAVAILABLE" : null,
    forecast: result.error ? null : {
      sunrise: buildForecastEventSnapshot(result.sunrise),
      sunset: buildForecastEventSnapshot(result.sunset)
    }
  };
}

/** Fetch and persist a single normalized forecast snapshot. No provider calls occur here. */
export async function generateReport(triggerType, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ?? Date.now();
  validateReportEnv(env);
  let locations = Array.isArray(deps.locations) ? deps.locations : await db.getLocations(env);
  if (Array.isArray(deps.locationIds)) {
    const idSet = new Set(deps.locationIds);
    locations = locations.filter((loc) => idSet.has(loc.id));
  }
  const activeLocations = locations.slice(0, 10);
  const results = await Promise.all(activeLocations.map(async (loc) => {
    try {
      const response = await fetchImpl(`https://api.sunsethue.com/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&days=2&key=${String(env.SUNSETHUE_API_KEY).trim()}`);
      if (!response.ok) throw new Error("FORECAST_UPSTREAM_ERROR");
      const json = await response.json();
      if (!json?.data) throw new Error("FORECAST_INVALID_RESPONSE");
      const selected = selectNextSunEvents(json.data, now);
      return { loc, sunrise: normalizeForecastEvent(selected.nextSunrise), sunset: normalizeForecastEvent(selected.nextSunset), error: null };
    } catch {
      return { loc, sunrise: null, sunset: null, error: "FORECAST_UNAVAILABLE" };
    }
  }));
  for (const result of results) {
    await db.updateLocationForecast(env, result.loc.id, result.error ? {
      lastForecastUpdate: now, forecastError: result.error
    } : {
      latestSunriseTime: result.sunrise?.time || null,
      latestSunriseQuality: result.sunrise?.quality ?? null,
      latestSunriseText: result.sunrise?.quality_text || null,
      latestSunsetTime: result.sunset?.time || null,
      latestSunsetQuality: result.sunset?.quality ?? null,
      latestSunsetText: result.sunset?.quality_text || null,
      lastForecastUpdate: now, forecastError: null
    });
  }
  return {
    runId: crypto.randomUUID(),
    triggerType,
    generatedAt: now,
    dashboardUrl: env.WEBAPP_URL || null,
    locationsCount: activeLocations.length,
    results: results.map((result) => ({
      locationId: result.loc.id,
      name: result.loc.name,
      latitude: result.loc.latitude,
      longitude: result.loc.longitude,
      sunrise: result.sunrise,
      sunset: result.sunset,
      error: result.error
    }))
  };
}

function parseScheduledSlot(triggerType) {
  const match = typeof triggerType === "string" ? /^SCHEDULED:(\d{2}:00)$/.exec(triggerType) : null;
  return match ? match[1] : null;
}

function withTriggeredEvents(results, filteredLocations) {
  return results.map((result) => {
    const match = filteredLocations.find(
      (loc) => loc.locationId === result.locationId || loc.name === result.name
    );
    return { ...result, triggeredEvents: match?.triggeredEvents || [] };
  });
}

function channelJobsForTargets({
  channel,
  model,
  filtered,
  settings,
  targets,
  status,
  lastErrorCode,
  deliveryPurpose
}) {
  const payloadModel = {
    ...model,
    deliveryPurpose,
    displayTimezone: resolveDisplayTimeZone(settings, null),
    results: filtered.locations.map((loc) => ({
      name: loc.name,
      locationId: loc.locationId,
      sunrise: loc.sunrise,
      sunset: loc.sunset,
      error: loc.error,
      triggeredEvents: loc.triggeredEvents || []
    }))
  };
  const payload = JSON.stringify(buildNotificationPayload(payloadModel));
  return targets.map((targetId) => ({
    id: crypto.randomUUID(),
    runId: model.runId,
    channel,
    deliveryTargetId: targetId,
    status: status || "pending",
    lastErrorCode: lastErrorCode || null,
    deliveryPurpose,
    payload,
    nextAttemptAt: model.generatedAt,
    createdAt: model.generatedAt,
    deliveryEmailTo: settings.emailTo ?? null,
    deliveryPushoverDevice: settings.pushoverDevice ?? null,
    deliveryPushoverPriority: settings.pushoverPriority ?? 0,
    deliveryPushoverSound: settings.pushoverSound ?? null
  }));
}

/**
 * Persist the run and its enabled notification jobs together, snapshotting the
 * current delivery preferences into each job so a later settings change cannot
 * redirect a pending notification.
 *
 * Delivery policy (Model A):
 * - scheduled report (when due): full run, ignores quality gating for send eligibility
 * - quality alert: threshold-filtered locations only
 * - if both due for the same channel: one scheduled_report job (no duplicate)
 */
export async function enqueueNotifications(model, env, deps = {}) {
  const settings = deps.settings || await getSettings(env);
  const applicationSettings = deps.applicationSettings || await getApplicationSettings(env);
  const allRules = deps.rules || await listLocationNotificationRules(env);
  const jobs = [];

  const channelPlan = [];
  if (settings.emailEnabled) channelPlan.push({ channel: "email", targets: [null] });
  if (settings.pushoverEnabled) channelPlan.push({ channel: "pushover", targets: [null] });
  if (Number(settings.webhookEnabled) === 1 && (deps.webhookConfigured ?? await hasWebhookTransportAsync(env))) {
    channelPlan.push({ channel: "webhook", targets: [null] });
  }
  const pushSubs = deps.webPushSubscriptions || await listWebPushSubscriptions(env, { enabledOnly: true });
  if (pushSubs.length > 0) {
    channelPlan.push({ channel: "webpush", targets: pushSubs.map((s) => s.id) });
  }

  const isSelfTest = model.triggerType === "WEEKLY_SELF_TEST";
  const isThresholdBypass = model.triggerType === "TEST" || isSelfTest;
  const isManualTest = model.triggerType === "Manual Test";
  const scheduledSlot = parseScheduledSlot(model.triggerType);
  const scheduledReportsEnabled = applicationSettings.scheduledReportsEnabled === true;
  const scheduledReportTimes = Array.isArray(applicationSettings.scheduledReportTimes)
    ? applicationSettings.scheduledReportTimes
    : [];
  const scheduledReportChannels = new Set(
    Array.isArray(applicationSettings.scheduledReportChannels)
      ? applicationSettings.scheduledReportChannels
      : []
  );
  const scheduledReportDue = !isThresholdBypass
    && !isManualTest
    && Boolean(scheduledSlot)
    && scheduledReportsEnabled
    && scheduledReportTimes.includes(scheduledSlot);

  for (const plan of channelPlan) {
    const rulesForChannel = allRules
      .filter((r) => r.channel === plan.channel)
      .map((r) => ({
        locationId: r.locationId,
        enabled: Number(r.enabled) === 1,
        thresholdPercent: r.thresholdPercent,
        eventScope: r.eventScope
      }));
    const effectiveRules = rulesForChannel.length > 0
      ? rulesForChannel
      : model.results.map((result) => ({
        locationId: result.locationId,
        enabled: true,
        thresholdPercent: null,
        eventScope: "either"
      }));

    const filtered = isThresholdBypass || model.results.length === 0
      ? { locations: model.results, qualifies: true }
      : filterResultsForChannel(model.results, effectiveRules);

    if (isThresholdBypass) {
      jobs.push(...channelJobsForTargets({
        channel: plan.channel,
        model,
        filtered: { locations: model.results },
        settings,
        targets: plan.targets,
        status: "pending",
        deliveryPurpose: isSelfTest ? "self_test" : "test"
      }));
      continue;
    }

    const channelScheduled = scheduledReportDue && scheduledReportChannels.has(plan.channel);
    if (channelScheduled) {
      jobs.push(...channelJobsForTargets({
        channel: plan.channel,
        model,
        filtered: { locations: withTriggeredEvents(model.results, filtered.locations) },
        settings,
        targets: plan.targets,
        status: "pending",
        deliveryPurpose: "scheduled_report"
      }));
      continue;
    }

    if (!filtered.qualifies) {
      jobs.push(...channelJobsForTargets({
        channel: plan.channel,
        model,
        filtered: { locations: [] },
        settings,
        targets: [null],
        status: "skipped",
        lastErrorCode: "NO_LOCATION_ABOVE_THRESHOLD",
        deliveryPurpose: isManualTest ? "test" : "quality_alert"
      }));
      continue;
    }

    jobs.push(...channelJobsForTargets({
      channel: plan.channel,
      model,
      filtered: { locations: filtered.locations },
      settings,
      targets: plan.targets,
      status: "pending",
      deliveryPurpose: isManualTest ? "test" : "quality_alert"
    }));
  }

  await db.createRunAndOutbox(env, {
    id: model.runId,
    timestamp: model.generatedAt,
    triggerType: model.triggerType,
    status: model.results.some((result) => result.error) ? "warning" : "success",
    locationsCount: model.locationsCount,
    results: model.results.map(buildRunResult),
    error: null
  }, jobs);
  return jobs.map((job) => ({
    id: job.id,
    channel: job.channel,
    deliveryTargetId: job.deliveryTargetId ?? null,
    status: job.status || "pending",
    lastErrorCode: job.lastErrorCode || null,
    deliveryPurpose: job.deliveryPurpose || null
  }));
}

/**
 * Compatibility entry point for manual and scheduled reports.
 *
 * Holds a singleton execution lock across the forecast fan-out so a cron
 * trigger and a concurrent manual trigger can never both call the upstream API
 * for the same set of locations.
 *
 * Manual / on-demand triggers are not treated as scheduled reports even when
 * scheduled reports are enabled.
 */
export async function runAndSendReport(triggerType, env, deps = {}) {
  const now = deps.now ?? Date.now();
  const leaseToken = crypto.randomUUID();
  const acquired = await db.claimReportLock(env, now, now + REPORT_LOCK_MS, leaseToken);
  if (!acquired) {
    throw new NotificationError("REPORT_IN_PROGRESS");
  }
  try {
    const model = await generateReport(triggerType, env, deps);
    const jobs = await enqueueNotifications(model, env, deps);
    const outcomes = await dispatchPendingNotifications(env, deps);
    return { runId: model.runId, jobs: jobs.map((job) => outcomes.find((outcome) => outcome.id === job.id) || job) };
  } catch (error) {
    try {
      await db.addRun(env, {
        id: crypto.randomUUID(),
        timestamp: now,
        triggerType,
        status: "failure",
        locationsCount: 0,
        results: [],
        error: "REPORT_GENERATION_FAILED"
      });
    } catch { /* Preserve the original operational error. */ }
    throw error;
  } finally {
    try {
      await db.releaseReportLock(env, leaseToken);
    } catch { /* Best-effort release; the lease expires on its own. */ }
  }
}
