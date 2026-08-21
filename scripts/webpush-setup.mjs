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
 */
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
  isValidVapidSubject,
  isValidVapidPublicKey
} from "./lib/webpush-vapid.mjs";

function parseArgs(argv) {
  const args = { subject: process.env.WEB_PUSH_SUBJECT || "", verifyUrl: process.env.WEBPUSH_VERIFY_URL || "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--subject") {
      args.subject = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--verify-url") {
      args.verifyUrl = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run webpush:setup -- --subject mailto:ops@example.com [--verify-url https://production.example.com]

Required:
  --subject      mailto: or https:// URL used as VAPID JWT subject
                 (or set WEB_PUSH_SUBJECT env var)

Environment:
  CLOUDFLARE_API_TOKEN   scoped token with Secrets Store Edit
  CLOUDFLARE_ACCOUNT_ID  32-hex account id
  SECRETS_STORE_ID       existing Secrets Store id (from secrets-store:bootstrap)

Optional:
  --verify-url  production base URL; after deploy, fetch /api/web-push/vapid-public-key
                and assert configured:true with a 65-byte / 0x04 public key.
`);
}

function assertNoPrivateMaterial(text) {
  if (typeof text === "string" && /BEGIN PRIVATE KEY|BEGIN EC PRIVATE KEY|BEGIN RSA PRIVATE KEY/.test(text)) {
    throw new Error("Refusing to print output that contains a private key");
  }
}

async function verifyRemote(url) {
  const endpoint = `${url.replace(/\/$/, "")}/api/web-push/vapid-public-key`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`VERIFY_HTTP_${response.status}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!body?.configured || !body?.publicKey) {
    throw new Error("VERIFY_NOT_CONFIGURED");
  }
  if (!isValidVapidPublicKey(body.publicKey)) {
    throw new Error("VERIFY_INVALID_PUBLIC_KEY");
  }
  return { endpoint, configured: body.configured };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const subject = (args.subject || "").trim();
  if (!isValidVapidSubject(subject)) {
    console.error(JSON.stringify({
      ok: false,
      error: "Missing or invalid --subject. Provide a mailto: or https:// URL."
    }));
    process.exitCode = 1;
    return;
  }

  assertScopedApiToken();
  await verifyToken();

  const storeId = process.env.SECRETS_STORE_ID;
  if (typeof storeId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(storeId.trim())) {
    console.error(JSON.stringify({ ok: false, error: "Invalid or missing SECRETS_STORE_ID" }));
    process.exitCode = 1;
    return;
  }

  const { publicKeyBase64Url, privateKeyPem } = await generateVapidKeyPair();
  const document = buildVapidSecretDocument(privateKeyPem);

  const existing = await findSecretByName(storeId, WEB_PUSH_VAPID_SECRET_NAME);
  let secretResult;
  if (existing?.id) {
    secretResult = await patchSecret(storeId, existing.id, {
      value: document,
      comment: "sunsethue-helper web push vapid keys",
      scopes: ["workers"]
    });
  } else {
    secretResult = await createSecret(storeId, {
      name: WEB_PUSH_VAPID_SECRET_NAME,
      value: document,
      comment: "sunsethue-helper web push vapid keys",
      scopes: ["workers"]
    });
  }
  const activated = await waitForSecretActive(storeId, secretResult.id);

  const summary = {
    ok: true,
    secret: {
      name: WEB_PUSH_VAPID_SECRET_NAME,
      id: activated.id,
      status: activated.status,
      action: existing?.id ? "updated" : "created"
    },
    publicKey: publicKeyBase64Url,
    subject,
    nextSteps: [
      "Set GitHub production environment variables:",
      `  WEB_PUSH_VAPID_PUBLIC_KEY=${publicKeyBase64Url}`,
      `  WEB_PUSH_SUBJECT=${subject}`,
      "Redeploy the Worker (production workflow or `wrangler deploy --keep-vars --config wrangler.worker.toml`).",
      "Retry Browser Push registration in Settings; expect POST /api/web-push/subscriptions."
    ]
  };
  assertNoPrivateMaterial(JSON.stringify(summary));
  console.log(JSON.stringify(summary, null, 2));

  if (args.verifyUrl) {
    try {
      const result = await verifyRemote(args.verifyUrl);
      console.log(JSON.stringify({ verify: { ok: true, ...result } }, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "VERIFY_FAILED";
      console.error(JSON.stringify({ verify: { ok: false, error: message } }));
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "WEBPUSH_SETUP_FAILED";
  assertNoPrivateMaterial(message);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
