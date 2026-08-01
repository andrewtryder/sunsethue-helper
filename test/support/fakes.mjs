/**
 * Fakes for every outbound dependency. No test may reach SMTP, Sunsethue,
 * Nominatim, Photon, or the Cloudflare Access JWKS endpoint.
 */

const HOST_HANDLERS = new Set([
  "api.sunsethue.com",
  "nominatim.openstreetmap.org",
  "photon.komoot.io"
]);

/**
 * Emulate a Cloudflare Secrets Store binding. The real binding exposes a
 * single `get()` method that resolves to the stored string document.
 */
export function fakeSecretsStoreBinding(document) {
  const payload = document === null || document === undefined ? null : (typeof document === "string" ? document : JSON.stringify(document));
  return {
    async get() {
      return payload;
    }
  };
}

const DEFAULT_EMAIL_TRANSPORT = Object.freeze({
  version: 1,
  configured: true,
  gmailUser: "reports@example.com",
  gmailAppPassword: "fake-app-password",
  emailFrom: '"Sunsethue Helper" <reports@example.com>'
});

const DEFAULT_PUSHOVER_TRANSPORT = Object.freeze({
  version: 1,
  configured: true,
  appToken: "abcdefghijklmnopqrstuvwxyz12",
  userKey: "zyxwvutsrqponmlkjihgfedcba98"
});

/**
 * Compose fake `EMAIL_TRANSPORT_SECRET` and `PUSHOVER_TRANSPORT_SECRET`
 * bindings for integration tests. Pass `null` for either channel to make
 * the resolver see the binding as unbound and fail closed. Pass a partial
 * override to keep the rest of the default configured document.
 */
export function transportBindings({ email, pushover } = {}) {
  const bindings = {};
  if (email !== null) {
    const document = email === undefined ? DEFAULT_EMAIL_TRANSPORT : { ...DEFAULT_EMAIL_TRANSPORT, ...email };
    bindings.EMAIL_TRANSPORT_SECRET = fakeSecretsStoreBinding(document);
  }
  if (pushover !== null) {
    const document = pushover === undefined ? DEFAULT_PUSHOVER_TRANSPORT : { ...DEFAULT_PUSHOVER_TRANSPORT, ...pushover };
    bindings.PUSHOVER_TRANSPORT_SECRET = fakeSecretsStoreBinding(document);
  }
  return bindings;
}

/**
 * Convenience helper: return an unconfigured sentinel binding for one channel.
 * The resolver treats this as "not configured" and fails closed.
 */
export function unconfiguredTransportBinding() {
  return fakeSecretsStoreBinding({ version: 1, configured: false });
}

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
