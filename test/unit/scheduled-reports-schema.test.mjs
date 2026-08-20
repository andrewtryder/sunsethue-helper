import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createLocalD1 } from "../support/local-d1.mjs";
import { getApplicationSettings } from "../../worker/notifications/application-settings.js";
import { normalizeDeliveryPurpose } from "../../worker/db.js";

const ALTERS = [
  "ALTER TABLE application_settings ADD COLUMN scheduledReportsEnabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE application_settings ADD COLUMN scheduledReportTimes TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE application_settings ADD COLUMN scheduledReportChannels TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE notification_outbox ADD COLUMN deliveryPurpose TEXT"
];

function isIgnorableAlterError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("duplicate column") || text.includes("already exists");
}

test("clean schema install includes scheduled-report defaults", async () => {
  const local = await createLocalD1();
  try {
    const settings = await getApplicationSettings({ DB: local.DB });
    assert.equal(settings.scheduledReportsEnabled, false);
    assert.deepEqual(settings.scheduledReportTimes, []);
    assert.deepEqual(settings.scheduledReportChannels, []);
  } finally {
    local.close();
  }
});

test("additive alters are safe to rerun on an existing DB", async () => {
  const database = new DatabaseSync(":memory:");
  // Minimal pre-feature application_settings / outbox shape.
  database.exec(`
    CREATE TABLE application_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scheduleTimezone TEXT NOT NULL,
      displayTimezoneMode TEXT NOT NULL,
      displayTimezone TEXT,
      scheduleTimes TEXT NOT NULL,
      weeklySelfTestEnabled INTEGER NOT NULL DEFAULT 1,
      weeklySelfTestMode TEXT NOT NULL DEFAULT 'passive',
      weeklySelfTestDay INTEGER NOT NULL DEFAULT 0,
      weeklySelfTestTime TEXT NOT NULL DEFAULT '10:00',
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE notification_outbox (
      id TEXT PRIMARY KEY,
      runId TEXT,
      channel TEXT NOT NULL,
      deliveryTargetId TEXT,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      nextAttemptAt INTEGER NOT NULL
    );
    INSERT INTO application_settings (
      id, scheduleTimezone, displayTimezoneMode, displayTimezone, scheduleTimes,
      weeklySelfTestEnabled, weeklySelfTestMode, weeklySelfTestDay, weeklySelfTestTime, updatedAt
    ) VALUES (
      1, 'America/New_York', 'schedule', NULL, '["06:00","12:00","18:00"]',
      1, 'passive', 0, '10:00', 1
    );
    INSERT INTO notification_outbox (
      id, runId, channel, deliveryTargetId, status, payload, attempts, createdAt, nextAttemptAt
    ) VALUES (
      'legacy', NULL, 'email', NULL, 'sent', '{}', 1, 1, 1
    );
  `);

  for (const sql of ALTERS) {
    database.exec(sql);
  }
  for (const sql of ALTERS) {
    try {
      database.exec(sql);
      assert.fail(`expected duplicate-column for: ${sql}`);
    } catch (error) {
      assert.ok(isIgnorableAlterError(error), String(error));
    }
  }

  const row = database.prepare("SELECT scheduledReportsEnabled, scheduledReportTimes, scheduledReportChannels FROM application_settings WHERE id = 1").get();
  assert.equal(row.scheduledReportsEnabled, 0);
  assert.equal(row.scheduledReportTimes, "[]");
  assert.equal(row.scheduledReportChannels, "[]");

  const outbox = database.prepare("SELECT deliveryPurpose FROM notification_outbox WHERE id = 'legacy'").get();
  assert.equal(outbox.deliveryPurpose, null);
  assert.equal(normalizeDeliveryPurpose({ deliveryPurpose: null, triggerType: "SCHEDULED:06:00" }), "quality_alert");
  database.close();
});

test("full schema.sql installs and exposes deliveryPurpose column", async () => {
  const schema = await readFile(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec(schema);
  const cols = database.prepare("PRAGMA table_info(notification_outbox)").all();
  assert.ok(cols.some((col) => col.name === "deliveryPurpose"));
  const appCols = database.prepare("PRAGMA table_info(application_settings)").all();
  assert.ok(appCols.some((col) => col.name === "scheduledReportsEnabled"));
  database.close();
});
