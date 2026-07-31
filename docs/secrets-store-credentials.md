# Cloudflare credentials and Secrets Store

Sunsethue Helper stores **provider transport credentials** (Gmail SMTP and Pushover) in **Cloudflare Secrets Store**, not in D1 and not in browser-visible APIs.

## Architecture

```text
Browser
  -> Cloudflare Access
  -> Pages /api/*
  -> main API Worker
  -> CREDENTIAL_ADMIN service binding
  -> credential-administration Worker
  -> Cloudflare Secrets Store API
```

- The **main Worker** never receives `CLOUDFLARE_API_TOKEN`.
- The **credential-administration Worker** is private (`workers_dev = false`, `preview_urls = false`) and has no public routes.
- Provider adapters read credentials with `await env.EMAIL_TRANSPORT_SECRET.get()` / `await env.PUSHOVER_TRANSPORT_SECRET.get()`.

## Secrets Store JSON documents

| Secret name | Purpose |
|-------------|---------|
| `SUNSETHUE_EMAIL_TRANSPORT` | Gmail user, app password, sender mailbox |
| `SUNSETHUE_PUSHOVER_TRANSPORT` | Pushover app token + user/group key |

Unconfigured sentinel:

```json
{ "version": 1, "configured": false }
```

Recipient email, Pushover device/priority/sound remain D1 notification settings — never inside these secrets.

## One-time bootstrap

```bash
export CLOUDFLARE_API_TOKEN=...   # scoped token with Account Secrets Store Edit
export CLOUDFLARE_ACCOUNT_ID=...
npm run secrets-store:bootstrap
```

Then set GitHub production **variable** `SECRETS_STORE_ID` (non-secret) and `CREDENTIAL_ADMIN_WORKER_NAME`.

Also apply D1 schema (adds metadata tables only):

```bash
npm run db:schema:remote
```

## Single token permissions

Continue using one scoped `CLOUDFLARE_API_TOKEN` for:

- Worker / Pages / D1 deploy
- Access administration
- Secrets Store administration

Do **not** use a Global API Key. Rotating the token requires updating:

1. GitHub production environment secret `CLOUDFLARE_API_TOKEN`
2. Credential-admin Worker secret (`npm run secrets:upload:admin`)

## Stage 1 vs Stage 2

**Stage 1 (this release):** Secrets Store + admin Worker + UI; legacy Gmail/Pushover Worker secrets remain as fallback.

**Stage 2 (after production validation):** Remove Gmail/Pushover from ordinary Worker secrets, GitHub env, and upload script; remove resolver fallback.

## Local development

Use ignored `.dev.vars` for legacy fallback credentials. Production Secrets Store values are **not** available to local Wrangler bindings. Never attempt to read production store values during local development.

## Rollback (Stage 1)

While legacy Worker secrets remain configured:

1. Keep or restore `GMAIL_*` / `PUSHOVER_*` on the main Worker and in GitHub production secrets.
2. Redeploy the previous main Worker version if the admin Worker or bindings misbehave.
3. Resolvers prefer Secrets Store only when `configured === true`; otherwise they use legacy secrets automatically.

Stage 2 (remove legacy secrets and fallback code) must not run until authenticated production tests succeed. After Stage 2, rollback requires restoring Worker secrets from a secure backup and redeploying a build that still includes fallback resolvers.

## API

Authenticated Access identity only:

- `GET /api/provider-credentials`
- `PUT|DELETE /api/provider-credentials/email`
- `PUT|DELETE /api/provider-credentials/pushover`

Mutations require `X-Sunsethue-Admin: credentials`, same-origin `Origin`, and reject cross-site `Sec-Fetch-Site`. Responses never include secret values.