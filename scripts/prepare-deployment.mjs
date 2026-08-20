#!/usr/bin/env node
/**
 * Production deployment preflight.
 *
 * Refuses to proceed from an unexpected repository or branch, records the current
 * Worker version and Pages production deployment so rollback has an exact target,
 * confirms the expected Cloudflare resources exist, and asserts that every required
 * binding and secret is present by name only.
 */
import {
  PROJECT,
  appendJobSummary,
  getLatestWorkerVersion,
  getPagesProject,
  getWorkerSchedules,
  getWorkerSettings,
  listPagesDeployments,
  setOutputs,
  shortId,
  summarizePagesDeployment,
  verifyD1ColumnsSync,
  verifyD1TablesSync,
  verifyToken
} from "./lib/cloudflare.mjs";
import { summarizeD1Checks } from "./lib/deployment-preflight.mjs";

function assertContext() {
  const repository = process.env.GITHUB_REPOSITORY;
  const refName = process.env.GITHUB_REF_NAME;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const problems = [];

  if (process.env.GITHUB_ACTIONS === "true" && !PROJECT.repository) {
    problems.push("DEPLOY_REPOSITORY is required in GitHub Actions");
  } else if (repository && PROJECT.repository && repository !== PROJECT.repository) {
    problems.push(`refusing to deploy from repository "${repository}"`);
  }
  if (refName && refName !== PROJECT.productionBranch) {
    problems.push(`refusing to deploy from branch "${refName}"; production branch is "${PROJECT.productionBranch}"`);
  }
  if (eventName && !["push", "workflow_dispatch"].includes(eventName)) {
    problems.push(`refusing to deploy from event "${eventName}"`);
  }

  return problems;
}

function bindingNames(settings) {
  return (settings?.bindings ?? []).map((binding) => ({ name: binding.name, type: binding.type }));
}

async function main() {
  const commitSha = process.env.GITHUB_SHA || "unknown";
  const problems = assertContext();

  await verifyToken();

  const [settings, schedules, project, deployments, workerVersion] = await Promise.all([
    getWorkerSettings(),
    getWorkerSchedules(),
    getPagesProject(),
    listPagesDeployments({ perPage: 1 }),
    getLatestWorkerVersion()
  ]);

  const bindings = bindingNames(settings);
  const bindingNamesOnly = bindings.map((binding) => binding.name);

  if (!bindings.some((binding) => binding.name === PROJECT.d1Binding && binding.type === "d1")) {
    problems.push(`Worker is missing the ${PROJECT.d1Binding} D1 binding`);
  }
  for (const secretName of PROJECT.requiredSecretNames) {
    if (!bindingNamesOnly.includes(secretName)) {
      problems.push(`Worker is missing required configuration binding ${secretName}`);
    }
  }

  const cronExpressions = (schedules?.schedules ?? []).map((schedule) => schedule.cron);
  if (cronExpressions.length === 0) {
    problems.push("Worker has no cron trigger configured");
  }

  if (project?.name !== PROJECT.pagesProject) {
    problems.push(`expected Pages project ${PROJECT.pagesProject}, found ${project?.name}`);
  }
  if (project?.production_branch !== PROJECT.productionBranch) {
    problems.push(
      `Pages production branch is "${project?.production_branch}", expected "${PROJECT.productionBranch}"`
    );
  }

  // D1 schema preflight is informational here. The dedicated `schema` job
  // (after prepare) applies additive schema via `npm run db:schema:remote`
  // and fail-closes on `npm run db:schema:verify`. If prepare rejected missing
  // schema, a release that intentionally adds a required column/table could
  // never reach the apply step. `doctor` and `db:schema:verify` stay strict.
  const d1Check = verifyD1TablesSync();
  const d1ColumnCheck = verifyD1ColumnsSync();
  const d1Summary = summarizeD1Checks(d1Check, d1ColumnCheck);

  const previousPages = summarizePagesDeployment(deployments[0]);

  const rows = [
    `| Commit | \`${commitSha.slice(0, 12)}\` |`,
    `| Worker version before deploy | \`${shortId(workerVersion?.id) ?? "unknown"}\` |`,
    `| Pages deployment before deploy | \`${previousPages?.shortId ?? "none"}\` |`,
    `| Pages deployment commit | \`${(previousPages?.commit ?? "unknown").slice(0, 12)}\` |`,
    `| Cron triggers | \`${cronExpressions.join(", ") || "none"}\` |`,
    `| Worker bindings | ${bindingNamesOnly.length} present (names only) |`,
    `| D1 schema preflight | ${d1Summary} |`
  ];

  await appendJobSummary(
    [
      "## Deployment preflight",
      "",
      "| Item | Value |",
      "| --- | --- |",
      ...rows,
      "",
      problems.length === 0
        ? "Preflight passed. No credential or secret values are recorded in this summary."
        : `### Blocking problems\n\n${problems.map((problem) => `- ${problem}`).join("\n")}`
    ].join("\n")
  );

  await setOutputs({
    commit_sha: commitSha,
    worker_version_before: workerVersion?.id ?? "",
    pages_deployment_before: previousPages?.id ?? "",
    pages_commit_before: previousPages?.commit ?? "",
    cron_configured: cronExpressions.length > 0 ? "true" : "false"
  });

  console.log(
    JSON.stringify(
      {
        ok: problems.length === 0,
        commit: commitSha.slice(0, 12),
        workerVersionBefore: shortId(workerVersion?.id),
        pagesDeploymentBefore: previousPages?.shortId ?? null,
        cronExpressions,
        bindingCount: bindingNamesOnly.length,
        problems
      },
      null,
      2
    )
  );

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
