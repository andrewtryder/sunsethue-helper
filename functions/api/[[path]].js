import {
  createRequestId,
  errorResponse,
  filterProxyRequestHeaders,
  hardenProxiedResponse,
  logSafe
} from "../../worker/http.js";

/**
 * Same-origin /api/* proxy.
 * Browser -> Access -> Pages -> this Function -> service binding -> Worker.
 */
export async function onRequest(context) {
  const requestId = createRequestId();
  const { request, env, params } = context;
  const url = new URL(request.url);

  try {
    if (!env.API_SERVICE || typeof env.API_SERVICE.fetch !== "function") {
      logSafe("error", "API service binding missing", {
        requestId,
        method: request.method,
        path: url.pathname,
        code: "MISCONFIGURED"
      });
      return errorResponse(
        "MISCONFIGURED",
        "API proxy is unavailable.",
        503,
        requestId
      );
    }

    // Access must already have admitted the request. Preserve the assertion
    // for Worker defense-in-depth; never synthesize a JWT here.
    const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
    const isLocal =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    const bypassEnabled =
      isLocal && String(env.DEV_AUTH_BYPASS).toLowerCase() === "true";

    if (!assertion && !bypassEnabled) {
      return errorResponse(
        "UNAUTHENTICATED",
        "Authentication is required.",
        401,
        requestId
      );
    }

    const pathParts = Array.isArray(params.path)
      ? params.path
      : params.path
        ? [params.path]
        : [];
    const downstreamPath = `/api/${pathParts.join("/")}${url.search}`;

    const headers = filterProxyRequestHeaders(request.headers);
    headers.set("X-Request-Id", requestId);

    const init = {
      method: request.method,
      headers
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      // @ts-expect-error duplex is required for streaming request bodies in some runtimes
      init.duplex = "half";
    }

    // Preserve loopback host on local auth bypass so the Worker hostname check
    // accepts DEV_AUTH_BYPASS (service bindings otherwise see api.internal).
    const downstreamOrigin = bypassEnabled
      ? `http://${url.hostname}`
      : "https://api.internal";
    const downstreamRequest = new Request(
      new URL(downstreamPath, downstreamOrigin),
      init
    );

    const response = await env.API_SERVICE.fetch(downstreamRequest);
    return hardenProxiedResponse(response, requestId);
  } catch {
    logSafe("error", "Pages API proxy failure", {
      requestId,
      method: request.method,
      path: url.pathname,
      code: "PROXY_ERROR"
    });
    return errorResponse(
      "PROXY_ERROR",
      "Unable to reach the API.",
      502,
      requestId
    );
  }
}
