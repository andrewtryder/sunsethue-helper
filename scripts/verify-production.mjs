#!/usr/bin/env node
/**
 * Post-deployment verification.
 *
 * Every check here is unauthenticated or read-only metadata. CI never holds a human
 * Access cookie or a real Access JWT, so authenticated browser verification stays a
 * documented manual step.
 */
import {
  PROJECT,
  appendJobSummary,
  getWorkerSchedules,
  getWorkerSettings,
  getWorkerSubdomain,
  listPagesDeployments,
  looksLikeSecret,
  summarizePagesDeployment,
  verifyToken
} from "./lib/cloudflare.mjs";

const PRODUCTION_URL = `https://${PROJECT.productionHostname}/`;
const APP_HTML_MARKERS = [/app-container/i, /Sunsethue Helper<\/title>/i, /id="location-list"/i];

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchSafely(url, init) {
  try {
    const response = await fetch(url, { redirect: "manual", ...init });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkAnonymousAccessGate() {
  const { response, body, error } = await fetchSafely(PRODUCTION_URL);
  if (error) {
    record("Anonymous production request completes", false, error);
    return;
  }

  const location = response.headers.get("location") ?? "";
  const servedAppHtml = APP_HTML_MARKERS.some((marker) => marker.test(body));
  record(
    "Production does not serve application HTML to an anonymous request",
    !servedAppHtml,
    `status ${response.status}`
  );

  const redirectedToAccess = /cloudflareaccess\.com/i.test(location) || /cloudflareaccess\.com/i.test(body);
  const denied = [401, 403].includes(response.status);
  record(
    "Anonymous request is redirected to Cloudflare Access or denied",
    redirectedToAccess || denied,
    redirectedToAccess ? "Access redirect present" : `status ${response.status}`
  );

  record("Anonymous response body discloses no credential-shaped value", !looksLikeSecret(body));
}

async function checkWorkersDevBypass(subdomain) {
  record(
    "workers.dev route is disabled on the Worker",
    subdomain?.enabled === false,
    `enabled=${subdomain?.enabled}`
  );
  record(
    "Worker preview URLs are disabled",
    subdomain?.previews_enabled === false,
    `previews_enabled=${subdomain?.previews_enabled}`
  );

  const host = process.env.WORKERS_DEV_HOST;
  if (!host) {
    record("Direct workers.dev API origin probe", true, "no workers.dev host configured to probe");
    return;
  }

  const { response, body, error } = await fetchSafely(`https://${host}/api/locations`);
  if (error) {
    record("Direct workers.dev API origin is unreachable", true, "request failed as expected");
    return;
  }
  record(
    "Direct workers.dev API origin does not return data",
    response.status !== 200,
    `status ${response.status}`
  );
  record("workers.dev response body discloses no credential-shaped value", !looksLikeSecret(body));
}

async function checkPagesDeployment(expectedCommit) {
  const deployments = await listPagesDeployments({ perPage: 5 });
  const latest = summarizePagesDeployment(deployments[0]);

  record("A production Pages deployment exists", Boolean(latest), latest?.shortId ?? "none");
  if (!latest) return;

  record(
    "Latest Pages deployment is in the production environment",
    latest.environment === "production",
    `environment=${latest.environment}`
  );
  record(
    "Latest Pages deployment was built from the production branch",
    latest.branch === PROJECT.productionBranch,
    `branch=${latest.branch}`
  );
  record(
    "Latest Pages deployment succeeded",
    latest.status === "success",
    `status=${latest.status}`
  );

  if (expectedCommit) {
    record(
      "Production Pages deployment points at the expected commit",
      latest.commit === expectedCommit,
      `deployed=${(latest.commit ?? "unknown").slice(0, 12)} expected=${expectedCommit.slice(0, 12)}`
    );
  }

  const previewPromoted = deployments
    .filter((deployment) => deployment.environment !== "production")
    .map((deployment) => deployment.id);
  record(
    "No preview deployment appears in the production deployment list",
    previewPromoted.length === 0,
    `${previewPromoted.length} non-production entries`
  );
}

async function checkWorkerConfiguration() {
  const [settings, schedules] = await Promise.all([getWorkerSettings(), getWorkerSchedules()]);
  const bindings = (settings?.bindings ?? []).map((binding) => binding.name);

  record(
    `Worker exposes the ${PROJECT.d1Binding} D1 binding`,
    (settings?.bindings ?? []).some((binding) => binding.name === PROJECT.d1Binding && binding.type === "d1")
  );

  const missing = PROJECT.requiredSecretNames.filter((name) => !bindings.includes(name));
  record(
    "Worker has every required configuration binding",
    missing.length === 0,
    missing.length === 0 ? "all present (names only)" : `missing ${missing.join(", ")}`
  );

  const crons = (schedules?.schedules ?? []).map((schedule) => schedule.cron);
  record("Worker cron trigger remains configured", crons.length > 0, crons.join(", ") || "none");
}

async function main() {
  const expectedCommit = process.env.EXPECTED_COMMIT_SHA || process.env.GITHUB_SHA || "";

  await verifyToken();
  const subdomain = await getWorkerSubdomain();

  await checkAnonymousAccessGate();
  await checkWorkersDevBypass(subdomain);
  await checkPagesDeployment(expectedCommit);
  await checkWorkerConfiguration();

  const failures = checks.filter((check) => !check.ok);

  await appendJobSummary(
    [
      "## Post-deployment verification",
      "",
      "| Check | Result | Detail |",
      "| --- | --- | --- |",
      ...checks.map(
        (check) => `| ${check.name} | ${check.ok ? "pass" : "**fail**"} | ${check.detail ?? ""} |`
      ),
      "",
      `Expected commit: \`${expectedCommit.slice(0, 12) || "unknown"}\``,
      "",
      failures.length === 0
        ? "All automated checks passed. Authenticated browser verification remains a manual step."
        : `**${failures.length} check(s) failed.** See docs/rollback.md before retrying.`
    ].join("\n")
  );

  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
