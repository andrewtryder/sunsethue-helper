import { runAndSendReport } from "./report.js";

// Cache expensive Intl.DateTimeFormat instances globally to improve execution speed
const hourFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hour12: false
});

const minuteFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  minute: "numeric"
});

export async function handleScheduledReport(event, env) {
  const now = new Date();
  
  // Format to Eastern Time hour and minute
  const hourStr = hourFormatterET.format(now);
  const minuteStr = minuteFormatterET.format(now);

  const currentHour = parseInt(hourStr, 10);
  const currentMinute = parseInt(minuteStr, 10);

  console.log(`Cron trigger checking. Current Eastern Time: ${currentHour}:${currentMinute.toString().padStart(2, "0")}`);

  // Ensure we are triggering near the top of the hour (Wrangler/Cloudflare cron is hourly on the hour)
  if (currentMinute > 10) {
    console.log("Not near top of the hour. Skipping.");
    return;
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
      await runAndSendReport(triggerType, env);
      console.log(`Scheduled ${triggerType} report run successfully completed.`);
    } catch (error) {
      console.error(`Scheduled ${triggerType} report run failed:`, error);
    }
  } else {
    console.log(`No scheduled report matched for hour ${currentHour} ET.`);
  }
}
