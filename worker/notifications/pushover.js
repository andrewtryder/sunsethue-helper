import { NotificationError } from "./errors.js";
import { buildPushoverContent, parseNotificationPayload } from "./payload.js";

const PUSHOVER_URL = "https://api.pushover.net/1/messages.json";
const PUSHOVER_TIMEOUT_MS = 10_000;

export async function sendPushover(job, env, deps = {}) {
  if (!env.PUSHOVER_APP_TOKEN || !env.PUSHOVER_USER_KEY) throw new NotificationError("PUSHOVER_NOT_CONFIGURED");
  const payload = parseNotificationPayload(job.payload);
  const { title, message } = buildPushoverContent(payload);
  // Prefer the delivery-time snapshot columns over live settings.
  const priority = job.deliveryPushoverPriority ?? job.settings?.pushoverPriority ?? 0;
  const device = job.deliveryPushoverDevice ?? job.settings?.pushoverDevice ?? null;
  const sound = job.deliveryPushoverSound ?? job.settings?.pushoverSound ?? null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSHOVER_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ token: env.PUSHOVER_APP_TOKEN, user: env.PUSHOVER_USER_KEY, title, message, priority: String(priority), timestamp: String(Math.floor(payload.generatedAt / 1000)) });
    if (device) body.set("device", device);
    if (sound) body.set("sound", sound);
    if (payload.dashboardUrl) {
      const url = new URL(payload.dashboardUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new NotificationError("INVALID_DASHBOARD_URL");
      body.set("url", url.toString().slice(0, 512)); body.set("url_title", "Open Sunsethue Helper");
    }
    const response = await (deps.fetch || fetch)(PUSHOVER_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: controller.signal });
    let responseBody = null;
    try { responseBody = await response.json(); } catch { responseBody = null; }
    if (response.ok && responseBody?.status === 1) return { providerMessageId: String(responseBody.request || response.headers.get("x-request-id") || "").slice(0, 128) || null };
    if (response.status === 429 || response.status >= 500) throw new NotificationError("PUSHOVER_RETRYABLE", { retryable: true });
    throw new NotificationError("PUSHOVER_REJECTED");
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    if (error?.name === "AbortError") throw new NotificationError("PUSHOVER_TIMEOUT", { retryable: true });
    throw new NotificationError("PUSHOVER_UNAVAILABLE", { retryable: true });
  } finally { clearTimeout(timeout); }
}
