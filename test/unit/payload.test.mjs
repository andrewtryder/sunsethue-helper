import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNotificationPayload,
  buildPushoverContent,
  parseNotificationPayload
} from "../../worker/notifications/payload.js";

const NOW = Date.parse("2026-07-15T12:00:00Z");

function baseModel(overrides = {}) {
  return {
    triggerType: "AM",
    generatedAt: NOW,
    dashboardUrl: "https://dashboard.example.test",
    results: [
      {
        name: "Beach",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.8, quality_text: "Great" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0.4, quality_text: "Fair" },
        error: null
      }
    ],
    ...overrides
  };
}

test("buildNotificationPayload normalizes location names", () => {
  const payload = buildNotificationPayload(baseModel({
    results: [{ name: "Line 1\r\nLine 2", sunrise: null, sunset: null, error: null }]
  }));
  assert.equal(payload.locations[0].name, "Line 1 Line 2");
  assert.equal(payload.version, 1);
});

test("parseNotificationPayload rejects every well-known shape violation", () => {
  const cases = [
    "not json",
    JSON.stringify(null),
    JSON.stringify([]),
    JSON.stringify({ version: 2, triggerType: "AM", generatedAt: NOW, locations: [] }),
    JSON.stringify({ version: 1, triggerType: "BAD", generatedAt: NOW, locations: [] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: "no", locations: [] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, dashboardUrl: "javascript:alert(1)", locations: [] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, dashboardUrl: 5, locations: [] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: "no" }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: new Array(11).fill({ name: "X", sunrise: null, sunset: null }) }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [null] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "" }] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "A", sunrise: [] }] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "A", sunrise: { time: 1, quality: 0.5, text: "ok" } }] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "A", sunrise: { time: "2026-07-15T09:00:00Z", quality: "no", text: null } }] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "A", sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.5, text: 4 } }] }),
    JSON.stringify({ version: 1, triggerType: "AM", generatedAt: NOW, locations: [{ name: "A", errorCode: "SOMETHING_ELSE" }] })
  ];
  for (const payload of cases) {
    assert.throws(() => parseNotificationPayload(payload), /INVALID_NOTIFICATION_PAYLOAD/, payload);
  }
});

test("parseNotificationPayload accepts a valid payload and normalizes names", () => {
  const parsed = parseNotificationPayload(JSON.stringify({
    version: 1,
    triggerType: "Manual Test",
    generatedAt: NOW,
    dashboardUrl: null,
    locations: [
      { name: "Beach\n\r", sunrise: null, sunset: null, errorCode: "FORECAST_UNAVAILABLE" }
    ]
  }));
  assert.equal(parsed.triggerType, "Manual Test");
  assert.equal(parsed.locations[0].name, "Beach");
  assert.equal(parsed.locations[0].errorCode, "FORECAST_UNAVAILABLE");
});

test("buildPushoverContent honors UTF-8 byte limits for the message", () => {
  const payload = {
    triggerType: "AM",
    locations: [{ name: "\u{1F355}".repeat(400), sunrise: null, sunset: null, errorCode: null }]
  };
  const content = buildPushoverContent(payload);
  const bodyBytes = new TextEncoder().encode(content.message).byteLength;
  assert.ok(bodyBytes <= 1024);
  assert.ok(content.title.length <= 250);
});

test("buildPushoverContent joins location entries and formats times with quality and triggers", () => {
  const content = buildPushoverContent({
    triggerType: "PM",
    displayTimezone: "America/New_York",
    locations: [
      { name: "A", sunrise: null, sunset: null, errorCode: null },
      { 
        name: "B", 
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.8, text: "Great" }, 
        sunset: { time: null },
        triggeredEvents: ["sunrise"]
      },
      {
        name: "C",
        sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.8, text: "80%" },
        sunset: { time: "2026-07-15T23:00:00Z", quality: 0, text: "Poor" },
        triggeredEvents: ["sunrise", "sunset"]
      }
    ]
  });
  // A: ↑ N/A | ↓ N/A
  // B: ★ ↑ 5:00 AM EDT · 80% Great | ↓ N/A
  // C: ★ ↑ 5:00 AM EDT · 80% | ★ ↓ 7:00 PM EDT · 0% Poor
  assert.match(content.message, /A: ↑ N\/A \| ↓ N\/A/);
  assert.match(content.message, /B: ★ ↑ 5:00 AM EDT · 80% Great \| ↓ N\/A/);
  assert.match(content.message, /C: ★ ↑ 5:00 AM EDT · 80% \| ★ ↓ 7:00 PM EDT · 0% Poor/);
});

test("buildPushoverContent intelligently truncates locations and appends a footer", () => {
  const longName = "Very Long Location Name ".repeat(10); // ~240 bytes each
  const locations = new Array(8).fill({
    name: longName,
    sunrise: { time: "2026-07-15T09:00:00Z", quality: 0.5, text: "Ok" },
    sunset: { time: "2026-07-15T23:00:00Z", quality: 0.5, text: "Ok" }
  });
  const content = buildPushoverContent({
    triggerType: "AM",
    displayTimezone: "UTC",
    locations
  });
  const bodyBytes = new TextEncoder().encode(content.message).byteLength;
  assert.ok(bodyBytes <= 1024);
  assert.match(content.message, /…and \d+ more\. Open Sunsethue Helper for details\./);
  // It shouldn't end halfway through a location name
  assert.ok(!content.message.endsWith("Very Long Loc"));
});

test("buildPushoverContent shows forecast unavailable for errors", () => {
  const content = buildPushoverContent({
    triggerType: "AM",
    locations: [{ name: "Beach", errorCode: "FORECAST_UNAVAILABLE" }]
  });
  assert.equal(content.message, "Beach: forecast unavailable");
});
