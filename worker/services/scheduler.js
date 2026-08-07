import * as db from "../db.js";
import { dispatchPendingNotifications } from "../notifications/dispatcher.js";
import { pruneOperationalData } from "../db.js";
import { getApplicationSettings } from "../notifications/application-settings.js";
import {
  buildOccurrenceKey,
  effectiveLocationScheduleTimes,
  getZonedParts,
  parseScheduleTimes
} from "../../shared/time-format.js";
import { runAndSendReport } from "./report.js";
import { maybeRunWeeklySelfTest } from "./selftest.js";

/**
 * @param {object} event
 * @param {object} env
 * @param {{
 *   now?: number | Date,
 *   runAndSendReport?: typeof runAndSendReport,
 *   dispatchPendingNotifications?: typeof dispatchPendingNotifications,
 *   getApplicationSettings?: typeof getApplicationSettings,
 *   getLocations?: typeof db.getLocations,
 *   claimScheduledOccurrence?: typeof db.claimScheduledOccurrence,
 *   bindOccurrenceRun?: typeof db.bindOccurrenceRun,
 *   maybeRunWeeklySelfTest?: typeof maybeRunWeeklySelfTest
 * }} [deps]
 */
export async function handleScheduledReport(event, env, deps = {}) {
  const now = deps.now === undefined ? new Date() : new Date(deps.now);
  const runReport = deps.runAndSendReport || runAndSendReport;
  const dispatch = deps.dispatchPendingNotifications || dispatchPendingNotifications;
  const loadSettings = deps.getApplicationSettings || getApplicationSettings;
  const loadLocations = deps.getLocations || db.getLocations;
  const claimOccurrence = deps.claimScheduledOccurrence || db.claimScheduledOccurrence;
  const bindRun = deps.bindOccurrenceRun || db.bindOccurrenceRun;
  const runSelfTest = deps.maybeRunWeeklySelfTest || maybeRunWeeklySelfTest;

  try {
    await dispatch(env, { ...deps, now: now.getTime() });
  } catch {
    // A later hourly cron recovers expired leases and pending work.
  }

  try {
    await pruneOperationalData(env, now.getTime());
  } catch {
    // Retention failures must not block scheduled reports.
  }

  let settings;
  try {
    settings = await loadSettings(env);
  } catch {
    settings = {
      scheduleTimezone: "America/New_York",
      scheduleTimes: ["06:00", "12:00", "18:00"]
    };
  }

  const timeZone = settings.scheduleTimezone || "America/New_York";
  const globalScheduleTimes = parseScheduleTimes(settings.scheduleTimes);
  const parts = getZonedParts(now, timeZone);
  const slot = `${String(parts.hour).padStart(2, "0")}:00`;

  console.log(`Cron trigger checking. Local ${timeZone}: ${parts.hour}:${String(parts.minute).padStart(2, "0")}`);

  try {
    await runSelfTest(env, { ...deps, now });
  } catch (error) {
    console.error("Weekly self-test failed:", error);
  }

  if (parts.minute > 10) {
    console.log("Not near top of the hour. Skipping.");
    return null;
  }

  let locations = [];
  try {
    locations = await loadLocations(env);
  } catch {
    locations = [];
  }

  const dueLocations = locations.filter((loc) =>
    effectiveLocationScheduleTimes(loc, globalScheduleTimes).includes(slot)
  );

  if (dueLocations.length === 0) {
    console.log(`No locations due for hour ${parts.hour} in ${timeZone}.`);
    return null;
  }

  const occurrenceKey = buildOccurrenceKey(timeZone, parts);
  const claimed = await claimOccurrence(env, occurrenceKey, now.getTime(), null);
  if (!claimed) {
    console.log(`Occurrence already claimed: ${occurrenceKey}`);
    return null;
  }

  const triggerType = `SCHEDULED:${slot}`;
  console.log(
    `Time match: Running scheduled ${triggerType} for ${dueLocations.length}/${locations.length} locations (${occurrenceKey})...`
  );
  try {
    const result = await runReport(triggerType, env, {
      ...deps,
      locations: dueLocations
    });
    if (result?.runId) {
      await bindRun(env, occurrenceKey, result.runId);
    }
    console.log(`Scheduled ${triggerType} report run successfully completed.`);
    return triggerType;
  } catch (error) {
    console.error(`Scheduled ${triggerType} report run failed:`, error);
    return triggerType;
  }
}
