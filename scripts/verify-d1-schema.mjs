#!/usr/bin/env node
/**
 * Fail-closed check that production (or local) D1 has every required table and
 * additive column. Used after db:schema:remote in deploy-worker so a failed
 * alter still blocks Worker deploy in the same workflow run.
 */
import { verifyD1ColumnsSync, verifyD1TablesSync } from "./lib/cloudflare.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const environment = process.argv.includes("--local") ? "local" : "remote";

const tables = verifyD1TablesSync({ environment });
if (tables.skipped) {
  fail(`D1 table verification skipped: ${tables.reason || "unknown reason"}`);
}
if (tables.missing.length > 0) {
  fail(`D1 is missing required table(s): ${tables.missing.join(", ")}`);
}

const columns = verifyD1ColumnsSync({ environment });
if (columns.skipped) {
  fail(`D1 column verification skipped: ${columns.reason || "unknown reason"}`);
}
if (columns.missing.length > 0) {
  fail(`D1 is missing required column(s): ${columns.missing.join(", ")}`);
}

console.log("D1 schema verification passed: required tables and columns present.");
