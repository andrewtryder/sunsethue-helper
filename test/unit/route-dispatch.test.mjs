import assert from "node:assert/strict";
import test from "node:test";
import { handleHttpRequest } from "../../worker/api.js";
import { API_ROUTE_CONTRACTS } from "../../worker/routes/contracts.js";

const SAMPLE_UUID = "11111111-1111-4111-8111-111111111111";
const WEBAPP_URL = "https://app.example.com";

function resolvePath(contract) {
  if (contract.path.includes(":id") && contract.pathPrefix) {
    if (contract.pathSuffix) {
      return `${contract.pathPrefix}${SAMPLE_UUID}${contract.pathSuffix}`;
    }
    return `${contract.pathPrefix}${SAMPLE_UUID}`;
  }
  return contract.path;
}

function disallowedMethod(allow) {
  const allowed = new Set(
    allow
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (!allowed.has(method)) return method;
  }
  return "TRACE";
}

/** Credential routes may run origin/admin guards before methodNotAllowed. */
function needsCredentialBypass(path) {
  return path === "/api/webhook-credentials"
    || path.startsWith("/api/provider-credentials/email")
    || path.startsWith("/api/provider-credentials/pushover");
}

test("route contract matrix includes the notification-platform paths", () => {
  const paths = new Set(API_ROUTE_CONTRACTS.map((entry) => entry.path));
  for (const required of [
    "/api/application-settings",
    "/api/location-notification-rules",
    "/api/web-push/vapid-public-key",
    "/api/web-push/subscriptions",
    "/api/webhook-credentials",
    "/api/notification-health",
    "/api/setup-status",
    "/api/history/export",
    "/api/history/clear",
    "/api/locations",
    "/api/provider-credentials"
  ]) {
    assert.ok(paths.has(required), `missing contract for ${required}`);
  }
  assert.equal(API_ROUTE_CONTRACTS.length, 26);
});

test("disallowed methods return 405 with the frozen Allow header", async () => {
  const env = { DB: null, SUNSETHUE_API_KEY: "test-key", WEBAPP_URL };
  for (const contract of API_ROUTE_CONTRACTS) {
    if (contract.retired) continue;
    const method = disallowedMethod(contract.allow);
    const path = resolvePath(contract);
    const headers = {};
    if (needsCredentialBypass(path)) {
      headers.Origin = WEBAPP_URL;
      headers["Sec-Fetch-Site"] = "same-origin";
      headers["X-Sunsethue-Admin"] = "credentials";
    }
    const response = await handleHttpRequest(
      new Request(`https://example.test${path}`, { method, headers }),
      env,
      { email: "owner@example.com" }
    );
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal(response.headers.get("Allow"), contract.allow, `${method} ${path} Allow`);
    const body = await response.json();
    assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
  }
});

test("retired config routes stay 404 for any method", async () => {
  const env = { DB: null };
  for (const contract of API_ROUTE_CONTRACTS.filter((entry) => entry.retired)) {
    for (const method of ["GET", "POST"]) {
      const response = await handleHttpRequest(
        new Request(`https://example.test${contract.path}`, { method }),
        env,
        { email: "owner@example.com" }
      );
      assert.equal(response.status, 404, `${method} ${contract.path}`);
    }
  }
});
