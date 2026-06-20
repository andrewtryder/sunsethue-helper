#!/bin/bash

# Kill all background jobs started by this script upon exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "🚀 Starting Sunsethue Helper local dev environment..."

# 1. Start Worker dev server in the background
echo "⚡️ Starting Cloudflare Worker API on port 8789..."
npx wrangler dev --port 8789 &

# Wait a couple of seconds for the worker port to bind
sleep 2

# 2. Start Pages dev server in the foreground
echo "🌐 Starting Cloudflare Pages Frontend on http://localhost:5010..."
npx wrangler pages dev public --port 5010
