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

Copy `.dev.vars.example` to `.dev.vars` and fill placeholders only. Never commit real tokens, JWTs, cookies, or Audience tags.

## Configuration files

| File | Role |
| --- | --- |
| `wrangler.toml` | Pages project (`pages_build_output_dir`, `API_SERVICE` binding) |
| `wrangler.worker.toml` | Private API Worker (`workers_dev = false`, cron, D1) |
| `schema.sql` | D1 schema for local setup and tests (`npm run db:schema:local`) |
| `public/_routes.json` | Invoke Functions only for `/api/*` |
| `functions/api/[[path]].js` | Same-origin API proxy |
| `scripts/cloudflare-access.mjs` | Idempotent Access automation (`plan`/`apply`/`verify`) |

## Tests and CI locally

```bash
npm run lint
npm run audit
npm run lint:shell
npm run lint:workflows
npm run validate:wrangler
npm test                 # frontend + worker + integration
npm run test:coverage    # real coverage with enforced thresholds
npm run ci               # everything above
```

JWT tests use generated RSA keys and a local JWKS fixture. They never use a real Access token. SMTP, Sunsethue, Nominatim, Photon, and Cloudflare JWKS are all faked. D1 tests run against an in-memory SQLite database built from `schema.sql`.

## CI/CD overview

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `validate.yml` | Pull requests to `main`, and reusable `workflow_call` | Lint, audit, tests, coverage, Wrangler dry-run. No production secrets. |
| `production.yml` | Push to `main`, or manual dispatch | Validate → prepare → deploy Worker → deploy Pages → verify → release |
| `rollback.yml` | Manual dispatch | Restore an exact prior Worker version and/or Pages deployment |

Details:

- [docs/deployment.md](docs/deployment.md) — production pipeline, secrets, verification
- [docs/rollback.md](docs/rollback.md) — exact-identifier rollback
- [docs/branch-protection.md](docs/branch-protection.md) — recommended `main` settings
- [docs/cloudflare-credentials.md](docs/cloudflare-credentials.md) — single API token and one-time Access setup

## Worker secrets

Set these as **Worker secrets** (never commit real values):

| Name | Purpose |
| --- | --- |
| `AUTHORIZED_EMAIL` | Exact allowed email |
| `TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | Access application Audience tag |
| `SUNSETHUE_API_KEY` | Sunsethue API key |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | SMTP auth |
| `EMAIL_TO` / `EMAIL_FROM` | Report recipients |

## GitHub environment secrets

All production credentials live in the GitHub `production` environment. See [docs/cloudflare-credentials.md](docs/cloudflare-credentials.md).

| Name | Scope |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers, Pages, D1, and Access (for rare local Access setup) |
| `CLOUDFLARE_ACCOUNT_ID` | Account identifier |
| Worker secrets listed above | Passed into the Worker deploy step |

Rotate the Cloudflare token from the Cloudflare dashboard if it is ever exposed. Prefer a scoped API token over a Global API Key.

## Access automation

Access is initialization-only. Run these locally with `CLOUDFLARE_API_TOKEN` set; they are not part of the production pipeline.

```bash
npm run access:snapshot   # sanitized rollback snapshot under .tmp/cloudflare-access/
npm run access:plan       # read-only plan
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
npx wrangler deployments list --config wrangler.worker.toml
curl -i https://sunsethue-helper-worker.mrcoffee.workers.dev/api/locations
```

Expect a non-200 failure (for example connection/error page), never application JSON. Production verification also asserts this automatically.

## Rollback

Use the **Rollback production** workflow with the exact Worker version id and Pages deployment id recorded in the deployment job summary. See [docs/rollback.md](docs/rollback.md).

D1 recovery uses Time Travel or re-applying `schema.sql`; the rollback workflow does not modify the database.

## Manual browser verification

After deploy (CI only performs unauthenticated negative checks):

1. Open `https://sunsethue-helper.pages.dev` in a private window and confirm Access challenges instead of rendering the app.
2. Sign in as `andrewtryder@gmail.com` with the Cloudflare identity provider.
3. Confirm locations, logs, credits, address search, and manual report still work over same-origin `/api/*`.

## Toolchain

| Pin | Source of truth |
| --- | --- |
| Node.js 24 | `.nvmrc`, `.node-version`, `package.json` engines, CI `node-version-file` |
| Wrangler 4.115.0 | `package.json` `devDependencies.wrangler` and every `wranglerVersion:` in workflows |

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is set on workflows so GitHub Actions that still declare Node 20 runtimes execute on Node 24. It is not an application Node-version setting. Revisit and remove it once every pinned action natively supports Node 24.
