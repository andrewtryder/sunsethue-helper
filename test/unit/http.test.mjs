import test from "node:test";
import assert from "node:assert/strict";
import {
  createRequestId,
  errorResponse,
  filterProxyRequestHeaders,
  hardenProxiedResponse,
  jsonResponse,
  logSafe,
  methodNotAllowed,
  securityHeaders,
  registerSecretForRedaction
} from "../../worker/http.js";

test("security headers are applied to every JSON response", () => {
  const headers = securityHeaders("req-1");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Request-Id"], "req-1");
  assert.match(headers["Content-Type"], /application\/json/);
});

test("request ids are unique", () => {
  const ids = new Set(Array.from({ length: 50 }, () => createRequestId()));
  assert.equal(ids.size, 50);
});

test("json responses serialize the payload and status", async () => {
  const response = jsonResponse({ ok: true }, 201, "req-2");
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("x-request-id"), "req-2");
});

test("error responses use the shared envelope", async () => {
  const response = errorResponse("FORBIDDEN", "You are not authorized.", 403, "req-3");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: { code: "FORBIDDEN", message: "You are not authorized." }
  });
});

test("method not allowed advertises only the supported methods", async () => {
  const response = methodNotAllowed("GET, POST", "req-4");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST");
  assert.equal((await response.json()).error.code, "METHOD_NOT_ALLOWED");
});

test("proxy header filtering drops hop-by-hop headers and keeps the Access assertion", () => {
  const incoming = new Headers({
    "Cf-Access-Jwt-Assertion": "token-value",
    "Content-Type": "application/json",
    "X-Custom": "keep",
    Connection: "keep-alive, x-drop-me",
    "Keep-Alive": "timeout=5",
    "Transfer-Encoding": "chunked",
    Host: "app.example.com",
    "X-Drop-Me": "gone"
  });

  const filtered = filterProxyRequestHeaders(incoming);
  assert.equal(filtered.get("cf-access-jwt-assertion"), "token-value");
  assert.equal(filtered.get("x-custom"), "keep");
  assert.equal(filtered.get("connection"), null);
  assert.equal(filtered.get("keep-alive"), null);
  assert.equal(filtered.get("transfer-encoding"), null);
  assert.equal(filtered.get("host"), null);
  assert.equal(filtered.get("x-drop-me"), null, "headers named in Connection are removed");
});

test("proxied responses lose CORS headers and gain hardening headers", () => {
  const upstream = new Response("{}", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Credentials": "true",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json"
    }
  });

  const hardened = hardenProxiedResponse(upstream, "req-5");
  assert.equal(hardened.headers.get("access-control-allow-origin"), null);
  assert.equal(hardened.headers.get("access-control-allow-methods"), null);
  assert.equal(hardened.headers.get("access-control-allow-headers"), null);
  assert.equal(hardened.headers.get("access-control-allow-credentials"), null);
  assert.equal(hardened.headers.get("cache-control"), "no-store");
  assert.equal(hardened.headers.get("x-content-type-options"), "nosniff");
  assert.equal(hardened.headers.get("x-request-id"), "req-5");
  assert.equal(hardened.headers.get("content-type"), "application/json");
});

test("structured logging drops tokens, cookies, emails, and auth headers", () => {
  const lines = [];
  const originalWarn = console.warn;
  console.warn = (line) => lines.push(line);

  try {
    logSafe("warn", "Request rejected", {
      requestId: "req-6",
      method: "POST",
      path: "/api/locations",
      status: 401,
      code: "UNAUTHENTICATED",
      token: "eyJhbGciOiJSUzI1NiJ9.should-not-appear",
      cookie: "CF_Authorization=should-not-appear",
      email: "owner@example.com",
      authorization: "Bearer should-not-appear"
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(logged).sort(), [
    "code",
    "level",
    "message",
    "method",
    "path",
    "requestId",
    "status"
  ]);
  assert.doesNotMatch(lines[0], /eyJ|CF_Authorization|owner@example\.com|Bearer/);
});

test("log level selects the matching console channel", () => {
  const seen = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => seen.push("log");
  console.warn = () => seen.push("warn");
  console.error = () => seen.push("error");

  try {
    logSafe("info", "a");
    logSafe("warn", "b");
    logSafe("error", "c");
  } finally {
    Object.assign(console, original);
  }

  assert.deepEqual(seen, ["log", "warn", "error"]);
});

test("logSafe redacts explicitly registered secrets as defense in depth", () => {
  const lines = [];
  const originalWarn = console.warn;
  console.warn = (line) => lines.push(line);

  try {
    registerSecretForRedaction("super-secret-exact");
    registerSecretForRedaction("vapid-private-key-123");
    registerSecretForRedaction("webhook-sig-xyz");
    registerSecretForRedaction("pushover-key-abc");

    logSafe("warn", "A failed request", {
      code: "API_ERROR",
      reason: "Failed due to super-secret-exact error",
      channel: "pushover",
      outboxId: "https://example.com/?token=webhook-sig-xyz&key=pushover-key-abc"
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  
  assert.equal(logged.reason, "Failed due to *** error");
  assert.equal(logged.outboxId, "https://example.com/?token=***&key=***");
});

test("logSafe drops un-allowlisted fields preventing PII and credentials from being logged", () => {
  const lines = [];
  const originalWarn = console.warn;
  console.warn = (line) => lines.push(line);

  try {
    logSafe("warn", "Delivery failed", {
      code: "SMTP_AUTH_REJECTED",
      channel: "email",
      gmailAddress: "owner@example.com",
      pushEndpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      coordinates: "40.7128,-74.0060",
      authorizationHeader: "Bearer 123456",
      webhookUrl: "https://example.com/webhook"
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  
  assert.equal(logged.code, "SMTP_AUTH_REJECTED");
  assert.equal(logged.channel, "email");
  assert.equal(logged.gmailAddress, undefined);
  assert.equal(logged.pushEndpoint, undefined);
  assert.equal(logged.coordinates, undefined);
  assert.equal(logged.authorizationHeader, undefined);
  assert.equal(logged.webhookUrl, undefined);
});
