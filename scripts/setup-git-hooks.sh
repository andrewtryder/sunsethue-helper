#!/bin/bash

# Get directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$DIR/.."
GIT_HOOK_DIR="$PROJECT_ROOT/.git/hooks"

echo "=== INSTALLING LOCAL GIT HOOKS ==="

# Check if .git directory exists
if [ ! -d "$PROJECT_ROOT/.git" ]; then
  echo "❌ Error: This project has not been initialized as a git repository."
  echo "Please initialize git first: git init"
  exit 1
fi

if [ ! -d "$PROJECT_ROOT/node_modules/commitplease" ]; then
  echo "❌ Error: commitplease is not installed."
  echo "Please run: npm install"
  exit 1
fi

# Create hooks directory if not exists
mkdir -p "$GIT_HOOK_DIR"

# Copy pre-commit hook
cp "$PROJECT_ROOT/scripts/pre-commit.sh" "$GIT_HOOK_DIR/pre-commit"
chmod +x "$GIT_HOOK_DIR/pre-commit"

# Copy commit-msg hook
cp "$PROJECT_ROOT/scripts/commit-msg.sh" "$GIT_HOOK_DIR/commit-msg"
chmod +x "$GIT_HOOK_DIR/commit-msg"

echo "✅ Success! Git hooks installed:"
echo "   - .git/hooks/pre-commit  (runs frontend + backend tests)"
echo "   - .git/hooks/commit-msg  (validates conventional commit messages)"
echo "Run 'npm install && npm run setup:hooks' after cloning to enable hooks locally."
exit 0
