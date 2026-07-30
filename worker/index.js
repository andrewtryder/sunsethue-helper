import { handleHttpRequest } from "./api.js";
import { handleScheduledReport } from "./cron.js";
import { authenticateRequest, AuthError } from "./auth.js";
import { createRequestId, errorResponse, logSafe } from "./http.js";

export default {
  async fetch(request, env, ctx) {
    const requestId = createRequestId();
    const url = new URL(request.url);

    try {
      const auth = await authenticateRequest(request, env);
      return handleHttpRequest(request, env, auth);
    } catch (error) {
      if (error instanceof AuthError) {
        logSafe("warn", "Request rejected by auth middleware", {
          requestId,
          method: request.method,
          path: url.pathname,
          status: error.status,
          code: error.code
        });
        return errorResponse(error.code, error.message, error.status, requestId);
      }

      logSafe("error", "Unhandled fetch error", {
        requestId,
        method: request.method,
        path: url.pathname,
        code: "INTERNAL_ERROR"
      });
      return errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        500,
        requestId
      );
    }
  },

  async scheduled(event, env, ctx) {
    // Scheduled reports remain independent of browser Access authentication.
    ctx.waitUntil(handleScheduledReport(event, env));
  }
};
