import { NotificationError } from "../notifications/errors.js";
import {
  clearHistory,
  countHistoryScopes,
  exportHistory,
  parseHistoryScopes
} from "../notifications/history.js";
import { jsonResponse, errorResponse, methodNotAllowed } from "../http.js";
import { readJsonBody } from "../validation.js";
import { bodyErrorResponse } from "./_shared.js";

/**
 * @param {{ request: Request, env: object, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, deps, requestId, path } = ctx;

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

  return null;
}
