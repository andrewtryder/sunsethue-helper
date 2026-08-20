import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimezoneSelectHtml,
  formatUtcOffsetLabel,
  isValidIanaTimeZone,
  resolveDisplayTimeZone
} from "../public/lib/time-format.js";

const JAN = new Date("2026-01-15T12:00:00Z");
const JUL = new Date("2026-07-15T12:00:00Z");

test("formatUtcOffsetLabel is DST-aware for fixed timestamps", () => {
  assert.equal(formatUtcOffsetLabel("America/New_York", JAN), "UTC−05:00");
  assert.equal(formatUtcOffsetLabel("America/New_York", JUL), "UTC−04:00");
  assert.equal(formatUtcOffsetLabel("Europe/London", JAN), "UTC+00:00");
  assert.equal(formatUtcOffsetLabel("Europe/London", JUL), "UTC+01:00");
  assert.equal(formatUtcOffsetLabel("UTC", JAN), "UTC+00:00");
  assert.equal(formatUtcOffsetLabel("Not/AZone", JAN), null);
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
});
