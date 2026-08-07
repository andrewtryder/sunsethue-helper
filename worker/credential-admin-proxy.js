/**
 * Main-Worker facade for CREDENTIAL_ADMIN service binding RPC.
 */

import { CredentialError } from "./lib/transport-schema.js";
import { CREDENTIAL_ADMIN_RPC_TIMEOUT_MS, withTimeout } from "./lib/timeout.js";

export class CredentialAdminProxyError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "CredentialAdminProxyError";
    this.code = code;
    this.status = status;
  }
}

const KNOWN_ADMIN_CODES = new Set([
  "INVALID_EMAIL_CREDENTIALS",
  "INVALID_PUSHOVER_CREDENTIALS",
  "CREDENTIAL_UPDATE_FORBIDDEN",
  "SECRETS_STORE_SECRET_MISSING",
  "SECRETS_STORE_NOT_CONFIGURED",
  "SECRETS_STORE_UPDATE_FAILED",
  "SECRETS_STORE_ACTIVATION_TIMEOUT",
  "CREDENTIAL_ADMIN_UNAVAILABLE"
]);

function statusForAdminCode(code) {
  if (code === "INVALID_EMAIL_CREDENTIALS" || code === "INVALID_PUSHOVER_CREDENTIALS") return 400;
  if (code === "CREDENTIAL_UPDATE_FORBIDDEN") return 403;
  if (code === "SECRETS_STORE_SECRET_MISSING" || code === "SECRETS_STORE_NOT_CONFIGURED") return 409;
  if (code === "CREDENTIAL_ADMIN_UNAVAILABLE") return 503;
  return 502;
}

/**
 * Recover controlled codes from RPC-shaped errors (instanceof is lost across bindings).
 */
export function extractAdminErrorCode(error) {
  const candidates = [error?.code, error?.message, error?.cause?.code, error?.cause?.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && KNOWN_ADMIN_CODES.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function mapAdminError(error) {
  if (error instanceof CredentialAdminProxyError) {
    return error;
  }
  if (error instanceof CredentialError) {
    return new CredentialAdminProxyError(error.code, statusForAdminCode(error.code));
  }
  const code = extractAdminErrorCode(error);
  if (code) {
    const status =
      typeof error?.status === "number" && error.status >= 400 && error.status < 600
        ? error.status
        : statusForAdminCode(code);
    return new CredentialAdminProxyError(code, status);
  }
  return new CredentialAdminProxyError("CREDENTIAL_ADMIN_UNAVAILABLE", 503);
}

export function getCredentialAdmin(env) {
  if (!env.CREDENTIAL_ADMIN) {
    throw new CredentialAdminProxyError("CREDENTIAL_ADMIN_UNAVAILABLE", 503);
  }
  return env.CREDENTIAL_ADMIN;
}

async function callAdmin(env, invoke, timeoutMs = CREDENTIAL_ADMIN_RPC_TIMEOUT_MS) {
  try {
    return await withTimeout(invoke(getCredentialAdmin(env)), timeoutMs, "CREDENTIAL_ADMIN_UNAVAILABLE");
  } catch (error) {
    throw mapAdminError(error);
  }
}

export async function adminGetStatus(env, meta, options = {}) {
  return callAdmin(env, (admin) => admin.getStatus(meta), options.timeoutMs);
}

export async function adminUpdateEmail(env, input, context) {
  return callAdmin(env, (admin) => admin.updateEmail(input, context), 15_000);
}

export async function adminRemoveEmail(env, context) {
  return callAdmin(env, (admin) => admin.removeEmail(context), 15_000);
}

export async function adminUpdatePushover(env, input, context) {
  return callAdmin(env, (admin) => admin.updatePushover(input, context), 15_000);
}

export async function adminRemovePushover(env, context) {
  return callAdmin(env, (admin) => admin.removePushover(context), 15_000);
}
