#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v java >/dev/null 2>&1; then
  if [ -d "/opt/homebrew/opt/openjdk/bin" ]; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  elif [ -d "/opt/homebrew/opt/openjdk@21/bin" ]; then
    export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
  elif [ -d "/usr/local/opt/openjdk@21/bin" ]; then
    export PATH="/usr/local/opt/openjdk@21/bin:$PATH"
  fi
fi

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Java is required for the Firestore emulator. Install OpenJDK 21+ and retry."
  exit 1
fi

echo "=== PREPARING FIREBASE EMULATOR SECRETS ==="
cat > "$PROJECT_ROOT/functions/.secret.local" <<EOF
SUNSETHUE_API_KEY=e2e-test-key
GMAIL_USER=e2e-test@gmail.com
GMAIL_APP_PASSWORD=e2e-test-password
EMAIL_TO=e2e-test@gmail.com
EOF

echo "=== INSTALLING FUNCTION DEPENDENCIES ==="
npm ci --prefix functions

echo "=== ENSURING PLAYWRIGHT BROWSER IS INSTALLED ==="
npx playwright install chromium

echo "=== RUNNING PLAYWRIGHT E2E TESTS AGAINST FIREBASE EMULATORS ==="
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"

npx firebase emulators:exec \
  --only auth,firestore,functions,hosting \
  --project sunsethue-helper-12345 \
  "npx playwright test"
