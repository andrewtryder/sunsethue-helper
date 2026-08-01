#!/usr/bin/env node
/**
 * Operator-run R3 D1 upgrade: health_check_runs + admin_audit_events.
 *
 * Usage:
 *   node scripts/db-upgrade-r3.mjs --dry-run
 *   node scripts/db-upgrade-r3.mjs --local
 *   node scripts/db-upgrade-r3.mjs --remote
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
CREATE TABLE IF NOT EXISTS health_check_runs (
  id TEXT PRIMARY KEY,
  checkType TEXT NOT NULL
    CHECK (checkType IN ('weekly_passive', 'weekly_active', 'manual')),
  provider TEXT,
  status TEXT NOT NULL,
  code TEXT,
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  durationMs INTEGER,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_check_runs_started
  ON health_check_runs (startedAt DESC);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  eventType TEXT NOT NULL,
  categories TEXT,
  counts TEXT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_events (createdAt DESC);
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  generateWranglerConfig({ strict: false });
  const project = resolveProject({ strict: false });

  if (args.mode === "remote" && !args.dryRun) {
    console.log("  Before applying: create a D1 Time Travel bookmark and record the bookmark id.");
  }

  const result = runSql(project, args.mode, buildUpgradeSql(), args.dryRun);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  if (!args.dryRun) {
    console.log("Post-check:");
    runSql(
      project,
      args.mode,
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('health_check_runs','admin_audit_events');`,
      false
    );
    console.log("R3 upgrade complete. Rollback: restore D1 from the Time Travel bookmark taken before this run.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
