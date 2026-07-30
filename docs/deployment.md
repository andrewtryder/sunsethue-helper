# Production deployment

## Trigger

The `Production` workflow (`.github/workflows/production.yml`) runs on:

- every push to `main`
- manual `workflow_dispatch`, with an optional `dry_run` input

It is serialized by the `sunsethue-production` concurrency group with `cancel-in-progress: false`, so two production deployments can never overlap and a mid-deploy cancel cannot leave Worker and Pages on different versions.

## Job order

```text
validate
  -> prepare
    -> migrate
      -> deploy-worker
        -> deploy-pages
          -> verify
            -> release
```

| Job | What it does |
| --- | --- |
| `validate` | Calls the reusable `validate.yml` workflow. Lint, audit, tests, coverage, Wrangler dry-run. No production secrets. |
| `prepare` | Records the commit SHA, the current Worker version, and the current Pages production deployment. Confirms the repository, branch, account, project, bindings, and cron. Writes a sanitized job summary. |
| `migrate` | Lists and applies pending D1 migrations. Succeeds without changes when nothing is pending. Fails loudly if state cannot be determined. |
| `deploy-worker` | Deploys the Worker first. Must stay backward compatible with the still-running previous Pages frontend. |
| `deploy-pages` | Deploys the Pages frontend and the `/api/*` Function with the `API_SERVICE` binding. |
| `verify` | Unauthenticated negative checks (Access gate, workers.dev bypass, Pages commit, bindings, cron). Records exact rollback identifiers. |
| `release` | Runs Release Please **after** verification, so a GitHub release cannot be published ahead of a working deployment. |

A dry-run dispatch stops after `prepare`. Nothing is migrated, deployed, or released.

## GitHub environment

Every Cloudflare-touching job uses:

```yaml
environment:
  name: production
  url: https://sunsethue-helper.pages.dev
```

Required repository settings are documented in [branch-protection.md](branch-protection.md) and [cloudflare-credentials.md](cloudflare-credentials.md).

## Required secrets (names only)

All of these live in the `production` environment. Values are never logged.

| Secret | Used by |
| --- | --- |
| `CLOUDFLARE_DEPLOY_API_TOKEN` | prepare, migrate, deploy, verify, rollback |
| `CLOUDFLARE_ACCOUNT_ID` | same |
| `AUTHORIZED_EMAIL` | Worker secret during deploy |
| `TEAM_DOMAIN` | Worker secret during deploy |
| `POLICY_AUD` | Worker secret during deploy |
| `SUNSETHUE_API_KEY` | Worker secret during deploy |
| `GMAIL_USER` | Worker secret during deploy |
| `GMAIL_APP_PASSWORD` | Worker secret during deploy |
| `EMAIL_TO` | Worker secret during deploy |
| `EMAIL_FROM` | Worker secret during deploy |

`CLOUDFLARE_ZEROTRUST_API_TOKEN` is **not** used by this workflow. Access changes go through the separate [Zero Trust workflow](cloudflare-credentials.md#zero-trust-workflow).

## Post-deployment checks

Automated verification asserts:

1. An anonymous request to `https://sunsethue-helper.pages.dev` does not receive application HTML.
2. The response is an Access redirect or a denial.
3. The Worker `workers.dev` subdomain and preview URLs are disabled.
4. The latest Pages deployment is production, built from `main`, successful, and points at the expected commit.
5. The Worker still has the `DB` binding and every required configuration binding (by name only).
6. The cron trigger is still configured.
7. No response body discloses a credential-shaped value.

Authenticated browser verification remains a documented manual step. CI never holds a human Access cookie or a real Access JWT.

## Release sequencing

Release Please still maintains its release pull request on every push to `main`, but the release job only runs after `verify` succeeds. A merge of the release PR therefore cannot publish a GitHub release before production has been deployed and smoke-tested.

Release runs are themselves serialized by the `sunsethue-release` concurrency group.

## Failure behaviour

- A failed `validate` or `prepare` job stops the pipeline before any mutation.
- A failed `migrate` job stops before any code deploy.
- A failed `deploy-pages` after a successful Worker deploy fails the workflow, records the Worker version, and publishes the exact prior identifiers for rollback. It never claims the release succeeded.
- The `release` job does not run when any earlier job fails.

## Manual authenticated verification

After a green production run:

1. Open `https://sunsethue-helper.pages.dev` in a private window and confirm Access challenges.
2. Sign in as the authorized email.
3. Confirm locations, logs, credits, address search, and the manual report over same-origin `/api/*`.
