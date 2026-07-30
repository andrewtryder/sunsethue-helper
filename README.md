# Sunsethue Helper

Private sunrise/sunset quality notifier for a single authorized user.

## Architecture

```text
Browser
  -> Cloudflare Access (exact host: sunsethue-helper.pages.dev)
  -> Pages static frontend
  -> same-origin /api/*
  -> Pages Function
  -> private service binding (API_SERVICE)
  -> sunsethue-helper-worker
  -> D1 + Sunsethue API + email
```

Scheduled reports continue to run from the Worker cron trigger and do **not** require a browser Access JWT.

## Authentication and authorization

1. **Cloudflare Access** admits only `andrewtryder@gmail.com` to `sunsethue-helper.pages.dev`.
2. The Pages Function forwards `/api/*` through a private Worker service binding and preserves `Cf-Access-Jwt-Assertion`.
3. The Worker cryptographically verifies the Access JWT (signature, issuer, audience, expiry, `nbf`, email) and authorizes the exact email again.

Invalid or missing tokens return `401`. A valid token for another identity returns `403`. Errors are generic JSON and never include JWTs, JWKS payloads, or verifier exception text.

## Production vs preview

| Surface | Access policy | API data access |
| --- | --- | --- |
| `sunsethue-helper.pages.dev` | Protected by exact-host Access app | Allowed only after Access + Worker JWT auth |
| `*.sunsethue-helper.pages.dev` deployment aliases / previews | Not covered by the production Access app | `/api/*` fails closed without a production Access JWT |
| `*.workers.dev` Worker URL | Disabled in Wrangler (`workers_dev = false`, `preview_urls = false`) | Not publicly reachable |

Do not enable account-wide “Require Access protection.” Do not add wildcard, Everyone, email-domain, or bypass policies for this app.

## Required deployment configuration

Set these as **Worker secrets** (never commit real values):

| Name | Purpose |
| --- | --- |
| `AUTHORIZED_EMAIL` | Exact allowed email |
| `TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | Access application Audience tag |
| `SUNSETHUE_API_KEY` | Sunsethue API key |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | SMTP auth |
| `EMAIL_TO` / `EMAIL_FROM` | Report recipients |

GitHub Actions also needs:

- `CLOUDFLARE_API_TOKEN` — scoped token with Access Apps/Policies write, Workers deploy, Pages deploy
- `CLOUDFLARE_ACCOUNT_ID`
- The Worker secrets listed above (`AUTHORIZED_EMAIL`, `TEAM_DOMAIN`, `POLICY_AUD`, …)

Rotate the Cloudflare management token from the Cloudflare dashboard if it is ever exposed. Prefer a scoped API token over a Global API Key.

## Local development

```bash
npm install
npm run dev
```

This starts:

- Worker on `http://127.0.0.1:8789` via `wrangler.worker.toml`
- Pages + Functions on `http://127.0.0.1:5010` with `API_SERVICE` bound to the local Worker

Local auth bypass requires **both**:

1. `DEV_AUTH_BYPASS=true`
2. Loopback host (`localhost`, `127.0.0.1`, or `[::1]`)

It never activates from a caller-controlled header, query parameter, or localStorage value, and it never activates on `pages.dev` / `workers.dev`.

Local D1 is used by default. Do not point local tests at the production D1 database.

## Configuration files

| File | Role |
| --- | --- |
| `wrangler.toml` | Pages project (`pages_build_output_dir`, `API_SERVICE` binding) |
| `wrangler.worker.toml` | Private API Worker (`workers_dev = false`, cron, D1) |
| `public/_routes.json` | Invoke Functions only for `/api/*` |
| `functions/api/[[path]].js` | Same-origin API proxy |
| `scripts/cloudflare-access.mjs` | Idempotent Access automation |

## Tests

```bash
npm test
npm run lint
```

JWT tests use generated RSA keys and a local JWKS fixture. They never use a real Access token.

## Access automation

```bash
npm run access:snapshot   # sanitized rollback snapshot under .tmp/cloudflare-access/
npm run access:apply      # idempotent create/update
npm run access:verify     # assert exact policy shape
```

Snapshots omit API tokens, JWTs, cookies, IdP secrets, and service-token secrets.

### Recreate the Access application

1. Run `npm run access:snapshot`.
2. Create/update with `npm run access:apply`.
3. Copy the new Audience tag into the Worker `POLICY_AUD` secret.
4. Redeploy the Worker and verify with `npm run access:verify`.

### Lockout recovery

If you are locked out of the UI:

1. Use the Cloudflare Zero Trust dashboard with an account owner session.
2. Confirm the Allow policy still includes only your exact email.
3. Prefer restoring from `.tmp/cloudflare-access/rollback-snapshot.json` over deleting the app.
4. Do not add Everyone / email-domain / bypass rules to regain access.

### Verify workers.dev stays disabled

```bash
npx wrangler deployments list --name sunsethue-helper-worker
# or inspect subdomain settings via API / dashboard Domains & Routes
curl -i https://sunsethue-helper-worker.mrcoffee.workers.dev/api/locations
```

Expect a non-200 failure (for example connection/error page), never application JSON.

## Rollback

1. Restore prior Access application/policy settings from the sanitized snapshot by ID.
2. Roll Pages back to the previous deployment.
3. Roll the Worker back to the previous version while keeping JWT enforcement if possible.
4. Only temporarily re-enable `workers.dev` when required for recovery, and only with JWT enforcement still active.
5. Deleting the Access application is a last-resort, owner-approved action — not the primary rollback.

## Manual browser verification

After deploy:

1. Open `https://sunsethue-helper.pages.dev` in a private window and confirm Access challenges instead of rendering the app.
2. Sign in as `andrewtryder@gmail.com` with the Cloudflare identity provider.
3. Confirm locations, logs, credits, address search, and manual report still work over same-origin `/api/*`.
