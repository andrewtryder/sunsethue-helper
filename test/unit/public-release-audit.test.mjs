import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  redact,
  collectNeedles
} from "../../scripts/public-release-audit.mjs";
import { SCANNERS } from "../../scripts/lib/scanner-versions.mjs";

test("redact never echoes the full secret", () => {
  const secret = "super-secret-token-value-12345";
  const out = redact(secret);
  assert.equal(out.includes(secret), false);
  assert.match(out, /^supe…45 \(len \d+, sha256:[0-9a-f]{6}\)$/);
  const expectedHash = createHash("sha256").update(secret).digest("hex").slice(0, 6);
  assert.ok(out.includes(expectedHash));
  assert.ok(out.includes(`len ${secret.length}`));
});

test("scanner versions are pinned with digests", () => {
  assert.equal(SCANNERS.gitleaks.version, "8.30.1");
  assert.equal(SCANNERS.trufflehog.version, "3.96.0");
  assert.match(SCANNERS.gitleaks.image, /@sha256:[0-9a-f]{64}$/);
  assert.match(SCANNERS.trufflehog.image, /@sha256:[0-9a-f]{64}$/);
});

test("collectNeedles skips placeholders and reads local ignored config", async () => {
  const temp = await mkdtemp(join(tmpdir(), "release-audit-"));
  try {
    await writeFile(
      join(temp, ".env"),
      [
        "AUTHORIZED_EMAIL=owner@example.com",
        "D1_DATABASE_ID=00000000-0000-0000-0000-000000000000",
        "POLICY_AUD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "PRODUCTION_HOSTNAME=my-app.pages.dev",
        "DEPLOY_REPOSITORY=andrewtryder/sunsethue-helper",
        "PAGES_PROJECT_NAME=should-not-be-a-needle",
        "SHORT=ab",
        ""
      ].join("\n")
    );
    await writeFile(
      join(temp, ".release-audit.local.json"),
      JSON.stringify({
        needles: [
          { label: "personal-email", value: "person@example.org" },
          "duplicate-host.pages.dev"
        ]
      })
    );
    await writeFile(
      join(temp, "wrangler.worker.toml"),
      [
        'name = "sunsethue-helper-worker"',
        'main = "worker/index.js"',
        'compatibility_date = "2026-05-01"',
        'database_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"',
        ""
      ].join("\n")
    );

    const needles = collectNeedles({ root: temp, ci: false });
    const values = needles.map((n) => n.value).sort();

    assert.ok(values.includes("person@example.org"));
    assert.ok(values.includes("duplicate-host.pages.dev"));
    assert.ok(values.includes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
    assert.ok(
      values.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    );
    assert.equal(values.includes("my-app.pages.dev"), false, "hostnames are opt-in via local needles");
    assert.equal(values.includes("owner@example.com"), false);
    assert.equal(values.includes("00000000-0000-0000-0000-000000000000"), false);
    assert.equal(values.includes("sunsethue-helper-worker"), false);
    assert.equal(values.includes("worker/index.js"), false);
    assert.equal(values.includes("2026-05-01"), false);
    assert.equal(values.includes("andrewtryder/sunsethue-helper"), false);
    assert.equal(values.includes("should-not-be-a-needle"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("isPublicationFinding ignores local secrets and dependency paths", async () => {
  const { isPublicationFinding } = await import("../../scripts/public-release-audit.mjs");
  assert.equal(isPublicationFinding({ path: ".env", rule: "generic-api-key" }), false);
  assert.equal(isPublicationFinding({ path: "node_modules/foo/bar.js", rule: "URI" }), false);
  assert.equal(
    isPublicationFinding({
      path: ".github/workflows/production.yml",
      rule: "CloudflareApiToken"
    }),
    false
  );
  assert.equal(isPublicationFinding({ path: "worker/auth.js", rule: "generic-api-key" }), true);
});

test("collectNeedles in CI mode tolerates a missing local needles file", async () => {
  const temp = await mkdtemp(join(tmpdir(), "release-audit-ci-"));
  try {
    await mkdir(temp, { recursive: true });
    const needles = collectNeedles({ root: temp, ci: true });
    assert.deepEqual(needles, []);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
