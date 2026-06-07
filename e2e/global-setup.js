module.exports = async function globalSetup() {
  const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const TEST_EMAIL = "atr000@gmail.com";
  const TEST_PASSWORD = "test-password-123";

  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        returnSecureToken: true
      })
    }
  );

  if (response.ok) {
    return;
  }

  const payload = await response.json().catch(() => ({}));
  const message = payload?.error?.message || "";

  if (message.includes("EMAIL_EXISTS")) {
    return;
  }

  throw new Error(`Failed to seed Auth emulator user: ${message || response.statusText}`);
};
