import * as db from "../db.js";
import { jsonResponse, methodNotAllowed } from "../http.js";

/**
 * @param {{ request: Request, env: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, requestId, path } = ctx;
  if (path !== "/api/setup-status") return null;
  if (request.method !== "GET") return methodNotAllowed("GET", requestId);
  const setup = await db.getSetupStatus(env);
  setup.forecastApiKey = typeof env.SUNSETHUE_API_KEY === "string" && env.SUNSETHUE_API_KEY.trim()
    ? "ready"
    : "missing";
  return jsonResponse(setup, 200, requestId);
}
