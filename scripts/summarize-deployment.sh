#!/usr/bin/env bash
# Record the Pages deployment result and the Worker versions on both sides of the
# deploy, so a failure downstream has exact rollback identifiers.
set -euo pipefail

PAGES_URL="${PAGES_URL:-unknown}"
WORKER_VERSION_BEFORE="${WORKER_VERSION_BEFORE:-unknown}"
WORKER_VERSION_AFTER="${WORKER_VERSION_AFTER:-unknown}"
PRODUCTION_URL="${PRODUCTION_URL:-}"

short() {
  local value="$1"
  if [ "${#value}" -gt 12 ]; then
    printf '%s…%s' "${value:0:8}" "${value: -4}"
  else
    printf '%s' "$value"
  fi
}

echo "Pages deployment URL: ${PAGES_URL}"
echo "Worker version before: $(short "$WORKER_VERSION_BEFORE")"
echo "Worker version after:  $(short "$WORKER_VERSION_AFTER")"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Deployment results"
    echo
    echo "| Component | Result |"
    echo "| --- | --- |"
    echo "| Pages deployment URL | ${PAGES_URL} |"
    echo "| Worker version before | \`$(short "$WORKER_VERSION_BEFORE")\` |"
    echo "| Worker version after | \`$(short "$WORKER_VERSION_AFTER")\` |"
    if [ -n "$PRODUCTION_URL" ]; then
      echo "| Production URL | ${PRODUCTION_URL} |"
    fi
  } >>"$GITHUB_STEP_SUMMARY"
fi
