import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  buildTimezoneSelectHtml,
  formatDateTimeMediumWithZone,
  formatDateWithZone,
  formatInstantWithZone,
  formatTimeShortWithZone,
  formatTimeWithZone,
  formatUtcOffsetLabel,
  isValidIanaTimeZone,
  listSupportedIanaTimeZones,
  resolveDisplayTimeZone
} from "../public/lib/time-format.js";

const JAN = new Date("2026-01-15T12:00:00Z");
const JUL = new Date("2026-07-15T12:00:00Z");
const FIXED = "2026-07-15T16:00:00.000Z";

test("formatUtcOffsetLabel is DST-aware for fixed timestamps", () => {
  assert.equal(formatUtcOffsetLabel("America/New_York", JAN), "UTC−05:00");
  assert.equal(formatUtcOffsetLabel("America/New_York", JUL), "UTC−04:00");
  assert.equal(formatUtcOffsetLabel("Europe/London", JAN), "UTC+00:00");
  assert.equal(formatUtcOffsetLabel("Europe/London", JUL), "UTC+01:00");
  assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+00:00");
  assert.equal(formatUtcOffsetLabel("Not/AZone", JAN), null);
  assert.equal(formatUtcOffsetLabel("America/New_York", "not-a-date"), null);
  assert.equal(formatUtcOffsetLabel("America/New_York", Number.NaN), null);
});

test("resolveDisplayTimeZone uses scheduleTimezone only", () => {
  assert.equal(
    resolveDisplayTimeZone({
      scheduleTimezone: "Europe/Berlin",
      displayTimezoneMode: "device",
      displayTimezone: "Asia/Tokyo"
    }, "America/Los_Angeles"),
    "Europe/Berlin"
  );
  assert.equal(
    resolveDisplayTimeZone({
      scheduleTimezone: "Not/AZone",
      displayTimezoneMode: "selected",
      displayTimezone: "Europe/London"
    }, "America/Chicago"),
    "America/New_York"
  );
  assert.equal(resolveDisplayTimeZone({}, null), "America/New_York");
  assert.equal(DEFAULT_SCHEDULE_TIMEZONE, "America/New_York");
});

test("timezone select groups US, Europe, then Other with offsets", () => {
  const html = buildTimezoneSelectHtml("America/New_York", JUL);
  assert.match(html, /<optgroup label="United States">/);
  assert.match(html, /<optgroup label="Europe">/);
  assert.match(html, /<optgroup label="Other time zones">/);
  const usIdx = html.indexOf('label="United States"');
  const euIdx = html.indexOf('label="Europe"');
  const otherIdx = html.indexOf('label="Other time zones"');
  assert.ok(usIdx >= 0 && euIdx > usIdx && otherIdx > euIdx);
  assert.match(html, /value="America\/New_York"[^>]*>America\/New_York \(UTC−04:00\)/);
  assert.match(html, /value="America\/Los_Angeles"/);
  assert.match(html, /value="Europe\/London"/);
  assert.match(html, /value="Europe\/Berlin"/);
  assert.match(html, /value="Asia\/Tokyo"/);
  assert.ok(isValidIanaTimeZone("America/New_York"));
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(isValidIanaTimeZone("Fake/Zone"), false);
  assert.equal(isValidIanaTimeZone("x".repeat(65)), false);
});

test("listSupportedIanaTimeZones returns browser-supported zones", () => {
  const zones = listSupportedIanaTimeZones();
  assert.ok(Array.isArray(zones));
  assert.ok(zones.includes("America/New_York"));
  assert.ok(zones.includes("Europe/London"));
  assert.ok(zones.every((tz) => isValidIanaTimeZone(tz)));
});

test("buildTimezoneSelectHtml preserves a valid selected zone missing from the source list", () => {
  const html = buildTimezoneSelectHtml("America/New_York", JUL);
  assert.match(html, /value="America\/New_York"[^>]* selected/);
  const defaultHtml = buildTimezoneSelectHtml(undefined, JUL);
  assert.match(defaultHtml, /value="America\/New_York"/);
});

test("listSupportedIanaTimeZones falls back when supportedValuesOf is unavailable", () => {
  const original = Intl.supportedValuesOf;
  try {
    // @ts-ignore
    delete Intl.supportedValuesOf;
    const zones = listSupportedIanaTimeZones();
    assert.ok(zones.includes("America/New_York"));
    assert.ok(zones.includes("Europe/Berlin"));
    assert.ok(zones.includes("Asia/Tokyo"));
  } finally {
    if (original) Intl.supportedValuesOf = original;
  }
});

test("listSupportedIanaTimeZones falls back when supportedValuesOf throws", () => {
  const original = Intl.supportedValuesOf;
  try {
    Intl.supportedValuesOf = () => {
      throw new Error("unsupported");
    };
    const zones = listSupportedIanaTimeZones();
    assert.ok(zones.includes("UTC"));
    assert.ok(zones.every((tz) => isValidIanaTimeZone(tz)));
  } finally {
    Intl.supportedValuesOf = original;
  }
});

test("formatUtcOffsetLabel normalizes uncommon GMT labels and handles formatter failures", () => {
  const proto = Intl.DateTimeFormat.prototype;
  const original = proto.formatToParts;
  try {
    proto.formatToParts = function formatToParts() {
      return [{ type: "timeZoneName", value: "GMT" }];
    };
    assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+00:00");

    proto.formatToParts = function formatToParts() {
      return [{ type: "timeZoneName", value: "GMT+0" }];
    };
    assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+00:00");

    proto.formatToParts = function formatToParts() {
      return [{ type: "timeZoneName", value: "GMT-0" }];
    };
    assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+00:00");

    proto.formatToParts = function formatToParts() {
      return [{ type: "timeZoneName", value: "GMT+5" }];
    };
    assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+05:00");

    proto.formatToParts = function formatToParts() {
      throw new Error("boom");
    };
    assert.equal(formatUtcOffsetLabel("UTC", JAN), null);
  } finally {
    proto.formatToParts = original;
  }
});

test("display format helpers format fixed instants in an application timezone", () => {
  assert.equal(formatInstantWithZone(null, "America/New_York"), null);
  assert.equal(formatInstantWithZone(undefined, "America/New_York"), null);
  assert.equal(formatInstantWithZone("", "America/New_York"), null);
  assert.equal(formatInstantWithZone("not-a-date", "America/New_York"), null);

  const withZone = formatTimeWithZone(FIXED, "America/New_York");
  assert.match(withZone, /12:00\sPM/);

  const dateOnly = formatDateWithZone(FIXED, "America/New_York");
  assert.match(dateOnly, /Jul/);
  assert.match(dateOnly, /15/);

  const medium = formatDateTimeMediumWithZone(FIXED, "America/New_York");
  assert.match(medium, /Jul/);
  assert.match(medium, /15/);
  assert.match(medium, /2026/);
  assert.match(medium, /12:00/);

  const short = formatTimeShortWithZone(FIXED, "America/New_York");
  assert.match(short, /12:00/);

  const fallbackTz = formatTimeWithZone(new Date(FIXED), "Not/AZone");
  assert.match(fallbackTz, /12:00/);
});
