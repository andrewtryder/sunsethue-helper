#!/usr/bin/env node
/**
 * Manual production rollback.
 *
 * Never guesses a target: the caller supplies an exact Worker version id and/or
 * Pages deployment id, and both are validated against this application before
 * anything changes. Database migrations are deliberately out of scope; see
 * docs/rollback.md for the D1 procedure.
 */
import { spawnSync } from "node:child_process";
import {
  PROJECT,
  accountPath,
  appendJobSummary,
  cfRequest,
  shortId,
  summarizePagesDeployment,
  verifyToken
} from "./lib/cloudflare.mjs";

const VALID_TARGETS = new Set(["worker", "pages", "both"]);

function readInputs() {
  const target = (process.env.ROLLBACK_TARGET || "").trim();
  const workerVersionId = (process.env.WORKER_VERSION_ID || "").trim();
  const pagesDeploymentId = (process.env.PAGES_DEPLOYMENT_ID || "").trim();
  const reason = (process.env.ROLLBACK_REASON || "manual rollback").trim();

  if (!VALID_TARGETS.has(target)) {
    throw new Error(`ROLLBACK_TARGET must be one of: ${[...VALID_TARGETS].join(", ")}`);
  }
  if (target !== "pages" && !workerVersionId) {
    throw new Error("WORKER_VERSION_ID is required when rolling back the Worker");
  }
  if (target !== "worker" && !pagesDeploymentId) {
    throw new Error("PAGES_DEPLOYMENT_ID is required when rolling back Pages");
  }

  return { target, workerVersionId, pagesDeploymentId, reason };
}

async function validateWorkerVersion(versionId) {
  const response = await cfRequest(
    "GET",
    accountPath(`/workers/scripts/${PROJECT.workerName}/versions/${encodeURIComponent(versionId)}`)
  );
  if (!response.ok) {
    throw new Error(
      `Worker version ${shortId(versionId)} does not belong to ${PROJECT.workerName} (HTTP ${response.status})`
    );
  }
  return { id: response.result?.id, number: response.result?.number ?? null };
}

async function validatePagesDeployment(deploymentId) {
  const response = await cfRequest(
    "GET",
    accountPath(`/pages/projects/${PROJECT.pagesProject}/deployments/${encodeURIComponent(deploymentId)}`)
  );
  if (!response.ok) {
    throw new Error(
      `Pages deployment ${shortId(deploymentId)} does not belong to ${PROJECT.pagesProject} (HTTP ${response.status})`
    );
  }

  const deployment = summarizePagesDeployment(response.result);
  if (deployment.environment !== "production") {
    throw new Error(
      `Pages deployment ${deployment.shortId} is a ${deployment.environment} deployment and cannot be promoted to production`
    );
  }
  return deployment;
}

function rollbackWorker(versionId, reason) {
  const args = [
    "--no",
    "--",
    "wrangler",
    "rollback",
    versionId,
    "--config",
    "wrangler.worker.toml",
    "--message",
    reason,
    "--yes"
  ];
  const result = spawnSync("npx", args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`wrangler rollback exited with status ${result.status}`);
  }
}

async function rollbackPages(deploymentId) {
  const response = await cfRequest(
    "POST",
    accountPath(
      `/pages/projects/${PROJECT.pagesProject}/deployments/${encodeURIComponent(deploymentId)}/rollback`
    )
  );
  if (!response.ok) {
    throw new Error(`Pages rollback failed (HTTP ${response.status}): ${JSON.stringify(response.errors)}`);
  }
  return summarizePagesDeployment(response.result);
}

async function main() {
  const inputs = readInputs();
  await verifyToken();

  const actions = [];

  // Validate every identifier before mutating anything.
  const workerVersion =
    inputs.target === "pages" ? null : await validateWorkerVersion(inputs.workerVersionId);
  const pagesDeployment =
    inputs.target === "worker" ? null : await validatePagesDeployment(inputs.pagesDeploymentId);

  // Worker first: the Pages Function calls it through the service binding, so the
  // API must be able to serve the frontend that is about to be restored.
  if (workerVersion) {
    rollbackWorker(inputs.workerVersionId, inputs.reason);
    actions.push(`Worker rolled back to version \`${shortId(workerVersion.id)}\``);
  }

  if (pagesDeployment) {
    const restored = await rollbackPages(inputs.pagesDeploymentId);
    actions.push(
      `Pages rolled back to deployment \`${restored.shortId}\` (commit \`${(restored.commit ?? "unknown").slice(0, 12)}\`)`
    );
  }

  await appendJobSummary(
    [
      "## Production rollback",
      "",
      `Target: **${inputs.target}**`,
      `Reason: ${inputs.reason}`,
      "",
      ...actions.map((action) => `- ${action}`),
      "",
      "D1 schema was not modified. A migration is only reversed with a reviewed down-migration; see docs/rollback.md."
    ].join("\n")
  );

  console.log(JSON.stringify({ ok: true, target: inputs.target, actions }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
