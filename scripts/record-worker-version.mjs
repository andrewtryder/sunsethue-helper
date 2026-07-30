#!/usr/bin/env node
/**
 * Record the current Worker version id after a successful deploy.
 * Intentionally smaller than prepare-deployment.mjs: no binding checks, no
 * refusal logic — just the identifier the next job and any rollback need.
 */
import {
  appendJobSummary,
  getLatestWorkerVersion,
  setOutputs,
  shortId,
  verifyToken
} from "./lib/cloudflare.mjs";

async function main() {
  await verifyToken();
  const version = await getLatestWorkerVersion();
  if (!version?.id) {
    throw new Error("Could not determine the deployed Worker version");
  }

  await setOutputs({
    worker_version: version.id
  });

  await appendJobSummary(
    [
      "## Worker deployment",
      "",
      `| Deployed Worker version | \`${shortId(version.id)}\` |`,
      `| Created | ${version.createdOn ?? "unknown"} |`
    ].join("\n")
  );

  console.log(
    JSON.stringify(
      { ok: true, workerVersion: shortId(version.id), createdOn: version.createdOn },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
