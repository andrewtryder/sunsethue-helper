/**
 * Resolve Pushover credentials from Cloudflare Secrets Store.
 *
 * Production delivery requires the store-backed `PUSHOVER_TRANSPORT_SECRET`
 * binding to hold a document with `configured === true`. There is no
 * legacy Worker-secret fallback — an unconfigured or missing store secret
 * fails closed with `PUSHOVER_NOT_CONFIGURED`.
 *
 * Never logs returned credential objects.
 */

import { CredentialError, parsePushoverTransport } from "../lib/transport-schema.js";
import { NotificationError } from "./errors.js";
import { registerSecretForRedaction } from "../http.js";
import { SECRETS_STORE_GET_TIMEOUT_MS, withTimeout } from "../lib/timeout.js";

async function readStoreBinding(binding) {
  if (!binding || typeof binding.get !== "function") return null;
  try {
    return await withTimeout(binding.get(), SECRETS_STORE_GET_TIMEOUT_MS, "SECRETS_STORE_GET_TIMEOUT");
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ source: "secrets_store", appToken: string, userKey: string }>}
 */
export async function resolvePushoverTransport(env) {
  const raw = await readStoreBinding(env.PUSHOVER_TRANSPORT_SECRET);
  if (raw) {
    try {
      const parsed = parsePushoverTransport(raw);
      if (parsed.configured) {
        registerSecretForRedaction(parsed.appToken);
        registerSecretForRedaction(parsed.userKey);
        return {
          source: "secrets_store",
          appToken: parsed.appToken,
          userKey: parsed.userKey
        };
      }
    } catch (error) {
      if (error instanceof CredentialError && error.code !== "SECRETS_STORE_SECRET_MISSING") {
        throw new NotificationError("PUSHOVER_NOT_CONFIGURED");
      }
    }
  }

  throw new NotificationError("PUSHOVER_NOT_CONFIGURED");
}

export async function pushoverTransportSource(env) {
  try {
    const resolved = await resolvePushoverTransport(env);
    return resolved.source;
  } catch {
    return "not_configured";
  }
}

export async function hasPushoverTransportAsync(env) {
  return (await pushoverTransportSource(env)) !== "not_configured";
}
