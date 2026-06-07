#!/bin/bash

# Get the repository root directory dynamically
PROJECT_ROOT=$(git rev-parse --show-toplevel)

echo "=== RUNNING PRE-COMMIT HOOK TESTS ==="

# 1. Run Frontend structural tests
echo "👉 Running Frontend structural tests..."
node "$PROJECT_ROOT/scripts/test-frontend.js"
FRONTEND_STATUS=$?

if [ $FRONTEND_STATUS -ne 0 ]; then
  echo "❌ Frontend structural tests FAILED! Aborting commit."
  exit 1
fi
echo "✅ Frontend structural tests PASSED."

# 2. Run Frontend unit tests
echo "👉 Running Frontend unit tests..."
node "$PROJECT_ROOT/scripts/test-frontend-unit.mjs"
FRONTEND_UNIT_STATUS=$?

if [ $FRONTEND_UNIT_STATUS -ne 0 ]; then
  echo "❌ Frontend unit tests FAILED! Aborting commit."
  exit 1
fi
echo "✅ Frontend unit tests PASSED."

# 3. Run Backend unit tests
echo "👉 Running Backend unit tests..."
npm test --prefix "$PROJECT_ROOT/functions"
BACKEND_STATUS=$?

if [ $BACKEND_STATUS -ne 0 ]; then
  echo "❌ Backend unit tests FAILED! Aborting commit."
  exit 1
fi
echo "✅ Backend unit tests PASSED."

echo "🎉 All checks passed! Proceeding with git commit."
exit 0
