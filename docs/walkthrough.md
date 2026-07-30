# Access hardening walkthrough

## What changed

Sunsethue Helper is now protected by Cloudflare Zero Trust Access on the exact production hostname. Browser API traffic uses same-origin `/api/*`, which is proxied by a Pages Function through a private Worker service binding. The Worker verifies Access JWTs and authorizes one email.

## Operator checklist

1. Ensure GitHub secrets include `AUTHORIZED_EMAIL`, `TEAM_DOMAIN`, and `POLICY_AUD` in addition to existing Cloudflare and email secrets.
2. Run `npm run access:snapshot` before mutations.
3. Run `npm run access:apply` and `npm run access:verify`.
4. Deploy Pages with `wrangler.pages.toml`, then deploy the Worker with JWT enforcement.
5. Confirm anonymous requests to production do not return application HTML.
6. Confirm `workers.dev` no longer serves API JSON.
7. Complete the manual authenticated browser login as the owner.

## Rollback

Use the sanitized snapshot under `.tmp/cloudflare-access/` and the procedure in the README. Do not broaden Access policies to recover from lockout.
