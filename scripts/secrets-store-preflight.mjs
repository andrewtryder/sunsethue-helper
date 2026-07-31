#!/usr/bin/env node
/**
 * Non-mutating Secrets Store preflight for production deploys.
 */
import { preflightSecretsStore } from "./lib/secrets-store.mjs";
import { requireEnv } from "./lib/cloudflare.mjs";

async function main() {
  try {
    const storeId = requireEnv("SECRETS_STORE_ID");
    const result = await preflightSecretsStore(storeId);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "PREFLIGHT_FAILED" }));
    process.exitCode = 1;
  }
}

main();
