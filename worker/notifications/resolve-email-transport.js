/**
 * Resolve Gmail SMTP credentials from Cloudflare Secrets Store.
 *
 * Production delivery requires the store-backed `EMAIL_TRANSPORT_SECRET`
 * binding to hold a document with `configured === true`. There is no
 * legacy Worker-secret fallback — an unconfigured or missing store secret
 * fails closed with `EMAIL_NOT_CONFIGURED`.
 *
 * Never logs returned credential objects.
 */

import { CredentialError, parseEmailTransport } from "../lib/transport-schema.js";
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
 * @returns {Promise<{ source: "secrets_store", gmailUser: string, gmailAppPassword: string, emailFrom: string }>}
 */
export async function resolveEmailTransport(env) {
  const raw = await readStoreBinding(env.EMAIL_TRANSPORT_SECRET);
  if (raw) {
    try {
      const parsed = parseEmailTransport(raw);
      if (parsed.configured) {
        registerSecretForRedaction(parsed.gmailAppPassword);
        return {
          source: "secrets_store",
          gmailUser: parsed.gmailUser,
          gmailAppPassword: parsed.gmailAppPassword,
          emailFrom: parsed.emailFrom
        };
      }
    } catch (error) {
      if (error instanceof CredentialError && error.code !== "SECRETS_STORE_SECRET_MISSING") {
        throw new NotificationError("EMAIL_NOT_CONFIGURED");
      }
    }
  }

  throw new NotificationError("EMAIL_NOT_CONFIGURED");
}

export async function emailTransportSource(env) {
  try {
    const resolved = await resolveEmailTransport(env);
    return resolved.source;
  } catch {
    return "not_configured";
  }
}

export async function hasEmailTransportAsync(env) {
  return (await emailTransportSource(env)) !== "not_configured";
}
