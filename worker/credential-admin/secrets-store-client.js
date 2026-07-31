/**
 * Secrets Store management client for the private credential-admin Worker.
 * Uses CLOUDFLARE_API_TOKEN from env. Never logs secret values.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_RESPONSE_BYTES = 64_000;
const REQUEST_TIMEOUT_MS = 20_000;

export class SecretsStoreClientError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "SecretsStoreClientError";
    this.code = code;
    this.status = status;
  }
}

function assertIds(accountId, storeId) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new SecretsStoreClientError("SECRETS_STORE_NOT_CONFIGURED", 503);
  }
  if (typeof storeId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(storeId)) {
    throw new SecretsStoreClientError("SECRETS_STORE_NOT_CONFIGURED", 503);
  }
}

async function apiRequest(env, method, path, body, { retries = 2 } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token || typeof token !== "string") {
    throw new SecretsStoreClientError("CREDENTIAL_ADMIN_UNAVAILABLE", 503);
  }
  assertIds(env.CLOUDFLARE_ACCOUNT_ID, env.SECRETS_STORE_ID);

  const url = `${API_BASE}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/secrets_store${path}`;
  if (!url.startsWith(`${API_BASE}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/secrets_store`)) {
    throw new SecretsStoreClientError("SECRETS_STORE_UPDATE_FAILED", 502);
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new SecretsStoreClientError("SECRETS_STORE_UPDATE_FAILED", 502);
      }
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      const ok = response.ok && payload?.success !== false;
      if (ok) {
        return { status: response.status, result: payload?.result };
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new SecretsStoreClientError("CREDENTIAL_UPDATE_FORBIDDEN", 403);
      }
      throw new SecretsStoreClientError("SECRETS_STORE_UPDATE_FAILED", 502);
    } catch (error) {
      if (error instanceof SecretsStoreClientError) throw error;
      if (error?.name === "AbortError") {
        throw new SecretsStoreClientError("SECRETS_STORE_ACTIVATION_TIMEOUT", 502);
      }
      if (attempt < retries) {
        attempt += 1;
        continue;
      }
      throw new SecretsStoreClientError("CREDENTIAL_ADMIN_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function listSecretMetadata(env) {
  const storeId = env.SECRETS_STORE_ID;
  const { result } = await apiRequest(env, "GET", `/stores/${storeId}/secrets?per_page=100`);
  return Array.isArray(result) ? result : [];
}

export async function findSecretByName(env, name) {
  const secrets = await listSecretMetadata(env);
  return secrets.find((secret) => secret?.name === name) || null;
}

export async function patchSecretById(env, secretId, value, comment) {
  const storeId = env.SECRETS_STORE_ID;
  if (typeof secretId !== "string" || secretId.length < 8) {
    throw new SecretsStoreClientError("SECRETS_STORE_SECRET_MISSING", 502);
  }
  const { result } = await apiRequest(env, "PATCH", `/stores/${storeId}/secrets/${secretId}`, {
    value,
    scopes: ["workers"],
    comment
  });
  return result;
}

export async function waitForActive(env, secretId, { timeoutMs = 30_000, intervalMs = 1_000 } = {}) {
  const storeId = env.SECRETS_STORE_ID;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await apiRequest(env, "GET", `/stores/${storeId}/secrets/${secretId}`, undefined, { retries: 0 });
    if (result?.status === "active") {
      return { id: result.id, name: result.name, status: result.status };
    }
    if (result?.status === "deleted") {
      throw new SecretsStoreClientError("SECRETS_STORE_SECRET_MISSING", 502);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new SecretsStoreClientError("SECRETS_STORE_ACTIVATION_TIMEOUT", 502);
}

export async function replaceProviderSecret(env, secretName, serialized, comment) {
  const existing = await findSecretByName(env, secretName);
  if (!existing?.id) {
    throw new SecretsStoreClientError("SECRETS_STORE_SECRET_MISSING", 502);
  }
  const patched = await patchSecretById(env, existing.id, serialized, comment);
  await waitForActive(env, patched?.id || existing.id);
  return { secretId: patched?.id || existing.id, name: secretName };
}
