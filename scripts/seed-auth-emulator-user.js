#!/usr/bin/env node

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const TEST_EMAIL = "e2e-test@gmail.com";
const TEST_PASSWORD = "test-password-123";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedAuthUser() {
  const signUpResponse = await fetch(
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

  if (!signUpResponse.ok) {
    const payload = await signUpResponse.json().catch(() => ({}));
    const message = payload?.error?.message || signUpResponse.statusText;
    if (!message.includes("EMAIL_EXISTS")) {
      throw new Error(`Auth emulator signUp failed: ${message}`);
    }
  }

  const signInResponse = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
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

  if (!signInResponse.ok) {
    const payload = await signInResponse.json().catch(() => ({}));
    const message = payload?.error?.message || signInResponse.statusText;
    throw new Error(`Auth emulator signInWithPassword failed: ${message}`);
  }
}

async function main() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await seedAuthUser();
      console.log("Auth emulator test user is ready.");
      return;
    } catch (error) {
      if (attempt === 29) {
        throw error;
      }
      await sleep(1000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
