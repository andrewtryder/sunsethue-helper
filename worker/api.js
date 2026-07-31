import { fetchApiCredits } from "./sunsethue.js";
import { enqueueNotifications, runAndSendReport } from "./report.js";
import * as db from "./db.js";
import { dispatchPendingNotifications } from "./notifications/dispatcher.js";
import { getSettings, hasEmailTransport, hasPushoverTransport, publicSettings, saveSettings } from "./notifications/settings.js";
import {
  createRequestId,
  jsonResponse,
  errorResponse,
  methodNotAllowed,
  logSafe
} from "./http.js";

/**
 * @param {Request} request
 * @param {object} env
 * @param {object | null} [authContext]
 * @param {{ fetch?: typeof fetch, loadMailer?: () => Promise<object> }} [deps]
 *   Injection seam so route tests never contact Sunsethue, Nominatim, or SMTP.
 */
export async function handleHttpRequest(request, env, authContext = null, deps = {}) {
  const requestId = createRequestId();
  const fetchImpl = deps.fetch || fetch;
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    async function jsonBody() {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return null;
      }
      return request.json();
    }

    if (path === "/api/notification-settings") {
      if (request.method === "GET") {
        return jsonResponse(publicSettings(await getSettings(env), env), 200, requestId);
      }
      if (request.method !== "PUT") return methodNotAllowed("GET, PUT", requestId);
      const body = await jsonBody();
      if (body === null) return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415, requestId);
      try {
        const settings = await saveSettings(env, body, deps.now ?? Date.now());
        return jsonResponse(publicSettings(settings, env), 200, requestId);
      } catch (error) {
        return errorResponse(error.code || "INVALID_SETTINGS", "Invalid notification settings.", 400, requestId);
      }
    }

    if (path === "/api/notification-deliveries") {
      if (request.method !== "GET") return methodNotAllowed("GET", requestId);
      return jsonResponse(await db.getNotificationDeliveries(env), 200, requestId);
    }

    if (path.startsWith("/api/notification-deliveries/") && path.endsWith("/retry")) {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const id = path.slice("/api/notification-deliveries/".length, -"/retry".length);
      if (!id) return errorResponse("BAD_REQUEST", "Missing delivery ID.", 400, requestId);
      const now = deps.now ?? Date.now();
      if (!await db.retryFailedDelivery(env, id, now)) return errorResponse("NOT_RETRYABLE", "Delivery is not failed.", 409, requestId);
      const outcomes = await dispatchPendingNotifications(env, deps);
      return jsonResponse({ id, status: outcomes.find((item) => item.id === id)?.status || "pending" }, 200, requestId);
    }

    if (path === "/api/notifications/test") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const body = await jsonBody();
      if (body === null) return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415, requestId);
      if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !["email", "pushover"].includes(body.channel)) {
        return errorResponse("BAD_REQUEST", "Choose an available notification channel.", 400, requestId);
      }
      const now = deps.now ?? Date.now();
      if (!await db.claimNotificationTestSlot(env, now)) return errorResponse("RATE_LIMITED", "Try again in a minute.", 429, requestId);
      const settings = await getSettings(env);
      if (body.channel === "email" && (!settings.emailEnabled || !hasEmailTransport(env))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Email is not configured.", 409, requestId);
      if (body.channel === "pushover" && (!settings.pushoverEnabled || !hasPushoverTransport(env))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Pushover is not configured.", 409, requestId);
      const jobs = await enqueueNotifications({ runId: crypto.randomUUID(), triggerType: "TEST", generatedAt: now, dashboardUrl: env.WEBAPP_URL || null, locationsCount: 0, results: [] }, env, {
        settings: { ...settings, emailEnabled: body.channel === "email" ? 1 : 0, pushoverEnabled: body.channel === "pushover" ? 1 : 0 }
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
      const { query } = await request.json();
      if (!query) {
        return errorResponse("BAD_REQUEST", "Missing search query.", 400, requestId);
      }

      const userAgentEmail = env.CONTACT_EMAIL || env.EMAIL_TO || "owner@example.com";
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

      const response = await fetchImpl(nominatimUrl, {
        headers: {
          "User-Agent": `SunsethueHelper/1.0 (${userAgentEmail})`,
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

    // 3. POST /api/triggerReport
    if (path === "/api/triggerReport") {
      if (request.method !== "POST") return methodNotAllowed("POST", requestId);
      const report = await runAndSendReport("Manual Test", env, deps);
      return jsonResponse(
        { success: true, runId: report.runId, jobs: report.jobs },
        200,
        requestId
      );
    }

    // 4. Locations endpoints (/api/locations)
    if (path === "/api/locations") {
      if (request.method === "GET") {
        const locations = await db.getLocations(env);
        return jsonResponse(locations, 200, requestId);
      }

      if (request.method === "POST") {
        const { name, latitude, longitude } = await request.json();
        if (!name || latitude === undefined || longitude === undefined) {
          return errorResponse("BAD_REQUEST", "Missing required fields.", 400, requestId);
        }
        const id = crypto.randomUUID();
        const newLoc = { id, name, latitude, longitude, createdAt: Date.now() };
        await db.addLocation(env, newLoc);
        return jsonResponse({ success: true, location: newLoc }, 200, requestId);
      }

      return methodNotAllowed("GET, POST", requestId);
    }

    // PUT /api/locations/:id and DELETE /api/locations/:id
    if (path.startsWith("/api/locations/")) {
      const id = path.substring("/api/locations/".length);
      if (!id) {
        return errorResponse("BAD_REQUEST", "Missing ID.", 400, requestId);
      }

      if (request.method === "PUT") {
        const { name, latitude, longitude } = await request.json();
        if (!name || latitude === undefined || longitude === undefined) {
          return errorResponse("BAD_REQUEST", "Missing required fields.", 400, requestId);
        }
        await db.updateLocation(env, id, { name, latitude, longitude });
        return jsonResponse({ success: true }, 200, requestId);
      }

      if (request.method === "DELETE") {
        await db.deleteLocation(env, id);
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
