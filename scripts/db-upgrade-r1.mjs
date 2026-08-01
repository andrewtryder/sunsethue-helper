#!/usr/bin/env node
/**
 * Operator-run R1 D1 upgrade: application_settings, location_notification_rules,
 * scheduled_occurrences. Does not reshape notification_outbox (see R2 script).
 *
 * Usage:
 *   node scripts/db-upgrade-r1.mjs --dry-run
 *   node scripts/db-upgrade-r1.mjs --local
 *   node scripts/db-upgrade-r1.mjs --remote
 *
 * Remote runs should bookmark D1 Time Travel before applying.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWranglerConfig } from "./generate-wrangler-config.mjs";
import { resolveProject } from "./lib/project-config.mjs";
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  DEFAULT_SCHEDULE_TIMES
} from "../shared/schema-manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const remote = argv.includes("--remote");
  const local = argv.includes("--local") || !remote;
  return { dryRun, remote: remote && !dryRun ? true : remote, local: !remote || local, mode: remote ? "remote" : "local" };
}

function runSql(project, mode, sql, dryRun) {
  if (dryRun) {
    console.log("--- SQL ---");
    console.log(sql);
    return { status: 0 };
  }
  const args = [
    "--no",
    "wrangler",
    "d1",
    "execute",
    project.d1Name,
    "--config",
    "wrangler.worker.toml",
    mode === "remote" ? "--remote" : "--local",
    "--command",
    sql
  ];
  return spawnSync("npx", args, { cwd: ROOT, stdio: "inherit", shell: false });
}

function buildUpgradeSql(now = Date.now()) {
  const scheduleTimesJson = JSON.stringify(DEFAULT_SCHEDULE_TIMES).replace(/'/g, "''");
  return `
CREATE TABLE IF NOT EXISTS application_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scheduleTimezone TEXT NOT NULL DEFAULT 'America/New_York',
  displayTimezoneMode TEXT NOT NULL DEFAULT 'schedule'
    CHECK (displayTimezoneMode IN ('schedule', 'device', 'selected')),
  displayTimezone TEXT,
  scheduleTimes TEXT NOT NULL DEFAULT '["06:00","12:00","18:00"]',
  weeklySelfTestEnabled INTEGER NOT NULL DEFAULT 1 CHECK (weeklySelfTestEnabled IN (0, 1)),
  weeklySelfTestMode TEXT NOT NULL DEFAULT 'passive'
    CHECK (weeklySelfTestMode IN ('passive', 'active')),
  weeklySelfTestDay INTEGER NOT NULL DEFAULT 0 CHECK (weeklySelfTestDay BETWEEN 0 AND 6),
  weeklySelfTestTime TEXT NOT NULL DEFAULT '10:00',
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS location_notification_rules (
  locationId TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  thresholdPercent INTEGER CHECK (thresholdPercent IS NULL OR (thresholdPercent BETWEEN 0 AND 100)),
  eventScope TEXT NOT NULL DEFAULT 'either'
    CHECK (eventScope IN ('either', 'sunrise', 'sunset', 'both')),
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (locationId, channel),
  FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_rules_channel
  ON location_notification_rules (channel, enabled);

CREATE TABLE IF NOT EXISTS scheduled_occurrences (
  occurrenceKey TEXT PRIMARY KEY,
  startedAt INTEGER NOT NULL,
  runId TEXT
);

INSERT INTO application_settings (
  id, scheduleTimezone, displayTimezoneMode, displayTimezone, scheduleTimes,
  weeklySelfTestEnabled, weeklySelfTestMode, weeklySelfTestDay, weeklySelfTestTime, updatedAt
) SELECT
  1, '${DEFAULT_SCHEDULE_TIMEZONE}', 'schedule', NULL, '${scheduleTimesJson}',
  1, 'passive', 0, '10:00', ${now}
WHERE NOT EXISTS (SELECT 1 FROM application_settings WHERE id = 1);

INSERT OR IGNORE INTO location_notification_rules (locationId, channel, enabled, thresholdPercent, eventScope, updatedAt)
SELECT l.id, 'email',
  CASE WHEN IFNULL((SELECT emailEnabled FROM notification_settings WHERE id = 1), 0) = 1 THEN 1 ELSE 0 END,
  NULL, 'either', ${now}
FROM locations l;

INSERT OR IGNORE INTO location_notification_rules (locationId, channel, enabled, thresholdPercent, eventScope, updatedAt)
SELECT l.id, 'pushover',
  CASE WHEN IFNULL((SELECT pushoverEnabled FROM notification_settings WHERE id = 1), 0) = 1 THEN 1 ELSE 0 END,
  NULL, 'either', ${now}
FROM locations l;
`.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await generateWranglerConfig({ strict: args.mode === "remote", root: ROOT });
  const project = resolveProject({ strict: args.mode === "remote" });

  console.log("R1 D1 upgrade");
  console.log(`  target: ${args.mode} D1=${project.d1Name}`);
  if (args.mode === "remote") {
    console.log("  Before applying: create a D1 Time Travel bookmark and record the bookmark id.");
    console.log("  Example: npx wrangler d1 time-travel info <D1_NAME> --config wrangler.worker.toml");
  }

  const preSql = `
SELECT 'locations' AS name, COUNT(*) AS n FROM locations
UNION ALL SELECT 'notification_settings', COUNT(*) FROM notification_settings
UNION ALL SELECT 'application_settings', COUNT(*) FROM sqlite_master WHERE type='table' AND name='application_settings'
UNION ALL SELECT 'location_notification_rules', COUNT(*) FROM sqlite_master WHERE type='table' AND name='location_notification_rules';
`.trim();
  console.log("Pre-check counts:");
  runSql(project, args.mode, preSql, false);

  const sql = buildUpgradeSql();
  const result = runSql(project, args.mode, sql, args.dryRun);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  if (!args.dryRun) {
    console.log("Post-check:");
    runSql(
      project,
      args.mode,
      `SELECT COUNT(*) AS application_settings FROM application_settings;
       SELECT COUNT(*) AS location_rules FROM location_notification_rules;
       SELECT COUNT(*) AS scheduled_occurrences FROM scheduled_occurrences;`,
      false
    );
    console.log("R1 upgrade complete. Rollback: restore D1 from the Time Travel bookmark taken before this run.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
