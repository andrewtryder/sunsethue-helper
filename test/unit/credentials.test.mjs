import test from "node:test";
import assert from "node:assert/strict";
import { resolveEmailTransport } from "../../worker/notifications/resolve-email-transport.js";
import { resolvePushoverTransport } from "../../worker/notifications/resolve-pushover-transport.js";
import { NotificationError } from "../../worker/notifications/errors.js";
import { assertCredentialRequestGuards } from "../../worker/credential-guards.js";

function binding(value) {
  return { get: async () => value };
}

test("email resolver prefers Secrets Store over legacy Worker secrets", async () => {
  const env = {
    EMAIL_TRANSPORT_SECRET: binding(
      JSON.stringify({
        version: 1,
        configured: true,
        gmailUser: "store@example.com",
        gmailAppPassword: "abcdefghijklmnop",
        emailFrom: "Sunsethue Helper <store@example.com>"
      })
    ),
    GMAIL_USER: "legacy@example.com",
    GMAIL_APP_PASSWORD: "legacy-password-xx",
    EMAIL_FROM: "legacy@example.com"
  };
  const resolved = await resolveEmailTransport(env);
  assert.equal(resolved.source, "secrets_store");
  assert.equal(resolved.gmailUser, "store@example.com");
});

test("email resolver falls back to legacy Worker secrets", async () => {
  const env = {
    EMAIL_TRANSPORT_SECRET: binding(JSON.stringify({ version: 1, configured: false })),
    GMAIL_USER: "legacy@example.com",
    GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    EMAIL_FROM: "legacy@example.com"
  };
  const resolved = await resolveEmailTransport(env);
  assert.equal(resolved.source, "legacy_worker_secret");
});

test("pushover resolver throws when neither Secrets Store nor legacy is configured", async () => {
  await assert.rejects(
    () => resolvePushoverTransport({ PUSHOVER_TRANSPORT_SECRET: binding(JSON.stringify({ version: 1, configured: false })) }),
    (error) => error instanceof NotificationError && error.code === "PUSHOVER_NOT_CONFIGURED"
  );
});

test("credential guards reject missing origin, cross-site, and missing admin header", () => {
  const env = { WEBAPP_URL: "https://app.example.com" };
  const missingOrigin = assertCredentialRequestGuards(new Request("https://worker.example/api/provider-credentials"), env);
  assert.equal(missingOrigin.ok, false);
  assert.equal(missingOrigin.status, 403);

  const crossSite = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { Origin: "https://app.example.com", "Sec-Fetch-Site": "cross-site" }
    }),
    env,
    { mutation: true }
  );
  assert.equal(crossSite.ok, false);

  const missingAdmin = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials/email", {
      method: "PUT",
      headers: { Origin: "https://app.example.com", "Sec-Fetch-Site": "same-origin" }
    }),
    env,
    { mutation: true }
  );
  assert.equal(missingAdmin.ok, false);

  const ok = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { Origin: "https://app.example.com", "Sec-Fetch-Site": "same-origin" }
    }),
    env
  );
  assert.equal(ok.ok, true);
});

test("credential-admin Worker is private and uses WorkerEntrypoint", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../../worker/credential-admin/index.js", import.meta.url), "utf8")
  );
  assert.match(source, /WorkerEntrypoint/);
  assert.match(source, /workers_dev|async fetch\(\)/);
  assert.match(source, /return new Response\("Not Found", \{ status: 404 \}\)/);
  assert.doesNotMatch(source, /X-Auth-Key/);
  assert.match(source, /getStatus/);
  assert.match(source, /updateEmail/);
  assert.match(source, /removePushover/);
});
