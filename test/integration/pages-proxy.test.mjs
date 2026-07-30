import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createAccessToken } from "../helpers.mjs";

async function loadPagesProxy() {
  const modulePath = new URL("../../functions/api/[[path]].js", import.meta.url);
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

test("a missing service binding fails closed with 503 and reveals no configuration", async () => {
  const { onRequest } = await loadPagesProxy();
  const token = await createAccessToken();
  const errors = [];
  const originalError = console.error;
  console.error = (line) => errors.push(line);

  let response;
  try {
    response = await onRequest({
      request: new Request("https://sunsethue-helper.pages.dev/api/locations", {
        headers: { "Cf-Access-Jwt-Assertion": token }
      }),
      env: {},
      params: { path: ["locations"] }
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "MISCONFIGURED");
  assert.doesNotMatch(JSON.stringify(body), /API_SERVICE|binding|worker/i);
  assert.equal(errors.length, 1);
  assert.doesNotMatch(errors[0], new RegExp(token.slice(0, 20)));
});

test("a downstream failure becomes a generic 502", async () => {
  const { onRequest } = await loadPagesProxy();
  const token = await createAccessToken();
  const originalError = console.error;
  console.error = () => {};

  let response;
  try {
    response = await onRequest({
      request: new Request("https://sunsethue-helper.pages.dev/api/locations", {
        headers: { "Cf-Access-Jwt-Assertion": token }
      }),
      env: {
        API_SERVICE: {
          async fetch() {
            throw new Error("service binding refused: internal detail");
          }
        }
      },
      params: { path: ["locations"] }
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, "PROXY_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /internal detail|service binding/);
});

test("the local bypass forwards without an assertion only on loopback", async () => {
  const { onRequest } = await loadPagesProxy();
  let forwarded = 0;
  const env = {
    DEV_AUTH_BYPASS: "true",
    API_SERVICE: {
      async fetch() {
        forwarded += 1;
        return new Response("[]", { status: 200 });
      }
    }
  };

  const loopback = await onRequest({
    request: new Request("http://127.0.0.1:8788/api/locations"),
    env,
    params: { path: ["locations"] }
  });
  assert.equal(loopback.status, 200);
  assert.equal(forwarded, 1);

  for (const host of ["sunsethue-helper.pages.dev", "sunsethue-helper-worker.example.workers.dev", "evil.example"]) {
    const response = await onRequest({
      request: new Request(`https://${host}/api/locations`),
      env,
      params: { path: ["locations"] }
    });
    assert.equal(response.status, 401, host);
    assert.equal(forwarded, 1, `${host} must not reach the Worker`);
  }
});

test("a nested path with no params still targets /api", async () => {
  const { onRequest } = await loadPagesProxy();
  const token = await createAccessToken();
  let capturedUrl = null;

  await onRequest({
    request: new Request("https://sunsethue-helper.pages.dev/api/locations/abc", {
      method: "DELETE",
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    env: {
      API_SERVICE: {
        async fetch(request) {
          capturedUrl = new URL(request.url);
          return new Response("{}", { status: 200 });
        }
      }
    },
    params: { path: "locations" }
  });

  assert.equal(capturedUrl.pathname, "/api/locations");
});

test("static asset routes are not defined as Pages API proxy targets", async () => {
  const routes = JSON.parse(
    await readFile(new URL("../../public/_routes.json", import.meta.url), "utf8")
  );
  assert.deepEqual(routes.include, ["/api/*"]);
  assert.equal(routes.version, 1);
  const appJs = await readFile(new URL("../../public/app.js", import.meta.url), "utf8");
  assert.match(appJs, /const API_BASE = ""/);
  assert.doesNotMatch(appJs, /workers\.dev/);
});
