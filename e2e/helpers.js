const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const TEST_EMAIL = "atr000@gmail.com";
const TEST_PASSWORD = "test-password-123";
const LOGIN_TIMEOUT_MS = process.env.CI ? 60_000 : 20_000;

module.exports.TEST_EMAIL = TEST_EMAIL;
module.exports.TEST_PASSWORD = TEST_PASSWORD;
module.exports.PROJECT_ID = "sunsethue-helper-12345";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAuthUser() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
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
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }

    await sleep(1000 * (attempt + 1));
  }

  throw new Error("Failed to seed Auth emulator user after multiple attempts");
}

module.exports.clearFirestoreEmulator = async function clearFirestoreEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  await fetch(
    `http://${host}/emulator/v1/projects/${module.exports.PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
};

module.exports.waitForAppReady = async function waitForAppReady(page) {
  await page.goto("/");
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById("loading-overlay");
      return overlay && overlay.classList.contains("fade-out");
    },
    { timeout: process.env.CI ? 60_000 : 30_000 }
  );
};

module.exports.login = async function login(page) {
  await ensureAuthUser();
  await module.exports.waitForAppReady(page);
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.locator("#login-btn").click();

  const appVisible = page.waitForSelector("#app-container:not(.hidden)", { timeout: LOGIN_TIMEOUT_MS });
  const authError = page.waitForSelector("#auth-error-banner", { state: "visible", timeout: LOGIN_TIMEOUT_MS })
    .then(async () => {
      const message = await page.locator("#auth-error-banner").textContent();
      throw new Error(`Login failed: ${message?.trim() || "unknown auth error"}`);
    });

  await Promise.race([appVisible, authError]);
  await page.waitForSelector(`#display-user-email:text("${TEST_EMAIL}")`, { timeout: LOGIN_TIMEOUT_MS });
};

module.exports.goToTab = async function goToTab(page, tabName) {
  await page.locator(`.nav-tab[data-tab="${tabName}"]`).first().click();
  await page.waitForSelector(`#pane-${tabName}.active`);
};
