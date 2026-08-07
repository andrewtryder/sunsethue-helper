/**
 * Frozen path × method matrix for every /api handler.
 * Route extractions must keep this list accurate; see test/unit/route-dispatch.test.mjs.
 */

/** @typedef {{ path: string, pathPrefix?: string, methods: string[], allow: string }} RouteContract */

/** @type {RouteContract[]} */
export const API_ROUTE_CONTRACTS = [
  { path: "/api/notification-settings", methods: ["GET", "PUT"], allow: "GET, PUT" },
  { path: "/api/application-settings", methods: ["GET", "PUT"], allow: "GET, PUT" },
  { path: "/api/location-notification-rules", methods: ["GET", "PUT", "POST"], allow: "GET, PUT, POST" },
  { path: "/api/web-push/vapid-public-key", methods: ["GET"], allow: "GET" },
  { path: "/api/web-push/subscriptions", methods: ["GET", "POST"], allow: "GET, POST" },
  {
    path: "/api/web-push/subscriptions/:id",
    pathPrefix: "/api/web-push/subscriptions/",
    methods: ["PATCH", "DELETE"],
    allow: "PATCH, DELETE"
  },
  { path: "/api/webhook-credentials", methods: ["GET", "PUT", "DELETE"], allow: "GET, PUT, DELETE" },
  { path: "/api/provider-credentials", methods: ["GET"], allow: "GET" },
  { path: "/api/provider-credentials/email", methods: ["PUT", "DELETE"], allow: "PUT, DELETE" },
  { path: "/api/provider-credentials/pushover", methods: ["PUT", "DELETE"], allow: "PUT, DELETE" },
  { path: "/api/notification-deliveries", methods: ["GET"], allow: "GET" },
  {
    path: "/api/notification-deliveries/:id/retry",
    pathPrefix: "/api/notification-deliveries/",
    pathSuffix: "/retry",
    methods: ["POST"],
    allow: "POST"
  },
  { path: "/api/notifications/test", methods: ["POST"], allow: "POST" },
  { path: "/api/getApiCredits", methods: ["GET"], allow: "GET" },
  { path: "/api/searchCoordinates", methods: ["POST"], allow: "POST" },
  { path: "/api/autocomplete", methods: ["POST"], allow: "POST" },
  { path: "/api/triggerReport", methods: ["POST"], allow: "POST" },
  { path: "/api/locations", methods: ["GET", "POST"], allow: "GET, POST" },
  {
    path: "/api/locations/:id",
    pathPrefix: "/api/locations/",
    methods: ["PUT", "DELETE"],
    allow: "PUT, DELETE"
  },
  { path: "/api/runs", methods: ["GET"], allow: "GET" },
  { path: "/api/notification-health", methods: ["GET"], allow: "GET" },
  { path: "/api/setup-status", methods: ["GET"], allow: "GET" },
  { path: "/api/history/export", methods: ["GET"], allow: "GET" },
  { path: "/api/history/clear", methods: ["POST"], allow: "POST" },
  { path: "/api/config", methods: [], allow: "", retired: true },
  { path: "/api/getAppConfig", methods: [], allow: "", retired: true }
];

export function listActiveRoutePaths() {
  return API_ROUTE_CONTRACTS.filter((entry) => !entry.retired).map((entry) => entry.path);
}
