/**
 * Shared HTTP helpers for authenticated API responses.
 */

export function createRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function securityHeaders(requestId) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId
  };
}

export function jsonResponse(data, status = 200, requestId = createRequestId(), extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...securityHeaders(requestId),
      ...extraHeaders
    }
  });
}

export function errorResponse(code, message, status, requestId = createRequestId(), extraHeaders = {}) {
  return jsonResponse(
    {
      error: {
        code,
        message
      }
    },
    status,
    requestId,
    extraHeaders
  );
}

export function methodNotAllowed(allow, requestId = createRequestId()) {
  return errorResponse(
    "METHOD_NOT_ALLOWED",
    "Method not allowed.",
    405,
    requestId,
    { Allow: allow }
  );
}

/**
 * Structured logging that never records JWTs, cookies, emails, or auth headers.
 * @param {string} level
 * @param {string} message
 * @param {object} [meta]
 */
export function logSafe(level, message, meta = {}) {
  const safe = {
    level,
    message,
    requestId: meta.requestId || null,
    method: meta.method || null,
    path: meta.path || null,
    status: meta.status || null,
    code: meta.code || null
  };
  const line = JSON.stringify(safe);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

/**
 * Copy request headers for service-binding proxying, stripping hop-by-hop headers.
 * Preserves Cf-Access-Jwt-Assertion for downstream verification.
 * @param {Headers} incoming
 */
export function filterProxyRequestHeaders(incoming) {
  const headers = new Headers();
  const connection = incoming.get("connection");
  const connectionTokens = new Set(
    (connection || "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
  );

  for (const [key, value] of incoming.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || connectionTokens.has(lower)) {
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

/**
 * Harden a downstream Worker response for the Pages Function proxy.
 * @param {Response} response
 * @param {string} requestId
 */
export function hardenProxiedResponse(response, requestId) {
  const headers = new Headers(response.headers);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Methods");
  headers.delete("Access-Control-Allow-Headers");
  headers.delete("Access-Control-Allow-Credentials");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
