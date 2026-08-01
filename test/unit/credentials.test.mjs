import test from "node:test";
import assert from "node:assert/strict";
import { resolveEmailTransport } from "../../worker/notifications/resolve-email-transport.js";
import { resolvePushoverTransport } from "../../worker/notifications/resolve-pushover-transport.js";
import { NotificationError } from "../../worker/notifications/errors.js";
import { assertCredentialRequestGuards } from "../../worker/credential-guards.js";

function binding(value) {
  return { get: async () => value };
}

test("email resolver returns Secrets Store credentials when configured", async () => {
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
    // Legacy Worker envs must be ignored — the resolver is Secrets Store only.
    GMAIL_USER: "legacy@example.com",
    GMAIL_APP_PASSWORD: "legacy-password-xx",
    EMAIL_FROM: "legacy@example.com"
  };
  const resolved = await resolveEmailTransport(env);
  assert.equal(resolved.source, "secrets_store");
  assert.equal(resolved.gmailUser, "store@example.com");
});

test("email resolver requires Secrets Store — legacy Worker envs never suffice", async () => {
  const env = {
    EMAIL_TRANSPORT_SECRET: binding(JSON.stringify({ version: 1, configured: false })),
    GMAIL_USER: "legacy@example.com",
    GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    EMAIL_FROM: "legacy@example.com"
  };
  await assert.rejects(
    () => resolveEmailTransport(env),
    (error) => error instanceof NotificationError && error.code === "EMAIL_NOT_CONFIGURED"
  );
});

test("email resolver fails closed when no Secrets Store binding is bound at all", async () => {
  await assert.rejects(
    () => resolveEmailTransport({
      GMAIL_USER: "legacy@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
      EMAIL_FROM: "legacy@example.com"
    }),
    (error) => error instanceof NotificationError && error.code === "EMAIL_NOT_CONFIGURED"
  );
});

test("pushover resolver returns Secrets Store credentials when configured", async () => {
  const env = {
    PUSHOVER_TRANSPORT_SECRET: binding(
      JSON.stringify({
        version: 1,
        configured: true,
        appToken: "abcdefghijklmnopqrstuvwxyz12",
        userKey: "zyxwvutsrqponmlkjihgfedcba98"
      })
    ),
    PUSHOVER_APP_TOKEN: "legacy-app-token",
    PUSHOVER_USER_KEY: "legacy-user-key"
  };
  const resolved = await resolvePushoverTransport(env);
  assert.equal(resolved.source, "secrets_store");
  assert.equal(resolved.appToken, "abcdefghijklmnopqrstuvwxyz12");
});

test("pushover resolver requires Secrets Store — legacy Worker envs never suffice", async () => {
  await assert.rejects(
    () => resolvePushoverTransport({
      PUSHOVER_TRANSPORT_SECRET: binding(JSON.stringify({ version: 1, configured: false })),
      PUSHOVER_APP_TOKEN: "legacy-app-token",
      PUSHOVER_USER_KEY: "legacy-user-key"
    }),
    (error) => error instanceof NotificationError && error.code === "PUSHOVER_NOT_CONFIGURED"
  );
});

test("credential guards reject missing origin, cross-site, and missing admin header", () => {
  const env = { WEBAPP_URL: "https://app.example.com" };

  // Mutations still require Origin.
  const missingOriginMutation = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials/email", { method: "PUT" }),
    env,
    { mutation: true }
  );
  assert.equal(missingOriginMutation.ok, false);
  assert.equal(missingOriginMutation.status, 403);

  // Same-origin GET may omit Origin; Sec-Fetch-Site: same-origin is enough.
  const getWithoutOrigin = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { "Sec-Fetch-Site": "same-origin" }
    }),
    env
  );
  assert.equal(getWithoutOrigin.ok, true);

  const getEmptySite = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials"),
    env
  );
  assert.equal(getEmptySite.ok, true);

  const getCrossSiteNoOrigin = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { "Sec-Fetch-Site": "cross-site" }
    }),
    env
  );
  assert.equal(getCrossSiteNoOrigin.ok, false);

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
