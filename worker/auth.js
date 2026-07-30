import { createRemoteJWKSet, jwtVerify, createLocalJWKSet } from "jose";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** @type {Map<string, ReturnType<typeof createRemoteJWKSet>>} */
const remoteJwksCache = new Map();

export class AuthError extends Error {
  /**
   * @param {"UNAUTHENTICATED"|"FORBIDDEN"|"MISCONFIGURED"} code
   * @param {string} message
   * @param {number} status
   */
  constructor(code, message, status) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} hostname
 */
export function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  let host = String(hostname).trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  } else if (host.includes(".") && host.includes(":")) {
    // Strip port from IPv4 host:port
    host = host.split(":")[0];
  }
  return LOOPBACK_HOSTS.has(host);
}

/**
 * @param {string | undefined} flag
 * @param {string | undefined} hostname
 */
export function isDevAuthBypassEnabled(flag, hostname) {
  return String(flag).toLowerCase() === "true" && isLoopbackHostname(hostname);
}

/**
 * @param {string} teamDomain
 */
export function normalizeTeamDomain(teamDomain) {
  if (!teamDomain) return "";
  const trimmed = String(teamDomain).trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * @param {object} options
 * @param {string} options.teamDomain
 * @param {(url: URL) => unknown} [options.createRemoteJWKSetFn]
 * @param {Map<string, unknown>} [options.cache]
 */
export function getRemoteJwks({
  teamDomain,
  createRemoteJWKSetFn = createRemoteJWKSet,
  cache = remoteJwksCache
}) {
  const normalized = normalizeTeamDomain(teamDomain);
  if (!normalized) {
    throw new AuthError(
      "MISCONFIGURED",
      "Authentication is unavailable.",
      401
    );
  }
  const jwksUrl = new URL(`${normalized}/cdn-cgi/access/certs`);
  const key = jwksUrl.toString();
  if (!cache.has(key)) {
    cache.set(key, createRemoteJWKSetFn(jwksUrl));
  }
  return cache.get(key);
}

/**
 * @param {Headers | Record<string, string>} headers
 */
export function readAccessJwt(headers) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(ACCESS_JWT_HEADER) || headers.get("Cf-Access-Jwt-Assertion");
  }
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return lower[ACCESS_JWT_HEADER] || null;
}

/** @type {object | null} */
let authDependencyOverrides = null;

/**
 * Test-only dependency injection for JWT verification.
 * @param {object | null} overrides
 */
export function setAuthDependencies(overrides) {
  authDependencyOverrides = overrides;
}

/**
 * Authenticate and authorize an HTTP request.
 * Authentication and authorization remain separate outcomes.
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} [deps]
 */
export async function authenticateRequest(request, env, deps = {}) {
  const mergedDeps = { ...(authDependencyOverrides || {}), ...deps };
  const url = new URL(request.url);
  const hostname = url.hostname;

  if (isDevAuthBypassEnabled(env.DEV_AUTH_BYPASS, hostname)) {
    return {
      authenticated: true,
      authorized: true,
      email: (env.AUTHORIZED_EMAIL || "dev@localhost").toLowerCase(),
      bypass: true
    };
  }

  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN || env.ACCESS_TEAM_DOMAIN);
  const audience = env.POLICY_AUD || env.ACCESS_AUD || env.ACCESS_POLICY_AUD;
  const authorizedEmail = String(env.AUTHORIZED_EMAIL || "").trim().toLowerCase();

  if (!teamDomain || !audience || !authorizedEmail) {
    throw new AuthError(
      "MISCONFIGURED",
      "Authentication is required.",
      401
    );
  }

  const token = readAccessJwt(request.headers);
  if (!token) {
    throw new AuthError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401
    );
  }

  const jwtVerifyFn = mergedDeps.jwtVerify || jwtVerify;
  const getJwks =
    mergedDeps.getJwks ||
    (() =>
      getRemoteJwks({
        teamDomain,
        createRemoteJWKSetFn: mergedDeps.createRemoteJWKSet || createRemoteJWKSet,
        cache: mergedDeps.cache || remoteJwksCache
      }));

  let payload;
  try {
    const jwks = typeof getJwks === "function" ? await getJwks() : getJwks;
    const verified = await jwtVerifyFn(token, jwks, {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"]
    });
    payload = verified.payload;
  } catch {
    throw new AuthError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401
    );
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  if (!email) {
    throw new AuthError(
      "UNAUTHENTICATED",
      "Authentication is required.",
      401
    );
  }

  if (email !== authorizedEmail) {
    throw new AuthError(
      "FORBIDDEN",
      "You are not authorized to access this resource.",
      403
    );
  }

  return {
    authenticated: true,
    authorized: true,
    email,
    bypass: false
  };
}

/**
 * Test helper: build a local JWKS verifier from an explicit key set.
 * @param {{ keys: object[] }} jwks
 */
export function createTestJwks(jwks) {
  return createLocalJWKSet(jwks);
}

export { ACCESS_JWT_HEADER, createRemoteJWKSet, jwtVerify, createLocalJWKSet };
