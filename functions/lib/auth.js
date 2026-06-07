const AUTHORIZED_EMAIL = "owner@example.com";

function isAuthorizedEmail(email) {
  return email === AUTHORIZED_EMAIL;
}

function parseBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split("Bearer ")[1];
}

module.exports = {
  AUTHORIZED_EMAIL,
  isAuthorizedEmail,
  parseBearerToken
};
