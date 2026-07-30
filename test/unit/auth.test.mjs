import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateRequest,
  AuthError,
  createTestJwks,
  getRemoteJwks,
  isDevAuthBypassEnabled,
  isLoopbackHostname,
  normalizeTeamDomain,
  readAccessJwt
} from "../../worker/auth.js";
import {
  AUTHORIZED_EMAIL,
  OTHER_EMAIL,
  POLICY_AUD,
  TEAM_DOMAIN,
  baseEnv,
  createAccessToken,
  createForeignKeyToken,
  getLocalJwks,
  makeRequest
} from "../helpers.mjs";

async function authWithLocalJwks(request, env, extraDeps = {}) {
  const jwks = createTestJwks(await getLocalJwks());
  return authenticateRequest(request, env, {
    getJwks: async () => jwks,
    ...extraDeps
  });
}

test("valid token for authorized email succeeds", async () => {
  const token = await createAccessToken();
  const result = await authWithLocalJwks(
    makeRequest("/api/locations", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    baseEnv()
  );
  assert.equal(result.authenticated, true);
  assert.equal(result.authorized, true);
  assert.equal(result.email, AUTHORIZED_EMAIL);
});

test("missing token is unauthenticated", async () => {
  await assert.rejects(
    () => authWithLocalJwks(makeRequest("/api/locations"), baseEnv()),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED" && error.status === 401
  );
});

test("malformed token is unauthenticated", async () => {
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("invalid signature is unauthenticated", async () => {
  const token = await createAccessToken();
  const tampered = `${token.slice(0, -4)}dead`;
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": tampered }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("unknown signing key is unauthenticated", async () => {
  const token = await createForeignKeyToken();
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("wrong issuer is unauthenticated", async () => {
  const token = await createAccessToken({}, { issuer: "https://evil.example" });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("wrong audience is unauthenticated", async () => {
  const token = await createAccessToken({}, { audience: "other-aud" });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("expired token is unauthenticated", async () => {
  const token = await createAccessToken({}, { expiresIn: "-1h" });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("future nbf is unauthenticated", async () => {
  const token = await createAccessToken({}, { notBefore: "2h" });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("missing email claim is unauthenticated", async () => {
  const token = await createAccessToken({ email: "" });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("valid token for another email is forbidden", async () => {
  const token = await createAccessToken({ email: OTHER_EMAIL });
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv()
      ),
    (error) => error instanceof AuthError && error.code === "FORBIDDEN" && error.status === 403
  );
});

test("audience represented as an array is accepted", async () => {
  const token = await createAccessToken({}, { audience: [POLICY_AUD, "extra"] });
  const result = await authWithLocalJwks(
    makeRequest("/api/locations", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    baseEnv()
  );
  assert.equal(result.authorized, true);
});

test("audience represented as a string is accepted", async () => {
  const token = await createAccessToken({}, { audience: POLICY_AUD });
  const result = await authWithLocalJwks(
    makeRequest("/api/locations", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    baseEnv()
  );
  assert.equal(result.authorized, true);
});

test("JWKS retrieval failure is unauthenticated", async () => {
  const token = await createAccessToken();
  await assert.rejects(
    () =>
      authenticateRequest(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        baseEnv(),
        {
          getJwks: async () => {
            throw new Error("jwks boom");
          }
        }
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("missing production configuration fails closed", async () => {
  const token = await createAccessToken();
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: { "Cf-Access-Jwt-Assertion": token }
        }),
        { AUTHORIZED_EMAIL }
      ),
    (error) => error instanceof AuthError && error.code === "MISCONFIGURED" && error.status === 401
  );
});

test("local bypass works only when explicitly enabled on loopback", () => {
  assert.equal(isDevAuthBypassEnabled("true", "localhost"), true);
  assert.equal(isDevAuthBypassEnabled("true", "127.0.0.1"), true);
  assert.equal(isDevAuthBypassEnabled("true", "[::1]"), true);
  assert.equal(isLoopbackHostname("::1"), true);
});

test("local bypass fails on pages.dev workers.dev and public hosts", () => {
  assert.equal(isDevAuthBypassEnabled("true", "app.example.com"), false);
  assert.equal(isDevAuthBypassEnabled("true", "worker.example.workers.dev"), false);
  assert.equal(isDevAuthBypassEnabled("true", "example.com"), false);
  assert.equal(isDevAuthBypassEnabled("false", "localhost"), false);
});

test("local bypass cannot be triggered by a request header alone", async () => {
  await assert.rejects(
    () =>
      authWithLocalJwks(
        makeRequest("/api/locations", {
          headers: {
            "x-dev-auth-bypass": "true",
            "Cf-Access-Jwt-Assertion": "ignored"
          },
          host: "example.com"
        }),
        baseEnv({ DEV_AUTH_BYPASS: "false" })
      ),
    (error) => error instanceof AuthError && error.code === "UNAUTHENTICATED"
  );
});

test("local bypass authenticates on loopback when enabled", async () => {
  const result = await authenticateRequest(
    makeRequest("/api/locations", { host: "127.0.0.1" }),
    baseEnv({ DEV_AUTH_BYPASS: "true" })
  );
  assert.equal(result.bypass, true);
  assert.equal(result.authorized, true);
});

test("loopback detection handles ports, IPv6 brackets, and public hosts", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("LOCALHOST"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("127.0.0.1:8788"), true);
  assert.equal(isLoopbackHostname("[::1]"), true);
  assert.equal(isLoopbackHostname("::1"), true);
  assert.equal(isLoopbackHostname(""), false);
  assert.equal(isLoopbackHostname(null), false);
  assert.equal(isLoopbackHostname("127.0.0.1.evil.example"), false);
  assert.equal(isLoopbackHostname("localhost.evil.example"), false);
});

test("the Access assertion header is read case-insensitively from Headers or a plain object", () => {
  assert.equal(readAccessJwt(new Headers({ "Cf-Access-Jwt-Assertion": "abc" })), "abc");
  assert.equal(readAccessJwt({ "CF-ACCESS-JWT-ASSERTION": "abc" }), "abc");
  assert.equal(readAccessJwt({ "cf-access-jwt-assertion": "abc" }), "abc");
  assert.equal(readAccessJwt({ authorization: "Bearer abc" }), null);
  assert.equal(readAccessJwt(new Headers()), null);
  assert.equal(readAccessJwt(null), null);
});

test("team domain normalization accepts bare, http, and trailing-slash forms", () => {
  assert.equal(normalizeTeamDomain("example.cloudflareaccess.com"), "https://example.cloudflareaccess.com");
  assert.equal(normalizeTeamDomain("https://example.cloudflareaccess.com/"), "https://example.cloudflareaccess.com");
  assert.equal(normalizeTeamDomain("http://localhost:8080"), "http://localhost:8080");
  assert.equal(normalizeTeamDomain(""), "");
  assert.equal(normalizeTeamDomain(undefined), "");
});

test("the remote JWKS verifier is created once per team domain and cached", () => {
  const cache = new Map();
  const created = [];
  const createRemoteJWKSetFn = (url) => {
    created.push(url.toString());
    return { url: url.toString() };
  };

  const first = getRemoteJwks({ teamDomain: "example.cloudflareaccess.com", createRemoteJWKSetFn, cache });
  const second = getRemoteJwks({ teamDomain: "example.cloudflareaccess.com", createRemoteJWKSetFn, cache });

  assert.equal(first, second, "keys must be reused across requests");
  assert.deepEqual(created, ["https://example.cloudflareaccess.com/cdn-cgi/access/certs"]);
});

test("an absent team domain makes the JWKS verifier fail closed", () => {
  assert.throws(
    () => getRemoteJwks({ teamDomain: "", cache: new Map() }),
    (error) => error instanceof AuthError && error.code === "MISCONFIGURED"
  );
});

test("issuer helper normalizes bare team domains", async () => {
  const token = await createAccessToken();
  const result = await authWithLocalJwks(
    makeRequest("/api/locations", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    baseEnv({ TEAM_DOMAIN: "example.cloudflareaccess.com" })
  );
  assert.equal(result.authorized, true);
  assert.equal(TEAM_DOMAIN.startsWith("https://"), true);
});
