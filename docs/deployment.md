# Production deployment

## Trigger

The `Production` workflow (`.github/workflows/production.yml`) runs on:

- every push to `main`
- manual `workflow_dispatch`, with an optional `dry_run` input

It is serialized by the `production-deploy` concurrency group with `cancel-in-progress: false`, so two production deployments can never overlap and a mid-deploy cancel cannot leave Worker and Pages on different versions.

## Job order

```text
validate
  -> prepare
    -> schema
      -> deploy-worker
        -> deploy-pages
          -> verify
            -> release
```

| Job | What it does |
| --- | --- |
| `validate` | Calls the reusable `validate.yml` workflow. Lint, audit, tests, coverage, Wrangler dry-run with placeholder configs. No production secrets. |
| `prepare` | Generates Wrangler configs from GitHub environment values (`config:generate:strict`), then records the commit SHA, current Worker version, and current Pages production deployment. Confirms the repository, branch, account, project, bindings, and cron. Reports D1 schema state informationally — it does not reject missing schema this release is responsible for applying. Writes a sanitized job summary. |
| `schema` | Regenerates Wrangler configs, applies additive D1 schema (`npm run db:schema:remote`), and fail-closes on `npm run db:schema:verify` before any Worker deploys. |
| `deploy-worker` | Regenerates Wrangler configs, then deploys the Workers. Must stay backward compatible with the still-running previous Pages frontend. |
| `deploy-pages` | Regenerates Wrangler configs, then deploys the Pages frontend and the `/api/*` Function with the `API_SERVICE` binding. |
| `verify` | Unauthenticated negative checks (Access gate, workers.dev bypass, Pages commit, bindings, cron). Records exact rollback identifiers. |
| `release` | Runs Release Please **after** verification, so a GitHub release cannot be published ahead of a working deployment. |

A dry-run dispatch stops after `prepare`. Nothing is deployed or released.


First-time operators can run `npm run setup` (interactive) and later `npm run doctor` for a read-only checklist. Neither CLI collects Gmail/Pushover secrets.

### Schema change sequence

For any change that adds tables, columns, or indexes:

1. Snapshot production D1 with Cloudflare **Time Travel** first.
2. Land the additive change in `schema.sql` / `scripts/lib/apply-schema-alters.mjs` and list any new columns in `REQUIRED_D1_COLUMNS` (`shared/schema-manifest.js`).
3. Merge to `main`. The `Production` workflow's dedicated `schema` job runs `npm run db:schema:remote` then `npm run db:schema:verify`, and only on success does `deploy-worker` ship Worker code that depends on the new schema.
4. `prepare` reports missing required tables/columns informationally only; it does not block, so a release that intentionally adds schema can reach the `schema` job. `doctor` and `db:schema:verify` remain fail-closed.

Operators can still run `npm run db:schema:remote` locally with `CLOUDFLARE_API_TOKEN` for emergency repair; the script is idempotent and never drops or mutates existing rows.

Access (Zero Trust) setup is also outside this pipeline; use the local `access:*` scripts.

If `D1_DATABASE_ID` or any other required instance variable is missing, `config:generate:strict` fails with the variable **name** only and the deploy does not proceed.

## GitHub environment

Every Cloudflare-touching job uses:

```yaml
environment:
  name: production
  url: ${{ vars.PRODUCTION_URL }}
```

Required variables and secrets are documented in [cloudflare-credentials.md](cloudflare-credentials.md). Repository settings are in [branch-protection.md](branch-protection.md).

## Required configuration (names only)

All of these live in the `production` environment. Values are never logged.

### Variables

`PAGES_PROJECT_NAME`, `WORKER_NAME`, `CREDENTIAL_ADMIN_WORKER_NAME`, `D1_DATABASE_NAME`, `SECRETS_STORE_ID`, `PRODUCTION_HOSTNAME`, `PRODUCTION_URL`, `ACCESS_HOSTNAME`, `DEPLOY_REPOSITORY`

### Secrets

| Secret | Used by |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | prepare, deploy, verify, rollback; also uploaded to credential-admin Worker |
| `CLOUDFLARE_ACCOUNT_ID` | same |
| `D1_DATABASE_ID` | Wrangler config generation (masked in logs) |
| `AUTHORIZED_EMAIL` | Worker secret during deploy |
| `CONTACT_EMAIL` | Worker secret during deploy |
| `TEAM_DOMAIN` | Worker secret during deploy |
| `POLICY_AUD` | Worker secret during deploy |
| `SUNSETHUE_API_KEY` | Worker secret during deploy |

Provider transport credentials (Gmail SMTP + Pushover) are **not** GitHub environment secrets and are **not** uploaded to the main Worker. They live in Cloudflare Secrets Store and are administered through the Notifications UI backed by the credential-admin Worker. See [secrets-store-credentials.md](secrets-store-credentials.md).

Before the first Secrets Store deploy: run `npm run secrets-store:bootstrap`, set `SECRETS_STORE_ID` / `CREDENTIAL_ADMIN_WORKER_NAME`, and apply `npm run db:schema:remote`.

Access policy changes are not part of this workflow. See [cloudflare-credentials.md](cloudflare-credentials.md) for one-time Access setup with the same token.

## Post-deployment checks

Automated verification asserts:

1. An anonymous request to the configured production URL does not receive application HTML.
2. The response is an Access redirect or a denial.
3. The Worker `workers.dev` subdomain and preview URLs are disabled.
4. The latest Pages deployment is production, built from `main`, successful, and points at the expected commit.
5. The Worker still has the `DB` binding and every required configuration binding (by name only).
6. The cron trigger is still configured.
7. No response body discloses a credential-shaped value.

Production deploy order: prepare (rollback capture) → schema apply → schema verify → Secrets Store preflight → upload main + credential-admin secrets → deploy credential-admin Worker → deploy main Worker → Pages.

Authenticated browser verification remains a documented manual step. CI never holds a human Access cookie or a real Access JWT.

## Release sequencing

Release Please still maintains its release pull request on every push to `main`, but the release job only runs after `verify` succeeds. A merge of the release PR therefore cannot publish a GitHub release before production has been deployed and smoke-tested.

Release runs are themselves serialized by the `sunsethue-release` concurrency group.

## Failure behaviour

- A failed `validate` or `prepare` job stops the pipeline before any mutation.
- A failed `deploy-pages` after a successful Worker deploy fails the workflow, records the Worker version, and publishes the exact prior identifiers for rollback. It never claims the release succeeded.
- The `release` job does not run when any earlier job fails.

## Manual authenticated verification

After a green production run:

1. Open the production URL in a private window and confirm Access challenges.
2. Sign in as the authorized email.
3. Confirm locations, logs, credits, address search, and the manual report over same-origin `/api/*`.
4. On Notifications: save Gmail credentials to Secrets Store → send test email; save Pushover to Secrets Store → send test push. Confirm status shows masked identifiers only.
5. Confirm browser storage, network responses, and D1 metadata contain no plaintext provider secrets.