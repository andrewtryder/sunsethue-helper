# Cloudflare credentials and Secrets Store

Sunsethue Helper stores **provider transport credentials** (Gmail SMTP, Pushover, webhook signing material, and Web Push VAPID private key) in **Cloudflare Secrets Store**, not in D1 and not in browser-visible APIs. The main Worker never receives Gmail or Pushover secrets; there is no legacy Worker-secret fallback.

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
- Provider adapters read credentials with `await env.EMAIL_TRANSPORT_SECRET.get()` / `await env.PUSHOVER_TRANSPORT_SECRET.get()` / `await env.WEBHOOK_TRANSPORT_SECRET.get()` / `await env.WEB_PUSH_VAPID_PRIVATE.get()`.
- Delivery requires `configured === true` in the store document. An unconfigured or missing store secret fails closed with `EMAIL_NOT_CONFIGURED` / `PUSHOVER_NOT_CONFIGURED` / `WEBHOOK_NOT_CONFIGURED`.

## Secrets Store JSON documents

| Secret name | Purpose |
|-------------|---------|
| `SUNSETHUE_EMAIL_TRANSPORT` | Gmail user, app password, sender mailbox |
| `SUNSETHUE_PUSHOVER_TRANSPORT` | Pushover app token + user/group key |
| `SUNSETHUE_WEBHOOK_TRANSPORT` | HTTPS webhook URL + HMAC signing secret |
| `SUNSETHUE_WEB_PUSH_VAPID` | Web Push VAPID private key JSON (`{ "version": 1, "configured": true, "privateKey": "..." }`) |

Unconfigured sentinel:

```json
{ "version": 1, "configured": false }
```

Recipient email, Pushover device/priority/sound, webhook enable/masked hostname, and browser subscription metadata remain in D1 — never inside these secrets.

Non-secret Web Push config on the Worker: `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_SUBJECT` (mailto: or https URL). The private key lives only in Secrets Store; the public key and subject are non-secret and are emitted into `wrangler.worker.toml` `[vars]` by `npm run config:generate` when `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_SUBJECT` are present in the environment.


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

## Web Push VAPID setup

After bootstrap, generate and install the VAPID keypair. The bootstrap created an unconfigured sentinel for this secret, so the first provisioning run must replace it with `--rotate`:

```bash
export CLOUDFLARE_API_TOKEN=...        # scoped, Secrets Store Edit
export CLOUDFLARE_ACCOUNT_ID=...
export SECRETS_STORE_ID=...            # from secrets-store:bootstrap
npm run webpush:setup -- --subject mailto:ops@example.com --rotate
```

The script:

1. Refuses to overwrite an existing secret unless `--rotate` is supplied, to prevent accidental keypair rotation.
2. Generates one P-256 (ES256) VAPID keypair.
3. Writes the PKCS8 private key into `SUNSETHUE_WEB_PUSH_VAPID` in Secrets Store as `{ "version": 1, "configured": true, "privateKey": "..." }`.
4. Waits for the secret to become `active`.
5. Prints the **non-secret** public key and subject to set as GitHub production **variables**:
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_SUBJECT`
6. Never prints the private key and refuses to log any string containing PEM markers.

Then set those two variables in the GitHub production environment and redeploy the Worker (production workflow, or `wrangler deploy --keep-vars --config wrangler.worker.toml` after `npm run config:generate` with both env vars present). After deploy, verify the endpoint:

```bash
npm run webpush:verify -- --url https://production.example.com
```

`webpush:verify` checks `GET /api/web-push/vapid-public-key` returns `configured: true` and a valid 65-byte / `0x04` public key. If `WEB_PUSH_VAPID_PUBLIC_KEY` is set in the environment, it also checks the returned key matches the expected value. Retry Browser Push registration in Settings — expect `POST /api/web-push/subscriptions`.

## Single token permissions

Continue using one scoped `CLOUDFLARE_API_TOKEN` for:

- Worker / Pages / D1 deploy
- Access administration
- Secrets Store administration

Do **not** use a Global API Key. Rotating the token requires updating:

1. GitHub production environment secret `CLOUDFLARE_API_TOKEN`
2. Credential-admin Worker secret (`npm run secrets:upload:admin`)

## Local development

Cloudflare Secrets Store bindings are **not** available to local Wrangler. Production delivery cannot run against a local dev server. Local unit and integration tests inject fake `EMAIL_TRANSPORT_SECRET` / `PUSHOVER_TRANSPORT_SECRET` bindings that emulate the Secrets Store `get()` contract; never attempt to read production store values during local development.

## Rollback

Provider delivery only succeeds when the corresponding Secrets Store document is `configured: true`. To disable a channel in an incident:

1. Use the Notifications UI (or `wrangler secrets-store secret ...`) to overwrite the affected document with the unconfigured sentinel `{ "version": 1, "configured": false }`.
2. Delivery fails closed immediately (`EMAIL_NOT_CONFIGURED` / `PUSHOVER_NOT_CONFIGURED`) without redeploying.
3. Redeploy the previous main Worker version if the admin Worker or bindings misbehave; do **not** attempt to re-introduce legacy Gmail/Pushover Worker secrets — the resolvers and helper scripts no longer read them.

## API

Authenticated Access identity only:

- `GET /api/provider-credentials`
- `PUT|DELETE /api/provider-credentials/email`
- `PUT|DELETE /api/provider-credentials/pushover`

Mutations require `X-Sunsethue-Admin: credentials`, same-origin `Origin`, and reject cross-site `Sec-Fetch-Site`. Responses never include secret values.
