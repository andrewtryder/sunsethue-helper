# Recovery exercise log

Recorded after the 1.19.0 / Secrets Store Stage 2 cutover.

## Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| RTO (Worker or Pages rollback) | ≤ 15 minutes | Prefer the Rollback production workflow |
| RPO (D1) | Last Time Travel bookmark ≤ 30 seconds before incident | Capture bookmark before schema changes |
| RTO (credential rotate) | ≤ 20 minutes | GitHub `CLOUDFLARE_API_TOKEN` + `npm run secrets:upload:admin` |

## Verified commands

### 1. Capture identifiers

```bash
npm run config:generate:strict
npx wrangler versions list --config wrangler.worker.toml
npx wrangler d1 time-travel info "$D1_DATABASE_NAME" --config wrangler.worker.toml
```

Use Worker/Pages ids from the latest Production job summary (`worker_version_before` / `pages_deployment_before`).

### 2. Worker rollback then restore

```bash
# Roll back
npx wrangler rollback <previous-version-id> \
  --config wrangler.worker.toml \
  --message "recovery-drill: temporary rollback" \
  --yes

# Verify Access gate still challenges
curl -sI "$PRODUCTION_URL" | head -5

# Restore current by redeploying main (or rollback to the newer version id)
npx wrangler rollback <current-version-id> \
  --config wrangler.worker.toml \
  --message "recovery-drill: restore current" \
  --yes
```

### 3. Pages rollback then restore

Use **Rollback production** with `target=pages` and the recorded deployment ids, or the Cloudflare API rollback endpoint documented in [rollback.md](rollback.md).

### 4. D1 disposable recovery

```bash
# Bookmark before touching production schema
npx wrangler d1 time-travel info "$D1_DATABASE_NAME" --config wrangler.worker.toml

# Create a disposable database and re-apply schema (do not overwrite production)
npx wrangler d1 create sunsethue-recovery-drill
# Point a temporary wrangler config at the new id, then:
npm run db:schema:remote   # against disposable only
```

Prefer Time Travel restore into a **fork/export**, never an unattended restore onto production during drills.

### 5. Token rotation path

1. Create a replacement scoped Cloudflare API token (Secrets Store Edit + deploy scopes).
2. Update GitHub `production` secret `CLOUDFLARE_API_TOKEN`.
3. `npm run secrets:upload:admin`
4. Delete the old token.

### 6. Provider credential recreate (UI)

Remove and re-save Gmail or Pushover via Settings → provider cards. Confirm `/api/operational-status` shows `secrets_store` after save and a test send succeeds.

## Measured drill (2026-08-01)

| Step | Result |
|------|--------|
| Worker rollback `<previous-worker-version>` → Access still 302 | 3s |
| Worker restore `<current-worker-version>` → Access still 302 | 2s |
| Total Worker RTO (rollback+restore) | **5s** (target ≤15m) |
| Production D1 bookmark captured | `<redacted-bookmark>` |
| Disposable D1 create | **Blocked** — account D1 database quota; substituted `npm run db:schema:local` idempotent reapply |
| Pages rollback | Use Rollback workflow with ids from Production verify summary (not exercised in this drill to avoid overlapping deploys) |
| Token rotate | Documented path; not rotated in this drill (would invalidate CI mid-flight) |
| Provider credential UI recreate | Operator exercise via Settings after Access login |

1. Stop deploys (concurrency group already serializes Production/Rollback).
2. Prefer exact-id rollback over forward-fixing during incidents.
3. If Secrets Store is unavailable, delivery fails closed (Stage 2); restore admin Worker / store access before attempting provider sends.
4. Document bookmark + version ids in the incident notes before any D1 restore.
