#!/usr/bin/env bash
# Validate a pull request title against the same commitlint rules used for commits,
# so squash-merge subjects stay releasable by Release Please.
set -euo pipefail

PR_TITLE="${1:-}"

if [ -z "$PR_TITLE" ]; then
  echo "Usage: check-pr-title.sh <pull-request-title>" >&2
  exit 2
fi

echo "Validating pull request title."

if printf '%s\n' "$PR_TITLE" | npx --no -- commitlint --verbose; then
  echo "Pull request title is valid."
  exit 0
fi

cat >&2 <<'HELP'
::error::The pull request title must follow Conventional Commits, for example:

  feat(frontend): add sunset quality sparkline
  ci(repo): serialize production deployments

Edit the pull request title and re-run this check.
HELP
exit 1
