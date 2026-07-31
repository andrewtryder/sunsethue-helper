/**
 * Main-Worker facade for CREDENTIAL_ADMIN service binding RPC.
 */

import { CredentialError } from "./lib/transport-schema.js";

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

export async function adminGetStatus(env, meta) {
  try {
    return await getCredentialAdmin(env).getStatus(meta);
  } catch (error) {
    throw mapAdminError(error);
  }
}

export async function adminUpdateEmail(env, input, context) {
  try {
    return await getCredentialAdmin(env).updateEmail(input, context);
  } catch (error) {
    throw mapAdminError(error);
  }
}

export async function adminRemoveEmail(env, context) {
  try {
    return await getCredentialAdmin(env).removeEmail(context);
  } catch (error) {
    throw mapAdminError(error);
  }
}

export async function adminUpdatePushover(env, input, context) {
  try {
    return await getCredentialAdmin(env).updatePushover(input, context);
  } catch (error) {
    throw mapAdminError(error);
  }
}

export async function adminRemovePushover(env, context) {
  try {
    return await getCredentialAdmin(env).removePushover(context);
  } catch (error) {
    throw mapAdminError(error);
  }
}
