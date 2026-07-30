#!/usr/bin/env bash
# Check-only conventional commit validation.
#
# This never rewrites history and never pushes. If a message is invalid the
# contributor fixes it locally with `git rebase -i` or `git commit --amend`.
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-HEAD}"

if [ -z "$BASE_SHA" ]; then
  echo "Usage: check-commit-messages.sh <base-sha> [head-sha]" >&2
  exit 2
fi

print_format_help() {
  cat >&2 <<'HELP'

Commit messages must follow Conventional Commits:

  type(scope): imperative subject

  Optional body paragraph.

  Optional footer, for example: BREAKING CHANGE: description

  type    one of feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
  scope   a noun in parentheses, for example (frontend), (functions), (ci)
  subject imperative mood, lowercase, no trailing period

Examples:

  feat(frontend): add loading overlay fade transition
  fix(worker): reject expired access tokens with 401
  ci(repo): pin github actions to commit shas

Fix the message locally and force-push your branch, for example:

  git rebase -i "$BASE_SHA"
  git push --force-with-lease

CI will not modify your branch.
HELP
}

echo "Validating commit messages in ${BASE_SHA}..${HEAD_SHA}"

if npx --no -- commitlint --from "$BASE_SHA" --to "$HEAD_SHA" --verbose; then
  echo "All commit messages are valid."
  exit 0
fi

echo "::error::One or more commit messages do not follow Conventional Commits." >&2
print_format_help
exit 1
