#!/bin/bash
set -euo pipefail

# Kill all background jobs started by this script upon exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting Sunsethue Helper local development environment..."
echo "Worker API: http://127.0.0.1:8789"
echo "Pages UI + /api proxy: http://127.0.0.1:5010"
echo "Local auth bypass requires DEV_AUTH_BYPASS=true and loopback hosts only."
echo "Local D1 is used by default; never point local tests at production D1."

export DEV_AUTH_BYPASS="${DEV_AUTH_BYPASS:-true}"
export AUTHORIZED_EMAIL="${AUTHORIZED_EMAIL:-andrewtryder@gmail.com}"
export TEAM_DOMAIN="${TEAM_DOMAIN:-https://example.cloudflareaccess.com}"
export POLICY_AUD="${POLICY_AUD:-local-dev-audience}"

echo "Starting Cloudflare Worker API on port 8789..."
npx wrangler dev --config wrangler.worker.toml --port 8789 \
  --var "DEV_AUTH_BYPASS:${DEV_AUTH_BYPASS}" \
  --var "AUTHORIZED_EMAIL:${AUTHORIZED_EMAIL}" \
  --var "TEAM_DOMAIN:${TEAM_DOMAIN}" \
  --var "POLICY_AUD:${POLICY_AUD}" &

sleep 3

echo "Starting Cloudflare Pages on http://127.0.0.1:5010..."
npx wrangler pages dev public --port 5010 \
  --service API_SERVICE=sunsethue-helper-worker \
  --compatibility-date 2026-06-20 \
  --compatibility-flags nodejs_compat \
  --binding "DEV_AUTH_BYPASS=${DEV_AUTH_BYPASS}"
