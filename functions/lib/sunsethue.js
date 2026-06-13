const SUNSETHUE_API_BASE = "https://api.sunsethue.com";

function getHeader(headers, name) {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function parseRateLimitHeaders(headers) {
  const limitRaw = getHeader(headers, "x-ratelimit-limit");
  const remainingRaw = getHeader(headers, "x-ratelimit-remaining");
  const resetRaw = getHeader(headers, "x-ratelimit-reset");

  if (limitRaw === null || remainingRaw === null) {
    return null;
  }

  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  const resetSeconds = resetRaw !== null ? Number(resetRaw) : null;

  if (Number.isNaN(limit) || Number.isNaN(remaining)) {
    return null;
  }

  return {
    remaining,
    limit,
    resetAt: resetSeconds && !Number.isNaN(resetSeconds) ? resetSeconds * 1000 : null,
    source: "rate-limit"
  };
}

function normalizeCreditsJson(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }

  const remaining = json.remaining ?? json.remaining_credits ?? json.credits_remaining ?? json.requests_remaining;
  const limit = json.limit ?? json.daily_limit ?? json.credits_limit ?? json.total ?? json.requests_limit ?? json.daily_quota;
  const used = json.used ?? json.credits_used ?? json.requests_used ?? json.daily_usage;

  if (remaining === undefined && limit === undefined && used === undefined) {
    return null;
  }

  let normalizedRemaining = remaining !== undefined ? Number(remaining) : null;
  let normalizedLimit = limit !== undefined ? Number(limit) : null;

  if (normalizedRemaining === null && normalizedLimit !== null && used !== undefined) {
    normalizedRemaining = normalizedLimit - Number(used);
  }

  if (normalizedRemaining === null && normalizedLimit === null) {
    return null;
  }

  const resetAt = json.resetAt ?? json.reset_at ?? json.resets_at ?? null;

  return {
    remaining: normalizedRemaining,
    limit: normalizedLimit,
    resetAt: resetAt ? Number(resetAt) : null,
    source: "credits"
  };
}

function getProbeDateET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function fetchCreditsFromEndpoint(fetchFn, apiKey, path) {
  const response = await fetchFn(`${SUNSETHUE_API_BASE}/${path}?key=${encodeURIComponent(apiKey)}`);
  const contentType = getHeader(response.headers, "content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.message || json.error || `Sunsethue API returned HTTP status ${response.status}`);
    }
    const normalized = normalizeCreditsJson(json);
    if (normalized) {
      return { ...normalized, source: path };
    }
  }

  const rateLimit = parseRateLimitHeaders(response.headers);
  if (rateLimit) {
    return rateLimit;
  }

  return null;
}

async function fetchRateLimitViaEventProbe(fetchFn, apiKey) {
  const date = getProbeDateET();
  const url = `${SUNSETHUE_API_BASE}/event?latitude=42.9286&longitude=-71.187&date=${date}&type=sunrise&key=${encodeURIComponent(apiKey)}`;
  const response = await fetchFn(url);

  const rateLimit = parseRateLimitHeaders(response.headers);
  if (rateLimit) {
    return rateLimit;
  }

  if (!response.ok) {
    let message = `Sunsethue API returned HTTP status ${response.status}`;
    try {
      const json = await response.json();
      if (json?.message) {
        message = json.message;
      }
    } catch {
      // Ignore JSON parse errors for non-JSON error bodies.
    }
    throw new Error(message);
  }

  throw new Error("Sunsethue API did not return rate limit headers");
}

async function fetchApiCredits({ fetch: fetchFn, apiKey }) {
  if (!apiKey) {
    throw new Error("SUNSETHUE_API_KEY environment variable is not configured.");
  }

  for (const path of ["usage", "credits", "quota"]) {
    try {
      const credits = await fetchCreditsFromEndpoint(fetchFn, apiKey, path);
      if (credits) {
        return credits;
      }
    } catch (error) {
      if (!/Cannot GET|404|Not Found/i.test(error.message)) {
        throw error;
      }
    }
  }

  return fetchRateLimitViaEventProbe(fetchFn, apiKey);
}

module.exports = {
  parseRateLimitHeaders,
  normalizeCreditsJson,
  fetchApiCredits
};
