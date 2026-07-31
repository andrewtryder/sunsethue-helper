import { fetchApiCredits } from "./sunsethue.js";
import { enqueueNotifications, runAndSendReport } from "./report.js";
import * as db from "./db.js";
import { dispatchPendingNotifications } from "./notifications/dispatcher.js";
import { NotificationError } from "./notifications/errors.js";
import { getSettings, hasEmailTransport, hasPushoverTransport, publicSettings, saveSettings } from "./notifications/settings.js";
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

const LOCATION_INPUT_FIELDS = new Set(["name", "latitude", "longitude"]);
const AUTOCOMPLETE_TIMEOUT_MS = 5_000;
const PHOTON_CONTACT_FALLBACK = "https://github.com/andrewtryder/sunsethue-helper";

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
        return jsonResponse(publicSettings(await getSettings(env), env), 200, requestId);
      }
      if (request.method !== "PUT") return methodNotAllowed("GET, PUT", requestId);
      const parsed = await readJsonBody(request);
      if ("error" in parsed) return bodyErrorResponse(parsed.error, requestId);
      try {
        const settings = await saveSettings(env, parsed.value, deps.now ?? Date.now());
        return jsonResponse(publicSettings(settings, env), 200, requestId);
      } catch (error) {
        if (error instanceof NotificationError && error.code === "PROVIDER_NOT_CONFIGURED") {
          return errorResponse("PROVIDER_NOT_CONFIGURED", "The selected channel is not configured.", 409, requestId);
        }
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
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !["email", "pushover"].includes(body.channel)) {
        return errorResponse("BAD_REQUEST", "Choose an available notification channel.", 400, requestId);
      }
      const now = deps.now ?? Date.now();
      const settings = await getSettings(env);
      // Check provider readiness before consuming the rate-limit slot so a
      // misconfigured channel cannot lock out a valid one for a full minute.
      if (body.channel === "email" && (!settings.emailEnabled || !hasEmailTransport(env))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Email is not configured.", 409, requestId);
      if (body.channel === "pushover" && (!settings.pushoverEnabled || !hasPushoverTransport(env))) return errorResponse("PROVIDER_NOT_CONFIGURED", "Pushover is not configured.", 409, requestId);
      if (!await db.claimNotificationTestSlot(env, now)) return errorResponse("RATE_LIMITED", "Try again in a minute.", 429, requestId);
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
