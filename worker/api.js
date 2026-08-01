import { fetchApiCredits } from "./sunsethue.js";
import { enqueueNotifications, runAndSendReport } from "./report.js";
import * as db from "./db.js";
import { dispatchPendingNotifications } from "./notifications/dispatcher.js";
import { NotificationError } from "./notifications/errors.js";
import {
  getSettings,
  hasEmailTransportAsync,
  hasPushoverTransportAsync,
  publicSettings,
  saveSettings
} from "./notifications/settings.js";
import {
  getApplicationSettings,
  saveApplicationSettings,
  estimateForecastQuota
} from "./notifications/application-settings.js";
import { listRules, saveRule } from "./notifications/rules.js";
import {
  publicVapidConfig,
  registerWebPushSubscription
} from "./notifications/webpush.js";
import { hasWebhookTransportAsync } from "./notifications/webhook.js";
import {
  buildWebhookTransportDocument,
  maskWebhookHostname
} from "./notifications/resolve-webhook-transport.js";
import { CredentialError } from "./lib/transport-schema.js";
import { emailTransportSource } from "./notifications/resolve-email-transport.js";
import { pushoverTransportSource } from "./notifications/resolve-pushover-transport.js";
import { getNotificationHealth } from "./notifications/health.js";
import {
  clearHistory,
  countHistoryScopes,
  exportHistory,
  parseHistoryScopes
} from "./notifications/history.js";
import {
  createRequestId,
  jsonResponse,
  errorResponse,
  methodNotAllowed,
  logSafe
} from "./http.js";
import {
  isUuid,
  readJsonBody,
  rejectUnknownFields,
  validateCoordinates,
  validateLocationName,
  validateSearchQuery
} from "./validation.js";
import { assertCredentialRequestGuards, MAX_CREDENTIAL_BODY_BYTES } from "./credential-guards.js";
import {
  adminGetStatus,
  adminRemoveEmail,
  adminRemovePushover,
  adminUpdateEmail,
  adminUpdatePushover,
  CredentialAdminProxyError
} from "./credential-admin-proxy.js";
import { readJsonBodyLimited } from "./credential-body.js";

const LOCATION_INPUT_FIELDS = new Set(["name", "latitude", "longitude"]);
const AUTOCOMPLETE_TIMEOUT_MS = 5_000;
const PHOTON_CONTACT_FALLBACK = "https://github.com/andrewtryder/sunsethue-helper";

function credentialMutationMessage(code, action) {
  if (code === "INVALID_EMAIL_CREDENTIALS") {
    return "Check Gmail address, app password, and sender mailbox.";
  }
  if (code === "INVALID_PUSHOVER_CREDENTIALS") {
    return "Check Pushover application token and user/group key.";
  }
  if (code === "CREDENTIAL_UPDATE_FORBIDDEN") {
    return "Credential administration is forbidden.";
  }
  if (code === "SECRETS_STORE_SECRET_MISSING" || code === "SECRETS_STORE_NOT_CONFIGURED") {
    return "Secrets Store is not configured for this provider.";
  }
  if (code === "CREDENTIAL_ADMIN_UNAVAILABLE") {
    return "Credential administration is unavailable.";
  }
  if (action === "remove-email") return "Unable to remove email credentials.";
  if (action === "update-pushover") return "Unable to update Pushover credentials.";
  if (action === "remove-pushover") return "Unable to remove Pushover credentials.";
  return "Unable to update email credentials.";
}

function bodyErrorResponse(error, requestId) {
  if (error === "UNSUPPORTED_MEDIA_TYPE") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415, requestId);
  }
  if (error === "PAYLOAD_TOO_LARGE") {
    return errorResponse("PAYLOAD_TOO_LARGE", "Request body is too large.", 413, requestId);
  }
  return errorResponse("BAD_REQUEST", "Request body is not valid JSON.", 400, requestId);
}

function contactIdentifier(env) {
  const contact = typeof env.CONTACT_EMAIL === "string" ? env.CONTACT_EMAIL.trim() : "";
  return contact.length > 0 ? contact : PHOTON_CONTACT_FALLBACK;
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {object | null} [authContext]
 * @param {{ fetch?: typeof fetch, loadMailer?: () => Promise<object>, now?: number, limit?: number }} [deps]
 *   Injection seam so route tests never contact Sunsethue, Nominatim, or SMTP.
 */
export async function handleHttpRequest(request, env, authContext = null, deps = {}) {
  const requestId = createRequestId();
  const fetchImpl = deps.fetch || fetch;
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/api/notification-settings") {
      if (request.method === "GET") {
        return jsonResponse(await publicSettings(await getSettings(env), env), 200, requestId);
      }
      if (request.method !== "PUT") return methodNotAllowed("GET, PUT", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      try {
        const settings = await saveSettings(env, parsed.value, deps.now ?? Date.now());
        return jsonResponse(await publicSettings(settings, env), 200, requestId);
      } catch (error) {
        if (error instanceof NotificationError && error.code === "PROVIDER_NOT_CONFIGURED") {
          return errorResponse("PROVIDER_NOT_CONFIGURED", "The selected channel is not configured.", 409, requestId);
        }
        return errorResponse(error.code || "INVALID_SETTINGS", "Invalid notification settings.", 400, requestId);
      }
    }

    if (path === "/api/application-settings") {
      if (request.method === "GET") {
        const settings = await getApplicationSettings(env);
        const locations = await db.getLocations(env);
        let remainingCredits = null;
        try {
          const credits = await fetchApiCredits(env, fetchImpl);
          remainingCredits = credits?.remaining ?? credits?.remainingCredits ?? null;
        } catch { /* optional */ }
        return jsonResponse({
          ...settings,
          quota: estimateForecastQuota({
            scheduleTimes: settings.scheduleTimes,
            activeLocations: locations.length,
            remainingCredits
          }),
          quotaNotes: {
            channelsDoNotAffectForecastQuota: true,
            manualReportsExcluded: true,
            retriesReuseStoredPayload: true
          }
        }, 200, requestId);
      }
      if (request.method !== "PUT") return methodNotAllowed("GET, PUT", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      try {
        const settings = await saveApplicationSettings(env, parsed.value, deps.now ?? Date.now());
        return jsonResponse(settings, 200, requestId);
      } catch (error) {
        return errorResponse(error.code || "INVALID_SETTINGS", "Invalid application settings.", 400, requestId);
      }
    }

    if (path === "/api/location-notification-rules") {
      if (request.method === "GET") {
        return jsonResponse({ rules: await listRules(env) }, 200, requestId);
      }
      if (request.method === "PUT") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        try {
          const rule = await saveRule(env, parsed.value, deps.now ?? Date.now());
          return jsonResponse({ rule }, 200, requestId);
        } catch (error) {
          return errorResponse(error.code || "INVALID_RULE", "Invalid notification rule.", 400, requestId);
        }
      }
      if (request.method === "POST") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        const action = parsed.value?.action;
        const now = deps.now ?? Date.now();
        if (action === "copy-to-all") {
          const sourceLocationId = parsed.value?.sourceLocationId;
          if (typeof sourceLocationId !== "string") {
            return errorResponse("INVALID_LOCATION", "sourceLocationId is required.", 400, requestId);
          }
          await db.copyLocationRulesToAll(env, sourceLocationId, now);
          return jsonResponse({ rules: await listRules(env) }, 200, requestId);
        }
        if (action === "set-channel-enabled") {
          const channel = parsed.value?.channel;
          const enabled = parsed.value?.enabled;
          if (typeof channel !== "string" || typeof enabled !== "boolean") {
            return errorResponse("INVALID_RULE", "channel and enabled are required.", 400, requestId);
          }
          await db.setChannelEnabledForAllLocations(env, channel, enabled, now);
          return jsonResponse({ rules: await listRules(env) }, 200, requestId);
        }
        if (action === "reset-defaults") {
          const locations = await db.getLocations(env);
          const settings = await getSettings(env);
          for (const loc of locations) {
            for (const channel of ["email", "pushover", "webpush", "webhook"]) {
              const master = channel === "email" ? settings.emailEnabled
                : channel === "pushover" ? settings.pushoverEnabled
                  : channel === "webhook" ? settings.webhookEnabled
                    : 1;
              await db.upsertLocationNotificationRule(env, {
                locationId: loc.id,
                channel,
                enabled: Number(master) === 1,
                thresholdPercent: 50,
                eventScope: "either",
                updatedAt: now
              });
            }
          }
          return jsonResponse({ rules: await listRules(env) }, 200, requestId);
        }
        return errorResponse("INVALID_ACTION", "Unknown bulk action.", 400, requestId);
      }
      return methodNotAllowed("GET, PUT, POST", requestId);
    }

    if (path === "/api/web-push/vapid-public-key") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      return jsonResponse(publicVapidConfig(env), 200, requestId);
    }

    if (path === "/api/web-push/subscriptions") {
      if (request.method === "GET") {
        return jsonResponse({ devices: await db.publicWebPushSubscriptions(env) }, 200, requestId);
      }
      if (request.method === "POST") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        try {
          const device = await registerWebPushSubscription(
            env,
            parsed.value,
            { userAgent: request.headers.get("user-agent") },
            deps.now ?? Date.now()
          );
          return jsonResponse({ device }, 201, requestId);
        } catch (error) {
          return errorResponse(error.code || "INVALID_PUSH_SUBSCRIPTION", "Invalid push subscription.", 400, requestId);
        }
      }
      return methodNotAllowed("GET, POST", requestId);
    }

    if (path.startsWith("/api/web-push/subscriptions/")) {
      const id = path.slice("/api/web-push/subscriptions/".length);
      if (!isUuid(id)) return errorResponse("NOT_FOUND", "Subscription not found.", 404, requestId);
      const now = deps.now ?? Date.now();
      if (request.method === "PATCH") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        const ok = await db.updateWebPushSubscriptionMeta(env, id, {
          deviceName: parsed.value?.deviceName,
          enabled: parsed.value?.enabled,
          lastSeenAt: now
        });
        if (!ok) return errorResponse("NOT_FOUND", "Subscription not found.", 404, requestId);
        return jsonResponse({ devices: await db.publicWebPushSubscriptions(env) }, 200, requestId);
      }
      if (request.method === "DELETE") {
        const ok = await db.deleteWebPushSubscription(env, id);
        if (!ok) return errorResponse("NOT_FOUND", "Subscription not found.", 404, requestId);
        return jsonResponse({ ok: true }, 200, requestId);
      }
      return methodNotAllowed("PATCH, DELETE", requestId);
    }

    if (path === "/api/webhook-credentials") {
      const guard = assertCredentialRequestGuards(request, env, { mutation: request.method !== "GET" });
      if (!guard.ok) return errorResponse(guard.code, guard.message, guard.status, requestId);
      if (request.method === "GET") {
        const configured = await hasWebhookTransportAsync(env);
        const settings = await getSettings(env);
        return jsonResponse({
          configured,
          enabled: Boolean(settings.webhookEnabled),
          maskedHostname: settings.webhookMaskedHostname || null,
          lastSuccessAt: settings.webhookLastSuccessAt || null,
          lastFailureCode: settings.webhookLastFailureCode || null
        }, 200, requestId);
      }
      if (request.method === "PUT") {
        const parsed = await readJsonBodyLimited(request, MAX_CREDENTIAL_BODY_BYTES);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        try {
          const { document, serialized } = buildWebhookTransportDocument(parsed.value);
          if (!env.WEBHOOK_TRANSPORT_SECRET || typeof env.WEBHOOK_TRANSPORT_SECRET.put !== "function") {
            // Prefer credential-admin in production; local tests may stub put().
            if (typeof deps.putWebhookSecret === "function") {
              await deps.putWebhookSecret(serialized);
            } else {
              return errorResponse("SECRETS_STORE_NOT_CONFIGURED", "Webhook Secrets Store is not configured.", 503, requestId);
            }
          } else {
            await env.WEBHOOK_TRANSPORT_SECRET.put(serialized);
          }
          const now = deps.now ?? Date.now();
          const settings = await getSettings(env);
          await db.upsertNotificationSettings(env, {
            ...settings,
            webhookMaskedHostname: maskWebhookHostname(document.url),
            updatedAt: now
          });
          await db.upsertProviderCredentialStatus(env, {
            provider: "webhook",
            configured: 1,
            maskedIdentifier: maskWebhookHostname(document.url),
            updatedAt: now,
            lastValidatedAt: now,
            lastValidationCode: "OK",
            lastUpdatedBy: authContext?.email || null
          });
          return jsonResponse({
            configured: true,
            maskedHostname: maskWebhookHostname(document.url)
          }, 200, requestId);
        } catch (error) {
          if (error instanceof CredentialError) {
            return errorResponse(error.code, "Invalid webhook credentials.", 400, requestId);
          }
          return errorResponse("SECRETS_STORE_UPDATE_FAILED", "Unable to update webhook credentials.", 502, requestId);
        }
      }
      if (request.method === "DELETE") {
        const sentinel = JSON.stringify({ version: 1, configured: false });
        if (typeof deps.putWebhookSecret === "function") {
          await deps.putWebhookSecret(sentinel);
        } else if (env.WEBHOOK_TRANSPORT_SECRET?.put) {
          await env.WEBHOOK_TRANSPORT_SECRET.put(sentinel);
        }
        const now = deps.now ?? Date.now();
        await db.disableNotificationChannel(env, "webhook", now);
        await db.upsertProviderCredentialStatus(env, {
          provider: "webhook",
          configured: 0,
          maskedIdentifier: null,
          updatedAt: now,
          lastValidatedAt: now,
          lastValidationCode: null,
          lastUpdatedBy: authContext?.email || null
        });
        return jsonResponse({ configured: false }, 200, requestId);
      }
      return methodNotAllowed("GET, PUT, DELETE", requestId);
    }

    if (path === "/api/provider-credentials") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const guard = assertCredentialRequestGuards(request, env, { mutation: false });
      if (!guard.ok) return errorResponse(guard.code, guard.message, guard.status, requestId);
      try {
        const rows = await db.listProviderCredentialStatus(env);
        const byProvider = Object.fromEntries(rows.map((row) => [row.provider, row]));
        const status = await adminGetStatus(env, {
          email: {
            updatedAt: byProvider.email?.updatedAt ?? null,
            lastValidationCode: byProvider.email?.lastValidationCode ?? null
          },
          pushover: {
            updatedAt: byProvider.pushover?.updatedAt ?? null,
            lastValidationCode: byProvider.pushover?.lastValidationCode ?? null
          }
        });
        return jsonResponse(status, 200, requestId);
      } catch (error) {
        if (error instanceof CredentialAdminProxyError) {
          return errorResponse(error.code, "Credential administration is unavailable.", error.status, requestId);
        }
        return errorResponse("CREDENTIAL_ADMIN_UNAVAILABLE", "Credential administration is unavailable.", 503, requestId);
      }
    }

    if (path === "/api/provider-credentials/email") {
      const guard = assertCredentialRequestGuards(request, env, { mutation: true });
      if (!guard.ok) return errorResponse(guard.code, guard.message, guard.status, requestId);
      const actor = authContext?.email || null;
      const now = deps.now ?? Date.now();
      if (request.method === "PUT") {
        if (!(await db.claimProviderCredentialSlot(env, now))) {
          return errorResponse("CREDENTIAL_UPDATE_RATE_LIMITED", "Try again shortly.", 429, requestId);
        }
        const parsed = await readJsonBodyLimited(request, MAX_CREDENTIAL_BODY_BYTES);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        try {
          const status = await adminUpdateEmail(env, parsed.value, { requestId, actor, now });
          await db.upsertProviderCredentialStatus(env, {
            provider: "email",
            configured: status.configured ? 1 : 0,
            maskedIdentifier: status.gmailUserMasked || null,
            updatedAt: now,
            lastValidatedAt: now,
            lastValidationCode: status.lastValidationCode || "OK",
            lastUpdatedBy: actor
          });
          return jsonResponse({ email: status }, 200, requestId);
        } catch (error) {
          if (error instanceof CredentialAdminProxyError) {
            return errorResponse(
              error.code,
              credentialMutationMessage(error.code, "update-email"),
              error.status,
              requestId
            );
          }
          return errorResponse("SECRETS_STORE_UPDATE_FAILED", credentialMutationMessage("SECRETS_STORE_UPDATE_FAILED", "update-email"), 502, requestId);
        }
      }
      if (request.method === "DELETE") {
        if (!(await db.claimProviderCredentialSlot(env, now))) {
          return errorResponse("CREDENTIAL_UPDATE_RATE_LIMITED", "Try again shortly.", 429, requestId);
        }
        try {
          const status = await adminRemoveEmail(env, { requestId, actor, now });
          await db.upsertProviderCredentialStatus(env, {
            provider: "email",
            configured: 0,
            maskedIdentifier: null,
            updatedAt: now,
            lastValidatedAt: now,
            lastValidationCode: null,
            lastUpdatedBy: actor
          });
          await db.disableNotificationChannel(env, "email", now);
          return jsonResponse({ email: status }, 200, requestId);
        } catch (error) {
          if (error instanceof CredentialAdminProxyError) {
            return errorResponse(
              error.code,
              credentialMutationMessage(error.code, "remove-email"),
              error.status,
              requestId
            );
          }
          return errorResponse("SECRETS_STORE_UPDATE_FAILED", credentialMutationMessage("SECRETS_STORE_UPDATE_FAILED", "remove-email"), 502, requestId);
        }
      }
      return methodNotAllowed("PUT, DELETE", requestId);
    }

    if (path === "/api/provider-credentials/pushover") {
      const guard = assertCredentialRequestGuards(request, env, { mutation: true });
      if (!guard.ok) return errorResponse(guard.code, guard.message, guard.status, requestId);
      const actor = authContext?.email || null;
      const now = deps.now ?? Date.now();
      if (request.method === "PUT") {
        if (!(await db.claimProviderCredentialSlot(env, now))) {
          return errorResponse("CREDENTIAL_UPDATE_RATE_LIMITED", "Try again shortly.", 429, requestId);
        }
        const parsed = await readJsonBodyLimited(request, MAX_CREDENTIAL_BODY_BYTES);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        try {
          const status = await adminUpdatePushover(env, parsed.value, { requestId, actor, now });
          await db.upsertProviderCredentialStatus(env, {
            provider: "pushover",
            configured: status.configured ? 1 : 0,
            maskedIdentifier: status.configured ? "configured" : null,
            updatedAt: now,
            lastValidatedAt: now,
            lastValidationCode: status.lastValidationCode || "OK",
            lastUpdatedBy: actor
          });
          return jsonResponse({ pushover: status }, 200, requestId);
        } catch (error) {
          if (error instanceof CredentialAdminProxyError) {
            return errorResponse(
              error.code,
              credentialMutationMessage(error.code, "update-pushover"),
              error.status,
              requestId
            );
          }
          return errorResponse("SECRETS_STORE_UPDATE_FAILED", credentialMutationMessage("SECRETS_STORE_UPDATE_FAILED", "update-pushover"), 502, requestId);
        }
      }
      if (request.method === "DELETE") {
        if (!(await db.claimProviderCredentialSlot(env, now))) {
          return errorResponse("CREDENTIAL_UPDATE_RATE_LIMITED", "Try again shortly.", 429, requestId);
        }
        try {
          const status = await adminRemovePushover(env, { requestId, actor, now });
          await db.upsertProviderCredentialStatus(env, {
            provider: "pushover",
            configured: 0,
            maskedIdentifier: null,
            updatedAt: now,
            lastValidatedAt: now,
            lastValidationCode: null,
            lastUpdatedBy: actor
          });
          await db.disableNotificationChannel(env, "pushover", now);
          return jsonResponse({ pushover: status }, 200, requestId);
        } catch (error) {
          if (error instanceof CredentialAdminProxyError) {
            return errorResponse(
              error.code,
              credentialMutationMessage(error.code, "remove-pushover"),
              error.status,
              requestId
            );
          }
          return errorResponse("SECRETS_STORE_UPDATE_FAILED", credentialMutationMessage("SECRETS_STORE_UPDATE_FAILED", "remove-pushover"), 502, requestId);
        }
      }
      return methodNotAllowed("PUT, DELETE", requestId);
    }

    if (path === "/api/notification-deliveries") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      return jsonResponse(await db.getNotificationDeliveries(env), 200, requestId);
    }

    if (path.startsWith("/api/notification-deliveries/") && path.endsWith("/retry")) {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const id = path.slice("/api/notification-deliveries/".length, -"/retry".length);
      if (!isUuid(id)) return errorResponse("BAD_REQUEST", "Invalid delivery ID.", 400, requestId);
      const now = deps.now ?? Date.now();
      const outcome = await db.retryFailedDelivery(env, id, now);
      if (!outcome.ok) {
        if (outcome.code === "MANUAL_RETRY_COOLDOWN") {
          return errorResponse("MANUAL_RETRY_COOLDOWN", "Wait before retrying this delivery.", 429, requestId);
        }
        if (outcome.code === "MANUAL_RETRY_EXHAUSTED") {
          return errorResponse("MANUAL_RETRY_EXHAUSTED", "Manual retry limit reached for this delivery.", 429, requestId);
        }
        return errorResponse("NOT_RETRYABLE", "Delivery is not failed.", 409, requestId);
      }
      const outcomes = await dispatchPendingNotifications(env, deps);
      return jsonResponse({ id, status: outcomes.find((item) => item.id === id)?.status || "pending" }, 200, requestId);
    }

    if (path === "/api/notifications/test") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      const body = parsed.value;
      const allowed = ["email", "pushover", "webhook", "webpush"];
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !allowed.includes(body.channel)) {
        return errorResponse("BAD_REQUEST", "Choose an available notification channel.", 400, requestId);
      }
      const now = deps.now ?? Date.now();
      const settings = await getSettings(env);
      if (body.channel === "email" && (!settings.emailEnabled || !(await hasEmailTransportAsync(env)))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Email is not configured.", 409, requestId);
      if (body.channel === "pushover" && (!settings.pushoverEnabled || !(await hasPushoverTransportAsync(env)))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Pushover is not configured.", 409, requestId);
      if (body.channel === "webhook" && (!settings.webhookEnabled || !(await hasWebhookTransportAsync(env)))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Webhook is not configured.", 409, requestId);
      if (body.channel === "webpush") {
        const subs = await db.listWebPushSubscriptions(env, { enabledOnly: true });
        if (subs.length === 0) return errorResponse("PROVIDER_NOT_CONFIGURED", "No browser push devices are enabled.", 409, requestId);
      }
      if (body.channel === "email" && !settings.emailTo) {
        return errorResponse("INVALID_EMAIL_ADDRESS", "Set an email destination in notification settings before sending a test.", 409, requestId);
      }
      if (!await db.claimNotificationTestSlot(env, now)) return errorResponse("RATE_LIMITED", "Try again in a minute.", 429, requestId);
      const jobs = await enqueueNotifications({ runId: crypto.randomUUID(), triggerType: "TEST", generatedAt: now, dashboardUrl: env.WEBAPP_URL || null, locationsCount: 0, results: [] }, env, {
        settings: {
          ...settings,
          emailEnabled: body.channel === "email" ? 1 : 0,
          pushoverEnabled: body.channel === "pushover" ? 1 : 0,
          webhookEnabled: body.channel === "webhook" ? 1 : 0
        },
        webPushSubscriptions: body.channel === "webpush"
          ? await db.listWebPushSubscriptions(env, { enabledOnly: true })
          : []
      });
      const outcomes = await dispatchPendingNotifications(env, deps);
      const job = jobs[0];
      return jsonResponse({ id: job.id, status: outcomes.find((item) => item.id === job.id)?.status || "pending" }, 202, requestId);
    }

    // 1. GET /api/getApiCredits
    if (path === "/api/getApiCredits") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const apiKey = env.SUNSETHUE_API_KEY;
      const credits = await fetchApiCredits({ fetch: fetchImpl, apiKey });
      return jsonResponse(credits, 200, requestId);
    }

    // 2. POST /api/searchCoordinates
    if (path === "/api/searchCoordinates") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      const validated = validateSearchQuery(parsed.value?.query);
      if (!validated.ok) return errorResponse("BAD_REQUEST", "Missing or invalid search query.", 400, requestId);

      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(validated.value)}&limit=5`;

      const response = await fetchImpl(nominatimUrl, {
        headers: {
          "User-Agent": `SunsethueHelper/1.0 (${contactIdentifier(env)})`,
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        logSafe("error", "Nominatim upstream failure", {
          requestId,
          method: request.method,
          path,
          status: response.status
        });
        return errorResponse("UPSTREAM_ERROR", "Address search failed.", 502, requestId);
      }

      const data = await response.json();
      return jsonResponse(data, 200, requestId);
    }

    // 2b. POST /api/autocomplete — Photon proxy for the address suggestion UI.
    if (path === "/api/autocomplete") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      const validated = validateSearchQuery(parsed.value?.query);
      if (!validated.ok) return errorResponse("BAD_REQUEST", "Missing or invalid autocomplete query.", 400, requestId);
      const now = deps.now ?? Date.now();
      if (!await db.claimAutocompleteSlot(env, now)) {
        return errorResponse("RATE_LIMITED", "Autocomplete is temporarily busy.", 429, requestId);
      }
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(validated.value)}&limit=5`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AUTOCOMPLETE_TIMEOUT_MS);
      try {
        const response = await fetchImpl(photonUrl, {
          headers: {
            "User-Agent": `SunsethueHelper/1.0 (${contactIdentifier(env)})`,
            Accept: "application/json"
          },
          signal: controller.signal
        });
        if (!response.ok) {
          logSafe("error", "Photon upstream failure", { requestId, method: request.method, path, status: response.status });
          return errorResponse("UPSTREAM_ERROR", "Autocomplete failed.", 502, requestId);
        }
        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features.slice(0, 5) : [];
        return jsonResponse({ features }, 200, requestId);
      } catch (error) {
        if (error?.name === "AbortError") {
          return errorResponse("UPSTREAM_TIMEOUT", "Autocomplete timed out.", 504, requestId);
        }
        logSafe("error", "Photon upstream error", { requestId, method: request.method, path, code: "UPSTREAM_ERROR" });
        return errorResponse("UPSTREAM_ERROR", "Autocomplete failed.", 502, requestId);
      } finally {
        clearTimeout(timer);
      }
    }

    // 3. POST /api/triggerReport
    if (path === "/api/triggerReport") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      try {
        const report = await runAndSendReport("Manual Test", env, deps);
        return jsonResponse(
          { success: true, runId: report.runId, jobs: report.jobs },
          200,
          requestId
        );
      } catch (error) {
        if (error instanceof NotificationError && error.code === "REPORT_IN_PROGRESS") {
          return errorResponse("REPORT_IN_PROGRESS", "A report is already running.", 429, requestId);
        }
        throw error;
      }
    }

    // 4. Locations endpoints (/api/locations)
    if (path === "/api/locations") {
      if (request.method === "GET") {
        const locations = await db.getLocations(env);
        return jsonResponse(locations, 200, requestId);
      }

      if (request.method === "POST") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        if (rejectUnknownFields(parsed.value, LOCATION_INPUT_FIELDS).ok === false) {
          return errorResponse("BAD_REQUEST", "Unexpected fields in request.", 400, requestId);
        }
        const nameCheck = validateLocationName(parsed.value.name);
        const coordCheck = validateCoordinates(parsed.value.latitude, parsed.value.longitude);
        if (!nameCheck.ok || !coordCheck.ok) {
          return errorResponse("BAD_REQUEST", "Missing or invalid required fields.", 400, requestId);
        }
        const id = crypto.randomUUID();
        const newLoc = { id, name: nameCheck.value, latitude: coordCheck.latitude, longitude: coordCheck.longitude, createdAt: deps.now ?? Date.now() };
        const inserted = await db.addLocation(env, newLoc);
        if (!inserted) {
          return errorResponse("LOCATION_LIMIT_REACHED", "You can monitor a maximum of 10 locations.", 409, requestId);
        }
        return jsonResponse({ success: true, location: newLoc }, 200, requestId);
      }

      return methodNotAllowed("GET, POST", requestId);
    }

    // PUT /api/locations/:id and DELETE /api/locations/:id
    if (path.startsWith("/api/locations/")) {
      const id = path.substring("/api/locations/".length);
      if (!isUuid(id)) {
        return errorResponse("BAD_REQUEST", "Invalid ID.", 400, requestId);
      }

      if (request.method === "PUT") {
        const parsed = await readJsonBody(request);
        if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
        if (rejectUnknownFields(parsed.value, LOCATION_INPUT_FIELDS).ok === false) {
          return errorResponse("BAD_REQUEST", "Unexpected fields in request.", 400, requestId);
        }
        const nameCheck = validateLocationName(parsed.value.name);
        const coordCheck = validateCoordinates(parsed.value.latitude, parsed.value.longitude);
        if (!nameCheck.ok || !coordCheck.ok) {
          return errorResponse("BAD_REQUEST", "Missing or invalid required fields.", 400, requestId);
        }
        const updated = await db.updateLocation(env, id, { name: nameCheck.value, latitude: coordCheck.latitude, longitude: coordCheck.longitude });
        if (!updated) return errorResponse("NOT_FOUND", "Location not found.", 404, requestId);
        return jsonResponse({ success: true }, 200, requestId);
      }

      if (request.method === "DELETE") {
        const deleted = await db.deleteLocation(env, id);
        if (!deleted) return errorResponse("NOT_FOUND", "Location not found.", 404, requestId);
        return jsonResponse({ success: true }, 200, requestId);
      }

      return methodNotAllowed("PUT, DELETE", requestId);
    }

    // 5. GET /api/runs
    if (path === "/api/runs") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const runs = await db.getRuns(env);
      return jsonResponse(runs, 200, requestId);
    }

    if (path === "/api/operational-status") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const status = await db.getOperationalStatus(env, deps.now ?? Date.now());
      status.emailTransport = await emailTransportSource(env);
      status.pushoverTransport = await pushoverTransportSource(env);
      return jsonResponse(status, 200, requestId);
    }

    if (path === "/api/notification-health") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const health = await getNotificationHealth(env, { now: deps.now ?? Date.now() });
      return jsonResponse(health, 200, requestId);
    }

    if (path === "/api/setup-status") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      const setup = await db.getSetupStatus(env);
      setup.forecastApiKey = typeof env.SUNSETHUE_API_KEY === "string" && env.SUNSETHUE_API_KEY.trim()
        ? "ready"
        : "missing";
      return jsonResponse(setup, 200, requestId);
    }

    if (path === "/api/history/export") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      try {
        const url = new URL(request.url);
        const scopes = parseHistoryScopes(url.searchParams.get("scopes") || "all");
        const payload = await exportHistory(env, scopes);
        return jsonResponse(payload, 200, requestId);
      } catch (error) {
        if (error instanceof NotificationError) {
          return errorResponse(error.code, "Invalid history export request.", 400, requestId);
        }
        throw error;
      }
    }

    if (path === "/api/history/clear") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      try {
        if (parsed.value?.preview === true) {
          const scopes = parseHistoryScopes(parsed.value.scopes || ["all"]);
          const counts = await countHistoryScopes(env, scopes);
          return jsonResponse({ scopes, counts }, 200, requestId);
        }
        const result = await clearHistory(env, {
          scopes: parsed.value?.scopes,
          confirm: parsed.value?.confirm
        }, deps.now ?? Date.now());
        return jsonResponse(result, 200, requestId);
      } catch (error) {
        if (error instanceof NotificationError) {
          const status = error.code === "CLEAR_CONFIRM_REQUIRED" ? 400 : 400;
          return errorResponse(error.code, "Unable to clear history.", status, requestId);
        }
        throw error;
      }
    }

    // Obsolete public config endpoint removed; keep a generic not-found.
    if (path === "/api/config" || path === "/api/getAppConfig") {
      return errorResponse("NOT_FOUND", "Not found.", 404, requestId);
    }

    return errorResponse("NOT_FOUND", "Not found.", 404, requestId);
  } catch (error) {
    logSafe("error", "API handler failure", {
      requestId,
      method: request.method,
      path,
      code: "INTERNAL_ERROR"
    });
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred.",
      500,
      requestId
    );
  }
}
