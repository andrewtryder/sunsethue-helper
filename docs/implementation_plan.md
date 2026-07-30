# Implementation notes

## Goals

- Exact-host Access for the production hostname
- Same-origin Pages Function API proxy via `API_SERVICE`
- Worker JWT defense-in-depth with single-email authorization
- Disable public Worker URLs after the private path is verified

## Non-goals

- Account-wide Require Access protection
- Wildcard preview Access changes
- Cross-origin browser calls to `workers.dev`
- Firebase authentication or hosting

## Key files

- `scripts/cloudflare-access.mjs` — idempotent Access automation
- `functions/api/[[path]].js` — Pages API proxy
- `worker/auth.js` — JWT verification and authorization
- `wrangler.toml` / `wrangler.pages.toml` — private Worker + Pages binding
- `test/*.test.mjs` — auth, HTTP, and proxy coverage
