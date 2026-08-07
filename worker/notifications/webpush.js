import { SignJWT, importPKCS8 } from "jose";
import {
  getWebPushSubscription,
  upsertWebPushSubscription,
  updateWebPushSubscriptionMeta
} from "../repositories/webpush.js";
import { NotificationError } from "./errors.js";
import { buildPushoverContent, parseNotificationPayload } from "./payload.js";

/**
 * Resolve VAPID public configuration from Worker env (non-secret) and private key
 * from Secrets Store binding WEB_PUSH_VAPID_PRIVATE when available.
 */
export async function resolveWebPushConfig(env) {
  const publicKey = typeof env.WEB_PUSH_VAPID_PUBLIC_KEY === "string"
    ? env.WEB_PUSH_VAPID_PUBLIC_KEY.trim()
    : "";
  const subject = typeof env.WEB_PUSH_SUBJECT === "string"
    ? env.WEB_PUSH_SUBJECT.trim()
    : "";
  let privateKeyPem = "";
  if (env.WEB_PUSH_VAPID_PRIVATE && typeof env.WEB_PUSH_VAPID_PRIVATE.get === "function") {
    try {
      const raw = await env.WEB_PUSH_VAPID_PRIVATE.get();
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        privateKeyPem = typeof parsed.privateKey === "string" ? parsed.privateKey : "";
      }
    } catch {
      privateKeyPem = "";
    }
  } else if (typeof env.WEB_PUSH_VAPID_PRIVATE_KEY === "string") {
    // Local/test secret fallback (never commit real values).
    privateKeyPem = env.WEB_PUSH_VAPID_PRIVATE_KEY;
  }
  return {
    configured: Boolean(publicKey && subject && privateKeyPem),
    publicKey,
    subject,
    privateKeyPem
  };
}

export async function hasWebPushConfiguredAsync(env) {
  const cfg = await resolveWebPushConfig(env);
  return cfg.configured;
}

function summarizeUserAgent(ua) {
  if (typeof ua !== "string" || !ua) return null;
  return ua.slice(0, 120);
}

export function publicVapidConfig(env) {
  const publicKey = typeof env.WEB_PUSH_VAPID_PUBLIC_KEY === "string"
    ? env.WEB_PUSH_VAPID_PUBLIC_KEY.trim()
    : "";
  return {
    configured: publicKey.length > 0,
    publicKey: publicKey || null
  };
}

/**
 * Register or refresh a push subscription. Never returns endpoint/keys.
 */
export async function registerWebPushSubscription(env, input, requestMeta = {}, now = Date.now()) {
  if (!input || typeof input !== "object") throw new NotificationError("INVALID_PUSH_SUBSCRIPTION", { retryable: false });
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input.keys?.auth === "string" ? input.keys.auth : "";
  const deviceName = typeof input.deviceName === "string" ? input.deviceName.trim().slice(0, 64) : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
    throw new NotificationError("INVALID_PUSH_ENDPOINT", { retryable: false });
  }
  if (!p256dh || !auth || p256dh.length > 256 || auth.length > 256) {
    throw new NotificationError("INVALID_PUSH_KEYS", { retryable: false });
  }
  if (!deviceName) throw new NotificationError("INVALID_DEVICE_NAME", { retryable: false });

  const existing = await env.DB.prepare(
    "SELECT id FROM web_push_subscriptions WHERE endpoint = ?"
  ).bind(endpoint).first();
  const id = existing?.id || crypto.randomUUID();
  await upsertWebPushSubscription(env, {
    id,
    endpoint,
    p256dh,
    auth,
    deviceName,
    userAgentSummary: summarizeUserAgent(requestMeta.userAgent),
    enabled: true,
    createdAt: now,
    lastSeenAt: now
  });
  return { id, deviceName, enabled: true };
}

async function buildVapidAuthHeader(endpoint, cfg) {
  const audience = new URL(endpoint).origin;
  const key = await importPKCS8(cfg.privateKeyPem, "ES256");
  const jwt = await new SignJWT({ aud: audience, sub: cfg.subject })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setExpirationTime("12h")
    .sign(key);
  return `vapid t=${jwt}, k=${cfg.publicKey}`;
}

/**
 * Payload-less Web Push with VAPID. Service worker shows a generic forecast notice.
 * deps.sendWebPush may override for tests.
 */
export async function sendWebPush(job, env, deps = {}) {
  if (typeof deps.sendWebPush === "function") {
    return deps.sendWebPush(job, env, deps);
  }
  const cfg = await resolveWebPushConfig(env);
  if (!cfg.configured) throw new NotificationError("WEB_PUSH_NOT_CONFIGURED", { retryable: false });

  const subId = job.deliveryTargetId;
  if (!subId) throw new NotificationError("WEB_PUSH_TARGET_MISSING", { retryable: false });
  const sub = await getWebPushSubscription(env, subId);
  if (!sub || Number(sub.enabled) !== 1) {
    throw new NotificationError("WEB_PUSH_SUBSCRIPTION_DISABLED", { retryable: false });
  }

  const fetchImpl = deps.fetch || fetch;
  const authorization = await buildVapidAuthHeader(sub.endpoint, cfg);
  let response;
  try {
    response = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        TTL: "86400",
        Urgency: "normal"
      }
    });
  } catch {
    throw new NotificationError("WEB_PUSH_NETWORK", { retryable: true });
  }

  const now = deps.now ?? Date.now();
  if (response.status === 404 || response.status === 410) {
    await updateWebPushSubscriptionMeta(env, subId, {
      enabled: false,
      lastFailureCode: "WEB_PUSH_GONE",
      lastSeenAt: now
    });
    throw new NotificationError("WEB_PUSH_GONE", { retryable: false });
  }
  if (response.status === 401 || response.status === 403) {
    await updateWebPushSubscriptionMeta(env, subId, {
      enabled: false,
      lastFailureCode: "WEB_PUSH_REVOKED",
      lastSeenAt: now
    });
    throw new NotificationError("WEB_PUSH_REVOKED", { retryable: false });
  }
  if (response.status === 429 || response.status >= 500) {
    await updateWebPushSubscriptionMeta(env, subId, {
      lastFailureCode: "WEB_PUSH_RETRYABLE",
      lastSeenAt: now
    });
    throw new NotificationError("WEB_PUSH_RETRYABLE", { retryable: true });
  }
  if (response.status < 200 || response.status >= 300) {
    await updateWebPushSubscriptionMeta(env, subId, {
      lastFailureCode: "WEB_PUSH_TERMINAL",
      lastSeenAt: now
    });
    throw new NotificationError("WEB_PUSH_TERMINAL", { retryable: false });
  }

  await updateWebPushSubscriptionMeta(env, subId, {
    lastSuccessAt: now,
    lastFailureCode: null,
    lastSeenAt: now
  });

  // Optional: parse payload for logging-safe title (not sent in payload-less mode).
  try {
    const parsed = parseNotificationPayload(job.payload);
    buildPushoverContent(parsed);
  } catch { /* ignore */ }

  return { providerMessageId: subId };
}
