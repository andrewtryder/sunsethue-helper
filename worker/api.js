import { fetchApiCredits } from "./sunsethue.js";
import { runAndSendReport } from "./report.js";
import * as db from "./db.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function handleHttpRequest(request, env) {
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // 1. GET /api/config
    if (path === "/api/config" || path === "/api/getAppConfig") {
      if (request.method !== "GET") return jsonResponse({ error: "Method Not Allowed" }, 405);
      return jsonResponse({
        authorizedEmail: (env.AUTHORIZED_EMAIL || env.EMAIL_TO || "").trim()
      });
    }

    // 2. GET /api/getApiCredits
    if (path === "/api/getApiCredits") {
      if (request.method !== "GET") return jsonResponse({ error: "Method Not Allowed" }, 405);
      const apiKey = env.SUNSETHUE_API_KEY;
      const credits = await fetchApiCredits({ fetch, apiKey });
      return jsonResponse(credits);
    }

    // 3. POST /api/searchCoordinates
    if (path === "/api/searchCoordinates") {
      if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
      const { query } = await request.json();
      if (!query) return jsonResponse({ error: "Missing search query" }, 400);

      const userAgentEmail = env.EMAIL_TO || "user@example.com";
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": `SunsethueHelper/1.0 (${userAgentEmail})`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API returned HTTP status ${response.status}`);
      }

      const data = await response.json();
      return jsonResponse(data);
    }

    // 4. POST /api/triggerReport
    if (path === "/api/triggerReport") {
      if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
      await runAndSendReport("Manual Test", env);
      return jsonResponse({ success: true, message: "Report processed and email sent." });
    }

    // 5. Locations endpoints (/api/locations)
    if (path === "/api/locations") {
      if (request.method === "GET") {
        const locations = await db.getLocations(env);
        return jsonResponse(locations);
      }

      if (request.method === "POST") {
        const { name, latitude, longitude } = await request.json();
        if (!name || latitude === undefined || longitude === undefined) {
          return jsonResponse({ error: "Missing required fields" }, 400);
        }
        const id = crypto.randomUUID();
        const newLoc = { id, name, latitude, longitude, createdAt: Date.now() };
        await db.addLocation(env, newLoc);
        return jsonResponse({ success: true, location: newLoc });
      }

      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    // PUT /api/locations/:id and DELETE /api/locations/:id
    if (path.startsWith("/api/locations/")) {
      const id = path.substring("/api/locations/".length);
      if (!id) return jsonResponse({ error: "Missing ID" }, 400);

      if (request.method === "PUT") {
        const { name, latitude, longitude } = await request.json();
        if (!name || latitude === undefined || longitude === undefined) {
          return jsonResponse({ error: "Missing required fields" }, 400);
        }
        await db.updateLocation(env, id, { name, latitude, longitude });
        return jsonResponse({ success: true });
      }

      if (request.method === "DELETE") {
        await db.deleteLocation(env, id);
        return jsonResponse({ success: true });
      }

      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    // 6. GET /api/runs
    if (path === "/api/runs") {
      if (request.method !== "GET") return jsonResponse({ error: "Method Not Allowed" }, 405);
      const runs = await db.getRuns(env);
      return jsonResponse(runs);
    }

    // Route not found
    return jsonResponse({ error: "Not Found" }, 404);

  } catch (error) {
    console.error("API error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}
