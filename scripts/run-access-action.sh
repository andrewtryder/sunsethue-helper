#!/usr/bin/env bash
# Run one Cloudflare Access action and publish a sanitized plan summary.
#
# plan and verify are read-only. apply is idempotent and touches only the
# Sunsethue Access application and its policies.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ACTION="${ACCESS_ACTION:-plan}"
OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT

case "$ACTION" in
  plan|verify|apply) ;;
  *)
    echo "ACCESS_ACTION must be plan, verify, or apply (got '${ACTION}')." >&2
    exit 2
    ;;
esac

echo "==> Access ${ACTION}"

status=0
node scripts/cloudflare-access.mjs "$ACTION" >"$OUTPUT" 2>&1 || status=$?

# The script redacts the Audience tag and never emits tokens, JWTs, cookies, or
# identity-provider secrets, so its output is safe to surface.
cat "$OUTPUT"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '## Zero Trust Access: %s\n\n' "$ACTION"
    if [ "$ACTION" = "plan" ]; then
      printf 'Read-only. No Cloudflare resource was modified.\n\n'
    fi
    printf '```json\n'
    cat "$OUTPUT"
    printf '\n```\n'
    if [ "$ACTION" = "plan" ]; then
      printf '\nRe-run this workflow with `action: apply` to make these changes.\n'
    fi
  } >>"$GITHUB_STEP_SUMMARY"
fi

if [ "$status" -ne 0 ]; then
  echo "Access ${ACTION} failed with status ${status}." >&2
  exit "$status"
fi

if [ "$ACTION" = "apply" ]; then
  echo "==> Verifying applied state"
  node scripts/cloudflare-access.mjs verify
fi
