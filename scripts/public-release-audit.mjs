#!/usr/bin/env node
/**
 * Public-release audit: working tree, full git history (branches + tags),
 * high-entropy credentials, and private identifiers from local ignored config.
 *
 * Findings never include raw secret values — only redacted fingerprints,
 * rule ids, refs, paths, and line numbers. Exit code 1 blocks publication.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCANNERS } from "./lib/scanner-versions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = resolve(ROOT, ".tmp/public-release-audit.json");

const PLACEHOLDER_VALUES = new Set([
  "owner@example.com",
  "user@example.com",
  "00000000-0000-0000-0000-000000000000",
  "https://app.example.com",
  "app.example.com",
  "worker.example.workers.dev",
  "http://127.0.0.1:5010",
  "sunsethue-helper",
  "sunsethue-helper-worker",
  "sunsethue-db",
  "main",
  "Sunsethue Helper",
  "API_SERVICE",
  "DB",
  "nodejs_compat",
  "./public",
  "worker/index.js",
  "public/"
]);

/** Env keys that may contain private instance identifiers or secrets. */
const NEEDLE_ENV_KEYS = new Set([
  "AUTHORIZED_EMAIL",
  "CONTACT_EMAIL",
  "EMAIL_TO",
  "GMAIL_USER",
  "D1_DATABASE_ID",
  "TEAM_DOMAIN",
  "POLICY_AUD",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "SUNSETHUE_API_KEY",
  "GMAIL_APP_PASSWORD"
]);

/**
 * Hostnames are inventory, not credentials. Tracked-source guards already keep
 * them out of main; add them to `.release-audit.local.json` when auditing tags
 * or stale branches before a public release.
 */

const MIN_NEEDLE_LENGTH = 8;

/** Paths that must never block publication (local-only or third-party). */
const IGNORED_FINDING_PATH = /(^|\/)(\.env|\.dev\.vars|node_modules|\.git|\.tmp|coverage|package-lock\.json)(\/|$)/i;

/**
 * Redact a secret for safe console/JSON output.
 * @param {string} value
 * @returns {string}
 */
export function redact(value) {
  const text = String(value ?? "");
  const len = text.length;
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 6);
  if (len <= 4) {
    return `**** (len ${len}, sha256:${hash})`;
  }
  if (len <= 8) {
    return `${text.slice(0, 1)}…${text.slice(-1)} (len ${len}, sha256:${hash})`;
  }
  return `${text.slice(0, 4)}…${text.slice(-2)} (len ${len}, sha256:${hash})`;
}

/**
 * Drop findings that come from local-only or third-party paths.
 * @param {{ path?: string }} finding
 */
export function isPublicationFinding(finding) {
  const path = String(finding?.path || "");
  if (!path || path === "(unknown)" || path === "(git-grep)") return true;
  if (IGNORED_FINDING_PATH.test(path)) return false;
  // Action commit SHAs pinned in workflows are not Cloudflare API tokens.
  if (/\.github\/workflows\//.test(path) && /cloudflareapitoken/i.test(String(finding?.rule || ""))) {
    return false;
  }
  return true;
}

function run(command, args, { cwd = ROOT, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) {
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`
    );
  }
  return result;
}

function parseEnvEntries(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) entries.push({ key, value });
  }
  return entries;
}

function parseTomlDatabaseIds(text) {
  const values = [];
  for (const match of text.matchAll(/^\s*database_id\s*=\s*"([^"]+)"/gim)) {
    values.push(match[1]);
  }
  return values;
}

function isUsefulNeedle(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < MIN_NEEDLE_LENGTH) return false;
  if (PLACEHOLDER_VALUES.has(trimmed)) return false;
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return false;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(trimmed)) return false;
  if (/^\{\{[A-Z0-9_]+\}\}$/.test(trimmed)) return false;
  if (/^\$\{\{/.test(trimmed)) return false;
  // Compatibility dates and relative paths are not private identifiers.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  if (/^\.?\.?\/[A-Za-z0-9._/-]+$/.test(trimmed)) return false;
  // Public GitHub repository identity is intentional in package metadata.
  if (/^andrewtryder\/sunsethue-helper$/i.test(trimmed)) return false;
  return true;
}

/**
 * Collect private-identifier needles from local ignored config.
 * Never returns placeholder example values.
 * @param {{ root?: string, ci?: boolean }} [options]
 * @returns {{ label: string, value: string }[]}
 */
export function collectNeedles({ root = ROOT, ci = false } = {}) {
  const byValue = new Map();

  function add(label, value) {
    if (!isUsefulNeedle(value)) return;
    const key = value.trim();
    if (!byValue.has(key)) {
      byValue.set(key, { label, value: key });
    }
  }

  const localPath = resolve(root, ".release-audit.local.json");
  if (existsSync(localPath)) {
    try {
      const parsed = JSON.parse(readFileSync(localPath, "utf8"));
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.needles)
          ? parsed.needles
          : [];
      for (const entry of list) {
        if (typeof entry === "string") {
          add("release-audit.local", entry);
        } else if (entry && typeof entry.value === "string") {
          add(entry.label || "release-audit.local", entry.value);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to parse .release-audit.local.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else if (!ci) {
    // Optional locally; CI intentionally has no production secrets mounted.
  }

  for (const relative of [".env", ".dev.vars"]) {
    const path = resolve(root, relative);
    if (!existsSync(path)) continue;
    for (const { key, value } of parseEnvEntries(readFileSync(path, "utf8"))) {
      if (!NEEDLE_ENV_KEYS.has(key)) continue;
      add(relative, value);
      // Also search bare emails embedded in From headers.
      for (const email of value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
        add(relative, email);
      }
    }
  }

  for (const relative of ["wrangler.toml", "wrangler.worker.toml"]) {
    const path = resolve(root, relative);
    if (!existsSync(path)) continue;
    for (const value of parseTomlDatabaseIds(readFileSync(path, "utf8"))) {
      add(relative, value);
    }
  }

  return [...byValue.values()];
}

/**
 * @param {{ root?: string, allRefs?: boolean }} [options]
 * @returns {string[]}
 */
export function listRefs({ root = ROOT, allRefs = false } = {}) {
  if (allRefs) {
    const result = run(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags"],
      { cwd: root }
    );
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  // Default publication surface: default branch + every tag.
  const refs = new Set();
  const head = run("git", ["symbolic-ref", "--quiet", "HEAD"], {
    cwd: root,
    allowFailure: true
  });
  if (head.status === 0 && head.stdout.trim()) {
    refs.add(head.stdout.trim());
  } else {
    refs.add("refs/heads/main");
  }

  const tags = run("git", ["for-each-ref", "--format=%(refname)", "refs/tags"], {
    cwd: root,
    allowFailure: true
  });
  for (const line of (tags.stdout || "").split("\n")) {
    const ref = line.trim();
    if (ref) refs.add(ref);
  }

  return [...refs];
}

/**
 * Search publication refs and the working tree for literal needles.
 * @param {{ label: string, value: string }[]} needles
 * @param {{ root?: string, allRefs?: boolean }} [options]
 */
export function scanRefs(needles, { root = ROOT, allRefs = false } = {}) {
  const findings = [];
  if (needles.length === 0) return findings;

  const refs = listRefs({ root, allRefs });

  for (const needle of needles) {
    for (const ref of refs) {
      const result = run(
        "git",
        ["grep", "-I", "-n", "-F", "-e", needle.value, ref, "--", "."],
        { cwd: root, allowFailure: true }
      );
      if (result.status === 0) {
        for (const line of result.stdout.split("\n").filter(Boolean)) {
          // git grep <ref>: ref:path:lineno:content
          const prefix = `${ref}:`;
          if (!line.startsWith(prefix)) continue;
          const rest = line.slice(prefix.length);
          const match = rest.match(/^([^:]+):(\d+):/);
          if (!match) continue;
          findings.push({
            rule: "private-identifier",
            label: needle.label,
            redacted: redact(needle.value),
            ref,
            path: match[1],
            line: Number(match[2])
          });
        }
      } else if (result.status !== 1) {
        const detail = (result.stderr || "").trim();
        if (!/does not have any commits|is a directory|binary/.test(detail)) {
          findings.push({
            rule: "private-identifier-error",
            label: needle.label,
            redacted: redact(needle.value),
            ref,
            path: "(git-grep)",
            line: 0,
            detail: detail.slice(0, 200) || `git grep exited ${result.status}`
          });
        }
      }
    }

    const worktree = run("git", ["grep", "-I", "-n", "-F", "-e", needle.value, "--", "."], {
      cwd: root,
      allowFailure: true
    });
    if (worktree.status === 0) {
      for (const line of worktree.stdout.split("\n").filter(Boolean)) {
        const match = line.match(/^([^:]+):(\d+):/);
        if (!match) continue;
        findings.push({
          rule: "private-identifier",
          label: needle.label,
          redacted: redact(needle.value),
          ref: "WORKTREE",
          path: match[1],
          line: Number(match[2])
        });
      }
    }
  }

  return findings;
}

function scannersAvailable() {
  const gitleaks = run("gitleaks", ["version"], { allowFailure: true });
  const trufflehog = run("trufflehog", ["--version"], { allowFailure: true });
  return {
    gitleaks: gitleaks.status === 0 ? (gitleaks.stdout || gitleaks.stderr || "").trim() : null,
    trufflehog: trufflehog.status === 0 ? (trufflehog.stdout || trufflehog.stderr || "").trim() : null
  };
}

function requireScannerVersions({ optional = false } = {}) {
  const available = scannersAvailable();
  if (!available.gitleaks || !available.trufflehog) {
    if (optional) return false;
    throw new Error(
      `gitleaks ${SCANNERS.gitleaks.version} and trufflehog ${SCANNERS.trufflehog.version} are required. Install both (e.g. brew install gitleaks trufflehog) and retry.`
    );
  }
  if (!available.gitleaks.includes(SCANNERS.gitleaks.version)) {
    throw new Error(
      `gitleaks version mismatch: expected ${SCANNERS.gitleaks.version}, got ${available.gitleaks}`
    );
  }
  if (!available.trufflehog.includes(SCANNERS.trufflehog.version)) {
    throw new Error(
      `trufflehog version mismatch: expected ${SCANNERS.trufflehog.version}, got ${available.trufflehog}`
    );
  }
  return true;
}

function parseGitleaksReport(reportPath) {
  if (!existsSync(reportPath)) return [];
  const text = readFileSync(reportPath, "utf8").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((finding) => ({
    rule: finding.RuleID || finding.Description || "gitleaks",
    ref: finding.Commit || "WORKTREE",
    path: finding.File || finding.Path || "(unknown)",
    line: finding.StartLine || finding.Line || 0,
    redacted: finding.Fingerprint
      ? `fingerprint:${String(finding.Fingerprint).slice(0, 12)}`
      : redact(finding.Secret || finding.Match || "secret")
  }));
}

function parseTrufflehogJson(stdout) {
  const findings = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const finding = JSON.parse(trimmed);
      const detector = finding.DetectorName || finding.DetectorDescription || "trufflehog";
      const meta = finding.SourceMetadata?.Data?.Git || finding.SourceMetadata?.Data?.Filesystem || {};
      findings.push({
        rule: detector,
        ref: meta.commit || meta.Commit || "WORKTREE",
        path: meta.file || meta.File || "(unknown)",
        line: meta.line || meta.Line || 0,
        redacted: redact(
          finding.Raw || finding.RawV2 || finding.Redacted || detector
        )
      });
    } catch {
      // skip non-JSON noise
    }
  }
  return findings;
}

function runGitleaks(args, reportName) {
  const reportPath = resolve(ROOT, ".tmp", reportName);
  const configPath = resolve(ROOT, ".gitleaks.toml");
  mkdirSync(resolve(ROOT, ".tmp"), { recursive: true });
  const result = run(
    "gitleaks",
    [
      "detect",
      "--no-banner",
      "--redact",
      "--config",
      configPath,
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      ...args
    ],
    { allowFailure: true }
  );
  const findings = parseGitleaksReport(reportPath);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`gitleaks failed with exit ${result.status}`);
  }
  return findings;
}

function runTrufflehog(args) {
  const excludePath = resolve(ROOT, "scripts/trufflehog-exclude.txt");
  const result = run(
    "trufflehog",
    [...args, "--json", "--no-verification", "--exclude-paths", excludePath],
    { allowFailure: true }
  );
  if (result.status !== 0 && result.status !== 1 && result.status !== 183) {
    const err = (result.stderr || "").trim();
    if (err && !result.stdout.includes("{")) {
      throw new Error(`trufflehog failed with exit ${result.status}: ${err.slice(0, 300)}`);
    }
  }
  return parseTrufflehogJson(result.stdout || "");
}

/**
 * @param {{ root?: string, ci?: boolean, skipScanners?: boolean, allRefs?: boolean }} [options]
 */
export async function runAudit({
  root = ROOT,
  ci = false,
  skipScanners = false,
  allRefs = false
} = {}) {
  const findings = [];
  const passes = [];

  const shouldRunScanners =
    !skipScanners && requireScannerVersions({ optional: ci });

  if (shouldRunScanners) {
    passes.push("working-tree-gitleaks");
    findings.push(
      ...runGitleaks(["--no-git", "--source", root], "gitleaks-tree.json").map((f) => ({
        ...f,
        pass: "working-tree"
      }))
    );

    passes.push("history-gitleaks");
    findings.push(
      ...runGitleaks(["--source", root, "--log-opts", "--all"], "gitleaks-history.json").map(
        (f) => ({ ...f, pass: "history" })
      )
    );

    passes.push("working-tree-trufflehog");
    findings.push(
      ...runTrufflehog(["filesystem", root]).map((f) => ({
        ...f,
        pass: "working-tree-entropy"
      }))
    );

    passes.push("history-trufflehog");
    findings.push(
      ...runTrufflehog(["git", `file://${root}`]).map((f) => ({
        ...f,
        pass: "history-entropy"
      }))
    );
  } else {
    passes.push(ci ? "scanners-deferred-to-workflow" : "scanners-skipped");
  }

  passes.push(allRefs ? "private-identifiers-all-refs" : "private-identifiers");
  const needles = collectNeedles({ root, ci });
  findings.push(
    ...scanRefs(needles, { root, allRefs }).map((f) => ({
      ...f,
      pass: "private-identifiers"
    }))
  );

  // Deduplicate by rule+ref+path+line+redacted and drop local-only noise.
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    if (!isPublicationFinding(finding)) continue;
    const key = [
      finding.pass,
      finding.rule,
      finding.ref,
      finding.path,
      finding.line,
      finding.redacted
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }

  const report = {
    ok: unique.length === 0,
    generatedAt: new Date().toISOString(),
    scanners: SCANNERS,
    passes,
    needleCount: needles.length,
    findingCount: unique.length,
    findings: unique.map((f) => ({
      pass: f.pass,
      rule: f.rule,
      ref: f.ref,
      path: f.path,
      line: f.line,
      redacted: f.redacted,
      label: f.label
    }))
  };

  mkdirSync(resolve(root, ".tmp"), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return report;
}

function printReport(report) {
  console.log(`Public-release audit: ${report.findingCount} finding(s), ${report.needleCount} needle(s)`);
  console.log(`Passes: ${report.passes.join(", ")}`);
  console.log(`Report: ${REPORT_PATH}`);

  if (report.ok) {
    console.log("PASS: no credentials or private identifiers detected.");
    return;
  }

  console.error("\n========== PUBLICATION BLOCKED ==========");
  for (const finding of report.findings) {
    console.error(
      `- [${finding.pass}] ${finding.rule} @ ${finding.ref} ${finding.path}:${finding.line} ${finding.redacted}${
        finding.label ? ` (from ${finding.label})` : ""
      }`
    );
  }
  console.error("=========================================\n");
  console.error("Do not publish until every finding is cleared or rotated. See SECURITY.md and CONTRIBUTING.md.");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ci = args.has("--ci");
  const allRefs = args.has("--all-refs");
  // Workflow docker steps already ran digest-pinned scanners; skip local CLIs in CI.
  const skipScanners = ci;

  const report = await runAudit({ ci, skipScanners, allRefs });
  printReport(report);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
