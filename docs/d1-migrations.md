# D1 migrations

## Layout

```text
migrations/
  0001_initial_schema.sql
  0002_query_indexes.sql
```

Configured in `wrangler.worker.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sunsethue-db"
database_id = "…"
migrations_dir = "migrations"
```

The old unrestricted `schema.sql` apply path is gone. Schema changes ship as versioned migration files and are applied explicitly by the production pipeline.

## Local commands

Always use the Wrangler version pinned in `package.json`.

```bash
# List pending migrations against the local D1 state
npm run db:migrations:list

# Apply pending migrations locally
npm run db:migrations:apply

# Same against a remote database (production credentials required)
npx wrangler d1 migrations list sunsethue-db --config wrangler.worker.toml --remote
npx wrangler d1 migrations apply sunsethue-db --config wrangler.worker.toml --remote
```

## Production pipeline behaviour

The `migrate` job in `production.yml`:

1. Lists pending migrations with `--remote`.
2. Fails the workflow if migration state cannot be determined. Nothing is deployed.
3. Succeeds without changes when nothing is pending.
4. Applies pending migrations before the Worker that needs the new schema is deployed.
5. Records which migrations were applied in the job summary.

Migrations must be backward compatible with the currently deployed Worker whenever possible, because the previous Pages frontend keeps calling the Worker until the next job finishes.

## Writing a migration

1. Create a new file with `npx wrangler d1 migrations create sunsethue-db "<message>" --config wrangler.worker.toml`.
2. Keep the change additive when you can (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, nullable new columns).
3. Apply and exercise it against local D1 before opening a pull request.
4. Never point a test at production D1. Integration tests build an in-memory SQLite database from the same `migrations/` files.

## Recovery

| Situation | Action |
| --- | --- |
| Bad data, good schema | Restore from a D1 Time Travel bookmark taken before the incident. Redeploy code if needed. |
| Bad schema, reviewed reverse migration exists | Apply the reverse migration through a normal pull request and production deploy. |
| Bad schema, no reverse migration | Prefer a new forward migration that restores a safe schema. Only use Time Travel when the forward path is worse. |

The [rollback workflow](rollback.md) never reverses a migration automatically.

### Time Travel sketch

```bash
# Capture a bookmark before a risky migration
npx wrangler d1 time-travel info sunsethue-db --config wrangler.worker.toml

# Restore to a bookmark (owner-approved, production environment only)
npx wrangler d1 time-travel restore sunsethue-db \
  --config wrangler.worker.toml \
  --bookmark=<bookmark-id>
```

Confirm the current Wrangler flags with `npx wrangler d1 time-travel --help` before running anything against production.
