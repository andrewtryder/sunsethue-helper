#!/usr/bin/env node
/**
 * Security policy checks for the GitHub Actions workflows in this repository.
 *
 * This is deliberately stricter than actionlint: it enforces the supply-chain and
 * least-privilege rules the project relies on, so a future edit cannot quietly
 * reintroduce a write-enabled pull request workflow or an unpinned action.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const WORKFLOW_DIR = new URL("../.github/workflows/", import.meta.url);

const SHA_PIN = /^[^@\s]+@[0-9a-f]{40}$/;
const DOCKER_PIN = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/;
const LOCAL_WORKFLOW = /^\.\//;
const WRITE_SCOPE = /^(write|write-all)$/;
const VERSION_COMMENT = /#\s*v?\d/;

/** Expressions that must be passed through `env:` instead of interpolated into a shell. */
const UNTRUSTED_IN_RUN = /\$\{\{\s*(github\.event|github\.head_ref|github\.ref_name|github\.actor|inputs|needs|steps|secrets)/;

function triggerNames(doc) {
  const on = doc?.on ?? doc?.true ?? {};
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on;
  return Object.keys(on);
}

function jobEntries(doc) {
  return Object.entries(doc?.jobs ?? {});
}

function stepEntries(job) {
  return Array.isArray(job?.steps) ? job.steps : [];
}

function permissionEntries(permissions) {
  if (!permissions) return [];
  if (typeof permissions === "string") return [["*", permissions]];
  return Object.entries(permissions);
}

function hasWriteScope(permissions) {
  return permissionEntries(permissions).some(([, scope]) => WRITE_SCOPE.test(String(scope)));
}

function collectFinding(findings, workflow, rule, message, location) {
  findings.push({ workflow, rule, message, location });
}

function auditStructure(add, doc, jobs, triggers) {
  if (triggers.length === 0) {
    add("invalid-workflow", "workflow declares no triggers");
  }
  if (jobs.length === 0) {
    add("invalid-workflow", "workflow declares no jobs");
  }

  const jobNames = new Set(jobs.map(([jobName]) => jobName));

  for (const [jobName, job] of jobs) {
    const location = `jobs.${jobName}`;

    if (!job?.uses) {
      if (!job?.["runs-on"]) {
        add("invalid-workflow", "job must declare runs-on or uses", location);
      }
      if (!Array.isArray(job?.steps) || job.steps.length === 0) {
        add("invalid-workflow", "job must declare at least one step", location);
      }
    }

    for (const dependency of [].concat(job?.needs ?? [])) {
      if (!jobNames.has(dependency)) {
        add("invalid-workflow", `needs references unknown job "${dependency}"`, location);
      }
    }

    for (const [index, step] of stepEntries(job).entries()) {
      const declared = [step?.uses, step?.run].filter((value) => typeof value === "string").length;
      if (declared !== 1) {
        add("invalid-workflow", "step must declare exactly one of uses or run", `${location}.steps[${index}]`);
      }
    }
  }
}

function auditExpressions(add, text) {
  const opens = (text.match(/\$\{\{/g) ?? []).length;
  const closes = (text.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    add("invalid-workflow", `unbalanced GitHub expressions: ${opens} "\${{" vs ${closes} "}}"`);
  }
}

export function auditWorkflow({ name, doc, text }) {
  const findings = [];
  const add = (rule, message, location) => collectFinding(findings, name, rule, message, location);
  const triggers = triggerNames(doc);
  const jobs = jobEntries(doc);
  const isPullRequestWorkflow = triggers.includes("pull_request");
  const isDeploymentWorkflow = jobs.some(([, job]) => job?.environment);

  auditStructure(add, doc, jobs, triggers);
  auditExpressions(add, text);

  if (triggers.includes("pull_request_target")) {
    add(
      "pull-request-target",
      "pull_request_target runs with repository write scope against untrusted code and is not allowed"
    );
  }

  if (!doc?.permissions && jobs.some(([, job]) => !job?.permissions && !job?.uses)) {
    add("missing-permissions", "declare permissions at the workflow or job level");
  }

  if (typeof doc?.permissions === "string" && doc.permissions !== "read-all") {
    add("excessive-permissions", `top-level permissions "${doc.permissions}" is too broad`);
  }

  if (isDeploymentWorkflow && !doc?.concurrency) {
    add(
      "missing-concurrency",
      "workflows that deploy to an environment must declare a concurrency group so runs cannot overlap"
    );
  }

  for (const [jobName, job] of jobs) {
    const location = `jobs.${jobName}`;

    if (isPullRequestWorkflow && hasWriteScope(doc?.permissions)) {
      add(
        "write-enabled-pr-workflow",
        "pull request workflows must not grant any write permission",
        "permissions"
      );
    }

    if (isPullRequestWorkflow && hasWriteScope(job?.permissions)) {
      add(
        "write-enabled-pr-workflow",
        "pull request workflows must not grant any write permission",
        `${location}.permissions`
      );
    }

    if (isPullRequestWorkflow && job?.environment) {
      add(
        "pr-environment-access",
        "pull request jobs must not reference a deployment environment",
        location
      );
    }

    if (!job?.uses && job?.["timeout-minutes"] === undefined) {
      add("missing-timeout", "set timeout-minutes so a hung job cannot run to the platform maximum", location);
    }

    for (const [index, step] of stepEntries(job).entries()) {
      const stepLocation = `${location}.steps[${index}]`;
      const uses = typeof step?.uses === "string" ? step.uses.trim() : null;

      if (uses && !LOCAL_WORKFLOW.test(uses) && !SHA_PIN.test(uses) && !DOCKER_PIN.test(uses)) {
        add(
          "unpinned-action",
          `"${uses}" must be pinned to a full 40-character commit SHA or an image digest`,
          stepLocation
        );
      }

      if (uses?.startsWith("actions/checkout@") && step?.with?.["persist-credentials"] !== false) {
        add(
          "persisted-credentials",
          "checkout must set persist-credentials: false unless the job needs to push",
          stepLocation
        );
      }

      if (typeof step?.run === "string" && UNTRUSTED_IN_RUN.test(step.run)) {
        add(
          "untrusted-interpolation",
          "pass GitHub expressions into shell steps through env: instead of interpolating them into the script",
          stepLocation
        );
      }
    }
  }

  if (isPullRequestWorkflow) {
    const secretRefs = [...text.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    const allowedSecrets = new Set(["GITHUB_TOKEN"]);
    for (const secret of new Set(secretRefs)) {
      if (!allowedSecrets.has(secret)) {
        add(
          "secret-in-pr-workflow",
          `pull request workflows must not read secrets.${secret}`,
          "secrets"
        );
      }
    }
  }

  for (const line of text.split("\n")) {
    const match = line.match(/^[ \t-]*uses:[ \t]*(\S+)/);
    if (!match) continue;
    const uses = match[1];
    if (LOCAL_WORKFLOW.test(uses)) continue;
    if (!VERSION_COMMENT.test(line)) {
      add(
        "missing-version-comment",
        `"${uses}" should keep a trailing "# vX.Y.Z" comment so the pinned SHA stays reviewable`
      );
    }
  }

  return findings;
}

export async function auditWorkflows(dir = WORKFLOW_DIR) {
  const entries = (await readdir(dir)).filter((entry) => /\.ya?ml$/.test(entry)).sort();
  const findings = [];
  const workflows = [];

  for (const entry of entries) {
    const text = await readFile(fileURLToPath(new URL(entry, dir)), "utf8");
    const doc = parse(text);
    workflows.push({ name: entry, doc, text });
    findings.push(...auditWorkflow({ name: entry, doc, text }));
  }

  return { findings, workflows };
}

async function main() {
  const { findings, workflows } = await auditWorkflows();
  console.log(`Audited ${workflows.length} workflow file(s): ${workflows.map((w) => w.name).join(", ")}`);

  if (findings.length === 0) {
    console.log("No workflow security findings.");
    return;
  }

  for (const finding of findings) {
    const where = finding.location ? ` (${finding.location})` : "";
    console.error(`${finding.workflow}${where}: [${finding.rule}] ${finding.message}`);
  }
  console.error(`\n${findings.length} workflow security finding(s).`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
