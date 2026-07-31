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

/**
 * @returns {{ ok: true } | { ok: false, code: string, status: number, message: string }}
 */
export function assertCredentialRequestGuards(request, env, { mutation = false } = {}) {
  const originHeader = request.headers.get("Origin");
  const origins = allowedOrigins(env);
  if (origins.size === 0) {
    return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message: "Origin policy is not configured." };
  }
  if (!originHeader) {
    return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message: "Origin is required." };
  }
  const origin = normalizeOrigin(originHeader);
  if (!origin || !origins.has(origin)) {
    return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message: "Origin is not allowed." };
  }

  const site = (request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (site === "cross-site") {
    return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message: "Cross-site requests are not allowed." };
  }

  if (mutation) {
    const admin = request.headers.get("X-Sunsethue-Admin");
    if (admin !== "credentials") {
      return { ok: false, code: "CREDENTIAL_UPDATE_FORBIDDEN", status: 403, message: "Administration header is required." };
    }
  }

  return { ok: true };
}

export const MAX_CREDENTIAL_BODY_BYTES = 4_096;
