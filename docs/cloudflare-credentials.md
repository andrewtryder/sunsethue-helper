# Cloudflare credentials

This repository uses a single scoped Cloudflare API token for application deployment, D1 access, and one-time Access (Zero Trust) setup.

## Token

| GitHub secret | Used by | Must be able to |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `production.yml`, `rollback.yml`, and local `npm run access:*` | Deploy the Worker, deploy the Pages project, read verification metadata, and (when needed) manage the Access application for `sunsethue-helper.pages.dev` |
| `CLOUDFLARE_ACCOUNT_ID` | Same | Identify the account |

The token must be a **scoped API token**, never a Global API Key.

## Suggested Cloudflare permission set

- Account → Workers Scripts → Edit
- Account → Cloudflare Pages → Edit
- Account → D1 → Edit
- Account → Access: Apps and Policies → Edit
- Account → Access: Organizations, Identity Providers, and Groups → Read
- Account → Account Settings → Read (minimum metadata)

Access write is only needed for rare initialization or repair via the local `access:*` scripts. Routine production deploys do not mutate Access policies.

## One-time Access setup

Access is not part of the production pipeline. Configure it locally when initializing or repairing the application:

```bash
# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
npm run access:plan      # read-only summary of intended changes
npm run access:apply     # idempotent create/update for sunsethue-helper.pages.dev only
npm run access:verify    # assert the exact single-email policy shape
```

See the README Access automation section for lockout recovery and Audience tag handling.

## Rotation

1. Create a replacement scoped API token in the Cloudflare dashboard with the permissions above.
2. Update the GitHub `production` environment secret `CLOUDFLARE_API_TOKEN` (and any local `.env` copy).
3. Confirm a dry-run of `production.yml` and a local `npm run access:verify`.
4. Revoke the previous token in Cloudflare.

## Incident: leaked token

1. Revoke the token immediately in the Cloudflare dashboard.
2. Rotate Worker secrets that may have been reachable with it if the leak scope is unclear.
3. Create a replacement scoped token and store it only as a GitHub environment secret (and local `.env` if used).
4. Re-run `npm run access:verify` and a dry-run of `production.yml`.
5. Search git history for the leaked value. If it was ever committed, treat the commit as compromised and rotate again after rewriting or isolating that history.

Never paste a token into chat, a pull request, documentation, a test fixture, or a workflow log.
