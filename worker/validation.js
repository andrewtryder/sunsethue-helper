/**
 * Shared request validation helpers.
 *
 * All helpers are pure and never throw on invalid input; callers decide the
 * HTTP mapping. Bounds are conservative because these run behind Cloudflare
 * Access, so we do not need to guard against every crawler-shaped payload —
 * only against confused-owner mistakes and adversarial browser sessions.
 */

const DEFAULT_MAX_BYTES = 32 * 1024;

// Characters that would break Nominatim's User-Agent header, our email
// subject/body handling, or Photon's autocomplete query, plus generic control
// characters that never belong in free-text.
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NEWLINE_RE = /[\r\n]/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Read a JSON body with hard limits.
 *
 * Fails closed on non-JSON content types (415), oversize payloads (413), and
 * malformed JSON (400). Never returns the underlying parser message.
 *
 * @param {Request} request
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<{ value: unknown } | { error: "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "INVALID_JSON" }>}
 */
export async function readJsonBody(request, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return { error: "UNSUPPORTED_MEDIA_TYPE" };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { error: "PAYLOAD_TOO_LARGE" };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { error: "INVALID_JSON" };
  }
  if (text.length > maxBytes) {
    return { error: "PAYLOAD_TOO_LARGE" };
  }
  if (text.length === 0) {
    return { error: "INVALID_JSON" };
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: "INVALID_JSON" };
  }
}

/**
 * @param {unknown} name
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
export function validateLocationName(name) {
  if (typeof name !== "string") return { ok: false };
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return { ok: false };
  if (CONTROL_CHAR_RE.test(trimmed) || NEWLINE_RE.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {{ ok: true, latitude: number, longitude: number } | { ok: false }}
 */
export function validateCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false };
  if (latitude < -90 || latitude > 90) return { ok: false };
  if (longitude < -180 || longitude > 180) return { ok: false };
  return { ok: true, latitude, longitude };
}

/**
 * @param {unknown} query
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
export function validateSearchQuery(query) {
  if (typeof query !== "string") return { ok: false };
  const trimmed = query.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return { ok: false };
  if (CONTROL_CHAR_RE.test(trimmed) || NEWLINE_RE.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Ensure an object contains only allowed keys.
 * @param {unknown} obj
 * @param {Set<string> | string[]} allowed
 * @returns {{ ok: true } | { ok: false, unknown: string }}
 */
export function rejectUnknownFields(obj, allowed) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, unknown: "__root__" };
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) return { ok: false, unknown: key };
  }
  return { ok: true };
}

/**
 * Return a shallow copy containing only the allowed fields.
 * @template T
 * @param {T} obj
 * @param {Set<string> | string[]} allowed
 * @returns {Partial<T>}
 */
export function pickKnownFields(obj, allowed) {
  if (!obj || typeof obj !== "object") return {};
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  const out = {};
  for (const key of Object.keys(obj)) {
    if (allowedSet.has(key)) out[key] = obj[key];
  }
  return out;
}

/**
 * Truncate a string so its UTF-8 byte length is at most `maxBytes`, never
 * splitting a code point. Useful for Pushover message payloads that must fit
 * a 1024-byte body limit.
 * @param {string} value
 * @param {number} maxBytes
 * @returns {string}
 */
export function truncateUtf8(value, maxBytes) {
  if (typeof value !== "string" || maxBytes <= 0) return "";
  const encoder = new TextEncoder();
  const encoded = encoder.encode(value);
  if (encoded.byteLength <= maxBytes) return value;
  const trimmed = encoded.subarray(0, maxBytes);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(trimmed).replace(/\uFFFD+$/g, "");
}

/**
 * Normalize newlines in a free-text location name so it never injects header
 * folding into Pushover payloads or email subjects.
 * @param {string} value
 * @returns {string}
 */
export function collapseWhitespace(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r?\n/g, " ").trim();
}
