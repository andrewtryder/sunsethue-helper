#!/usr/bin/env bash
# Validate both Wrangler configurations without deploying anything.
#
# Uses the Wrangler version pinned in package.json so local, CI, migration, and
# deployment runs all agree.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

WORKER_CONFIG="wrangler.worker.toml"
PAGES_CONFIG="wrangler.toml"
DRY_RUN_OUT=".wrangler/validate-dry-run"

echo "Wrangler version: $(npx --no -- wrangler --version | tail -n 1)"

echo
echo "==> Worker bundle and bindings (${WORKER_CONFIG}, dry run, no deploy)"
npx --no -- wrangler deploy --dry-run --outdir "$DRY_RUN_OUT" --config "$WORKER_CONFIG"

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
require_line "$WORKER_CONFIG" '^migrations_dir[[:space:]]*=[[:space:]]*"migrations"' 'D1 migrations_dir is set' || failures=1
require_line "$PAGES_CONFIG" '^pages_build_output_dir[[:space:]]*=' 'Pages output directory is set' || failures=1
require_line "$PAGES_CONFIG" '^binding[[:space:]]*=[[:space:]]*"API_SERVICE"' 'API_SERVICE binding is declared' || failures=1
require_line "$PAGES_CONFIG" '^service[[:space:]]*=[[:space:]]*"sunsethue-helper-worker"' 'API_SERVICE targets the Worker' || failures=1

# Secrets must never be committed as plaintext vars.
for forbidden in SUNSETHUE_API_KEY GMAIL_APP_PASSWORD GMAIL_USER POLICY_AUD TEAM_DOMAIN AUTHORIZED_EMAIL; do
  if grep -Eq "^[[:space:]]*${forbidden}[[:space:]]*=" "$WORKER_CONFIG" "$PAGES_CONFIG"; then
    echo "FORBIDDEN: ${forbidden} is set as a plaintext var; it must be a Worker secret" >&2
    failures=1
  fi
done

if [ "$failures" -ne 0 ]; then
  echo
  echo "Wrangler configuration validation failed." >&2
  exit 1
fi

echo
echo "Wrangler configuration validation passed. Nothing was deployed."
