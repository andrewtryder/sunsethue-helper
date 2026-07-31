import { runAndSendReport } from "./report.js";
import { dispatchPendingNotifications } from "./notifications/dispatcher.js";

// ⚡ Bolt Performance Optimization:
// Caching Intl.DateTimeFormat instances at the module level prevents the V8 engine
// from expensively re-initializing them on every single cron invocation.
const hourFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hour12: false
});

const minuteFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  minute: "numeric"
});

/**
 * @param {object} event
 * @param {object} env
 * @param {{ now?: number | Date, runAndSendReport?: typeof runAndSendReport, dispatchPendingNotifications?: typeof dispatchPendingNotifications }} [deps]
 *   Injection seam so tests can pin the instant and observe dispatch without
 *   sending email. Production callers omit it.
 */
export async function handleScheduledReport(event, env, deps = {}) {
  const now = deps.now === undefined ? new Date() : new Date(deps.now);
  const runReport = deps.runAndSendReport || runAndSendReport;
  const dispatch = deps.dispatchPendingNotifications || dispatchPendingNotifications;

  try {
    await dispatch(env, { ...deps, now: now.getTime() });
  } catch {
    // A later hourly cron recovers expired leases and pending work.
  }

  // Format to Eastern Time hour and minute
  const hourStr = hourFormatterET.format(now);
  const minuteStr = minuteFormatterET.format(now);

  const currentHour = parseInt(hourStr, 10);
  const currentMinute = parseInt(minuteStr, 10);

  console.log(`Cron trigger checking. Current Eastern Time: ${currentHour}:${currentMinute.toString().padStart(2, "0")}`);

  // Ensure we are triggering near the top of the hour (Wrangler/Cloudflare cron is hourly on the hour)
  if (currentMinute > 10) {
    console.log("Not near top of the hour. Skipping.");
    return null;
  }

  let triggerType = null;
  if (currentHour === 6) {
    triggerType = "AM";
  } else if (currentHour === 12) {
    triggerType = "NOON";
  } else if (currentHour === 18) {
    triggerType = "PM";
  }

  if (triggerType) {
    console.log(`Time match: Running scheduled ${triggerType} report...`);
    try {
      await runReport(triggerType, env);
      console.log(`Scheduled ${triggerType} report run successfully completed.`);
    } catch (error) {
      console.error(`Scheduled ${triggerType} report run failed:`, error);
    }
    return triggerType;
  }

  console.log(`No scheduled report matched for hour ${currentHour} ET.`);
  return null;
}
