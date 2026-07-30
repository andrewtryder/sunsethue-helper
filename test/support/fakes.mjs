/**
 * Fakes for every outbound dependency. No test may reach SMTP, Sunsethue,
 * Nominatim, Photon, or the Cloudflare Access JWKS endpoint.
 */

const HOST_HANDLERS = new Set([
  "api.sunsethue.com",
  "nominatim.openstreetmap.org",
  "photon.komoot.io"
]);

export function jsonOk(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
}

/**
 * A fetch stand-in that refuses any host the tests have not explicitly faked.
 * @param {Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>} routes
 */
export function createFetchFake(routes = {}) {
  const calls = [];
  const fetchFake = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push({ url: url.toString(), host: url.host, method: init?.method || "GET" });

    const handler = routes[url.host];
    if (!handler) {
      throw new Error(
        `Unfaked outbound request to ${url.host}. Tests must never contact real services.`
      );
    }
    return handler(url, init);
  };
  fetchFake.calls = calls;
  fetchFake.knownHosts = [...HOST_HANDLERS];
  return fetchFake;
}

/** Records what would have been emailed instead of connecting to Gmail SMTP. */
export function createMailerFake({ failConnect = false, failSend = false } = {}) {
  const sent = [];
  const connections = [];

  const loadMailer = async () => ({
    WorkerMailer: {
      async connect(options) {
        connections.push({
          host: options.host,
          port: options.port,
          secure: options.secure,
          hasCredentials: Boolean(options.credentials?.username)
        });
        if (failConnect) {
          throw new Error("smtp connect failed");
        }
        return {
          async send(message) {
            if (failSend) {
              throw new Error("smtp send failed");
            }
            sent.push(message);
          }
        };
      }
    }
  });

  return { loadMailer, sent, connections };
}

export function sunsethueForecast({ quality = 0.75, baseTime = Date.now() } = {}) {
  const hour = 60 * 60 * 1000;
  return {
    data: [
      {
        type: "sunrise",
        time: new Date(baseTime + 6 * hour).toISOString(),
        quality,
        quality_text: "Good"
      },
      {
        type: "sunset",
        time: new Date(baseTime + 18 * hour).toISOString(),
        quality: quality - 0.2,
        quality_text: "Fair"
      }
    ]
  };
}
