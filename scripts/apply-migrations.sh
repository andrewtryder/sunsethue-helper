#!/usr/bin/env bash
# Apply pending D1 migrations to the production database.
#
# Fails loudly if migration state cannot be determined, and succeeds without
# changing anything when nothing is pending. Uses the Wrangler version pinned in
# package.json.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

CONFIG="wrangler.worker.toml"
DATABASE="sunsethue-db"
LIST_LOG="$(mktemp)"
trap 'rm -f "$LIST_LOG"' EXIT

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
}

echo "==> Listing pending migrations for ${DATABASE}"
if ! npx --no -- wrangler d1 migrations list "$DATABASE" --config "$CONFIG" --remote >"$LIST_LOG" 2>&1; then
  echo "Could not determine D1 migration state. Refusing to deploy." >&2
  cat "$LIST_LOG" >&2
  summary "## D1 migrations

Migration state could not be determined. No migrations were applied and the deployment was stopped."
  exit 1
fi

cat "$LIST_LOG"

if grep -q "No migrations to apply" "$LIST_LOG"; then
  echo "No pending migrations."
  summary "## D1 migrations

No pending migrations. The database was not modified."
  exit 0
fi

PENDING="$(grep -oE '[0-9]{4}_[a-z0-9_]+\.sql' "$LIST_LOG" | sort -u | tr '\n' ' ')"
echo "==> Applying pending migrations: ${PENDING}"

npx --no -- wrangler d1 migrations apply "$DATABASE" --config "$CONFIG" --remote

summary "## D1 migrations

Applied: \`${PENDING}\`

Migrations run before the Worker deploy and are written to be backward compatible with the
currently deployed Worker. Recovery uses D1 Time Travel; see docs/d1-migrations.md."

echo "Migrations applied."
