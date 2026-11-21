/**
 * Optional model-run freshness hints.
 *
 * Only an explicit run ID attached to a successful forecast response may be
 * written to the location cache. The current-run endpoint is checked once per
 * scheduled report, never once per location. Unknown API contracts fail open
 * to normal forecast fetching; they can never cause a stale-cache hit.
 */
const RUN_INFO_URL = "https://api.sunsethue.com/run-info";
const RUN_ID_KEYS = ["run_id", "run_identifier", "runId", "current_run_id", "model_run", "current_run", "run"];

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function validId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function idFrom(value, nested = false) {
  const item = object(value);
  if (!item) return null;
  for (const key of nested ? [...RUN_ID_KEYS, "id", "identifier"] : RUN_ID_KEYS) {
    const found = validId(item[key]);
    if (found) return found;
  }
  return null;
}

/** Live /run-info exposes ISO timestamps on last_run before next_run. */
function flatRunTimestamps(part) {
  const item = object(part);
  if (!item) return null;
  return validId(item.last_run) ?? validId(item.next_run) ?? validId(item.run_id) ?? null;
}

/** Return the current model run from a recognized response shape, or null. */
export function parseModelRunId(payload) {
  const root = object(payload);
  if (!root) return null;
  const data = object(root.data);
  for (const node of [root, data].filter(Boolean)) {
    const runInfo = object(node.run_info);
    for (const part of [node, runInfo].filter(Boolean)) {
      const direct = idFrom(part);
      if (direct) return direct;
      const flat = flatRunTimestamps(part);
      if (flat) return flat;
      const runs = object(part.runs);
      for (const current of [part.current_run, part.current, part.run, part.last_run, runs?.current]) {
        if (typeof current === "string") {
          const fromString = validId(current);
          if (fromString) return fromString;
          continue;
        }
        const nested = idFrom(current, true);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/**
 * A successful bulk-forecast payload may expose one run ID at the root or
 * consistently on every event. Never infer a forecast's run ID from /run-info;
 * we do not yet have an independently verified contract for the bulk endpoint.
 */
export function forecastRunId(payload) {
  const root = object(payload);
  if (!root) return null;
  const direct = parseModelRunId(root);
  if (direct) return direct;
  if (!Array.isArray(root.data) || root.data.length === 0) return null;
  const ids = root.data.map(parseModelRunId);
  return ids.every((id) => id && id === ids[0]) ? ids[0] : null;
}

/** Query only when there is an eligible cached location to check. */
export async function fetchCurrentRunId({ fetch: fetchFn, apiKey }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  try {
    const response = await fetchFn(RUN_INFO_URL, {
      method: "GET",
      headers: { "x-api-key": apiKey.trim(), Accept: "application/json" },
      redirect: "error"
    });
    if (!response.ok) return null;
    const length = Number(response.headers?.get?.("content-length") ?? 0);
    if (length > 16_384) return null;
    const body = await response.text();
    if (body.length > 16_384) return null;
    return parseModelRunId(JSON.parse(body));
  } catch {
    // Unsupported endpoint, quota, network errors, invalid JSON: fetch normally.
    return null;
  }
}

/**
 * The helper only reports the NEXT sunrise and NEXT sunset. After either event
 * has passed the selected two-event cache is incomplete, even if the model run
 * has not changed. No stale or error forecasts may be reused.
 */
export function cachedUpcomingEvents(loc, now) {
  if (!validId(loc?.forecastModelRunId) || loc.forecastError) return null;
  const sunriseMs = Date.parse(loc.latestSunriseTime);
  const sunsetMs = Date.parse(loc.latestSunsetTime);
  if (!Number.isFinite(sunriseMs) || !Number.isFinite(sunsetMs)) return null;
  if (sunriseMs <= now || sunsetMs <= now) return null;
  return {
    runId: loc.forecastModelRunId,
    sunrise: {
      type: "sunrise", time: loc.latestSunriseTime,
      quality: loc.latestSunriseQuality ?? null,
      quality_text: loc.latestSunriseText ?? null
    },
    sunset: {
      type: "sunset", time: loc.latestSunsetTime,
      quality: loc.latestSunsetQuality ?? null,
      quality_text: loc.latestSunsetText ?? null
    }
  };
}
