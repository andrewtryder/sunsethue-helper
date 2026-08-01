#!/usr/bin/env node
/**
 * Read-only operator health checklist. Exit non-zero when any check fails.
 */
import {
  PROJECT,
  getPagesProject,
  getWorkerSchedules,
  getWorkerSubdomain,
  verifyD1TablesSync,
  verifyToken,
  looksLikeSecret
} from "./lib/cloudflare.mjs";
import { preflightSecretsStore } from "./lib/secrets-store.mjs";
import { REQUIRED_D1_TABLES } from "../shared/schema-manifest.js";
import {
  checkAccessRedirect,
  checkCron,
  checkD1Tables,
  checkEnvPresent,
  checkPagesBinding,
  checkPrivateWorker,
  checkSecretsStore,
  checkTokenActive
} from "./lib/doctor-checks.mjs";

const STRICT_ENV = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "PAGES_PROJECT_NAME",
  "WORKER_NAME",
  "D1_DATABASE_NAME",
  "PRODUCTION_HOSTNAME",
  "SECRETS_STORE_ID",
  "CREDENTIAL_ADMIN_WORKER_NAME"
];

async function checkProductionGate() {
  const url = `https://${PROJECT.productionHostname}/`;
  try {
    const response = await fetch(url, { redirect: "manual" });
    const body = await response.text();
    const servedAppHtml = /app-container/i.test(body) && /Sunsethue Helper<\/title>/i.test(body);
    const location = response.headers.get("location") ?? "";
    const redirectedOrDenied = /cloudflareaccess\.com/i.test(location)
      || /cloudflareaccess\.com/i.test(body)
      || [401, 403].includes(response.status);
    const secretLeak = looksLikeSecret(body);
    return [
      checkAccessRedirect({ servedAppHtml, redirectedOrDenied }),
      {
        name: "Anonymous response has no credential-shaped values",
        ok: !secretLeak,
        detail: secretLeak ? "possible secret-shaped content" : "clean"
      }
    ];
  } catch (error) {
    return [{
      name: "Production Access redirect",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    }];
  }
}

async function main() {
  const results = [];
  results.push(checkEnvPresent(process.env, STRICT_ENV));

  try {
    const token = await verifyToken();
    results.push(checkTokenActive(token));
  } catch (error) {
    results.push({
      name: "Cloudflare API token",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  results.push(checkD1Tables(verifyD1TablesSync({ required: REQUIRED_D1_TABLES }), REQUIRED_D1_TABLES));

  try {
    await preflightSecretsStore(process.env.SECRETS_STORE_ID);
    results.push(checkSecretsStore({ ok: true, detail: "preflight passed" }));
  } catch (error) {
    results.push(checkSecretsStore({
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    }));
  }

  try {
    const mainSub = await getWorkerSubdomain();
    results.push(checkPrivateWorker(mainSub, "API Worker"));
  } catch (error) {
    results.push({
      name: "API Worker workers.dev disabled",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const pages = await getPagesProject();
    results.push(checkPagesBinding(pages, PROJECT.workerName));
  } catch (error) {
    results.push({
      name: "Pages API_SERVICE binding",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const schedules = await getWorkerSchedules();
    results.push(checkCron(schedules));
  } catch (error) {
    results.push({
      name: "Worker cron triggers",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  results.push(...await checkProductionGate());

  let failed = 0;
  for (const check of results) {
    const mark = check.ok ? "PASS" : (check.skipped ? "SKIP" : "FAIL");
    if (!check.ok && !check.skipped) failed += 1;
    console.log(`${mark}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
