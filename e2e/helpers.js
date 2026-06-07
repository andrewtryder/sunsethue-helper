const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const TEST_EMAIL = "atr000@gmail.com";
const TEST_PASSWORD = "test-password-123";

module.exports.TEST_EMAIL = TEST_EMAIL;
module.exports.TEST_PASSWORD = TEST_PASSWORD;
module.exports.PROJECT_ID = "sunsethue-helper-12345";

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
    { timeout: 30_000 }
  );
};

module.exports.login = async function login(page) {
  await module.exports.waitForAppReady(page);
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.locator("#login-form").press("Enter");
  await page.waitForSelector("#app-container:not(.hidden)", { timeout: 20_000 });
  await page.waitForSelector(`#display-user-email:text("${TEST_EMAIL}")`);
};

module.exports.goToTab = async function goToTab(page, tabName) {
  await page.locator(`.nav-tab[data-tab="${tabName}"]`).first().click();
  await page.waitForSelector(`#pane-${tabName}.active`);
};
