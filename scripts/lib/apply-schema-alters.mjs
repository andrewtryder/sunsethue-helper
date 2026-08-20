/**
 * Apply additive schema alters that CREATE TABLE IF NOT EXISTS cannot express.
 * Safe to re-run: duplicate-column errors are ignored.
 */
import { spawnSync } from "node:child_process";

const ALTERS = [
  "ALTER TABLE locations ADD COLUMN scheduleTimes TEXT",
  "ALTER TABLE application_settings ADD COLUMN scheduledReportsEnabled INTEGER NOT NULL DEFAULT 0 CHECK (scheduledReportsEnabled IN (0, 1))",
  "ALTER TABLE application_settings ADD COLUMN scheduledReportTimes TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE application_settings ADD COLUMN scheduledReportChannels TEXT NOT NULL DEFAULT '[]'",
  `ALTER TABLE notification_outbox ADD COLUMN deliveryPurpose TEXT CHECK (
    deliveryPurpose IS NULL
    OR deliveryPurpose IN (
      'scheduled_report',
      'quality_alert',
      'test',
      'self_test'
    )
  )`
];

function isIgnorableAlterError(output) {
  const text = String(output || "").toLowerCase();
  return text.includes("duplicate column")
    || text.includes("already exists");
}

/**
 * @param {{
 *   d1Name: string,
 *   configPath?: string,
 *   remote?: boolean,
 *   cwd: string
 * }} opts
 */
export function applySchemaAlters({ d1Name, configPath = "wrangler.worker.toml", remote = false, cwd }) {
  for (const command of ALTERS) {
    const args = [
      "--no",
      "wrangler",
      "d1",
      "execute",
      d1Name,
      "--config",
      configPath,
      remote ? "--remote" : "--local",
      "--command",
      command
    ];
    const result = spawnSync("npx", args, {
      cwd,
      encoding: "utf8",
      shell: false
    });
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (result.status === 0) {
      console.log(`Applied schema alter: ${command}`);
      continue;
    }
    if (isIgnorableAlterError(combined)) {
      console.log(`Schema alter already present: ${command}`);
      continue;
    }
    console.error(combined);
    throw new Error(`Failed to apply schema alter: ${command}`);
  }
}
