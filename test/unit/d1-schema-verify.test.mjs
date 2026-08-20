import test from "node:test";
import assert from "node:assert/strict";
import { verifyD1ColumnsSync, verifyD1TablesSync } from "../../scripts/lib/cloudflare.mjs";
import { checkD1Columns } from "../../scripts/lib/doctor-checks.mjs";
import { summarizeD1Checks } from "../../scripts/prepare-deployment.mjs";
import { REQUIRED_D1_COLUMNS } from "../../shared/schema-manifest.js";

test("verifyD1TablesSync skips when remote credentials are missing", () => {
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    const result = verifyD1TablesSync({ spawn: () => assert.fail("spawn should not run") });
    assert.equal(result.skipped, true);
    assert.match(result.reason, /CLOUDFLARE_/);
  } finally {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
  }
});

test("verifyD1ColumnsSync reports missing columns from PRAGMA JSON", () => {
  process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "test-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "test-account";

  const responses = {
    locations: JSON.stringify([{ results: [{ results: [{ name: "id" }, { name: "scheduleTimes" }] }] }]),
    application_settings: JSON.stringify([
      {
        results: [
          {
            results: [
              { name: "id" },
              { name: "scheduledReportsEnabled" },
              { name: "scheduledReportTimes" }
              // scheduledReportChannels intentionally missing
            ]
          }
        ]
      }
    ]),
    notification_outbox: JSON.stringify([{ results: [{ results: [{ name: "id" }] }] }])
  };

  const result = verifyD1ColumnsSync({
    required: REQUIRED_D1_COLUMNS,
    spawn: (_cmd, args) => {
      const command = args[args.indexOf("--command") + 1];
      const table = /PRAGMA table_info\(([^)]+)\)/.exec(command)?.[1];
      return { status: 0, stdout: responses[table] || "[]", stderr: "" };
    }
  });

  assert.equal(result.skipped, false);
  assert.deepEqual(result.missing, [
    "application_settings.scheduledReportChannels",
    "notification_outbox.deliveryPurpose"
  ]);
});

test("verifyD1ColumnsSync treats wrangler failure as all columns missing for that table", () => {
  process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "test-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "test-account";

  const result = verifyD1ColumnsSync({
    required: { notification_outbox: ["deliveryPurpose"] },
    spawn: () => ({ status: 1, stdout: "", stderr: "boom" })
  });

  assert.deepEqual(result.missing, ["notification_outbox.deliveryPurpose"]);
});

test("checkD1Columns formats doctor output", () => {
  assert.deepEqual(
    checkD1Columns({ missing: ["notification_outbox.deliveryPurpose"], skipped: false }, REQUIRED_D1_COLUMNS),
    {
      name: "D1 required columns",
      ok: false,
      detail: "missing notification_outbox.deliveryPurpose"
    }
  );
  assert.equal(
    checkD1Columns({ missing: [], skipped: false }, REQUIRED_D1_COLUMNS).ok,
    true
  );
});

test("summarizeD1Checks reports all-present when nothing is missing", () => {
  assert.equal(
    summarizeD1Checks({ missing: [], skipped: false }, { missing: [], skipped: false }),
    "all required tables and columns present"
  );
});

test("summarizeD1Checks is informational — never blocking — when a required column is missing", () => {
  // Simulates the next release that intentionally declares a new required
  // column the pre-deploy database does not yet have. Prepare must not block;
  // the downstream schema job applies the column and db:schema:verify gates.
  const summary = summarizeD1Checks(
    { missing: [], skipped: false },
    { missing: ["notification_outbox.deliveryPurpose"], skipped: false }
  );
  assert.match(summary, /^informational — /);
  assert.match(summary, /columns missing: notification_outbox\.deliveryPurpose/);
  assert.match(summary, /schema job will apply/);
});

test("summarizeD1Checks reports missing tables informationally", () => {
  const summary = summarizeD1Checks(
    { missing: ["notification_outbox"], skipped: false },
    { missing: [], skipped: false }
  );
  assert.match(summary, /tables missing: notification_outbox/);
  assert.doesNotMatch(summary, /schema job will apply/);
});

test("summarizeD1Checks skips when Cloudflare credentials are absent", () => {
  assert.equal(
    summarizeD1Checks({ missing: [], skipped: true, reason: "no token" }, { missing: [], skipped: false }),
    "skipped (no Cloudflare credentials)"
  );
  assert.equal(
    summarizeD1Checks({ missing: [], skipped: false }, { missing: [], skipped: true, reason: "no token" }),
    "skipped (no Cloudflare credentials)"
  );
});
