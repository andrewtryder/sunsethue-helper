/**
 * Narrow Cloudflare Secrets Store API helpers.
 *
 * Only talks to /accounts/{accountId}/secrets_store/... .
 * Never logs secret values or raw Cloudflare response bodies.
 */
import { accountPath, cfRequest, requireEnv, shortId, verifyToken } from "./cloudflare.mjs";

export const EMAIL_SECRET_NAME = "SUNSETHUE_EMAIL_TRANSPORT";
export const PUSHOVER_SECRET_NAME = "SUNSETHUE_PUSHOVER_TRANSPORT";
export const WEBHOOK_SECRET_NAME = "SUNSETHUE_WEBHOOK_TRANSPORT";
export const WEB_PUSH_VAPID_SECRET_NAME = "SUNSETHUE_WEB_PUSH_VAPID";
export const PROVIDER_SECRET_NAMES = [
  EMAIL_SECRET_NAME,
  PUSHOVER_SECRET_NAME,
  WEBHOOK_SECRET_NAME,
  WEB_PUSH_VAPID_SECRET_NAME
];

export const SENTINEL_VALUE = JSON.stringify({ version: 1, configured: false });

const STORE_NAME = "sunsethue-helper";

function assertAccountId(accountId) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/i.test(accountId.trim())) {
    throw new Error("Invalid CLOUDFLARE_ACCOUNT_ID");
  }
  return accountId.trim();
}

function assertStoreId(storeId) {
  if (typeof storeId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(storeId.trim())) {
    throw new Error("Invalid SECRETS_STORE_ID");
  }
  return storeId.trim();
}

/**
 * Reject Global API Key auth patterns. Secrets Store requires a scoped API token.
 */
export function assertScopedApiToken() {
  if (process.env.CLOUDFLARE_API_KEY || process.env.CF_API_KEY) {
    throw new Error("Global API Key authentication is not permitted; use a scoped CLOUDFLARE_API_TOKEN");
  }
  if (process.env.CLOUDFLARE_EMAIL && !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error("X-Auth-Email / Global API Key auth is not permitted");
  }
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  if (typeof token !== "string" || token.length < 20) {
    throw new Error("CLOUDFLARE_API_TOKEN is missing or malformed");
  }
  return token;
}

function secretsStorePath(suffix) {
  const accountId = assertAccountId(requireEnv("CLOUDFLARE_ACCOUNT_ID"));
  return `/accounts/${accountId}/secrets_store${suffix}`;
}

export async function listStores() {
  const response = await cfRequest("GET", secretsStorePath("/stores"));
  if (!response.ok) {
    throw new Error(`SECRETS_STORE_LIST_FAILED:${response.status}`);
  }
  return Array.isArray(response.result) ? response.result : response.result?.stores ?? [];
}

export async function createStore(name = STORE_NAME) {
  const response = await cfRequest("POST", secretsStorePath("/stores"), { name });
  if (!response.ok) {
    throw new Error(`SECRETS_STORE_CREATE_FAILED:${response.status}`);
  }
  return response.result;
}

export async function listSecrets(storeId) {
  const id = assertStoreId(storeId);
  const response = await cfRequest("GET", secretsStorePath(`/stores/${id}/secrets?per_page=100`));
  if (!response.ok) {
    throw new Error(`SECRETS_STORE_SECRET_LIST_FAILED:${response.status}`);
  }
  return Array.isArray(response.result) ? response.result : [];
}

export async function createSecret(storeId, { name, value, comment, scopes = ["workers"] }) {
  const id = assertStoreId(storeId);
  const response = await cfRequest("POST", secretsStorePath(`/stores/${id}/secrets`), [
    { name, value, comment, scopes }
  ]);
  if (!response.ok) {
    throw new Error(`SECRETS_STORE_SECRET_CREATE_FAILED:${response.status}`);
  }
  const result = response.result;
  return Array.isArray(result) ? result[0] : result;
}

export async function patchSecret(storeId, secretId, { value, comment, scopes = ["workers"] }) {
  const sid = assertStoreId(storeId);
  if (typeof secretId !== "string" || secretId.length < 8) {
    throw new Error("Invalid secret id");
  }
  const response = await cfRequest("PATCH", secretsStorePath(`/stores/${sid}/secrets/${secretId}`), {
    value,
    comment,
    scopes
  });
  if (!response.ok) {
    throw new Error(`SECRETS_STORE_UPDATE_FAILED:${response.status}`);
  }
  return response.result;
}

export async function findSecretByName(storeId, name) {
  const secrets = await listSecrets(storeId);
  return secrets.find((secret) => secret?.name === name) || null;
}

/**
 * Poll secret metadata until status is active or timeout.
 * Never returns or logs the secret value.
 */
export async function waitForSecretActive(storeId, secretId, { timeoutMs = 30_000, intervalMs = 1_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const sid = assertStoreId(storeId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await cfRequest("GET", secretsStorePath(`/stores/${sid}/secrets/${secretId}`));
    if (response.ok && response.result?.status === "active") {
      return { id: response.result.id, name: response.result.name, status: response.result.status, scopes: response.result.scopes };
    }
    if (response.ok && response.result?.status === "deleted") {
      throw new Error("SECRETS_STORE_SECRET_MISSING");
    }
    await sleep(intervalMs);
  }
  throw new Error("SECRETS_STORE_ACTIVATION_TIMEOUT");
}

/**
 * Non-mutating preflight: store exists, both provider secrets exist with workers scope.
 */
export async function preflightSecretsStore(storeId) {
  assertScopedApiToken();
  await verifyToken();
  const id = assertStoreId(storeId);
  const storeResponse = await cfRequest("GET", secretsStorePath(`/stores/${id}`));
  if (!storeResponse.ok) {
    throw new Error(`SECRETS_STORE_NOT_CONFIGURED:${storeResponse.status}`);
  }
  const secrets = await listSecrets(id);
  const report = [];
  for (const name of PROVIDER_SECRET_NAMES) {
    const secret = secrets.find((item) => item?.name === name);
    if (!secret) {
      throw new Error(`SECRETS_STORE_SECRET_MISSING:${name}`);
    }
    const scopes = Array.isArray(secret.scopes) ? secret.scopes : [];
    if (!scopes.includes("workers")) {
      throw new Error(`SECRETS_STORE_SCOPE_MISSING:${name}`);
    }
    report.push({
      name,
      status: secret.status || "unknown",
      scopes,
      id: shortId(secret.id)
    });
  }
  return {
    storeId: shortId(id),
    secrets: report
  };
}

/**
 * Ensure store + two provider secrets exist (idempotent). Never prints values.
 */
export async function bootstrapSecretsStore({ storeName = STORE_NAME } = {}) {
  assertScopedApiToken();
  await verifyToken();

  const stores = await listStores();
  let store = stores.find((item) => item?.name === storeName) || stores[0] || null;
  let storeAction = "reused";
  if (!store) {
    store = await createStore(storeName);
    storeAction = "created";
  }
  const storeId = store.id;
  assertStoreId(storeId);

  const existing = await listSecrets(storeId);
  const existingNames = new Set(existing.map((item) => item?.name).filter(Boolean));
  const secretResults = [];

  const specs = [
    { name: EMAIL_SECRET_NAME, comment: "sunsethue-helper email transport (Gmail SMTP)" },
    { name: PUSHOVER_SECRET_NAME, comment: "sunsethue-helper pushover transport" },
    { name: WEBHOOK_SECRET_NAME, comment: "sunsethue-helper webhook transport" },
    { name: WEB_PUSH_VAPID_SECRET_NAME, comment: "sunsethue-helper web push vapid keys" }
  ];

  for (const spec of specs) {
    if (existingNames.has(spec.name)) {
      const current = existing.find((item) => item.name === spec.name);
      secretResults.push({
        name: spec.name,
        action: "reused",
        status: current?.status || "unknown",
        scopes: current?.scopes || [],
        id: shortId(current?.id)
      });
      continue;
    }
    const created = await createSecret(storeId, {
      name: spec.name,
      value: SENTINEL_VALUE,
      comment: spec.comment,
      scopes: ["workers"]
    });
    secretResults.push({
      name: spec.name,
      action: "created",
      status: created?.status || "pending",
      scopes: created?.scopes || ["workers"],
      id: shortId(created?.id)
    });
  }

  return {
    storeId,
    storeIdRedacted: shortId(storeId),
    storeAction,
    secrets: secretResults
  };
}

export { accountPath, shortId };
