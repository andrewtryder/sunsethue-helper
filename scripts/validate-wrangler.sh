#!/usr/bin/env bash
# Validate Wrangler configurations without deploying anything.
#
# Uses the Wrangler version pinned in package.json so local, CI, deployment, and
# rollback runs all agree. Generates configs from templates first so a fresh
# clone with placeholder defaults still validates.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

WORKER_CONFIG="wrangler.worker.toml"
ADMIN_CONFIG="wrangler.credential-admin.toml"
PAGES_CONFIG="wrangler.toml"
DRY_RUN_OUT=".wrangler/validate-dry-run"

echo "==> Generating Wrangler configs from templates"
npm run config:generate

# Resolve the expected Worker service name without printing secrets.
EXPECTED_WORKER="$(
  node --input-type=module -e '
    import { resolveProject } from "./scripts/lib/project-config.mjs";
    process.stdout.write(resolveProject({ strict: false }).workerName);
  '
)"
EXPECTED_ADMIN="$(
  node --input-type=module -e '
    import { resolveProject } from "./scripts/lib/project-config.mjs";
    process.stdout.write(resolveProject({ strict: false }).credentialAdminWorkerName);
  '
)"

echo "Wrangler version: $(npx --no -- wrangler --version | tail -n 1)"

echo
echo "==> Worker bundle and bindings (${WORKER_CONFIG}, dry run, no deploy)"
npx --no -- wrangler deploy --dry-run --outdir "$DRY_RUN_OUT" --config "$WORKER_CONFIG"

echo
echo "==> Credential-admin Worker bundle (${ADMIN_CONFIG}, dry run, no deploy)"
npx --no -- wrangler deploy --dry-run --outdir "${DRY_RUN_OUT}-admin" --config "$ADMIN_CONFIG"

echo
echo "==> Pages Functions build (${PAGES_CONFIG}, no deploy)"
npx --no -- wrangler pages functions build \
  --outfile "${DRY_RUN_OUT}/pages-functions.js" \
  --compatibility-date "$(grep -m1 '^compatibility_date' "$PAGES_CONFIG" | cut -d'"' -f2)" \
  functions

echo
echo "==> Required configuration invariants"

require_line() {
  local file="$1" pattern="$2" description="$3"
  if ! grep -Eq "$pattern" "$file"; then
    echo "MISSING in ${file}: ${description}" >&2
    return 1
  fi
  echo "ok  ${file}: ${description}"
}

failures=0

# The Worker must stay private; browser traffic only arrives via the Pages binding.
require_line "$WORKER_CONFIG" '^workers_dev[[:space:]]*=[[:space:]]*false' 'workers_dev is disabled' || failures=1
require_line "$WORKER_CONFIG" '^preview_urls[[:space:]]*=[[:space:]]*false' 'preview_urls is disabled' || failures=1
require_line "$WORKER_CONFIG" '^crons[[:space:]]*=' 'cron trigger is configured' || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"DB"' 'D1 binding DB is declared' || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"CREDENTIAL_ADMIN"' 'CREDENTIAL_ADMIN service binding is declared' || failures=1
require_line "$WORKER_CONFIG" "^service[[:space:]]*=[[:space:]]*\"${EXPECTED_ADMIN}\"" "CREDENTIAL_ADMIN targets ${EXPECTED_ADMIN}" || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"EMAIL_TRANSPORT_SECRET"' 'EMAIL_TRANSPORT_SECRET binding is declared' || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"PUSHOVER_TRANSPORT_SECRET"' 'PUSHOVER_TRANSPORT_SECRET binding is declared' || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"WEBHOOK_TRANSPORT_SECRET"' 'WEBHOOK_TRANSPORT_SECRET binding is declared' || failures=1
require_line "$WORKER_CONFIG" '^binding[[:space:]]*=[[:space:]]*"WEB_PUSH_VAPID_PRIVATE"' 'WEB_PUSH_VAPID_PRIVATE binding is declared' || failures=1
require_line "$WORKER_CONFIG" 'secret_name[[:space:]]*=[[:space:]]*"SUNSETHUE_EMAIL_TRANSPORT"' 'email Secrets Store secret name is declared' || failures=1
require_line "$WORKER_CONFIG" 'secret_name[[:space:]]*=[[:space:]]*"SUNSETHUE_PUSHOVER_TRANSPORT"' 'pushover Secrets Store secret name is declared' || failures=1
require_line "$WORKER_CONFIG" 'secret_name[[:space:]]*=[[:space:]]*"SUNSETHUE_WEBHOOK_TRANSPORT"' 'webhook Secrets Store secret name is declared' || failures=1
require_line "$WORKER_CONFIG" 'secret_name[[:space:]]*=[[:space:]]*"SUNSETHUE_WEB_PUSH_VAPID"' 'web push VAPID Secrets Store secret name is declared' || failures=1

require_line "$ADMIN_CONFIG" '^workers_dev[[:space:]]*=[[:space:]]*false' 'credential-admin workers_dev is disabled' || failures=1
require_line "$ADMIN_CONFIG" '^preview_urls[[:space:]]*=[[:space:]]*false' 'credential-admin preview_urls is disabled' || failures=1
require_line "$ADMIN_CONFIG" '^binding[[:space:]]*=[[:space:]]*"EMAIL_TRANSPORT_SECRET"' 'credential-admin EMAIL_TRANSPORT_SECRET binding' || failures=1
require_line "$ADMIN_CONFIG" '^binding[[:space:]]*=[[:space:]]*"PUSHOVER_TRANSPORT_SECRET"' 'credential-admin PUSHOVER_TRANSPORT_SECRET binding' || failures=1
require_line "$ADMIN_CONFIG" 'main[[:space:]]*=[[:space:]]*"worker/credential-admin/index.js"' 'credential-admin entrypoint' || failures=1

require_line "$PAGES_CONFIG" '^pages_build_output_dir[[:space:]]*=' 'Pages output directory is set' || failures=1
require_line "$PAGES_CONFIG" '^binding[[:space:]]*=[[:space:]]*"API_SERVICE"' 'API_SERVICE binding is declared' || failures=1
require_line "$PAGES_CONFIG" "^service[[:space:]]*=[[:space:]]*\"${EXPECTED_WORKER}\"" "API_SERVICE targets ${EXPECTED_WORKER}" || failures=1

# Secrets must never be committed as plaintext vars on the main Worker.
for forbidden in SUNSETHUE_API_KEY GMAIL_APP_PASSWORD GMAIL_USER PUSHOVER_APP_TOKEN PUSHOVER_USER_KEY POLICY_AUD TEAM_DOMAIN AUTHORIZED_EMAIL CONTACT_EMAIL CLOUDFLARE_API_TOKEN; do
  if grep -Eq "^[[:space:]]*${forbidden}[[:space:]]*=" "$WORKER_CONFIG" "$PAGES_CONFIG"; then
    echo "FORBIDDEN: ${forbidden} is set as a plaintext var on main/pages config" >&2
    failures=1
  fi
done

# Management token must not appear as a plaintext var on the admin Worker either
# (it is uploaded as a secret). Account/store IDs are non-secret vars.
if grep -Eq '^[[:space:]]*CLOUDFLARE_API_TOKEN[[:space:]]*=' "$ADMIN_CONFIG"; then
  echo "FORBIDDEN: CLOUDFLARE_API_TOKEN must be a Worker secret, not a var" >&2
  failures=1
fi

# Generated configs must never retain template tokens.
if grep -Eq '\{\{[A-Z0-9_]+\}\}' "$WORKER_CONFIG" "$PAGES_CONFIG" "$ADMIN_CONFIG"; then
  echo "FORBIDDEN: unresolved template tokens remain in generated Wrangler configs" >&2
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  echo
  echo "Wrangler configuration validation failed." >&2
  exit 1
fi

echo
echo "Wrangler configuration validation passed. Nothing was deployed."
