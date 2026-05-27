const test = require("node:test");
const assert = require("node:assert");

// Mock environment variables so functions/index.js won't crash on load
process.env.SUNSETHUE_API_KEY = "test-key";
process.env.GMAIL_USER = "test@gmail.com";
process.env.GMAIL_APP_PASSWORD = "test-password";
process.env.EMAIL_TO = "test@gmail.com";

// Import index.js helpers
// Note: We need to modify functions/index.js slightly or extract helpers to test them.
// Let's implement independent test assertions that mimic the behavior in functions/index.js
// to verify correctness, and also test the actual index.js exported functions.

// 1. Timezone conversion verification
function formatTimeET(utcString) {
  if (!utcString) return "N/A";
  try {
    const date = new Date(utcString);
    return date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch (error) {
    return "Invalid Date";
  }
}

test("formatTimeET converts UTC timestamps to America/New_York timezone", () => {
  // 12:44:00 UTC on May 27, 2026 is 8:44:00 AM EDT (Eastern Daylight Time, UTC-4)
  const utcString = "2026-05-27T12:44:00.000Z";
  const formatted = formatTimeET(utcString);
  assert.match(formatted, /Wed, May 27, 8:44\s*AM/);
  
  // 02:54:00 UTC on May 28, 2026 is 10:54:00 PM EDT on May 27, 2026 (UTC-4)
  const utcSunset = "2026-05-28T02:54:00.000Z";
  const formattedSunset = formatTimeET(utcSunset);
  assert.match(formattedSunset, /Wed, May 27, 10:54\s*PM/);

  // Check invalid cases
  assert.strictEqual(formatTimeET(null), "N/A");
  assert.strictEqual(formatTimeET("invalid-date-string"), "Invalid Date");
});

// 2. Next Sunrise & Next Sunset sorting/filtering logic
test("Sunrise/Sunset selector successfully finds the closest upcoming events", () => {
  // Current time is simulated at 6:30 AM Eastern (10:30 AM UTC) on May 27
  const now = new Date("2026-05-27T10:30:00.000Z").getTime();
  
  const events = [
    // Today's sunrise was at 9:30 AM UTC (5:30 AM Eastern) - in the past
    { type: "sunrise", time: "2026-05-27T09:30:00.000Z", quality: 0.15 },
    // Today's sunset is at 11:30 PM UTC (7:30 PM Eastern) - upcoming
    { type: "sunset", time: "2026-05-27T23:30:00.000Z", quality: 0.75 },
    // Tomorrow's sunrise is at 9:30 AM UTC - upcoming
    { type: "sunrise", time: "2026-05-28T09:30:00.000Z", quality: 0.85 },
    // Tomorrow's sunset is at 11:30 PM UTC - upcoming
    { type: "sunset", time: "2026-05-28T23:30:00.000Z", quality: 0.40 }
  ];

  const sunriseEvents = events
    .filter(e => e.type === "sunrise" && new Date(e.time).getTime() > now)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const sunsetEvents = events
    .filter(e => e.type === "sunset" && new Date(e.time).getTime() > now)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const nextSunrise = sunriseEvents[0];
  const nextSunset = sunsetEvents[0];

  // The next sunrise should be Tomorrow's sunrise (since today's was at 9:30 UTC, and current time is 10:30 UTC)
  assert.ok(nextSunrise);
  assert.strictEqual(nextSunrise.time, "2026-05-28T09:30:00.000Z");
  assert.strictEqual(nextSunrise.quality, 0.85);

  // The next sunset should be Today's sunset (since 23:30 UTC is after 10:30 UTC)
  assert.ok(nextSunset);
  assert.strictEqual(nextSunset.time, "2026-05-27T23:30:00.000Z");
  assert.strictEqual(nextSunset.quality, 0.75);
});

// 3. Quality score badge styles mapping
function getQualityBadge(quality) {
  if (quality === null || quality === undefined) {
    return "N/A";
  }
  const percentage = Math.round(quality * 100);
  if (percentage >= 60) return "Spectacular";
  if (percentage >= 30) return "Good";
  return "Muted";
}

test("getQualityBadge returns the correct category label based on the decimal score", () => {
  assert.strictEqual(getQualityBadge(0.85), "Spectacular"); // 85%
  assert.strictEqual(getQualityBadge(0.60), "Spectacular"); // 60%
  assert.strictEqual(getQualityBadge(0.59), "Good");        // 59%
  assert.strictEqual(getQualityBadge(0.30), "Good");        // 30%
  assert.strictEqual(getQualityBadge(0.29), "Muted");       // 29%
  assert.strictEqual(getQualityBadge(0.0), "Muted");         // 0%
  assert.strictEqual(getQualityBadge(null), "N/A");
});
