import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createAccessToken } from "./helpers.mjs";

async function loadPagesProxy() {
  const modulePath = new URL("../functions/api/[[path]].js", import.meta.url);
  return import(pathToFileURL(modulePath.pathname).href);
}

test("/api/* is forwarded through the service binding", async () => {
  const { onRequest } = await loadPagesProxy();
  const token = await createAccessToken();
  let captured = null;

  const response = await onRequest({
    request: new Request("https://sunsethue-helper.pages.dev/api/locations?limit=1", {
      method: "GET",
      headers: {
        "Cf-Access-Jwt-Assertion": token,
        "X-Custom": "keep-me",
        Connection: "keep-alive",
        "Keep-Alive": "timeout=5"
      }
    }),
    env: {
      API_SERVICE: {
        async fetch(request) {
          captured = request;
          return new Response(JSON.stringify([{ id: "1" }]), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
    },
    params: { path: ["locations"] }
  });

  assert.equal(response.status, 200);
  assert.ok(captured);
  const capturedUrl = new URL(captured.url);
  assert.equal(capturedUrl.pathname, "/api/locations");
  assert.equal(capturedUrl.search, "?limit=1");
  assert.equal(captured.method, "GET");
  assert.equal(captured.headers.get("Cf-Access-Jwt-Assertion"), token);
  assert.equal(captured.headers.get("X-Custom"), "keep-me");
  assert.equal(captured.headers.get("Keep-Alive"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("method path query and body are preserved", async () => {
  const { onRequest } = await loadPagesProxy();
  const token = await createAccessToken();
  let captured = null;

  await onRequest({
    request: new Request("https://sunsethue-helper.pages.dev/api/searchCoordinates?x=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": token
      },
      body: JSON.stringify({ query: "nyc" })
    }),
    env: {
      API_SERVICE: {
        async fetch(request) {
          captured = {
            method: request.method,
            url: request.url,
            body: await request.text(),
            assertion: request.headers.get("Cf-Access-Jwt-Assertion")
          };
          return new Response("{}", { status: 200 });
        }
      }
    },
    params: { path: ["searchCoordinates"] }
  });

  assert.equal(captured.method, "POST");
  assert.match(captured.url, /\/api\/searchCoordinates\?x=1$/);
  assert.equal(captured.body, JSON.stringify({ query: "nyc" }));
  assert.equal(captured.assertion, token);
});

test("missing Access assertion is rejected outside local bypass", async () => {
  const { onRequest } = await loadPagesProxy();
  const response = await onRequest({
    request: new Request("https://sunsethue-helper.pages.dev/api/locations"),
    env: {
      API_SERVICE: {
        async fetch() {
          throw new Error("should not be called");
        }
      }
    },
    params: { path: ["locations"] }
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "UNAUTHENTICATED");
});

test("static asset routes are not defined as Pages API proxy targets", async () => {
  const routes = JSON.parse(
    await readFile(new URL("../public/_routes.json", import.meta.url), "utf8")
  );
  assert.deepEqual(routes.include, ["/api/*"]);
  assert.equal(routes.version, 1);
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(appJs, /const API_BASE = ""/);
  assert.doesNotMatch(appJs, /workers\.dev/);
});
