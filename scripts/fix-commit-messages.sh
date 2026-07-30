#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BASE_SHA="${1:?Usage: fix-commit-messages.sh <base-sha> <head-sha>}"
HEAD_SHA="${2:?Usage: fix-commit-messages.sh <base-sha> <head-sha>}"

if [ "$(git log -1 --format='%an')" = "github-actions[bot]" ]; then
  echo "Skipping: tip commit authored by github-actions[bot] (loop guard)"
  exit 0
fi

if [ "$(git rev-parse HEAD)" != "$HEAD_SHA" ]; then
  echo "HEAD ($(git rev-parse HEAD)) does not match expected ${HEAD_SHA}"
  exit 1
fi

if npx commitlint --from "${BASE_SHA}" --to "${HEAD_SHA}"; then
  echo "Commit messages already valid; no changes needed"
  exit 0
fi

echo "Rewriting commit messages in range ${BASE_SHA}..${HEAD_SHA}"

export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --msg-filter 'node scripts/wrap-commit-message.js' "${BASE_SHA}"..${HEAD_SHA}

if ! npx commitlint --from "${BASE_SHA}" --to "${HEAD_SHA}"; then
  echo "Commit messages still invalid after rewrite"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" = "HEAD" ]; then
  echo "Detached HEAD; cannot push"
  exit 1
fi

echo "Pushing rewritten commits to origin/${CURRENT_BRANCH}"
git push --force-with-lease origin "HEAD:${CURRENT_BRANCH}"
