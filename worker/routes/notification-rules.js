import * as db from "../db.js";
import { getSettings } from "../notifications/settings.js";
import { listRules, saveRule } from "../notifications/rules.js";
import { jsonResponse, errorResponse, methodNotAllowed } from "../http.js";
import { readJsonBody } from "../validation.js";
import { bodyErrorResponse } from "./_shared.js";

/**
 * @param {{ request: Request, env: object, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, deps, requestId, path } = ctx;
  if (path !== "/api/location-notification-rules") return null;

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
