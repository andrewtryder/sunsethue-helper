/**
 * Minimal Cloudflare API client and GitHub Actions plumbing shared by the
 * deployment, verification, and rollback scripts.
 *
 * Nothing here ever prints a token, an Access JWT, a cookie, a secret value, or a
 * raw private API payload. Identifiers are truncated before they reach a log.
 */
import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolveProject } from "./project-config.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";

const resolved = resolveProject({ strict: false });

export const PROJECT = {
  workerName: resolved.workerName,
  credentialAdminWorkerName: resolved.credentialAdminWorkerName,
  pagesProject: resolved.pagesProject,
  productionHostname: resolved.productionHostname,
  productionBranch: resolved.productionBranch,
  repository: resolved.deployRepository,
  d1Binding: resolved.d1Binding,
  d1Name: resolved.d1Name,
  requiredSecretNames: [
    "AUTHORIZED_EMAIL",
    "TEAM_DOMAIN",
    "POLICY_AUD",
    "SUNSETHUE_API_KEY",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "EMAIL_TO",
    "CONTACT_EMAIL"
  ],
  requiredAdminSecretNames: ["CLOUDFLARE_API_TOKEN"],
  requiredD1Tables: [
    "locations",
    "runs",
    "notification_settings",
    "notification_outbox",
    "notification_test_limiter",
    "report_execution_lock",
    "provider_credential_status",
    "provider_credential_limiter"
  ]
};

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Shorten an identifier so logs stay useful without publishing full internal ids. */
export function shortId(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export async function cfRequest(method, path, body) {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    ok: response.ok && payload?.success !== false,
    status: response.status,
    result: payload?.result,
    errors: (payload?.errors ?? []).map((error) => ({ code: error.code, message: error.message }))
  };
}

async function cfExpect(method, path, description) {
  const response = await cfRequest(method, path);
  if (!response.ok) {
    throw new Error(`${description} failed (HTTP ${response.status}): ${JSON.stringify(response.errors)}`);
  }
  return response.result;
}

export function accountPath(suffix) {
  return `/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}${suffix}`;
}

export async function verifyToken() {
  const result = await cfExpect("GET", "/user/tokens/verify", "Cloudflare API token verification");
  if (result?.status !== "active") {
    throw new Error(`Cloudflare API token is not active (status=${result?.status})`);
  }
  return { active: true };
}

export async function getWorkerSettings() {
  return cfExpect(
    "GET",
    accountPath(`/workers/scripts/${PROJECT.workerName}/settings`),
    "Read Worker settings"
  );
}

export async function getWorkerSchedules() {
  return cfExpect(
    "GET",
    accountPath(`/workers/scripts/${PROJECT.workerName}/schedules`),
    "Read Worker cron schedules"
  );
}

export async function getWorkerSubdomain() {
  return cfExpect(
    "GET",
    accountPath(`/workers/scripts/${PROJECT.workerName}/subdomain`),
    "Read Worker subdomain state"
  );
}

export async function getLatestWorkerVersion() {
  const result = await cfExpect(
    "GET",
    accountPath(`/workers/scripts/${PROJECT.workerName}/versions?per_page=1`),
    "List Worker versions"
  );
  const items = result?.items ?? result ?? [];
  const latest = Array.isArray(items) ? items[0] : null;
  return latest ? { id: latest.id, number: latest.number ?? null, createdOn: latest.metadata?.created_on ?? null } : null;
}

export async function getPagesProject() {
  return cfExpect(
    "GET",
    accountPath(`/pages/projects/${PROJECT.pagesProject}`),
    "Read Pages project"
  );
}

export async function listPagesDeployments({ env = "production", perPage = 5 } = {}) {
  const result = await cfExpect(
    "GET",
    accountPath(`/pages/projects/${PROJECT.pagesProject}/deployments?env=${env}&per_page=${perPage}`),
    "List Pages deployments"
  );
  return Array.isArray(result) ? result : [];
}

export function summarizePagesDeployment(deployment) {
  if (!deployment) return null;
  return {
    id: deployment.id,
    shortId: shortId(deployment.id),
    environment: deployment.environment,
    url: deployment.url,
    branch: deployment.deployment_trigger?.metadata?.branch ?? null,
    commit: deployment.deployment_trigger?.metadata?.commit_hash ?? null,
    status: deployment.latest_stage?.status ?? null,
    createdOn: deployment.created_on ?? null
  };
}

export async function appendJobSummary(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) {
    console.log(markdown);
    return;
  }
  await appendFile(target, `${markdown}\n`, "utf8");
}

export async function setOutputs(outputs) {
  const target = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("\n");
  if (!target) {
    console.log(`outputs:\n${lines}`);
    return;
  }
  await appendFile(target, `${lines}\n`, "utf8");
}

/**
 * Read-only check that every table required by the Worker exists in production
 * D1. Uses `wrangler d1 execute --remote` because the D1 HTTP query API is not
 * exposed by `cfRequest` here without a database UUID lookup, and this helper
 * runs from GitHub Actions where wrangler is already available.
 *
 * Never mutates D1 (SELECTs only). Returns the list of missing table names.
 * Never prints the wrangler token or the raw response body — only names.
 *
 * @returns {{ missing: string[], skipped: boolean, reason?: string }}
 */
export function verifyD1TablesSync({
  configPath = "wrangler.worker.toml",
  cwd = process.cwd(),
  required = PROJECT.requiredD1Tables,
  spawn = spawnSync
} = {}) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    return { missing: [], skipped: true, reason: "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set" };
  }

  const result = spawn(
    "npx",
    [
      "--no",
      "wrangler",
      "d1",
      "execute",
      PROJECT.d1Name,
      "--config",
      configPath,
      "--remote",
      "--json",
      "--command",
      "SELECT name FROM sqlite_master WHERE type='table'"
    ],
    { cwd, encoding: "utf8", shell: false }
  );

  if (result.status !== 0) {
    return {
      missing: [...required],
      skipped: false,
      reason: `wrangler d1 execute exited with status ${result.status ?? "unknown"}`
    };
  }

  const names = extractTableNames(result.stdout);
  const missing = required.filter((table) => !names.has(table));
  return { missing, skipped: false };
}

function extractTableNames(stdout) {
  const found = new Set();
  if (!stdout) return found;
  try {
    const parsed = JSON.parse(stdout);
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== "object") return;
      if (typeof node.name === "string") {
        found.add(node.name);
      }
      for (const value of Object.values(node)) {
        walk(value);
      }
    };
    walk(parsed);
  } catch {
    // Fall back to matching bare table-name lines wrangler prints in text mode.
    for (const line of stdout.split(/\r?\n/)) {
      const match = /"name"\s*:\s*"([^"]+)"/.exec(line);
      if (match) found.add(match[1]);
    }
  }
  return found;
}

/**
 * Detects credential-shaped strings so verification can assert that no response
 * body discloses one. Deliberately does not print the match.
 */
export function looksLikeSecret(text) {
  if (typeof text !== "string") return false;
  const patterns = [
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
    /\bBearer\s+[A-Za-z0-9._-]{20,}/i,
    /\bCF_Authorization=/i,
    /\b[A-Za-z0-9_-]{40,}\b/
  ];
  return patterns.some((pattern) => pattern.test(text));
}
