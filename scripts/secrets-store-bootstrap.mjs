#!/usr/bin/env node
/**
 * Idempotent Secrets Store bootstrap for sunsethue-helper provider credentials.
 *
 * Requires CLOUDFLARE_API_TOKEN (scoped) and CLOUDFLARE_ACCOUNT_ID.
 * Never accepts or prints secret values.
 */
import { bootstrapSecretsStore } from "./lib/secrets-store.mjs";

async function main() {
  try {
    const result = await bootstrapSecretsStore();
    console.log(
      JSON.stringify(
        {
          ok: true,
          storeId: result.storeIdRedacted,
          storeAction: result.storeAction,
          secrets: result.secrets.map((secret) => ({
            name: secret.name,
            action: secret.action,
            status: secret.status,
            scopes: secret.scopes,
            id: secret.id
          })),
          nextStep: "Set GitHub production environment variable SECRETS_STORE_ID to the full store id (not printed here in logs beyond redaction). Retrieve the full id from the Cloudflare dashboard or API if needed."
        },
        null,
        2
      )
    );
    // Print the full store ID once on stdout as a dedicated line so operators can
    // copy it into GitHub vars without grepping other logs. Still never prints values.
    console.log(`SECRETS_STORE_ID=${result.storeId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "BOOTSTRAP_FAILED";
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

main();
