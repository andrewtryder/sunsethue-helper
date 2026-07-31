/**
 * Strict versioned provider credential JSON schemas for Secrets Store values.
 * Shared conceptually by the credential-admin Worker and main Worker resolvers.
 */

export const TRANSPORT_VERSION = 1;
export const MAX_TRANSPORT_BYTES = 1024;

export const EMAIL_FIELDS = new Set(["version", "configured", "gmailUser", "gmailAppPassword", "emailFrom"]);
export const PUSHOVER_FIELDS = new Set(["version", "configured", "appToken", "userKey"]);

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CONTROL_OR_WS = /[\r\n\t\v\f]|[\u0000-\u001f\u007f]/;

export class CredentialError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

export function validateEmailAddress(value) {
  return typeof value === "string" && !/[\r\n]/.test(value) && EMAIL_RE.test(value.trim());
}

export function parseMailbox(value) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  const clean = value.trim();
  const open = clean.indexOf("<");
  const close = clean.lastIndexOf(">");
  const parsed =
    open >= 0 || close >= 0
      ? { name: clean.slice(0, open).trim().replaceAll('"', ""), email: clean.slice(open + 1, close).trim() }
      : { name: "", email: clean };
  if ((open >= 0 && (close !== clean.length - 1 || open === 0)) || (close >= 0 && open < 0)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  if (!validateEmailAddress(parsed.email)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  return parsed;
}

function assertNoControlOrWhitespace(value, code) {
  if (typeof value !== "string" || value.length === 0 || CONTROL_OR_WS.test(value) || /\s/.test(value)) {
    throw new CredentialError(code);
  }
}

function assertSerializedSize(obj) {
  const serialized = JSON.stringify(obj);
  if (serialized.length > MAX_TRANSPORT_BYTES) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS", "Transport document exceeds size limit");
  }
  return serialized;
}

export function parseTransportJson(raw, allowedFields) {
  if (raw === null || raw === undefined || raw === "") {
    throw new CredentialError("SECRETS_STORE_SECRET_MISSING");
  }
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new CredentialError("SECRETS_STORE_SECRET_MISSING");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CredentialError("SECRETS_STORE_SECRET_MISSING");
  }
  for (const key of Object.keys(parsed)) {
    if (!allowedFields.has(key)) {
      throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
    }
  }
  if (parsed.version !== TRANSPORT_VERSION) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  if (typeof parsed.configured !== "boolean") {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  return parsed;
}

export function parseEmailTransport(raw) {
  const parsed = parseTransportJson(raw, EMAIL_FIELDS);
  if (!parsed.configured) {
    return { version: 1, configured: false };
  }
  if (!validateEmailAddress(parsed.gmailUser)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  assertNoControlOrWhitespace(parsed.gmailAppPassword, "INVALID_EMAIL_CREDENTIALS");
  parseMailbox(parsed.emailFrom);
  assertSerializedSize(parsed);
  return {
    version: 1,
    configured: true,
    gmailUser: parsed.gmailUser.trim().toLowerCase(),
    gmailAppPassword: parsed.gmailAppPassword,
    emailFrom: parsed.emailFrom.trim()
  };
}

export function parsePushoverTransport(raw) {
  const parsed = parseTransportJson(raw, PUSHOVER_FIELDS);
  if (!parsed.configured) {
    return { version: 1, configured: false };
  }
  assertNoControlOrWhitespace(parsed.appToken, "INVALID_PUSHOVER_CREDENTIALS");
  assertNoControlOrWhitespace(parsed.userKey, "INVALID_PUSHOVER_CREDENTIALS");
  if (parsed.appToken.length < 20 || parsed.appToken.length > 128) {
    throw new CredentialError("INVALID_PUSHOVER_CREDENTIALS");
  }
  if (parsed.userKey.length < 20 || parsed.userKey.length > 128) {
    throw new CredentialError("INVALID_PUSHOVER_CREDENTIALS");
  }
  assertSerializedSize(parsed);
  return {
    version: 1,
    configured: true,
    appToken: parsed.appToken,
    userKey: parsed.userKey
  };
}

export function buildEmailTransportDocument({ gmailUser, gmailAppPassword, emailFrom }) {
  if (!validateEmailAddress(gmailUser)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  // Reject surrounding whitespace on app password without normalizing the secret.
  if (typeof gmailAppPassword !== "string" || gmailAppPassword !== gmailAppPassword.trim()) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  assertNoControlOrWhitespace(gmailAppPassword, "INVALID_EMAIL_CREDENTIALS");
  parseMailbox(emailFrom);
  const doc = {
    version: 1,
    configured: true,
    gmailUser: gmailUser.trim().toLowerCase(),
    gmailAppPassword,
    emailFrom: emailFrom.trim()
  };
  return { document: doc, serialized: assertSerializedSize(doc) };
}

export function buildPushoverTransportDocument({ appToken, userKey }) {
  assertNoControlOrWhitespace(appToken, "INVALID_PUSHOVER_CREDENTIALS");
  assertNoControlOrWhitespace(userKey, "INVALID_PUSHOVER_CREDENTIALS");
  if (appToken.length < 20 || appToken.length > 128 || userKey.length < 20 || userKey.length > 128) {
    throw new CredentialError("INVALID_PUSHOVER_CREDENTIALS");
  }
  const doc = { version: 1, configured: true, appToken, userKey };
  return { document: doc, serialized: assertSerializedSize(doc) };
}

export function unconfiguredSentinel() {
  return { document: { version: 1, configured: false }, serialized: JSON.stringify({ version: 1, configured: false }) };
}
