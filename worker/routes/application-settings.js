import { fetchApiCredits } from "../sunsethue.js";
import * as db from "../db.js";
import {
  getApplicationSettings,
  saveApplicationSettings,
  estimateForecastQuota
} from "../notifications/application-settings.js";
import { jsonResponse, errorResponse, methodNotAllowed } from "../http.js";
import { readJsonBody } from "../validation.js";
import { bodyErrorResponse } from "./_shared.js";

/**
 * @param {{ request: Request, env: object, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, deps, requestId, path } = ctx;
  if (path !== "/api/application-settings") return null;

  const fetchImpl = deps.fetch || fetch;

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
        locations,
        activeLocations: locations.length,
        remainingCredits
      }),
      quotaNotes: {
        channelsDoNotAffectForecastQuota: true,
        scheduledReportsReuseForecastChecks: true,
        qualityAlertsReuseForecastChecks: true,
        manualReportsExcluded: true,
        retriesReuseStoredPayload: true,
        perLocationSchedulesCounted: true
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
