import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailTransportDocument,
  buildPushoverTransportDocument,
  CredentialError,
  parseEmailTransport,
  parseMailbox,
  parsePushoverTransport,
  parseTransportJson,
  unconfiguredSentinel,
  EMAIL_FIELDS
} from "../../worker/lib/transport-schema.js";
import {
  emailStatusFromTransport,
  maskEmail,
  maskMailbox,
  pushoverStatusFromTransport
} from "../../worker/lib/masking.js";
import { assertScopedApiToken, SENTINEL_VALUE } from "../../scripts/lib/secrets-store.mjs";
import { readJsonBodyLimited } from "../../worker/credential-body.js";
import { assertCredentialRequestGuards, allowedOrigins } from "../../worker/credential-guards.js";
import {
  adminGetStatus,
  adminRemoveEmail,
  adminRemovePushover,
  adminUpdateEmail,
  adminUpdatePushover,
  CredentialAdminProxyError,
  getCredentialAdmin
} from "../../worker/credential-admin-proxy.js";
import { resolveEmailTransport, emailTransportSource } from "../../worker/notifications/resolve-email-transport.js";
import { resolvePushoverTransport, pushoverTransportSource } from "../../worker/notifications/resolve-pushover-transport.js";
import { NotificationError } from "../../worker/notifications/errors.js";

function binding(value) {
  return { get: async () => value };
}

function failingBinding() {
  return {
    get: async () => {
      throw new Error("binding failed");
    }
  };
}

test("email transport requires configured fields and rejects unknown keys", () => {
  assert.throws(
    () =>
      parseEmailTransport(
        JSON.stringify({
          version: 1,
          configured: true,
          gmailUser: "a@example.com",
          gmailAppPassword: "abcdefghijklmnop",
          emailFrom: "a@example.com",
          extra: 1
        })
      ),
    (error) => error instanceof CredentialError
  );
  const doc = buildEmailTransportDocument({
    gmailUser: "owner@example.com",
    gmailAppPassword: "abcdefghijklmnop",
    emailFrom: "Sunsethue Helper <owner@example.com>"
  });
  assert.equal(doc.document.gmailUser, "owner@example.com");
  assert.ok(doc.serialized.length <= 1024);
});

test("email transport rejects CR/LF and whitespace in app password", () => {
  assert.throws(
    () =>
      buildEmailTransportDocument({
        gmailUser: "owner@example.com",
        gmailAppPassword: "abcd efghijklmno",
        emailFrom: "owner@example.com"
      }),
    (error) => error.code === "INVALID_EMAIL_CREDENTIALS"
  );
  assert.throws(
    () =>
      buildEmailTransportDocument({
        gmailUser: "owner@example.com",
        gmailAppPassword: "abcdefghijklmnop\n",
        emailFrom: "owner@example.com"
      }),
    (error) => error.code === "INVALID_EMAIL_CREDENTIALS"
  );
});

test("pushover transport requires both credentials within conservative limits", () => {
  assert.throws(
    () => buildPushoverTransportDocument({ appToken: "short", userKey: "abcdefghijklmnopqrstuvwxyz12" }),
    (error) => error.code === "INVALID_PUSHOVER_CREDENTIALS"
  );
  const doc = buildPushoverTransportDocument({
    appToken: "abcdefghijklmnopqrstuvwxyz12",
    userKey: "zyxwvutsrqponmlkjihgfedcba98"
  });
  assert.equal(doc.document.configured, true);
  const parsed = parsePushoverTransport(doc.serialized);
  assert.equal(parsed.configured, true);
});

test("unconfigured sentinel and masking never expose full secrets", () => {
  assert.equal(unconfiguredSentinel().serialized, SENTINEL_VALUE);
  assert.equal(maskEmail("owner@example.com"), "ow***@example.com");
  assert.equal(maskEmail("not-an-email"), "***");
  assert.equal(maskEmail("ab@example.com"), "a***@example.com");
  assert.match(maskMailbox("Sunsethue Helper <owner@example.com>"), /Su\*\*\*.*ow\*\*\*@example\.com/);
  assert.equal(maskMailbox("owner@example.com"), "ow***@example.com");
  assert.equal(maskMailbox(null), "***");
  const emailStatus = emailStatusFromTransport({
    configured: true,
    gmailUser: "owner@example.com",
    emailFrom: "Sunsethue Helper <owner@example.com>"
  });
  assert.equal(emailStatus.configured, true);
  assert.doesNotMatch(JSON.stringify(emailStatus), /abcdefgh/);
  assert.equal(emailStatusFromTransport({ configured: false }).configured, false);
  const pushStatus = pushoverStatusFromTransport({ configured: true, appToken: "x", userKey: "y" });
  assert.equal(pushStatus.appTokenPresent, true);
  assert.equal(pushStatus.userKeyPresent, true);
  assert.equal(pushoverStatusFromTransport({ configured: false }).configured, false);
});

test("parseTransportJson rejects missing, invalid, and wrong-version payloads", () => {
  assert.throws(() => parseTransportJson(null, EMAIL_FIELDS), (e) => e.code === "SECRETS_STORE_SECRET_MISSING");
  assert.throws(() => parseTransportJson("{", EMAIL_FIELDS), (e) => e.code === "SECRETS_STORE_SECRET_MISSING");
  assert.throws(() => parseTransportJson("[]", EMAIL_FIELDS), (e) => e.code === "SECRETS_STORE_SECRET_MISSING");
  assert.throws(
    () => parseTransportJson(JSON.stringify({ version: 2, configured: false }), EMAIL_FIELDS),
    (e) => e.code === "INVALID_EMAIL_CREDENTIALS"
  );
  assert.throws(
    () => parseTransportJson(JSON.stringify({ version: 1, configured: "yes" }), EMAIL_FIELDS),
    (e) => e.code === "INVALID_EMAIL_CREDENTIALS"
  );
});

test("parseMailbox and configured email transport reject bad mailboxes", () => {
  assert.throws(() => parseMailbox("Name <bad>\n"), (e) => e.code === "INVALID_EMAIL_CREDENTIALS");
  assert.throws(() => parseMailbox("<owner@example.com>"), (e) => e.code === "INVALID_EMAIL_CREDENTIALS");
  assert.throws(() => parseMailbox("Name <not-email>"), (e) => e.code === "INVALID_EMAIL_CREDENTIALS");
  assert.throws(
    () =>
      parseEmailTransport(
        JSON.stringify({
          version: 1,
          configured: true,
          gmailUser: "not-email",
          gmailAppPassword: "abcdefghijklmnop",
          emailFrom: "owner@example.com"
        })
      ),
    (e) => e.code === "INVALID_EMAIL_CREDENTIALS"
  );
  assert.throws(
    () =>
      parsePushoverTransport(
        JSON.stringify({
          version: 1,
          configured: true,
          appToken: "abcdefghijklmnopqrstuvwxyz12",
          userKey: "short"
        })
      ),
    (e) => e.code === "INVALID_PUSHOVER_CREDENTIALS"
  );
});

test("assertScopedApiToken rejects Global API Key env patterns", () => {
  const previous = {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY,
    CF_API_KEY: process.env.CF_API_KEY
  };
  try {
    process.env.CLOUDFLARE_API_TOKEN = "scoped-token-value-with-enough-length";
    delete process.env.CLOUDFLARE_API_KEY;
    delete process.env.CF_API_KEY;
    assert.equal(assertScopedApiToken(), "scoped-token-value-with-enough-length");
    process.env.CLOUDFLARE_API_KEY = "global-key";
    assert.throws(() => assertScopedApiToken(), /Global API Key/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("parseEmailTransport accepts sentinel as unconfigured", () => {
  const parsed = parseEmailTransport(SENTINEL_VALUE);
  assert.deepEqual(parsed, { version: 1, configured: false });
});

test("readJsonBodyLimited enforces content type and size", async () => {
  const wrongType = await readJsonBodyLimited(
    new Request("https://example.test", { method: "PUT", body: "{}", headers: { "content-type": "text/plain" } }),
    100
  );
  assert.deepEqual(wrongType, { error: "UNSUPPORTED_MEDIA_TYPE" });

  const declaredLarge = await readJsonBodyLimited(
    new Request("https://example.test", {
      method: "PUT",
      body: "{}",
      headers: { "content-type": "application/json", "content-length": "9999" }
    }),
    100
  );
  assert.deepEqual(declaredLarge, { error: "PAYLOAD_TOO_LARGE" });

  const invalid = await readJsonBodyLimited(
    new Request("https://example.test", {
      method: "PUT",
      body: "{",
      headers: { "content-type": "application/json" }
    }),
    100
  );
  assert.deepEqual(invalid, { error: "BAD_REQUEST" });
});

test("credential guards reject unconfigured and mismatched origins", () => {
  assert.equal(allowedOrigins({}).size, 0);
  const unconfigured = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { Origin: "https://app.example.com" }
    }),
    {}
  );
  assert.equal(unconfigured.ok, false);

  const mismatch = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { Origin: "https://evil.example.com", "Sec-Fetch-Site": "same-origin" }
    }),
    { WEBAPP_URL: "https://app.example.com" }
  );
  assert.equal(mismatch.ok, false);

  const badOrigin = assertCredentialRequestGuards(
    new Request("https://worker.example/api/provider-credentials", {
      headers: { Origin: "not-a-url", "Sec-Fetch-Site": "same-origin" }
    }),
    { WEBAPP_URL: "https://app.example.com" }
  );
  assert.equal(badOrigin.ok, false);
});

test("credential-admin proxy maps errors and invokes RPC methods", async () => {
  assert.throws(() => getCredentialAdmin({}), (e) => e instanceof CredentialAdminProxyError);

  const admin = {
    getStatus: async () => ({ email: { configured: false }, pushover: { configured: false } }),
    updateEmail: async () => ({ configured: true }),
    removeEmail: async () => ({ configured: false }),
    updatePushover: async () => ({ configured: true }),
    removePushover: async () => ({ configured: false })
  };
  const env = { CREDENTIAL_ADMIN: admin };
  assert.deepEqual(await adminGetStatus(env, {}), await admin.getStatus());
  assert.equal((await adminUpdateEmail(env, {}, {})).configured, true);
  assert.equal((await adminRemoveEmail(env, {})).configured, false);
  assert.equal((await adminUpdatePushover(env, {}, {})).configured, true);
  assert.equal((await adminRemovePushover(env, {})).configured, false);

  const failing = {
    CREDENTIAL_ADMIN: {
      updateEmail: async () => {
        throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
      },
      removeEmail: async () => {
        throw new CredentialError("CREDENTIAL_UPDATE_FORBIDDEN");
      },
      updatePushover: async () => {
        throw new CredentialError("SECRETS_STORE_SECRET_MISSING");
      },
      getStatus: async () => {
        throw new Error("boom");
      }
    }
  };
  await assert.rejects(() => adminUpdateEmail(failing, {}, {}), (e) => e.code === "INVALID_EMAIL_CREDENTIALS" && e.status === 400);
  await assert.rejects(() => adminRemoveEmail(failing, {}), (e) => e.code === "CREDENTIAL_UPDATE_FORBIDDEN" && e.status === 403);
  await assert.rejects(() => adminUpdatePushover(failing, {}, {}), (e) => e.code === "SECRETS_STORE_SECRET_MISSING" && e.status === 409);
  await assert.rejects(() => adminGetStatus(failing, {}), (e) => e.code === "CREDENTIAL_ADMIN_UNAVAILABLE" && e.status === 503);
});

test("resolvers handle binding failures and invalid store documents", async () => {
  assert.equal(await emailTransportSource({ EMAIL_TRANSPORT_SECRET: failingBinding() }), "not_configured");
  assert.equal(await pushoverTransportSource({ PUSHOVER_TRANSPORT_SECRET: failingBinding() }), "not_configured");

  await assert.rejects(
    () =>
      resolveEmailTransport({
        EMAIL_TRANSPORT_SECRET: binding(
          JSON.stringify({
            version: 1,
            configured: true,
            gmailUser: "bad",
            gmailAppPassword: "abcdefghijklmnop",
            emailFrom: "owner@example.com"
          })
        )
      }),
    (error) => error instanceof NotificationError && error.code === "EMAIL_NOT_CONFIGURED"
  );

  const push = await resolvePushoverTransport({
    PUSHOVER_TRANSPORT_SECRET: binding(
      JSON.stringify({
        version: 1,
        configured: true,
        appToken: "abcdefghijklmnopqrstuvwxyz12",
        userKey: "zyxwvutsrqponmlkjihgfedcba98"
      })
    )
  });
  assert.equal(push.source, "secrets_store");

  await assert.rejects(
    () =>
      resolvePushoverTransport({
        PUSHOVER_TRANSPORT_SECRET: binding(
          JSON.stringify({
            version: 1,
            configured: true,
            appToken: "bad token",
            userKey: "zyxwvutsrqponmlkjihgfedcba98"
          })
        )
      }),
    (error) => error instanceof NotificationError && error.code === "PUSHOVER_NOT_CONFIGURED"
  );
});
