import * as db from "./db.js";
import {
  buildForecastEventSnapshot,
  normalizeForecastEvent,
  selectNextSunEvents,
  validateReportEnv
} from "./helpers.js";
import { dispatchPendingNotifications } from "./notifications/dispatcher.js";
import { buildNotificationPayload } from "./notifications/payload.js";
import { getSettings } from "./notifications/settings.js";

export { buildHtmlEmail } from "./notifications/email.js";

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
  const locations = await db.getLocations(env);
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
    runId: crypto.randomUUID(), triggerType, generatedAt: now, dashboardUrl: env.WEBAPP_URL || null,
    locationsCount: activeLocations.length,
    results: results.map((result) => ({ name: result.loc.name, sunrise: result.sunrise, sunset: result.sunset, error: result.error }))
  };
}

/** Persist the run and its enabled notification jobs together. */
export async function enqueueNotifications(model, env, deps = {}) {
  const settings = deps.settings || await getSettings(env);
  const payload = JSON.stringify(buildNotificationPayload(model));
  const channels = [];
  if (settings.emailEnabled) channels.push("email");
  if (settings.pushoverEnabled) channels.push("pushover");
  const jobs = channels.map((channel) => ({
    id: crypto.randomUUID(), runId: model.runId, channel, payload,
    nextAttemptAt: model.generatedAt, createdAt: model.generatedAt
  }));
  await db.createRunAndOutbox(env, {
    id: model.runId, timestamp: model.generatedAt, triggerType: model.triggerType,
    status: model.results.some((result) => result.error) ? "warning" : "success",
    locationsCount: model.locationsCount, results: model.results.map(buildRunResult), error: null
  }, jobs);
  return jobs.map((job) => ({ id: job.id, channel: job.channel, status: "pending" }));
}

/** Compatibility entry point for manual and scheduled reports. */
export async function runAndSendReport(triggerType, env, deps = {}) {
  try {
    const model = await generateReport(triggerType, env, deps);
    const jobs = await enqueueNotifications(model, env, deps);
    const outcomes = await dispatchPendingNotifications(env, deps);
    return { runId: model.runId, jobs: jobs.map((job) => outcomes.find((outcome) => outcome.id === job.id) || job) };
  } catch (error) {
    // A report can fail before a run exists (for example, an absent forecast key).
    try {
      await db.addRun(env, { id: crypto.randomUUID(), timestamp: deps.now ?? Date.now(), triggerType, status: "failure", locationsCount: 0, results: [], error: "REPORT_GENERATION_FAILED" });
    } catch { /* Preserve the original operational error. */ }
    throw error;
  }
}
