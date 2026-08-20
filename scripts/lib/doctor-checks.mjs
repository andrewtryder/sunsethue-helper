/**
 * Pure doctor checks for unit testing with injected deps.
 */

export function checkEnvPresent(env, names) {
  const missing = names.filter((name) => !env[name] || String(env[name]).trim() === "");
  return {
    name: "Required environment variables",
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "present"
  };
}

export function checkTokenActive(verifyResult) {
  return {
    name: "Cloudflare API token",
    ok: Boolean(verifyResult?.active),
    detail: verifyResult?.active ? "active" : "inactive or unverified"
  };
}

export function checkD1Tables(result, required) {
  if (result?.skipped) {
    return { name: "D1 required tables", ok: false, detail: result.reason || "skipped", skipped: true };
  }
  const missing = result?.missing || [...required];
  return {
    name: "D1 required tables",
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "all present"
  };
}

export function checkD1Columns(result, required) {
  if (result?.skipped) {
    return { name: "D1 required columns", ok: false, detail: result.reason || "skipped", skipped: true };
  }
  const expected = Object.entries(required || {}).flatMap(([table, columns]) =>
    columns.map((column) => `${table}.${column}`)
  );
  const missing = result?.missing || expected;
  return {
    name: "D1 required columns",
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "all present"
  };
}

export function checkSecretsStore(preflight) {
  return {
    name: "Secrets Store provider documents",
    ok: Boolean(preflight?.ok),
    detail: preflight?.detail || (preflight?.ok ? "ready" : "not ready")
  };
}

export function checkPrivateWorker(subdomain, label) {
  return {
    name: `${label} workers.dev disabled`,
    ok: subdomain?.enabled === false,
    detail: `enabled=${subdomain?.enabled}`
  };
}

export function checkPagesBinding(pagesProject, workerName) {
  const services = pagesProject?.deployment_configs?.production?.services
    || pagesProject?.deployment_configs?.production?.service_bindings
    || {};
  const hasBinding = Boolean(services.API_SERVICE)
    || Object.values(services).some((s) => s?.service === workerName || s?.name === workerName);
  return {
    name: "Pages API_SERVICE binding",
    ok: hasBinding,
    detail: hasBinding ? "present" : "missing"
  };
}

export function checkCron(schedules) {
  const list = Array.isArray(schedules) ? schedules : schedules?.schedules || [];
  return {
    name: "Worker cron triggers",
    ok: list.length > 0,
    detail: list.length ? `${list.length} schedule(s)` : "none"
  };
}

export function checkAccessRedirect({ servedAppHtml, redirectedOrDenied }) {
  return {
    name: "Production Access redirect",
    ok: !servedAppHtml && redirectedOrDenied,
    detail: servedAppHtml ? "app HTML leaked to anonymous" : (redirectedOrDenied ? "gated" : "not gated")
  };
}
