export const API_BASE = "";
export const CREDENTIAL_ADMIN_HEADER = { "X-Sunsethue-Admin": "credentials" };

export const DEFAULT_GET_TIMEOUT_MS = 8_000;
export const DEFAULT_MUTATION_TIMEOUT_MS = 15_000;
export const CREDENTIAL_STATUS_TIMEOUT_MS = 5_000;

function resolveTimeoutMs(path, init = {}) {
  if (typeof init.timeoutMs === "number") return init.timeoutMs;
  const method = (init.method || "GET").toUpperCase();
  if (path.startsWith("/api/provider-credentials") && method === "GET") {
    return CREDENTIAL_STATUS_TIMEOUT_MS;
  }
  return method === "GET" || method === "HEAD" ? DEFAULT_GET_TIMEOUT_MS : DEFAULT_MUTATION_TIMEOUT_MS;
}

async function fetchWithTimeout(path, init = {}) {
  const { timeoutMs: _ignored, ...fetchInit } = init;
  const timeoutMs = resolveTimeoutMs(path, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createApiClient({ readOnly = false } = {}) {
  return {
    async get(path, init) {
      const response = await fetchWithTimeout(path, { ...init, method: "GET" });
      if (!response.ok) throw new Error(`Request failed: ${path}`);
      return response.json();
    },
    async send(path, init = {}) {
      if (readOnly && init?.method && init.method !== "GET") {
        throw new Error("DEMO_READ_ONLY");
      }
      return fetchWithTimeout(path, init);
    }
  };
}

export function createDemoClient(fixtures) {
  async function get(path) {
    if (path.startsWith("/api/notification-health")) return fixtures.notificationHealth;
    if (path.startsWith("/api/setup-status")) return fixtures.setupStatus;
    if (path.startsWith("/api/application-settings")) return fixtures.applicationSettings;
    if (path.startsWith("/api/notification-settings")) return fixtures.notificationSettings;
    if (path.startsWith("/api/locations")) return fixtures.locations;
    if (path.startsWith("/api/runs")) return fixtures.runs;
    if (path.startsWith("/api/notification-deliveries")) return fixtures.deliveries || [];
    if (path.startsWith("/api/location-notification-rules")) return fixtures.rules;
    if (path.startsWith("/api/getApiCredits")) return fixtures.credits;
    if (path.startsWith("/api/provider-credentials")) return fixtures.providerCredentials;
    if (path.startsWith("/api/web-push")) return fixtures.webPush || { devices: [] };
    return {};
  }
  return {
    get,
    async send(path, init) {
      const method = (init?.method || "GET").toUpperCase();
      if (method !== "GET") {
        throw new Error("DEMO_READ_ONLY");
      }
      const data = await get(path);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
}

export function initApi() {
  const DEMO_MODE = new URLSearchParams(window.location.search).has("demo")
    || window.__SUNSETHUE_DEMO__ === true
    || document.documentElement.dataset.demo === "1";
  const DEMO_READ_ONLY = DEMO_MODE;

  const api = DEMO_MODE
    ? createDemoClient(window.__SUNSETHUE_DEMO_FIXTURES__ || {})
    : createApiClient({ readOnly: DEMO_READ_ONLY });

  if (DEMO_MODE) {
    const banner = document.getElementById("demo-banner");
    if (banner) banner.hidden = false;
  }

  return { api, DEMO_MODE, DEMO_READ_ONLY };
}
