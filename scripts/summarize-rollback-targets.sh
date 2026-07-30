#!/usr/bin/env bash
# Always publish the exact rollback identifiers captured before this deployment,
# whether verification passed or failed. Never claim success on failure.
set -euo pipefail

WORKER_VERSION_BEFORE="${WORKER_VERSION_BEFORE:-unknown}"
PAGES_DEPLOYMENT_BEFORE="${PAGES_DEPLOYMENT_BEFORE:-unknown}"

echo "Rollback targets for this deployment:"
echo "  Worker version id:      ${WORKER_VERSION_BEFORE}"
echo "  Pages deployment id:    ${PAGES_DEPLOYMENT_BEFORE}"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat >>"$GITHUB_STEP_SUMMARY" <<EOF
## Rollback targets

Run the **Rollback production** workflow with these exact identifiers if this deployment
needs to be reverted:

| Input | Value |
| --- | --- |
| \`worker_version_id\` | \`${WORKER_VERSION_BEFORE}\` |
| \`pages_deployment_id\` | \`${PAGES_DEPLOYMENT_BEFORE}\` |

Database schema is not modified by rollback. See docs/rollback.md.
EOF
fi
