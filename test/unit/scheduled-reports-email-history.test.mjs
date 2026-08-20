import test from "node:test";
import assert from "node:assert/strict";
import { buildEmailSubject, buildHtmlEmail } from "../../worker/notifications/email.js";
import { formatColumnDateWithZone } from "../../shared/time-format.js";
import { validateApplicationSettingsInput } from "../../worker/notifications/application-settings.js";
import { NotificationError } from "../../worker/notifications/errors.js";
import { exportHistoryScope } from "../../worker/repositories/history.js";
import { createLocalD1 } from "../support/local-d1.mjs";

// 2026-08-20T15:00:00Z is Aug 20 afternoon in New York and Aug 21 morning in Tokyo.
const BOUNDARY_INSTANT = "2026-08-20T15:00:00.000Z";

test("formatColumnDateWithZone differs between New York and Tokyo at the date boundary", () => {
  const ny = formatColumnDateWithZone(BOUNDARY_INSTANT, "America/New_York");
  const tokyo = formatColumnDateWithZone(BOUNDARY_INSTANT, "Asia/Tokyo");
  assert.match(ny, /Aug 20/);
  assert.match(tokyo, /Aug 21/);
  assert.notEqual(ny, tokyo);
});

test("email subjects and headings reflect delivery purpose and display timezone", () => {
  const results = [{
    name: "Harbor",
    sunrise: { time: BOUNDARY_INSTANT, quality: 0.8, quality_text: "Great" },
    sunset: { time: BOUNDARY_INSTANT, quality: 0.7, quality_text: "Good" },
    triggeredEvents: ["sunset"],
    error: null
  }];

  assert.match(
    buildEmailSubject({ triggerType: "SCHEDULED:06:00", deliveryPurpose: "scheduled_report" }),
    /Scheduled Report — 6:00 AM/
  );
  assert.match(
    buildEmailSubject({ triggerType: "SCHEDULED:00:00", deliveryPurpose: "scheduled_report" }),
    /12:00 AM/
  );
  assert.match(
    buildEmailSubject({ triggerType: "SCHEDULED:12:00", deliveryPurpose: "scheduled_report" }),
    /12:00 PM/
  );
  assert.match(
    buildEmailSubject({ triggerType: "SCHEDULED:18:00", deliveryPurpose: "scheduled_report" }),
    /6:00 PM/
  );
  assert.equal(
    buildEmailSubject({ triggerType: "Manual", deliveryPurpose: "scheduled_report" }),
    "Sunsethue Scheduled Report"
  );
  assert.equal(
    buildEmailSubject({ triggerType: "SCHEDULED:12:00", deliveryPurpose: "quality_alert" }),
    "Sunsethue Quality Alert"
  );
  assert.equal(
    buildEmailSubject({ triggerType: "Manual Test", deliveryPurpose: "test" }),
    "Sunsethue Test"
  );
  assert.equal(
    buildEmailSubject({ triggerType: "WEEKLY_SELF_TEST", deliveryPurpose: "self_test" }),
    "Sunsethue Self-Test"
  );

  const tokyoHtml = buildHtmlEmail(
    results,
    {
      triggerType: "SCHEDULED:06:00",
      deliveryPurpose: "scheduled_report",
      displayTimezone: "Asia/Tokyo"
    },
    "report-time",
    "https://example.test"
  );
  assert.match(tokyoHtml, /Scheduled forecast report/);
  assert.match(tokyoHtml, /Aug 21/);
  assert.doesNotMatch(tokyoHtml, /Aug 20/);
  assert.match(tokyoHtml, /★/);

  const errorHtml = buildHtmlEmail(
    [{ name: "Broken", sunrise: null, sunset: null, error: "Forecast unavailable", triggeredEvents: [] }],
    { triggerType: "AM", deliveryPurpose: "quality_alert", displayTimezone: "America/New_York" },
    "now",
    null
  );
  assert.match(errorHtml, /Forecast unavailable/);
  assert.match(errorHtml, /Quality alert/);

  const nyHtml = buildHtmlEmail(
    results,
    {
      triggerType: "SCHEDULED:12:00",
      deliveryPurpose: "quality_alert",
      displayTimezone: "America/New_York"
    },
    "report-time",
    null
  );
  assert.match(nyHtml, /Quality alert/);
  assert.match(nyHtml, /Aug 20/);

  const legacyString = buildHtmlEmail(results, "PM", "now", "https://example.test");
  assert.match(legacyString, /Next Sunrise/);
});

test("application settings reject invalid scheduled-report channels and enabled type", () => {
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00",
      scheduledReportsEnabled: "yes",
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["email"]
    }),
    (error) => error instanceof NotificationError && error.code === "INVALID_SETTINGS"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00",
      scheduledReportsEnabled: true,
      scheduledReportTimes: ["06:00"],
      scheduledReportChannels: ["sms"]
    }),
    (error) => error instanceof NotificationError && error.code === "INVALID_SCHEDULED_REPORT_CHANNEL"
  );
  assert.throws(
    () => validateApplicationSettingsInput({
      scheduleTimezone: "America/New_York",
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: ["06:00"],
      weeklySelfTestEnabled: true,
      weeklySelfTestMode: "passive",
      weeklySelfTestDay: 0,
      weeklySelfTestTime: "10:00",
      scheduledReportsEnabled: true,
      scheduledReportTimes: "06:00",
      scheduledReportChannels: ["email"]
    }),
    (error) => error instanceof NotificationError && error.code === "INVALID_SCHEDULED_REPORT_TIME"
  );
});

test("history export normalizes NULL and explicit deliveryPurpose", async () => {
  const local = await createLocalD1();
  const env = { DB: local.DB };
  try {
    await env.DB.prepare(
      `INSERT INTO runs (id, timestamp, triggerType, status, locationsCount, results, error)
       VALUES ('run-a', 1, 'SCHEDULED:06:00', 'success', 1, '[]', NULL),
              ('run-b', 2, 'TEST', 'success', 1, '[]', NULL)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO notification_outbox
        (id, runId, channel, deliveryTargetId, status, payload, attempts, createdAt, nextAttemptAt, sentAt, lastErrorCode, deliveryPurpose)
       VALUES
        ('d-null', 'run-a', 'email', NULL, 'sent', '{}', 1, 1, 1, 1, NULL, NULL),
        ('d-alert', 'run-a', 'pushover', NULL, 'sent', '{}', 1, 2, 2, 2, NULL, 'quality_alert'),
        ('d-fail', 'run-b', 'email', NULL, 'failed', '{}', 3, 3, 3, NULL, 'SMTP_DELIVERY_FAILED', 'test')`
    ).run();

    const completed = await exportHistoryScope(env, "deliveries_completed");
    const nullRow = completed.find((row) => row.id === "d-null");
    const alertRow = completed.find((row) => row.id === "d-alert");
    assert.equal(nullRow.deliveryPurpose, "quality_alert");
    assert.equal(alertRow.deliveryPurpose, "quality_alert");

    const failed = await exportHistoryScope(env, "deliveries_failed");
    assert.equal(failed[0].deliveryPurpose, "test");
  } finally {
    local.close();
  }
});
