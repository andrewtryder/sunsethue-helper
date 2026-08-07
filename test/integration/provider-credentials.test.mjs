import test from "node:test";
import assert from "node:assert/strict";
import { handleHttpRequest } from "../../worker/api.js";
import { createLocalD1 } from "../support/local-d1.mjs";
import { makeRequest } from "../helpers.mjs";
import { CredentialError } from "../../worker/lib/transport-schema.js";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const AUTH_CONTEXT = { authenticated: true, authorized: true, email: "owner@example.com" };
const WEBAPP_URL = "https://app.example.com";
const SECRET_NEEDLE = "super-secret-app-password-value";

function fakeAdmin(status = {}) {
  return {
    getStatus: async () => ({
      email: {
        configured: false,
        gmailUserMasked: null,
        emailFromMasked: null,
        updatedAt: null,
        lastValidationCode: null,
        ...status.email
      },
      pushover: {
        configured: false,
        updatedAt: null,
        lastValidationCode: null,
        ...status.pushover
      }
    }),
    updateEmail: async (input) => {
      if (input?.gmailAppPassword === SECRET_NEEDLE) {
        return {
          configured: true,
          gmailUserMasked: "o***@example.com",
          emailFromMasked: "Sunsethue <o***@example.com>",
          lastValidationCode: "OK"
        };
      }
      return { configured: true, gmailUserMasked: "o***@example.com", lastValidationCode: "OK" };
    },
    removeEmail: async () => ({ configured: false, gmailUserMasked: null, lastValidationCode: null }),
    updatePushover: async () => ({ configured: true, lastValidationCode: "OK" }),
    removePushover: async () => ({ configured: false, lastValidationCode: null })
  };
}

async function withCredentialsApi(fn, { admin = fakeAdmin(), authContext = AUTH_CONTEXT } = {}) {
  const local = await createLocalD1();
  const env = {
    DB: local.DB,
    WEBAPP_URL,
    CREDENTIAL_ADMIN: admin
  };
  const call = (path, options = {}) =>
    handleHttpRequest(makeRequest(path, options), env, authContext, { now: NOW });
  try {
    return await fn({ call, env });
  } finally {
    local.close();
  }
}

function credentialHeaders({ mutation = false, origin = WEBAPP_URL, site = "same-origin", admin = true } = {}) {
  const headers = {
    Origin: origin,
    "Sec-Fetch-Site": site
  };
  if (mutation && admin) headers["X-Sunsethue-Admin"] = "credentials";
  return headers;
}

test("GET /api/provider-credentials allows same-origin without Origin and never returns secret values", async () => {
  await withCredentialsApi(async ({ call }) => {
    // Same-origin GET often omits Origin; empty Sec-Fetch-Site is allowed.
    const withoutOrigin = await call("/api/provider-credentials");
    assert.equal(withoutOrigin.status, 200);
    assert.equal(withoutOrigin.headers.get("cache-control"), "no-store");

    const ok = await call("/api/provider-credentials", {
      headers: credentialHeaders()
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const body = await ok.json();
    assert.equal(body.email.configured, false);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(SECRET_NEEDLE));
    assert.doesNotMatch(JSON.stringify(body), /CLOUDFLARE_API_TOKEN/);
  });
});

test("credential mutations reject cross-site and missing admin header", async () => {
  await withCredentialsApi(async ({ call }) => {
    const crossSite = await call("/api/provider-credentials/email", {
      method: "PUT",
      headers: credentialHeaders({ mutation: true, site: "cross-site" }),
      body: { gmailUser: "owner@example.com", gmailAppPassword: "abcdefghijklmnop", emailFrom: "owner@example.com" }
    });
    assert.equal(crossSite.status, 403);

    const missingAdmin = await call("/api/provider-credentials/email", {
      method: "PUT",
      headers: credentialHeaders({ mutation: true, admin: false }),
      body: { gmailUser: "owner@example.com", gmailAppPassword: "abcdefghijklmnop", emailFrom: "owner@example.com" }
    });
    assert.equal(missingAdmin.status, 403);
  });
});

test("PUT email proxies to admin Worker and response stays masked", async () => {
  await withCredentialsApi(async ({ call }) => {
    const response = await call("/api/provider-credentials/email", {
      method: "PUT",
      headers: credentialHeaders({ mutation: true }),
      body: {
        gmailUser: "owner@example.com",
        gmailAppPassword: SECRET_NEEDLE,
        emailFrom: "Sunsethue <owner@example.com>"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.email.configured, true);
    assert.equal(body.email.gmailUserMasked, "o***@example.com");
    assert.doesNotMatch(JSON.stringify(body), new RegExp(SECRET_NEEDLE));
  });
});

test("credential routes reject oversized bodies", async () => {
  await withCredentialsApi(async ({ call }) => {
    const response = await call("/api/provider-credentials/email", {
      method: "PUT",
      headers: credentialHeaders({ mutation: true }),
      body: "x".repeat(5000)
    });
    assert.equal(response.status, 413);
  });
});

test("GET provider-credentials serves D1 metadata without CREDENTIAL_ADMIN", async () => {
  await withCredentialsApi(
    async ({ call }) => {
      const response = await call("/api/provider-credentials", {
        headers: credentialHeaders()
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.email.configured, false);
      assert.equal(body.pushover.configured, false);
      assert.doesNotMatch(JSON.stringify(body), new RegExp(SECRET_NEEDLE));
      assert.doesNotMatch(JSON.stringify(body), /CLOUDFLARE_API_TOKEN/);
    },
    { admin: null }
  );
});

test("missing CREDENTIAL_ADMIN binding returns controlled unavailability on mutation", async () => {
  await withCredentialsApi(
    async ({ call }) => {
      const response = await call("/api/provider-credentials/email", {
        method: "PUT",
        headers: credentialHeaders({ mutation: true }),
        body: {
          gmailUser: "owner@example.com",
          gmailAppPassword: "abcdefghijklmnop",
          emailFrom: "owner@example.com"
        }
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.error.code, "CREDENTIAL_ADMIN_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(body), /token|password|secret/i);
    },
    { admin: null }
  );
});

test("DELETE email removes credentials and stays masked", async () => {
  await withCredentialsApi(async ({ call }) => {
    const removed = await call("/api/provider-credentials/email", {
      method: "DELETE",
      headers: credentialHeaders({ mutation: true })
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).email.configured, false);
    assert.equal(removed.headers.get("cache-control"), "no-store");
  });
});

test("PUT and DELETE pushover stay masked", async () => {
  await withCredentialsApi(async ({ call }) => {
    const pushPut = await call("/api/provider-credentials/pushover", {
      method: "PUT",
      headers: credentialHeaders({ mutation: true }),
      body: {
        appToken: "abcdefghijklmnopqrstuvwxyz12",
        userKey: "zyxwvutsrqponmlkjihgfedcba98"
      }
    });
    assert.equal(pushPut.status, 200);
    assert.equal((await pushPut.json()).pushover.configured, true);
  });

  await withCredentialsApi(async ({ call }) => {
    const pushDelete = await call("/api/provider-credentials/pushover", {
      method: "DELETE",
      headers: credentialHeaders({ mutation: true })
    });
    assert.equal(pushDelete.status, 200);
    assert.equal((await pushDelete.json()).pushover.configured, false);
  });
});

test("credential mutations rate-limit and map admin errors", async () => {
  let calls = 0;
  await withCredentialsApi(
    async ({ call }) => {
      const first = await call("/api/provider-credentials/email", {
        method: "PUT",
        headers: credentialHeaders({ mutation: true }),
        body: {
          gmailUser: "owner@example.com",
          gmailAppPassword: "abcdefghijklmnop",
          emailFrom: "owner@example.com"
        }
      });
      assert.equal(first.status, 400);

      const second = await call("/api/provider-credentials/email", {
        method: "PUT",
        headers: credentialHeaders({ mutation: true }),
        body: {
          gmailUser: "owner@example.com",
          gmailAppPassword: "abcdefghijklmnop",
          emailFrom: "owner@example.com"
        }
      });
      assert.equal(second.status, 429);
      assert.equal(calls, 1);
    },
    {
      admin: {
        ...fakeAdmin(),
        updateEmail: async () => {
          calls += 1;
          throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
        }
      }
    }
  );
});
