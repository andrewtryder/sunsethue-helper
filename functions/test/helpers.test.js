const test = require("node:test");
const assert = require("node:assert");
const {
  formatTimeET,
  getQualityBadge,
  escapeHtml,
  selectNextSunEvents,
  validateReportEnv,
  buildEmailSubject,
  normalizeQualityToUnit,
  qualityToPercent,
  buildForecastEventSnapshot,
  normalizeForecastEvent
} = require("../lib/helpers");

test("formatTimeET converts UTC timestamps to America/New_York timezone", () => {
  assert.match(formatTimeET("2026-05-27T12:44:00.000Z"), /Wed, May 27, 8:44\s*AM/);
  assert.match(formatTimeET("2026-05-28T02:54:00.000Z"), /Wed, May 27, 10:54\s*PM/);
  assert.strictEqual(formatTimeET(null), "N/A");
  assert.strictEqual(formatTimeET(undefined), "N/A");
  assert.strictEqual(formatTimeET("invalid-date-string"), "Invalid Date");
});

test("selectNextSunEvents finds the closest upcoming sunrise and sunset", () => {
  const now = new Date("2026-05-27T10:30:00.000Z").getTime();
  const events = [
    { type: "sunrise", time: "2026-05-27T09:30:00.000Z", quality: 0.15 },
    { type: "sunset", time: "2026-05-27T23:30:00.000Z", quality: 0.75 },
    { type: "sunrise", time: "2026-05-28T09:30:00.000Z", quality: 0.85 },
    { type: "sunset", time: "2026-05-28T23:30:00.000Z", quality: 0.40 }
  ];

  const { nextSunrise, nextSunset } = selectNextSunEvents(events, now);
  assert.strictEqual(nextSunrise.time, "2026-05-28T09:30:00.000Z");
  assert.strictEqual(nextSunset.time, "2026-05-27T23:30:00.000Z");
});

test("normalizeQualityToUnit accepts decimal and percent-scale values", () => {
  assert.strictEqual(normalizeQualityToUnit(0.35), 0.35);
  assert.strictEqual(normalizeQualityToUnit(35), 0.35);
  assert.strictEqual(normalizeQualityToUnit(0.7), 0.7);
  assert.strictEqual(normalizeQualityToUnit(1), 1);
  assert.strictEqual(normalizeQualityToUnit(100), 1);
  assert.strictEqual(normalizeQualityToUnit(null), null);
  assert.strictEqual(normalizeQualityToUnit(150), null);
  assert.strictEqual(normalizeQualityToUnit("bad"), null);
});

test("qualityToPercent converts normalized values for display", () => {
  assert.strictEqual(qualityToPercent(0.35), 35);
  assert.strictEqual(qualityToPercent(35), 35);
  assert.strictEqual(qualityToPercent(0.7), 70);
  assert.strictEqual(qualityToPercent(null), null);
});

test("buildForecastEventSnapshot captures raw and normalized quality", () => {
  const snapshot = buildForecastEventSnapshot({
    type: "sunset",
    time: "2026-05-27T23:30:00.000Z",
    quality: 35,
    quality_text: "Fair"
  });

  assert.strictEqual(snapshot.quality, 35);
  assert.strictEqual(snapshot.normalizedQuality, 0.35);
  assert.strictEqual(snapshot.displayPercent, 35);
  assert.strictEqual(snapshot.qualityText, "Fair");
});

test("normalizeForecastEvent stores quality on 0-1 scale", () => {
  const event = normalizeForecastEvent({
    type: "sunrise",
    time: "2026-05-28T09:30:00.000Z",
    quality: 35,
    quality_text: "Fair"
  });

  assert.strictEqual(event.quality, 0.35);
  assert.strictEqual(event.quality_text, "Fair");
});

test("getQualityBadge returns the correct HTML badge based on the decimal score", () => {
  assert.match(getQualityBadge(0.85), /85% \(Spectacular\)/);
  assert.match(getQualityBadge(0.85, "Great"), /85% \(Great\)/);
  assert.match(getQualityBadge(0.35, "Fair"), /35% \(Fair\)/);
  assert.match(getQualityBadge(35, "Fair"), /35% \(Fair\)/);
  assert.match(getQualityBadge(0.7), /70%/);
  assert.match(getQualityBadge(0.60), /60% \(Spectacular\)/);
  assert.match(getQualityBadge(0.59), /59% \(Good\)/);
  assert.match(getQualityBadge(0.30), /30% \(Good\)/);
  assert.match(getQualityBadge(0.29), /29% \(Muted\)/);
  assert.match(getQualityBadge(0.0), /0% \(Muted\)/);
  assert.match(getQualityBadge(null), /N\/A/);
  assert.match(getQualityBadge(undefined), /N\/A/);
  assert.match(getQualityBadge(150), /N\/A/);
});

test("escapeHtml sanitizes HTML entities", () => {
  assert.strictEqual(escapeHtml('<script>"\'&"</script>'), "&lt;script&gt;&quot;&#039;&amp;&quot;&lt;/script&gt;");
  assert.strictEqual(escapeHtml(""), "");
  assert.strictEqual(escapeHtml(null), "");
});

test("validateReportEnv rejects missing or placeholder configuration", () => {
  assert.throws(
    () => validateReportEnv({ SUNSETHUE_API_KEY: "PLACEHOLDER" }),
    /SUNSETHUE_API_KEY/
  );
  assert.throws(
    () => validateReportEnv({
      SUNSETHUE_API_KEY: "valid",
      GMAIL_USER: "user@gmail.com",
      GMAIL_APP_PASSWORD: "PLACEHOLDER_GMAIL_APP_PASSWORD"
    }),
    /Gmail SMTP/
  );
  assert.doesNotThrow(() => validateReportEnv({
    SUNSETHUE_API_KEY: "valid",
    GMAIL_USER: "user@gmail.com",
    GMAIL_APP_PASSWORD: "secret",
    EMAIL_TO: "user@gmail.com"
  }));
});

test("buildEmailSubject labels trigger types correctly", () => {
  assert.match(buildEmailSubject("AM"), /Morning/);
  assert.match(buildEmailSubject("PM"), /Evening/);
  assert.match(buildEmailSubject("Manual Test"), /On-Demand Test/);
});
