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

function mapAdminError(error) {
  if (error instanceof CredentialError) {
    const status =
      error.code === "INVALID_EMAIL_CREDENTIALS" || error.code === "INVALID_PUSHOVER_CREDENTIALS"
        ? 400
        : error.code === "CREDENTIAL_UPDATE_FORBIDDEN"
          ? 403
          : error.code === "SECRETS_STORE_SECRET_MISSING" || error.code === "SECRETS_STORE_NOT_CONFIGURED"
            ? 409
            : 502;
    return new CredentialAdminProxyError(error.code, status);
  }
  if (error?.code) {
    return new CredentialAdminProxyError(error.code, error.status || 502);
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
