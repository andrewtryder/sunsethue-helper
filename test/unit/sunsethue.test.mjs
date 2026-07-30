import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchApiCredits,
  normalizeCreditsJson,
  parseRateLimitHeaders
} from "../../worker/sunsethue.js";
import { createFetchFake, jsonOk } from "../support/fakes.mjs";

test("rate limit headers are parsed from a Headers instance", () => {
  const parsed = parseRateLimitHeaders(
    new Headers({
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "37",
      "x-ratelimit-reset": "1750000000"
    })
  );
  assert.deepEqual(parsed, {
    remaining: 37,
    limit: 100,
    resetAt: 1750000000000,
    source: "rate-limit"
  });
});

test("rate limit headers are parsed case-insensitively from a plain object", () => {
  const parsed = parseRateLimitHeaders({
    "X-RateLimit-Limit": "50",
    "X-RateLimit-Remaining": "5"
  });
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.resetAt, null);
});

test("incomplete or non-numeric rate limit headers are ignored", () => {
  assert.equal(parseRateLimitHeaders(null), null);
  assert.equal(parseRateLimitHeaders(new Headers()), null);
  assert.equal(parseRateLimitHeaders({ "x-ratelimit-limit": "100" }), null);
  assert.equal(
    parseRateLimitHeaders({ "x-ratelimit-limit": "abc", "x-ratelimit-remaining": "1" }),
    null
  );
});

test("credit payloads are normalized across the documented field spellings", () => {
  assert.equal(normalizeCreditsJson({ remaining: 10, limit: 20 }).remaining, 10);
  assert.equal(normalizeCreditsJson({ credits_remaining: 8, credits_limit: 20 }).remaining, 8);
  assert.equal(normalizeCreditsJson({ daily_limit: 20, daily_usage: 5 }).remaining, 15);
  assert.equal(normalizeCreditsJson({ requests_remaining: 3 }).limit, null);
});

test("unusable credit payloads normalize to null", () => {
  assert.equal(normalizeCreditsJson(null), null);
  assert.equal(normalizeCreditsJson([1, 2]), null);
  assert.equal(normalizeCreditsJson({ unrelated: true }), null);
});

test("a missing API key is rejected before any request is made", async () => {
  const fetchFake = createFetchFake({});
  await assert.rejects(
    () => fetchApiCredits({ fetch: fetchFake, apiKey: "" }),
    /SUNSETHUE_API_KEY/
  );
  assert.equal(fetchFake.calls.length, 0);
});

test("the first usable credits endpoint wins and the key is url-encoded", async () => {
  let seenKey = null;
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) => {
      seenKey = url.searchParams.get("key");
      return jsonOk({ remaining: 12, limit: 50 });
    }
  });

  const credits = await fetchApiCredits({ fetch: fetchFake, apiKey: " key/with+chars " });
  assert.equal(credits.remaining, 12);
  assert.equal(credits.source, "usage");
  assert.equal(seenKey, "key/with+chars", "the key is trimmed and encoded, not logged");
  assert.equal(fetchFake.calls.length, 1);
});

test("404 responses fall through to the next endpoint", async () => {
  const paths = [];
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) => {
      paths.push(url.pathname);
      if (url.pathname === "/usage" || url.pathname === "/credits") {
        return jsonOk({ message: "Cannot GET /usage" }, { status: 404 });
      }
      return jsonOk({ remaining: 1, limit: 2 });
    }
  });

  const credits = await fetchApiCredits({ fetch: fetchFake, apiKey: "k" });
  assert.deepEqual(paths, ["/usage", "/credits", "/quota"]);
  assert.equal(credits.source, "quota");
});

test("a non-404 upstream error propagates the upstream message", async () => {
  const fetchFake = createFetchFake({
    "api.sunsethue.com": () => jsonOk({ message: "Invalid API key" }, { status: 401 })
  });
  await assert.rejects(() => fetchApiCredits({ fetch: fetchFake, apiKey: "k" }), /Invalid API key/);
});

test("when no credits endpoint exists the event probe supplies rate limit headers", async () => {
  const paths = [];
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) => {
      paths.push(url.pathname);
      if (url.pathname === "/event") {
        return new Response("{}", {
          status: 200,
          headers: { "x-ratelimit-limit": "500", "x-ratelimit-remaining": "499" }
        });
      }
      return jsonOk({ message: "Not Found" }, { status: 404 });
    }
  });

  const credits = await fetchApiCredits({ fetch: fetchFake, apiKey: "k" });
  assert.equal(credits.source, "rate-limit");
  assert.equal(credits.remaining, 499);
  assert.equal(paths.at(-1), "/event");
});

test("an event probe without rate limit headers reports a clear failure", async () => {
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) =>
      url.pathname === "/event"
        ? new Response("{}", { status: 200 })
        : jsonOk({ message: "Not Found" }, { status: 404 })
  });
  await assert.rejects(
    () => fetchApiCredits({ fetch: fetchFake, apiKey: "k" }),
    /did not return rate limit headers/
  );
});

test("a failing event probe surfaces the upstream status", async () => {
  const fetchFake = createFetchFake({
    "api.sunsethue.com": (url) =>
      url.pathname === "/event"
        ? new Response("nope", { status: 500 })
        : jsonOk({ message: "Not Found" }, { status: 404 })
  });
  await assert.rejects(
    () => fetchApiCredits({ fetch: fetchFake, apiKey: "k" }),
    /HTTP status 500/
  );
});
