/**
 * Resolve Gmail SMTP credentials from Secrets Store (preferred) or legacy Worker secrets.
 * Never logs returned credential objects.
 */

import { CredentialError, parseEmailTransport } from "../lib/transport-schema.js";
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
 * @returns {Promise<{ source: string, gmailUser: string, gmailAppPassword: string, emailFrom: string }>}
 */
export async function resolveEmailTransport(env) {
  const raw = await readStoreBinding(env.EMAIL_TRANSPORT_SECRET);
  if (raw) {
    try {
      const parsed = parseEmailTransport(raw);
      if (parsed.configured) {
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

  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return {
      source: "legacy_worker_secret",
      gmailUser: String(env.GMAIL_USER).trim(),
      gmailAppPassword: String(env.GMAIL_APP_PASSWORD),
      emailFrom: env.EMAIL_FROM || `Sunsethue Helper <${env.GMAIL_USER}>`
    };
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
