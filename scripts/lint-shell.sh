#!/usr/bin/env bash
# Run ShellCheck over the deployment and developer scripts.
#
# The tool is preinstalled on GitHub-hosted Ubuntu runners. Locally it is optional:
# this script explains how to install it instead of breaking a dev loop, but it is
# always required in CI.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v shellcheck >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    echo "shellcheck is required in CI but was not found on PATH." >&2
    exit 1
  fi
  echo "shellcheck not found; skipping locally. Install with: brew install shellcheck"
  exit 0
fi

# Portable collection: macOS ships bash 3.2, which has no mapfile.
# .husky/_ holds vendored husky shims that are not ours to fix.
scripts=""
while IFS= read -r script; do
  scripts="${scripts} ${script}"
done <<EOF
$(find scripts .husky -type f -name '*.sh' -not -path '.husky/_/*' -print | sort)
EOF

if [ -z "${scripts// /}" ]; then
  echo "No shell scripts found."
  exit 0
fi

echo "Linting shell scripts:"
for script in $scripts; do
  echo "  $script"
done

# shellcheck disable=SC2086 # word splitting is the intended list expansion
shellcheck --severity=warning --external-sources $scripts
echo "shellcheck passed."
