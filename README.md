# Sunsethue Helper

Private sunrise/sunset quality notifier for a single authorized user.

## Architecture

```text
Browser
  -> Cloudflare Access (exact production hostname)
  -> Pages static frontend
  -> same-origin /api/*
  -> Pages Function
  -> private service binding (API_SERVICE)
  -> private Worker
  -> D1 + Sunsethue API + Secrets Store (email/Pushover) + credential-admin Worker
```

Provider Gmail and Pushover credentials live in **Cloudflare Secrets Store**, managed through a private credential-admin Worker. Recipients and delivery preferences live in D1.

Scheduled reports continue to run from the Worker cron trigger and do **not** require a browser Access JWT.

## Authentication and authorization

1. **Cloudflare Access** admits only the configured `AUTHORIZED_EMAIL` to the production hostname.
2. The Pages Function forwards `/api/*` through a private Worker service binding and preserves `Cf-Access-Jwt-Assertion`.
3. The Worker cryptographically verifies the Access JWT (signature, issuer, audience, expiry, `nbf`, email) and authorizes the exact email again.

Invalid or missing tokens return `401`. A valid token for another identity returns `403`. Errors are generic JSON and never include JWTs, JWKS payloads, or verifier exception text.

## Production vs preview

| Surface | Access policy | API data access |
| --- | --- | --- |
| Production hostname | Protected by exact-host Access app | Allowed only after Access + Worker JWT auth |
| `*.pages.dev` deployment aliases / previews | Not covered by the production Access app | `/api/*` fails closed without a production Access JWT |
| `*.workers.dev` Worker URL | Disabled in Wrangler (`workers_dev = false`, `preview_urls = false`) | Not publicly reachable |

Do not enable account-wide “Require Access protection.” Do not add wildcard, Everyone, email-domain, or bypass policies for this app.

## Configure your own instance

This repository ships without the owner's production identity or infrastructure IDs.

1. Copy `.env.example` to `.env` and fill in your Cloudflare account, project names, D1 id, Access values, and mail secrets.
2. Copy `.dev.vars.example` to `.dev.vars` for local Worker/Pages vars. Keep `DEV_AUTH_BYPASS=false` unless you explicitly need loopback-only bypass.
3. Generate Wrangler configs (gitignored):

```bash
npm run config:generate          # placeholder defaults for local CI / dry-runs
npm run config:generate:strict   # required before deploy or Access apply
```

4. In the GitHub `production` environment, set the variables and secrets listed in [docs/cloudflare-credentials.md](docs/cloudflare-credentials.md). `D1_DATABASE_ID` is a secret so deploy logs never print it.

Tracked templates are `wrangler.example.toml` and `wrangler.worker.example.toml`. Do not commit real `wrangler.toml` / `wrangler.worker.toml` files.

## Local development

```bash
npm install
npm run config:generate
npm run dev
```

This starts:

- Worker on `http://127.0.0.1:8789` via generated `wrangler.worker.toml`
- Pages + Functions on `http://127.0.0.1:5010` with `API_SERVICE` bound to the local Worker

Local auth bypass requires **both**:

1. `DEV_AUTH_BYPASS=true` (explicit; the committed example defaults to `false`)
2. Loopback host (`localhost`, `127.0.0.1`, or `[::1]`)

It never activates from a caller-controlled header, query parameter, or localStorage value, and it never activates on `pages.dev` / `workers.dev`.

Local D1 is used by default. Do not point local tests at a production D1 database.

Never commit real tokens, JWTs, cookies, Audience tags, or D1 database IDs.

## Configuration files

| File | Role |
| --- | --- |
| `wrangler.example.toml` | Template for the Pages project (`pages_build_output_dir`, `API_SERVICE` binding) |
| `wrangler.worker.example.toml` | Template for the private API Worker (`workers_dev = false`, cron, D1) |
| `wrangler.toml` / `wrangler.worker.toml` | Generated locally / in CI; gitignored |
| `.env.example` / `.dev.vars.example` | Placeholder configuration |
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
- [docs/cloudflare-credentials.md](docs/cloudflare-credentials.md) — environment variables, secrets, and one-time Access setup
- [docs/secrets-store-credentials.md](docs/secrets-store-credentials.md) — Secrets Store provider credentials and credential-admin Worker
- [docs/operations.md](docs/operations.md) — operational status, alerts, retention

## Worker secrets

Set these as **Worker secrets** on the main API Worker (never commit real values):

| Name | Purpose |
| --- | --- |
| `AUTHORIZED_EMAIL` | Exact allowed email |
| `CONTACT_EMAIL` | Public application contact (Nominatim User-Agent) |
| `TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | Access application Audience tag |
| `SUNSETHUE_API_KEY` | Sunsethue API key |
| `WEBAPP_URL` | Dashboard link used in report emails (set from `PRODUCTION_URL` in CI) |

Provider transport credentials (Gmail SMTP + Pushover) are **not** Worker secrets. They live in Cloudflare Secrets Store and are administered through the Notifications UI backed by the credential-admin Worker. Report recipient email and Pushover device/priority/sound live in D1 notification settings.

The private **credential-admin** Worker receives only `CLOUDFLARE_API_TOKEN` (Secrets Store Edit). See [docs/secrets-store-credentials.md](docs/secrets-store-credentials.md).

## Notifications

Delivery can be email-only, Pushover-only, both, or disabled. The protected
Notifications tab stores channel preferences in D1. Provider transport credentials
live in Cloudflare Secrets Store and are managed through the Notifications UI
(Gmail / Pushover cards). Delivery requires the corresponding Secrets Store
document to be marked `configured: true`; there is no legacy Worker-secret
fallback. Each report snapshot creates one D1 outbox job per enabled channel,
then attempts delivery immediately. Jobs use at-least-once semantics: the
dispatcher leases a job for one minute and retries transient failures after 1
minute, 5 minutes, 30 minutes, and 2 hours (five attempts total). A later hourly
cron also processes due jobs.

Use the tab's test buttons and delivery history to test or retry a failed channel.
Tests use the same outbox/dispatcher path as reports. Pushover titles are limited to
250 characters, messages to 1,024, and dashboard URLs to 512. No emergency priority
is supported.

`schema.sql` is intentionally the bootstrap source of truth, not a migration
framework. Reapply it when provisioning or adding these idempotent tables. Before
production schema work, take a D1 backup and confirm Time Travel retention. Rotate
provider credentials via the Notifications UI (which writes to Secrets Store),
then redeploy if needed; never put credentials in D1, browser storage, commits,
or public issue reports.
## Access automation

Access is initialization-only. Run these locally with instance configuration in `.env`; they are not part of the production pipeline.

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
# Attempt the Worker workers.dev URL for your account; expect a non-200 failure
# (connection/error page), never application JSON.
```

Production verification also asserts this automatically.

## Rollback

Use the **Rollback production** workflow with the exact Worker version id and Pages deployment id recorded in the deployment job summary. See [docs/rollback.md](docs/rollback.md).

D1 recovery uses Time Travel or re-applying `schema.sql`; the rollback workflow does not modify the database.

## Manual browser verification

After deploy (CI only performs unauthenticated negative checks):

1. Open the production URL in a private window and confirm Access challenges instead of rendering the app.
2. Sign in as the authorized email with the Cloudflare identity provider.
3. Confirm locations, logs, credits, address search, and manual report still work over same-origin `/api/*`.

## Local browser E2E

Playwright covers Horizon tabs, drawer focus, axe checks, and pane screenshots against the **local** stack only:

```bash
npm run e2e:install
DEV_AUTH_BYPASS=true npm run dev   # separate terminal
npm run test:e2e
```

Never point Playwright at production, real SMTP, Pushover, or Secrets Store.

## Toolchain

| Pin | Source of truth |
| --- | --- |
| Node.js 24 | `.nvmrc`, `.node-version`, `package.json` engines, CI `node-version-file` |
| Wrangler 4.115.0 | `package.json` `devDependencies.wrangler` and every `wranglerVersion:` in workflows |
| Gitleaks 8.30.1 / TruffleHog 3.96.0 | `scripts/lib/scanner-versions.mjs` and `.github/workflows/security.yml` digests |

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is set on workflows so GitHub Actions that still declare Node 20 runtimes execute on Node 24. It is not an application Node-version setting. Revisit and remove it once every pinned action natively supports Node 24.

## License and contributing

This project is [MIT](LICENSE)-licensed. See [CONTRIBUTING.md](CONTRIBUTING.md),
[SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and the
[public release checklist](docs/public-release-checklist.md) before publishing
a fork or making the repository public.
