#!/usr/bin/env node
/**
 * Verify a deployed Web Push VAPID endpoint.
 *
 * Fetches /api/web-push/vapid-public-key from the given base URL and asserts
 * configured:true with a valid 65-byte / 0x04 P-256 public key. Optionally
 * compares the returned public key to the WEB_PUSH_VAPID_PUBLIC_KEY environment
 * variable.
 *
 * Usage:
 *   npm run webpush:verify -- --url https://production.example.com
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidVapidPublicKey } from "./lib/webpush-vapid.mjs";

export function parseArgs(argv) {
  const args = {
    url: "",
    expected: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || ""
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      args.url = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--expected") {
      args.expected = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run webpush:verify -- --url https://production.example.com
  npm run webpush:verify -- --url https://production.example.com --expected BPublicKey...

Environment:
  WEB_PUSH_VAPID_PUBLIC_KEY  optional expected public key (also set via --expected)

Checks:
  - endpoint returns 2xx
  - response.configured === true
  - response.publicKey is a valid 65-byte / 0x04 P-256 VAPID public key
  - if --expected or WEB_PUSH_VAPID_PUBLIC_KEY is set, the returned public key matches
`);
}

export async function verifyRemote(url) {
  const base = (url || "").replace(/\/$/, "");
  if (!base || !/^https:\/\//i.test(base)) {
    throw new Error("Provide a valid --url starting with https://");
  }
  const endpoint = `${base}/api/web-push/vapid-public-key`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`VERIFY_HTTP_${response.status}`);
  }
  const body = await response.json().catch(() => ({}));
  if (body?.configured !== true || !body?.publicKey) {
    throw new Error("VERIFY_NOT_CONFIGURED");
  }
  if (!isValidVapidPublicKey(body.publicKey)) {
    throw new Error("VERIFY_INVALID_PUBLIC_KEY");
  }
  return { endpoint, publicKey: body.publicKey, configured: body.configured };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  try {
    const result = await verifyRemote(args.url);
    const report = {
      ok: true,
      endpoint: result.endpoint,
      configured: result.configured,
      publicKey: result.publicKey
    };
    if (args.expected) {
      if (result.publicKey !== args.expected.trim()) {
        console.error(JSON.stringify({
          ok: false,
          error: "VERIFY_PUBLIC_KEY_MISMATCH",
          endpoint: result.endpoint,
          returnedPublicKey: result.publicKey
        }));
        process.exitCode = 1;
        return;
      }
      report.expectedPublicKeyMatched = true;
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "VERIFY_FAILED";
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}
