/**
 * Web Push VAPID keypair helpers.
 *
 * Uses the existing `jose` dependency to generate a P-256 (ES256) keypair and
 * expose the browser-compatible base64url public key plus a PKCS8 PEM private
 * key. The Worker delivery path imports the private key with
 * `jose.importPKCS8(pem, "ES256")`, so this is the exact format the runtime
 * expects.
 *
 * Never logs or returns private key material through console helpers.
 */
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";

/**
 * Convert a Uint8Array to a base64url string with no padding.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Convert a base64/base64url string to a Uint8Array.
 * @param {string} input
 * @returns {Uint8Array}
 */
export function base64UrlToBytes(input) {
  if (typeof input !== "string" || !input) {
    throw new Error("Invalid base64url input");
  }
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from([...binary].map((c) => c.charCodeAt(0)));
}

/**
 * A browser VAPID public key is the uncompressed P-256 point: 0x04 || X(32) || Y(32) = 65 bytes.
 * @param {string} publicKeyBase64Url
 * @returns {boolean}
 */
export function isValidVapidPublicKey(publicKeyBase64Url) {
  if (typeof publicKeyBase64Url !== "string" || !publicKeyBase64Url) return false;
  try {
    const bytes = base64UrlToBytes(publicKeyBase64Url);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}

/**
 * Generate one P-256 VAPID keypair.
 * @returns {Promise<{ publicKeyBase64Url: string, privateKeyPem: string }>}
 */
export async function generateVapidKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  if (!jwk.x || !jwk.y) {
    throw new Error("Generated public key is missing coordinates");
  }
  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);
  const uncompressed = new Uint8Array(1 + x.length + y.length);
  uncompressed[0] = 4;
  uncompressed.set(x, 1);
  uncompressed.set(y, 1 + x.length);
  const publicKeyBase64Url = bytesToBase64Url(uncompressed);
  const privateKeyPem = await exportPKCS8(privateKey);

  if (!isValidVapidPublicKey(publicKeyBase64Url)) {
    throw new Error("Generated VAPID public key failed validation");
  }
  if (typeof privateKeyPem !== "string" || !privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Generated VAPID private key is not a PEM");
  }

  return { publicKeyBase64Url, privateKeyPem };
}

/**
 * Build the JSON document stored in SUNSETHUE_WEB_PUSH_VAPID.
 * @param {string} privateKeyPem
 */
export function buildVapidSecretDocument(privateKeyPem) {
  if (typeof privateKeyPem !== "string" || !privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("privateKey must be a PKCS8 PEM");
  }
  return JSON.stringify({ version: 1, configured: true, privateKey: privateKeyPem });
}

/**
 * Validate a VAPID subject. RFC 8291 allows mailto: or any https URL.
 * @param {string} subject
 */
export function isValidVapidSubject(subject) {
  if (typeof subject !== "string" || !subject) return false;
  const trimmed = subject.trim();
  if (/^mailto:[^\s@]+@[^\s@]+/.test(trimmed)) return true;
  if (/^https:\/\/[^\s]+$/.test(trimmed)) return true;
  return false;
}
