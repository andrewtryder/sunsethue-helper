import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailSubject,
  buildForecastEventSnapshot,
  escapeHtml,
  formatColumnDateET,
  formatTimeOnlyET,
  getQualityBadge,
  getQualityDotColor,
  normalizeForecastEvent,
  normalizeQualityToUnit,
  qualityToPercent,
  selectNextSunEvents,
  validateReportEnv
} from "../../worker/helpers.js";

const SUMMER_SUNSET = "2026-07-15T00:26:00Z"; // 2026-07-14 20:26 EDT
const WINTER_SUNSET = "2026-01-15T21:20:00Z"; // 2026-01-15 16:20 EST

test("quality values normalize from both unit and percent scales", () => {
  assert.equal(normalizeQualityToUnit(0.42), 0.42);
  assert.equal(normalizeQualityToUnit(0), 0);
  assert.equal(normalizeQualityToUnit(1), 1);
  assert.equal(normalizeQualityToUnit(42), 0.42);
  assert.equal(normalizeQualityToUnit(100), 1);
  assert.equal(normalizeQualityToUnit("0.5"), 0.5);
});

test("unusable quality values normalize to null", () => {
  assert.equal(normalizeQualityToUnit(null), null);
  assert.equal(normalizeQualityToUnit(undefined), null);
  assert.equal(normalizeQualityToUnit("not a number"), null);
  assert.equal(normalizeQualityToUnit(101), null);
  assert.equal(normalizeQualityToUnit(-1), null);
});

test("percentages round to the nearest whole number", () => {
  assert.equal(qualityToPercent(0.756), 76);
  assert.equal(qualityToPercent(75.6), 76);
  assert.equal(qualityToPercent(null), null);
});

test("dot colour follows the quality bands", () => {
  assert.equal(getQualityDotColor(80), "#34d399");
  assert.equal(getQualityDotColor(50), "#34d399");
  assert.equal(getQualityDotColor(49), "#f97316");
  assert.equal(getQualityDotColor(15), "#f97316");
  assert.equal(getQualityDotColor(14), "#ef4444");
  assert.equal(getQualityDotColor(null), null);
});

test("quality badge renders a percentage and a readable label", () => {
  const spectacular = getQualityBadge(0.72, "Spectacular");
  assert.match(spectacular, /72% \(Spectacular\)/);
  assert.match(spectacular, /#34d399/);
  assert.match(spectacular, /#064e3b/, "light green backgrounds get dark text");

  const muted = getQualityBadge(0.05, null);
  assert.match(muted, /5% \(Muted\)/);
  assert.match(muted, /#ef4444/);

  assert.match(getQualityBadge(0.4, undefined), /40% \(Good\)/);
  assert.match(getQualityBadge(0.7, undefined), /70% \(Spectacular\)/);
});

test("a numeric quality_text falls back to a descriptive label", () => {
  assert.match(getQualityBadge(0.65, "65%"), /65% \(Spectacular\)/);
  assert.match(getQualityBadge(0.65, "65"), /65% \(Spectacular\)/);
  assert.match(getQualityBadge(0.65, "  Vivid  "), /65% \(Vivid\)/);
});

test("an unusable quality renders N/A rather than a broken badge", () => {
  assert.match(getQualityBadge(null, "ignored"), />N\/A</);
  assert.match(getQualityBadge("garbage", null), />N\/A</);
});

test("badge labels are HTML escaped", () => {
  const badge = getQualityBadge(0.5, '<script>alert("x")</script>');
  assert.equal(badge.includes("<script>"), false);
  assert.equal(badge.includes("&lt;script&gt;"), true);
});

test("escapeHtml handles every replaced character and empty input", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;");
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "");
});

test("time-only and column date formats stay Eastern", () => {
  assert.match(formatTimeOnlyET(SUMMER_SUNSET), /8:26\sPM/);
  assert.equal(formatTimeOnlyET(null), "N/A");

  assert.equal(formatColumnDateET(SUMMER_SUNSET), "(Tue, Jul 14)");
  assert.equal(formatColumnDateET(WINTER_SUNSET), "(Thu, Jan 15)");
  assert.equal(formatColumnDateET(null), "");
});

test("forecast snapshots keep the raw value alongside the normalized one", () => {
  assert.equal(buildForecastEventSnapshot(null), null);

  const snapshot = buildForecastEventSnapshot({
    time: SUMMER_SUNSET,
    type: "sunset",
    quality: 68,
    quality_text: "Great"
  });
  assert.deepEqual(snapshot, {
    time: SUMMER_SUNSET,
    type: "sunset",
    quality: 68,
    normalizedQuality: 0.68,
    qualityText: "Great",
    displayPercent: 68
  });

  const sparse = buildForecastEventSnapshot({ quality: null });
  assert.deepEqual(sparse, {
    time: null,
    type: null,
    quality: null,
    normalizedQuality: null,
    qualityText: null,
    displayPercent: null
  });
});

test("normalizeForecastEvent rewrites quality and warns only on bad input", () => {
  assert.equal(normalizeForecastEvent(null), null);
  assert.equal(normalizeForecastEvent({ quality: 55 }).quality, 0.55);
  assert.equal(normalizeForecastEvent({ quality: null }).quality, null);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args[0]);
  try {
    assert.equal(normalizeForecastEvent({ quality: 5000, time: SUMMER_SUNSET }).quality, null);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Invalid forecast quality/);
});

test("the next sunrise and sunset are the earliest future events of each type", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");
  const events = [
    { type: "sunrise", time: "2026-07-15T09:00:00Z" },
    { type: "sunset", time: "2026-07-15T23:00:00Z" },
    { type: "sunrise", time: "2026-07-16T09:05:00Z" },
    { type: "sunset", time: "2026-07-17T23:05:00Z" },
    { type: "sunrise", time: "2026-07-17T09:10:00Z" }
  ];

  const { nextSunrise, nextSunset } = selectNextSunEvents(events, now);
  assert.equal(nextSunrise.time, "2026-07-16T09:05:00Z");
  assert.equal(nextSunset.time, "2026-07-15T23:00:00Z");
});

test("selectNextSunEvents returns nulls when nothing is upcoming", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  const { nextSunrise, nextSunset } = selectNextSunEvents(
    [{ type: "sunrise", time: "2026-07-15T09:00:00Z" }],
    now
  );
  assert.equal(nextSunrise, null);
  assert.equal(nextSunset, null);
  assert.deepEqual(selectNextSunEvents([], now), { nextSunrise: null, nextSunset: null });
});

test("report generation validation requires only the forecast credential", () => {
  const complete = { SUNSETHUE_API_KEY: "k" };
  assert.doesNotThrow(() => validateReportEnv(complete));

  assert.throws(() => validateReportEnv({ SUNSETHUE_API_KEY: "" }), /SUNSETHUE_API_KEY/);
  assert.throws(
    () => validateReportEnv({ SUNSETHUE_API_KEY: "PLACEHOLDER" }),
    /SUNSETHUE_API_KEY/
  );
});

test("email subjects describe the trigger type", () => {
  assert.match(buildEmailSubject("AM"), /Morning/);
  assert.match(buildEmailSubject("NOON"), /Midday/);
  assert.match(buildEmailSubject("PM"), /Evening/);
  assert.match(buildEmailSubject("Manual Test"), /On-Demand Test/);
});
