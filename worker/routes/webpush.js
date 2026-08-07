import {
  publicVapidConfig,
  registerWebPushSubscription
} from "../notifications/webpush.js";
import {
  deleteWebPushSubscription,
  publicWebPushSubscriptions,
  updateWebPushSubscriptionMeta
} from "../repositories/webpush.js";
import { jsonResponse, errorResponse, methodNotAllowed } from "../http.js";
import { isUuid, readJsonBody } from "../validation.js";
import { bodyErrorResponse } from "./_shared.js";

/**
 * @param {{ request: Request, env: object, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, deps, requestId, path } = ctx;

  if (path === "/api/web-push/vapid-public-key") {
    if (request.method !== "GET") return methodNotAllowed("GET", requestId);
    return jsonResponse(publicVapidConfig(env), 200, requestId);
  }

  if (path === "/api/web-push/subscriptions") {
    if (request.method === "GET") {
      return jsonResponse({ devices: await publicWebPushSubscriptions(env) }, 200, requestId);
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
      const ok = await updateWebPushSubscriptionMeta(env, id, {
        deviceName: parsed.value?.deviceName,
        enabled: parsed.value?.enabled,
        lastSeenAt: now
      });
      if (!ok) return errorResponse("NOT_FOUND", "Subscription not found.", 404, requestId);
      return jsonResponse({ devices: await publicWebPushSubscriptions(env) }, 200, requestId);
    }
    if (request.method === "DELETE") {
      const ok = await deleteWebPushSubscription(env, id);
      if (!ok) return errorResponse("NOT_FOUND", "Subscription not found.", 404, requestId);
      return jsonResponse({ ok: true }, 200, requestId);
    }
    return methodNotAllowed("PATCH, DELETE", requestId);
  }

  return null;
}
