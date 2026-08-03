import * as db from "../db.js";
import { getSettings } from "../notifications/settings.js";
import { hasWebhookTransportAsync } from "../notifications/webhook.js";
import {
  buildWebhookTransportDocument,
  maskWebhookHostname
} from "../notifications/resolve-webhook-transport.js";
import { CredentialError } from "../lib/transport-schema.js";
import { jsonResponse, errorResponse, methodNotAllowed } from "../http.js";
import { assertCredentialRequestGuards, MAX_CREDENTIAL_BODY_BYTES } from "../credential-guards.js";
import { readJsonBodyLimited } from "../credential-body.js";
import { bodyErrorResponse } from "./_shared.js";

/**
 * @param {{ request: Request, env: object, authContext: object|null, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, authContext, deps, requestId, path } = ctx;
  if (path !== "/api/webhook-credentials") return null;

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
