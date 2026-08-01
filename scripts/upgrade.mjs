#!/usr/bin/env node
/**
 * Apply pending reviewed db:upgrade:rN scripts, redeploy Workers/Pages, verify.
 * Never runs ad-hoc ALTER statements.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT,
  getLatestWorkerVersion,
  listPagesDeployments,
  shortId,
  verifyD1TablesSync
} from "./lib/cloudflare.mjs";
import { REQUIRED_D1_TABLES, SCHEMA_UPGRADE_SCRIPTS } from "../shared/schema-manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  if (DRY) return { status: 0 };
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
  return result;
}

function pendingUpgrades(missingTables) {
  const missing = new Set(missingTables);
  return SCHEMA_UPGRADE_SCRIPTS.filter((entry) =>
    entry.requiredTables.some((table) => missing.has(table))
  );
}

async function main() {
  run("npm", ["run", "config:generate:strict"]);

  const beforeWorker = await getLatestWorkerVersion().catch(() => null);
  const beforePages = await listPagesDeployments().catch(() => []);
  console.log("Rollback identifiers (before):");
  console.log(`  Worker version: ${shortId(beforeWorker?.id) || "unknown"}`);
  console.log(`  Pages deployment: ${shortId(beforePages?.[0]?.id) || "unknown"}`);

  const d1 = verifyD1TablesSync({ required: REQUIRED_D1_TABLES });
  if (d1.skipped) {
    throw new Error(d1.reason || "D1 table check skipped");
  }

  const pending = pendingUpgrades(d1.missing);
  if (pending.length === 0 && d1.missing.length === 0) {
    console.log("No pending schema upgrades.");
  } else if (d1.missing.length && pending.length === 0) {
    throw new Error(`Missing tables with no reviewed upgrade script: ${d1.missing.join(", ")}`);
  } else {
    console.log(`Pending upgrades: ${pending.map((p) => p.id).join(", ")}`);
    console.log("Create a D1 Time Travel bookmark before applying remote upgrades.");
    for (const entry of pending) {
      run("npm", ["run", entry.script, "--", "--remote"]);
    }
  }

  run("npx", ["--no", "wrangler", "deploy", "--config", "wrangler.credential-admin.toml"]);
  run("npx", ["--no", "wrangler", "deploy", "--config", "wrangler.worker.toml"]);
  run("npx", ["--no", "wrangler", "pages", "deploy", "public", "--project-name", PROJECT.pagesProject]);
  run("npm", ["run", "verify:production"]);

  const afterWorker = await getLatestWorkerVersion().catch(() => null);
  const afterPages = await listPagesDeployments().catch(() => []);
  console.log("Rollback identifiers (after):");
  console.log(`  Worker version: ${shortId(afterWorker?.id) || "unknown"}`);
  console.log(`  Pages deployment: ${shortId(afterPages?.[0]?.id) || "unknown"}`);
  console.log("Upgrade complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
