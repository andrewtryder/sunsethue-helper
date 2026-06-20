import { handleHttpRequest } from "./api.js";
import { handleScheduledReport } from "./cron.js";

export default {
  async fetch(request, env, ctx) {
    return handleHttpRequest(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduledReport(event, env));
  }
};
