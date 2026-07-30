import { generateKeyPair, exportJWK, SignJWT } from "jose";

export const TEAM_DOMAIN = "https://example.cloudflareaccess.com";
export const POLICY_AUD = "test-audience-tag";
export const AUTHORIZED_EMAIL = "owner@example.com";
export const OTHER_EMAIL = "other@example.com";

let cachedKeys = null;

export async function getTestKeys() {
  if (cachedKeys) return cachedKeys;
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  publicJwk.kid = "test-key-1";
  cachedKeys = { privateKey, publicKey, publicJwk };
  return cachedKeys;
}

export async function createAccessToken(claims = {}, options = {}) {
  const { privateKey, publicJwk } = await getTestKeys();
  const {
    audience = POLICY_AUD,
    issuer = TEAM_DOMAIN,
    expiresIn = "1h",
    notBefore,
    kid = publicJwk.kid
  } = options;

  let builder = new SignJWT({
    email: AUTHORIZED_EMAIL,
    ...claims
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn);

  if (notBefore) {
    builder = builder.setNotBefore(notBefore);
  }

  return builder.sign(privateKey);
}

export async function createForeignKeyToken(claims = {}) {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return new SignJWT({
    email: AUTHORIZED_EMAIL,
    ...claims
  })
    .setProtectedHeader({ alg: "RS256", kid: "foreign-key" })
    .setIssuedAt()
    .setIssuer(TEAM_DOMAIN)
    .setAudience(POLICY_AUD)
    .setExpirationTime("1h")
    .sign(privateKey);
}

export async function getLocalJwks() {
  const { publicJwk } = await getTestKeys();
  return { keys: [publicJwk] };
}

export function baseEnv(overrides = {}) {
  return {
    TEAM_DOMAIN,
    POLICY_AUD,
    AUTHORIZED_EMAIL,
    DEV_AUTH_BYPASS: "false",
    ...overrides
  };
}

export function makeRequest(path, { method = "GET", headers = {}, body, host = "sunsethue-helper.pages.dev" } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!init.headers.has("content-type")) {
      init.headers.set("content-type", "application/json");
    }
  }
  return new Request(`https://${host}${path}`, init);
}
