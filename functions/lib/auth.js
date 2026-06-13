const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || process.env.EMAIL_TO || "owner@example.com";

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
