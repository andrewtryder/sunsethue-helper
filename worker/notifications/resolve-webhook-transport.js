import { CredentialError, parseTransportJson, TRANSPORT_VERSION } from "../lib/transport-schema.js";
import { registerSecretForRedaction } from "../http.js";

export const WEBHOOK_FIELDS = new Set(["version", "configured", "url", "signingSecret"]);

const PRIVATE_IPV4 =
  /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[0-2]\d)\.)/;

/**
 * @param {unknown} raw
 */
export function parseWebhookTransport(raw) {
  const parsed = parseTransportJson(raw, WEBHOOK_FIELDS);
  if (!parsed.configured) {
    return { version: 1, configured: false };
  }
  assertSafeWebhookUrl(parsed.url);
  if (typeof parsed.signingSecret !== "string" || parsed.signingSecret.length < 16 || parsed.signingSecret.length > 256) {
    throw new CredentialError("INVALID_WEBHOOK_CREDENTIALS");
  }
  registerSecretForRedaction(parsed.signingSecret);
  return {
    version: TRANSPORT_VERSION,
    configured: true,
    url: parsed.url.trim(),
    signingSecret: parsed.signingSecret
  };
}

export function buildWebhookTransportDocument({ url, signingSecret }) {
  assertSafeWebhookUrl(url);
  if (typeof signingSecret !== "string" || signingSecret.length < 16 || signingSecret.length > 256) {
    throw new CredentialError("INVALID_WEBHOOK_CREDENTIALS");
  }
  const doc = {
    version: TRANSPORT_VERSION,
    configured: true,
    url: String(url).trim(),
    signingSecret
  };
  return { document: doc, serialized: JSON.stringify(doc) };
}

export function assertSafeWebhookUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new CredentialError("INVALID_WEBHOOK_URL");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CredentialError("INVALID_WEBHOOK_URL");
  }
  if (url.protocol !== "https:") {
    throw new CredentialError("INVALID_WEBHOOK_URL");
  }
  if (url.username || url.password) {
    throw new CredentialError("INVALID_WEBHOOK_URL");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0"
  ) {
    throw new CredentialError("INVALID_WEBHOOK_URL");
  }
  if (PRIVATE_IPV4.test(host) || host.includes(":")) {
    // Reject IPv4 private literals and raw IPv6 literals.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
      throw new CredentialError("INVALID_WEBHOOK_URL");
    }
  }
  return url;
}

export function maskWebhookHostname(urlString) {
  try {
    return new URL(urlString).hostname;
  } catch {
    return null;
  }
}

/**
 * Sign timestamp + "." + raw body with HMAC-SHA256.
 * @param {string} signingSecret
 * @param {string|number} timestamp
 * @param {string} rawBody
 */
export async function signWebhookBody(signingSecret, timestamp, rawBody) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
