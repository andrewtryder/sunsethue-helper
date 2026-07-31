import { formatTimeOnlyET } from "../helpers.js";

export function buildNotificationPayload(model) {
  return {
    version: 1,
    triggerType: model.triggerType,
    generatedAt: model.generatedAt,
    dashboardUrl: model.dashboardUrl || null,
    locations: model.results.map((result) => ({
      name: result.name,
      sunrise: result.sunrise ? {
        time: result.sunrise.time || null,
        quality: result.sunrise.quality ?? null,
        text: result.sunrise.quality_text || null
      } : null,
      sunset: result.sunset ? {
        time: result.sunset.time || null,
        quality: result.sunset.quality ?? null,
        text: result.sunset.quality_text || null
      } : null,
      errorCode: result.error ? "FORECAST_UNAVAILABLE" : null
    }))
  };
}

export function parseNotificationPayload(payload) {
  let parsed;
  try { parsed = JSON.parse(payload); } catch { throw new Error("INVALID_NOTIFICATION_PAYLOAD"); }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.locations)) {
    throw new Error("INVALID_NOTIFICATION_PAYLOAD");
  }
  return parsed;
}

export function buildPushoverContent(payload) {
  const title = `Sunsethue ${payload.triggerType} forecast`.slice(0, 250);
  const items = payload.locations.slice(0, 10).map((location) => {
    if (location.errorCode) return `${location.name}: forecast unavailable`;
    const sunrise = location.sunrise?.time ? `sunrise ${formatTimeOnlyET(location.sunrise.time)}` : "sunrise N/A";
    const sunset = location.sunset?.time ? `sunset ${formatTimeOnlyET(location.sunset.time)}` : "sunset N/A";
    return `${location.name}: ${sunrise}, ${sunset}`;
  });
  return { title, message: items.join("\n").slice(0, 1024) || "Forecast report generated." };
}
