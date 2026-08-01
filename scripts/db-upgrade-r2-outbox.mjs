#!/usr/bin/env node
/**
 * Operator-run R2 D1 upgrade: rebuild notification_outbox without channel CHECK,
 * add deliveryTargetId, create web_push_subscriptions, expand provider_credential_status,
 * add webhook columns on notification_settings.
 *
 * Usage:
 *   node scripts/db-upgrade-r2-outbox.mjs --dry-run
 *   node scripts/db-upgrade-r2-outbox.mjs --local
 *   node scripts/db-upgrade-r2-outbox.mjs --remote
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWranglerConfig } from "./generate-wrangler-config.mjs";
import { resolveProject } from "./lib/project-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const remote = argv.includes("--remote");
  return { dryRun, mode: remote ? "remote" : "local" };
}

function runSql(project, mode, sql, dryRun) {
  if (dryRun) {
    console.log("--- SQL ---");
    console.log(sql);
    return { status: 0 };
  }
  return spawnSync(
    "npx",
    [
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
    ],
    { cwd: ROOT, stdio: "inherit", shell: false }
  );
}

function buildUpgradeSql() {
  return `
-- Outbox rebuild: drop fixed channel enumeration; add deliveryTargetId.
CREATE TABLE IF NOT EXISTS notification_outbox_new (
  id TEXT PRIMARY KEY,
  runId TEXT NOT NULL,
  channel TEXT NOT NULL,
  deliveryTargetId TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL,
  lockedUntil INTEGER,
  leaseToken TEXT,
  providerMessageId TEXT,
  lastErrorCode TEXT,
  createdAt INTEGER NOT NULL,
  sentAt INTEGER,
  deliveryEmailTo TEXT,
  deliveryPushoverDevice TEXT,
  deliveryPushoverPriority INTEGER,
  deliveryPushoverSound TEXT,
  manualAttempts INTEGER NOT NULL DEFAULT 0,
  lastManualRetryAt INTEGER,
  FOREIGN KEY (runId) REFERENCES runs(id)
);

INSERT INTO notification_outbox_new (
  id, runId, channel, deliveryTargetId, status, payload, attempts, nextAttemptAt,
  lockedUntil, leaseToken, providerMessageId, lastErrorCode, createdAt, sentAt,
  deliveryEmailTo, deliveryPushoverDevice, deliveryPushoverPriority, deliveryPushoverSound,
  manualAttempts, lastManualRetryAt
)
SELECT
  id, runId, channel, NULL, status, payload, attempts, nextAttemptAt,
  lockedUntil, leaseToken, providerMessageId, lastErrorCode, createdAt, sentAt,
  deliveryEmailTo, deliveryPushoverDevice, deliveryPushoverPriority, deliveryPushoverSound,
  manualAttempts, lastManualRetryAt
FROM notification_outbox;

DROP TABLE notification_outbox;
ALTER TABLE notification_outbox_new RENAME TO notification_outbox;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_run_channel_target
  ON notification_outbox (runId, channel, ifnull(deliveryTargetId, ''));
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON notification_outbox (status, nextAttemptAt);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  deviceName TEXT NOT NULL,
  userAgentSummary TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  createdAt INTEGER NOT NULL,
  lastSeenAt INTEGER,
  lastSuccessAt INTEGER,
  lastFailureCode TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_push_enabled ON web_push_subscriptions (enabled);

-- Expand provider_credential_status CHECK via rebuild.
CREATE TABLE IF NOT EXISTS provider_credential_status_new (
  provider TEXT PRIMARY KEY
    CHECK (provider IN ('email', 'pushover', 'webhook', 'webpush')),
  configured INTEGER NOT NULL DEFAULT 0
    CHECK (configured IN (0, 1)),
  maskedIdentifier TEXT,
  updatedAt INTEGER,
  lastValidatedAt INTEGER,
  lastValidationCode TEXT,
  lastUpdatedBy TEXT
);

INSERT INTO provider_credential_status_new (
  provider, configured, maskedIdentifier, updatedAt, lastValidatedAt, lastValidationCode, lastUpdatedBy
)
SELECT provider, configured, maskedIdentifier, updatedAt, lastValidatedAt, lastValidationCode, lastUpdatedBy
FROM provider_credential_status;

DROP TABLE provider_credential_status;
ALTER TABLE provider_credential_status_new RENAME TO provider_credential_status;

-- Webhook non-secret columns on notification_settings (ignore if already present).
-- SQLite ADD COLUMN cannot be guarded with IF NOT EXISTS on all versions; operators
-- should run once. Duplicate-column errors are safe to ignore after first apply.
`.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await generateWranglerConfig({ strict: args.mode === "remote", root: ROOT });
  const project = resolveProject({ strict: args.mode === "remote" });

  console.log("R2 outbox / webpush D1 upgrade");
  console.log(`  target: ${args.mode} D1=${project.d1Name}`);
  if (args.mode === "remote") {
    console.log("  Before applying: create a D1 Time Travel bookmark and record the bookmark id.");
  }

  console.log("Pre-check outbox counts by channel/status:");
  runSql(
    project,
    args.mode,
    "SELECT channel, status, COUNT(*) AS n FROM notification_outbox GROUP BY channel, status;",
    false
  );

  const result = runSql(project, args.mode, buildUpgradeSql(), args.dryRun);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  // Separate ADD COLUMN statements so a partial apply can continue.
  for (const col of [
    "ALTER TABLE notification_settings ADD COLUMN webhookEnabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE notification_settings ADD COLUMN webhookMaskedHostname TEXT",
    "ALTER TABLE notification_settings ADD COLUMN webhookLastSuccessAt INTEGER",
    "ALTER TABLE notification_settings ADD COLUMN webhookLastFailureCode TEXT"
  ]) {
    const addResult = runSql(project, args.mode, col, args.dryRun);
    if (addResult.status !== 0 && !args.dryRun) {
      console.log(`  (column may already exist) ${col}`);
    }
  }

  if (!args.dryRun) {
    console.log("Post-check:");
    runSql(
      project,
      args.mode,
      `SELECT COUNT(*) AS outbox FROM notification_outbox;
       SELECT COUNT(*) AS web_push FROM web_push_subscriptions;
       SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_outbox%';`,
      false
    );
    console.log("R2 upgrade complete. Rollback: restore D1 from the Time Travel bookmark taken before this run.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
