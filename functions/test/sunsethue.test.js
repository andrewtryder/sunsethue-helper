const test = require("node:test");
const assert = require("node:assert");
const {
  parseRateLimitHeaders,
  normalizeCreditsJson,
  fetchApiCredits
} = require("../lib/sunsethue");

test("parseRateLimitHeaders reads Sunsethue rate limit headers", () => {
  const parsed = parseRateLimitHeaders({
    get(name) {
      const values = {
        "x-ratelimit-limit": "50",
        "x-ratelimit-remaining": "49",
        "x-ratelimit-reset": "1780885606"
      };
      return values[name.toLowerCase()] ?? null;
    }
  });

  assert.deepStrictEqual(parsed, {
    remaining: 49,
    limit: 50,
    resetAt: 1780885606000,
    source: "rate-limit"
  });
});

test("normalizeCreditsJson accepts common quota response shapes", () => {
  assert.deepStrictEqual(normalizeCreditsJson({ remaining: 850, limit: 1000 }), {
    remaining: 850,
    limit: 1000,
    resetAt: null,
    source: "credits"
  });

  assert.deepStrictEqual(normalizeCreditsJson({ used: 150, limit: 1000 }), {
    remaining: 850,
    limit: 1000,
    resetAt: null,
    source: "credits"
  });

  assert.deepStrictEqual(normalizeCreditsJson({ daily_usage: 140, daily_quota: 1000 }), {
    remaining: 860,
    limit: 1000,
    resetAt: null,
    source: "credits"
  });
});

test("fetchApiCredits falls back to event probe rate-limit headers", async () => {
  const calls = [];

  const credits = await fetchApiCredits({
    apiKey: "test-key",
    fetch: async (url) => {
      calls.push(url);
      if (url.includes("/usage") || url.includes("/credits") || url.includes("/quota")) {
        return {
          ok: false,
          status: 404,
          headers: {
            get: () => "text/html"
          },
          json: async () => ({ message: "Cannot GET " + url })
        };
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            const values = {
              "content-type": "application/json",
              "x-ratelimit-limit": "50",
              "x-ratelimit-remaining": "42",
              "x-ratelimit-reset": "1780885606"
            };
            return values[name.toLowerCase()] ?? null;
          }
        },
        json: async () => ({ data: { type: "sunrise" } })
      };
    }
  });

  assert.strictEqual(credits.remaining, 42);
  assert.strictEqual(credits.limit, 50);
  assert.strictEqual(credits.source, "rate-limit");
  assert.ok(calls.some((url) => url.includes("/event?")));
});

test("fetchApiCredits retrieves and normalizes usage endpoint data", async () => {
  const credits = await fetchApiCredits({
    apiKey: "test-key",
    fetch: async (url) => {
      if (url.includes("/usage")) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n) => n.toLowerCase() === "content-type" ? "application/json" : null
          },
          json: async () => ({
            daily_usage: 140,
            daily_quota: 1000,
            plan: "paying"
          })
        };
      }
      throw new Error("Should not reach here");
    }
  });

  assert.strictEqual(credits.remaining, 860);
  assert.strictEqual(credits.limit, 1000);
  assert.strictEqual(credits.source, "usage");
});
