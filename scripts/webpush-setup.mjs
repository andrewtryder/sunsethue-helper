#!/usr/bin/env node
/**
 * One-time Web Push VAPID provisioning for sunsethue-helper.
 *
 * Generates a P-256 (ES256) VAPID keypair, writes the PKCS8 private key into
 * the SUNSETHUE_WEB_PUSH_VAPID secret in Cloudflare Secrets Store, and prints
 * the non-secret public key + subject the operator must set as Worker vars
 * (WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_SUBJECT) before redeploying.
 *
 * Requires:
 *   CLOUDFLARE_API_TOKEN (scoped, Secrets Store Edit)
 *   CLOUDFLARE_ACCOUNT_ID
 *   SECRETS_STORE_ID
 *   --subject mailto:ops@example.com  (or WEB_PUSH_SUBJECT env var)
 *
 * Never prints the private key. Refuses to log any string containing PEM markers.
 * Refuses to overwrite an existing secret unless --rotate is supplied, because
 * rotating the application-server key can require existing Browser Push devices
 * to register again. The sentinel secret created by `secrets-store:bootstrap` is
 * still an existing secret, so the first real provisioning run must use --rotate
 * to replace it.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertScopedApiToken,
  createSecret,
  findSecretByName,
  patchSecret,
  waitForSecretActive,
  WEB_PUSH_VAPID_SECRET_NAME
} from "./lib/secrets-store.mjs";
import { verifyToken } from "./lib/cloudflare.mjs";
import {
  buildVapidSecretDocument,
  generateVapidKeyPair,
  isValidVapidSubject
} from "./lib/webpush-vapid.mjs";

export function parseArgs(argv) {
  const args = {
    subject: process.env.WEB_PUSH_SUBJECT || "",
    rotate: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--subject") {
      args.subject = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--rotate") {
      args.rotate = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run webpush:setup -- --subject mailto:ops@example.com
  npm run webpush:setup -- --subject mailto:ops@example.com --rotate

Required:
  --subject      mailto: or https:// URL used as VAPID JWT subject
                 (or set WEB_PUSH_SUBJECT env var)

Environment:
  CLOUDFLARE_API_TOKEN   scoped token with Secrets Store Edit
  CLOUDFLARE_ACCOUNT_ID  32-hex account id
  SECRETS_STORE_ID       existing Secrets Store id (from secrets-store:bootstrap)

Options:
  --rotate     Overwrite an existing VAPID secret. Browser Push
               devices may need to register again after rotation.

Next steps:
  1. Set GitHub production environment variables from the printed output.
  2. Redeploy the Worker.
  3. Run npm run webpush:verify -- --url https://production.example.com
`);
}

export function assertNoPrivateMaterial(text) {
  if (typeof text === "string" && /BEGIN PRIVATE KEY|BEGIN EC PRIVATE KEY|BEGIN RSA PRIVATE KEY/.test(text)) {
    throw new Error("Refusing to print output that contains a private key");
  }
}

/**
 * Run the setup with injectable dependencies so unit tests can mock the
 * Cloudflare API and the keypair generator.
 */
export async function runSetup(deps) {
  const {
    argv = [],
    env = process.env,
    generate = generateVapidKeyPair,
    findSecret = findSecretByName,
    create = createSecret,
    patch = patchSecret,
    waitActive = waitForSecretActive,
    assertToken = assertScopedApiToken,
    verify = verifyToken,
    log = console.log,
    error = console.error
  } = deps;

  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { ok: true, help: true };
  }

  const subject = (args.subject || "").trim();
  if (!isValidVapidSubject(subject)) {
    error(JSON.stringify({
      ok: false,
      error: "Missing or invalid --subject. Provide a mailto: or https:// URL."
    }));
    return { ok: false, error: "Missing or invalid --subject. Provide a mailto: or https:// URL." };
  }

  assertToken();
  await verify();

  const storeId = env.SECRETS_STORE_ID;
  if (typeof storeId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(storeId.trim())) {
    error(JSON.stringify({ ok: false, error: "Invalid or missing SECRETS_STORE_ID" }));
    return { ok: false, error: "Invalid or missing SECRETS_STORE_ID" };
  }

  const existing = await findSecret(storeId, WEB_PUSH_VAPID_SECRET_NAME);
  if (existing && !args.rotate) {
    error(JSON.stringify({
      ok: false,
      error: "A VAPID secret already exists. To replace it, run again with --rotate. Existing Browser Push devices may need to register again after rotation."
    }));
    return { ok: false, error: "A VAPID secret already exists. To replace it, run again with --rotate." };
  }

  const { publicKeyBase64Url, privateKeyPem } = await generate();
  const document = buildVapidSecretDocument(privateKeyPem);

  let secretResult;
  if (existing?.id) {
    secretResult = await patch(storeId, existing.id, {
      value: document,
      comment: "sunsethue-helper web push vapid keys",
      scopes: ["workers"]
    });
  } else {
    secretResult = await create(storeId, {
      name: WEB_PUSH_VAPID_SECRET_NAME,
      value: document,
      comment: "sunsethue-helper web push vapid keys",
      scopes: ["workers"]
    });
  }
  const activated = await waitActive(storeId, secretResult.id);

  const summary = {
    ok: true,
    secret: {
      name: WEB_PUSH_VAPID_SECRET_NAME,
      id: activated.id,
      status: activated.status,
      action: existing?.id ? "rotated" : "created",
      rotation: args.rotate || false
    },
    publicKey: publicKeyBase64Url,
    subject,
    nextSteps: [
      "Set GitHub production environment variables:",
      `  WEB_PUSH_VAPID_PUBLIC_KEY=${publicKeyBase64Url}`,
      `  WEB_PUSH_SUBJECT=${subject}`,
      "Redeploy the Worker (production workflow or `wrangler deploy --keep-vars --config wrangler.worker.toml`).",
      "Run `npm run webpush:verify -- --url https://<production-host>` to confirm the endpoint.",
      "Retry Browser Push registration in Settings; expect POST /api/web-push/subscriptions."
    ]
  };
  assertNoPrivateMaterial(JSON.stringify(summary));
  log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  try {
    await runSetup({});
  } catch (error) {
    const message = error instanceof Error ? error.message : "WEBPUSH_SETUP_FAILED";
    assertNoPrivateMaterial(message);
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
