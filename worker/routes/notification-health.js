import { getNotificationHealth } from "../notifications/health.js";
import { jsonResponse, methodNotAllowed } from "../http.js";

/**
 * @param {{ request: Request, env: object, deps: object, requestId: string, path: string }} ctx
 * @returns {Promise<Response|null>}
 */
export async function tryHandle(ctx) {
  const { request, env, deps, requestId, path } = ctx;
  if (path !== "/api/notification-health") return null;
  if (request.method !== "GET") return methodNotAllowed("GET", requestId);
  const health = await getNotificationHealth(env, { now: deps.now ?? Date.now() });
  return jsonResponse(health, 200, requestId);
}
