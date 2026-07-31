/**
 * Resolve Pushover credentials from Secrets Store (preferred) or legacy Worker secrets.
 * Never logs returned credential objects.
 */

import { CredentialError, parsePushoverTransport } from "../lib/transport-schema.js";
import { NotificationError } from "./errors.js";

async function readStoreBinding(binding) {
  if (!binding || typeof binding.get !== "function") return null;
  try {
    return await binding.get();
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ source: string, appToken: string, userKey: string }>}
 */
export async function resolvePushoverTransport(env) {
  const raw = await readStoreBinding(env.PUSHOVER_TRANSPORT_SECRET);
  if (raw) {
    try {
      const parsed = parsePushoverTransport(raw);
      if (parsed.configured) {
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

  if (env.PUSHOVER_APP_TOKEN && env.PUSHOVER_USER_KEY) {
    return {
      source: "legacy_worker_secret",
      appToken: String(env.PUSHOVER_APP_TOKEN),
      userKey: String(env.PUSHOVER_USER_KEY)
    };
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
