# Rollback

## Principles

1. Never guess a rollback target. Use the exact Worker version id and Pages deployment id recorded in the deployment job summary.
2. Validate that every identifier belongs to this application before mutating anything.
3. Treat D1 separately. Schema recovery uses Time Travel or re-applying `schema.sql`, not an automated reverse migration.
4. Share the `production-deploy` concurrency group so a rollback can never overlap a deployment.

## Automated rollback workflow

Trigger **Rollback production** (`.github/workflows/rollback.yml`) with:

| Input | Required | Notes |
| --- | --- | --- |
| `target` | yes | `both`, `worker`, or `pages` |
| `worker_version_id` | when target includes the Worker | Exact version id from the deployment summary |
| `pages_deployment_id` | when target includes Pages | Exact production deployment id |
| `reason` | yes | Free-text explanation |

The workflow:

1. Generates Wrangler configs from the GitHub `production` environment (`config:generate:strict`).
2. Verifies the Cloudflare API token.
3. Looks up the Worker version and/or Pages deployment and refuses anything that does not belong to this application, or any Pages deployment that is not `production`.
4. Rolls the Worker back first (the Pages Function calls it through the service binding).
5. Rolls Pages back second.
6. Re-runs the unauthenticated post-deployment smoke tests.
7. Writes a sanitized job summary. D1 is never modified.

## Finding the identifiers

Every production run publishes them twice:

- in the `prepare` job summary (the state before the deploy)
- in the `verify` job summary under **Rollback targets**, whether verification passed or failed

Example:

| Input | Value |
| --- | --- |
| `worker_version_id` | `a1b2c3d4-…` |
| `pages_deployment_id` | `e5f6a7b8-…` |

## Manual commands (same identifiers)

Use the Wrangler version pinned in `package.json`. Generate configs first (`npm run config:generate:strict`).

```bash
# Worker
npx wrangler rollback <worker-version-id> \
  --config wrangler.worker.toml \
  --message "rollback: <reason>" \
  --yes

# Pages (Cloudflare API)
# POST /accounts/<account>/pages/projects/<PAGES_PROJECT_NAME>/deployments/<id>/rollback
```

Or run the packaged entry points:

```bash
ROLLBACK_TARGET=both \
WORKER_VERSION_ID=<id> \
PAGES_DEPLOYMENT_ID=<id> \
ROLLBACK_REASON="incident: <summary>" \
npm run rollback:production
```

## Compatibility

Roll back to a pair of deployments that were known to work together. Prefer the `worker_version_before` / `pages_deployment_before` pair from a single production run. Mixing a Worker version from one run with a Pages deployment from another can produce an incompatible frontend and API.

## D1

The rollback workflow does **not** modify the database.

Options, in preferred order:

1. Use [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) to restore a bookmark taken before the incident. Document the bookmark in the incident notes.
2. Re-apply the committed `schema.sql` against a local or recovered database when only missing tables/indexes need restoring (`npm run db:schema:local` for local D1; use Wrangler `--remote` only with explicit owner approval).

Confirm current Wrangler flags with `npx wrangler d1 time-travel --help` before touching production.

## Access / Zero Trust

Do not roll Access back through the application rollback workflow.

1. Prefer the sanitized snapshot under `.tmp/cloudflare-access/rollback-snapshot.json` with `npm run access:plan` / `access:apply`.
2. Deleting the Access application is a last-resort, owner-approved action.

## workers.dev

Do not re-enable `workers.dev` during a normal rollback. Only re-enable it temporarily, with JWT enforcement still active, when the Pages service binding itself is broken and owner approval has been given. Disable it again before declaring recovery complete.
