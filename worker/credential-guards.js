/**
 * Guards for provider-credential management routes.
 */

function normalizeOrigin(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(env) {
  const origins = new Set();
  for (const candidate of [env.WEBAPP_URL, env.PRODUCTION_URL]) {
    const origin = normalizeOrigin(candidate);
    if (origin) origins.add(origin);
  }
  return origins;
}

function forbidden(message) {
  return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, status: number, message: string }}
 */
export function assertCredentialRequestGuards(request, env, { mutation = false } = {}) {
  const origins = allowedOrigins(env);
  if (origins.size === 0) {
    return forbidden("Origin policy is not configured.");
  }

  const site = (request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (site === "cross-site") {
    return forbidden("Cross-site requests are not allowed.");
  }

  const originHeader = request.headers.get("Origin");
  if (originHeader) {
    const origin = normalizeOrigin(originHeader);
    if (!origin || !origins.has(origin)) {
      return forbidden("Origin is not allowed.");
    }
  } else if (mutation) {
    // Mutations are non-simple requests and must carry a matching Origin.
    return forbidden("Origin is required.");
  } else {
    // Same-origin GET often omits Origin. Allow only same-origin (or empty
    // Sec-Fetch-Site for older browsers). Reject same-site from sibling hosts.
    if (site && site !== "same-origin" && site !== "none") {
      return forbidden("Origin is required.");
    }
    const referer = request.headers.get("Referer");
    if (referer) {
      const refererOrigin = normalizeOrigin(referer);
      if (refererOrigin && !origins.has(refererOrigin)) {
        return forbidden("Origin is not allowed.");
      }
    }
  }

  if (mutation) {
    const admin = request.headers.get("X-Sunsethue-Admin");
    if (admin !== "credentials") {
      return forbidden("Administration header is required.");
    }
  }

  return { ok: true };
}

export const MAX_CREDENTIAL_BODY_BYTES = 4_096;
