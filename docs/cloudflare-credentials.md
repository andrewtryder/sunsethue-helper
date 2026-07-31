# Cloudflare credentials

This repository uses a single scoped Cloudflare API token for application deployment, D1 access, and one-time Access (Zero Trust) setup.

Instance-specific values (project names, hostnames, D1 id) are **not** committed. They are supplied as GitHub environment configuration and rendered into local Wrangler files by `npm run config:generate`.

## GitHub `production` environment

### Variables (non-secret)

| Variable | Example | Purpose |
| --- | --- | --- |
| `PAGES_PROJECT_NAME` | `your-pages-project` | Cloudflare Pages project name |
| `WORKER_NAME` | `your-worker-name` | Private Worker script name |
| `D1_DATABASE_NAME` | `your-d1-database` | D1 database name |
| `PRODUCTION_HOSTNAME` | `your-pages-project.pages.dev` | Exact Access / production host |
| `PRODUCTION_URL` | `https://your-pages-project.pages.dev` | Environment URL and Worker `WEBAPP_URL` |
| `ACCESS_HOSTNAME` | `your-pages-project.pages.dev` | Access application hostname (defaults to production hostname when unset locally) |
| `DEPLOY_REPOSITORY` | `your-github-org/your-repo` | Repository the deploy scripts will accept |

### Secrets

| Secret | Used by | Must be able to / purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `production.yml`, `rollback.yml`, local `npm run access:*` | Deploy Worker and Pages, read verification metadata, manage Access when needed |
| `CLOUDFLARE_ACCOUNT_ID` | Same | Identify the account |
| `D1_DATABASE_ID` | Config generation before deploy | Bind the Worker to the correct D1 database (stored as a secret so GitHub masks it in logs) |
| `AUTHORIZED_EMAIL` | Worker secret | Exact allowed Access identity |
| `CONTACT_EMAIL` | Worker secret | Public Nominatim User-Agent contact |
| `TEAM_DOMAIN` | Worker secret | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | Worker secret | Access application Audience tag |
| `SUNSETHUE_API_KEY` | Worker secret | Sunsethue API key |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Worker secret | SMTP auth |
| `EMAIL_TO` / `EMAIL_FROM` | Worker secret | Report recipients |

The Cloudflare API token must be a **scoped API token**, never a Global API Key.

If `D1_DATABASE_ID` (or any other required value) is missing, `npm run config:generate:strict` fails with the **name** of the missing variable and does not print the identifier.

## Suggested Cloudflare permission set

- Account → Workers Scripts → Edit
- Account → Cloudflare Pages → Edit
- Account → D1 → Edit
- Account → Access: Apps and Policies → Edit
- Account → Access: Organizations, Identity Providers, and Groups → Read
- Account → Account Settings → Read (minimum metadata)

Access write is only needed for rare initialization or repair via the local `access:*` scripts. Routine production deploys do not mutate Access policies.

## Local configuration

```bash
cp .env.example .env
# fill instance values and secrets
npm run config:generate          # placeholders allowed for local dry-runs
npm run config:generate:strict   # required before real deploy / Access apply
```

Generated `wrangler.toml` and `wrangler.worker.toml` are gitignored. Edit the tracked `*.example.toml` templates only.

## One-time Access setup

Access is not part of the production pipeline. Configure it locally when initializing or repairing the application:

```bash
# Requires the variables and secrets above in .env
npm run access:plan      # read-only summary of intended changes
npm run access:apply     # idempotent create/update for ACCESS_HOSTNAME only
npm run access:verify    # assert the exact single-email policy shape
```

See the README Access automation section for lockout recovery and Audience tag handling.

## Rotation

1. Create a replacement scoped API token in the Cloudflare dashboard with the permissions above.
2. Update the GitHub `production` environment secret `CLOUDFLARE_API_TOKEN` (and any local `.env` copy).
3. Confirm a dry-run of `production.yml` and a local `npm run access:verify`.
4. Revoke the previous token in Cloudflare.

Rotate `D1_DATABASE_ID` only when you intentionally point the Worker at a different database; treat a leaked id as an inventory disclosure, not a credential, but prefer keeping it out of public logs.

## Incident: leaked token

1. Revoke the token immediately in the Cloudflare dashboard.
2. Rotate Worker secrets that may have been reachable with it if the leak scope is unclear.
3. Create a replacement scoped token and store it only as a GitHub environment secret (and local `.env` if used).
4. Re-run `npm run access:verify` and a dry-run of `production.yml`.
5. Search git history for the leaked value. If it was ever committed, treat the commit as compromised and rotate again after rewriting or isolating that history.

Never paste a token into chat, a pull request, documentation, a test fixture, or a workflow log.

## Secret scanning

For a full public-release gate (working tree, full history including tags,
high-entropy sweep, and private-identifier needles), use the pinned audit:

```bash
brew install gitleaks trufflehog   # must match scripts/lib/scanner-versions.mjs
npm run audit:release
```

A lighter TruffleHog-only history scan remains available:

```bash
npm run security:scan
```

Neither command is part of `npm run ci`. The weekly/manual
[security workflow](../.github/workflows/security.yml) runs the same
digest-pinned scanners without production secrets. See
[docs/public-release-checklist.md](public-release-checklist.md).

A one-time history rewrite removed personal email addresses and the previously committed production D1 database id from every reachable commit. Treat that D1 id as previously disclosed inventory: it is not a credential, but it must live only in the `D1_DATABASE_ID` GitHub environment secret going forward. GitHub may keep unreachable objects addressable by SHA until its own garbage collection runs; contact GitHub Support if a complete purge of cached views is required.
