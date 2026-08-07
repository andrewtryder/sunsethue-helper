import { NotificationError } from "./errors.js";
import {
  assertSafeWebhookUrl,
  maskWebhookHostname,
  parseWebhookTransport,
  signWebhookBody
} from "./resolve-webhook-transport.js";
import * as db from "../db.js";

const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2048;

export async function hasWebhookTransportAsync(env) {
  try {
    const transport = await resolveWebhookTransport(env);
    return Boolean(transport?.configured);
  } catch {
    return false;
  }
}

async function resolveWebhookTransport(env) {
  if (!env.WEBHOOK_TRANSPORT_SECRET || typeof env.WEBHOOK_TRANSPORT_SECRET.get !== "function") {
    return { version: 1, configured: false };
  }
  const raw = await env.WEBHOOK_TRANSPORT_SECRET.get();
  return parseWebhookTransport(raw);
}

/**
 * Build the public webhook JSON body for a forecast notification.
 */
export function buildWebhookPayload(job, deliveryId, generatedAtIso) {
  let parsed;
  try {
    parsed = JSON.parse(job.payload);
  } catch {
    throw new NotificationError("INVALID_NOTIFICATION_PAYLOAD", { retryable: false });
  }
  return {
    version: 1,
    event: "forecast.notification",
    deliveryId,
    generatedAt: generatedAtIso,
    triggerType: parsed.triggerType,
    locations: (parsed.locations || []).map((loc) => ({
      id: loc.id || null,
      name: loc.name,
      triggeredEvents: loc.triggeredEvents || [],
      sunrise: loc.sunrise
        ? { time: loc.sunrise.time, quality: loc.sunrise.quality != null ? Math.round(Number(loc.sunrise.quality) * (loc.sunrise.quality <= 1 ? 100 : 1)) : null }
        : null,
      sunset: loc.sunset
        ? { time: loc.sunset.time, quality: loc.sunset.quality != null ? Math.round(Number(loc.sunset.quality) * (loc.sunset.quality <= 1 ? 100 : 1)) : null }
        : null
    }))
  };
}

function classifyWebhookStatus(status) {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return { ok: false, retryable: true, code: "WEBHOOK_RETRYABLE" };
  }
  return { ok: false, retryable: false, code: "WEBHOOK_TERMINAL" };
}

export async function sendWebhook(job, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const transport = await resolveWebhookTransport(env);
  if (!transport.configured) {
    throw new NotificationError("WEBHOOK_NOT_CONFIGURED", { retryable: false });
  }
  assertSafeWebhookUrl(transport.url);

  const deliveryId = job.id;
  const timestamp = Math.floor((deps.now ?? Date.now()) / 1000);
  const bodyObj = buildWebhookPayload(job, deliveryId, new Date((deps.now ?? Date.now())).toISOString());
  const rawBody = JSON.stringify(bodyObj);
  const signature = await signWebhookBody(transport.signingSecret, timestamp, rawBody);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(transport.url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Sunsethue-Event": "forecast.notification",
        "X-Sunsethue-Delivery": deliveryId,
        "X-Sunsethue-Timestamp": String(timestamp),
        "X-Sunsethue-Signature": `v1=${signature}`
      },
      body: rawBody
    });
  } catch (error) {
    throw new NotificationError("WEBHOOK_NETWORK", { retryable: true, cause: error });
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new NotificationError("WEBHOOK_REDIRECT", { retryable: false });
  }

  try {
    const reader = response.body?.getReader?.();
    if (reader) {
      let read = 0;
      while (read < MAX_RESPONSE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value?.byteLength || 0;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    }
  } catch { /* ignore body read limits */ }

  const classification = classifyWebhookStatus(response.status);
  const now = deps.now ?? Date.now();
  const settingsRow = await db.getNotificationSettingsRow(env);
  if (settingsRow) {
    if (classification.ok) {
      await db.upsertNotificationSettings(env, {
        ...settingsRow,
        webhookMaskedHostname: maskWebhookHostname(transport.url),
        webhookLastSuccessAt: now,
        webhookLastFailureCode: null,
        updatedAt: now
      });
    } else {
      await db.upsertNotificationSettings(env, {
        ...settingsRow,
        webhookMaskedHostname: maskWebhookHostname(transport.url),
        webhookLastFailureCode: classification.code,
        updatedAt: now
      });
    }
  }

  if (!classification.ok) {
    const error = new NotificationError(classification.code, { retryable: classification.retryable });
    error.detail = `HTTP ${response.status}`;
    throw error;
  }
  return { providerMessageId: deliveryId };
}
