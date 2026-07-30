# Cloudflare credentials

Application deployment and Zero Trust administration are separate trust domains. They use different tokens, different workflows, and different failure modes.

## Tokens

| Conceptual name | GitHub secret | Used by | Must be able to | Must NOT be able to |
| --- | --- | --- | --- | --- |
| Application deployment | `CLOUDFLARE_DEPLOY_API_TOKEN` | `production.yml`, `rollback.yml` | Deploy the Worker, deploy the Pages project, apply D1 migrations, read the minimum metadata needed for verification | Access Apps / Policies Write |
| Zero Trust infrastructure | `CLOUDFLARE_ZEROTRUST_API_TOKEN` | `zero-trust.yml` only | Manage the Access application for `sunsethue-helper.pages.dev`, its policies, and required Access metadata | Workers / Pages deploy, D1 write |
| Account id | `CLOUDFLARE_ACCOUNT_ID` | All of the above | Identify the account | — |

Both tokens must be **scoped API tokens**, never a Global API Key.

## Suggested Cloudflare permission sets

### `CLOUDFLARE_DEPLOY_API_TOKEN`

- Account → Workers Scripts → Edit
- Account → Workers Tail → Read (optional, for debugging)
- Account → Cloudflare Pages → Edit
- Account → D1 → Edit
- Account → Account Settings → Read (minimum metadata)

Do **not** include Access: Apps and Policies.

### `CLOUDFLARE_ZEROTRUST_API_TOKEN`

- Account → Access: Apps and Policies → Edit
- Account → Access: Organizations, Identity Providers, and Groups → Read

Do **not** include Workers Scripts Edit, Pages Edit, or D1 Edit.

## Rotation plan for the existing combined token

The repository previously used a single `CLOUDFLARE_API_TOKEN` for both application deployment and Access administration. That secret name is obsolete.

1. Create the two scoped tokens above in the Cloudflare dashboard.
2. Add them as environment secrets on the GitHub `production` environment under the new names.
3. Confirm a dry-run of `production.yml` and a `plan` of `zero-trust.yml` both succeed.
4. Revoke the old combined `CLOUDFLARE_API_TOKEN` in Cloudflare.
5. Delete the obsolete GitHub repository/environment secret named `CLOUDFLARE_API_TOKEN`.

Until step 4 is done, treat the old token as over-privileged and schedule its revocation.

## Zero Trust workflow

`.github/workflows/zero-trust.yml` is manual only:

| Input | Default | Effect |
| --- | --- | --- |
| `plan` | yes | Read-only. Lists the changes that would be made. No write calls. |
| `verify` | | Asserts the exact Access policy shape. |
| `apply` | | Idempotent create/update of the Sunsethue Access application only. |

Rules enforced by the script and the workflow:

- Modifies only the Access application for `sunsethue-helper.pages.dev`.
- Never prints tokens, JWTs, cookies, or identity-provider secrets.
- The Audience tag is redacted in every log and job summary.
- Defaults to `plan`. Applying changes requires an explicit input and the `production` environment.

## Incident: leaked token

1. Revoke the token immediately in the Cloudflare dashboard.
2. Rotate every secret that may have been reachable with it (Worker secrets, Access policies if the Zero Trust token leaked).
3. Create a replacement scoped token and store it only as a GitHub environment secret.
4. Re-run `zero-trust.yml` with `action: verify` and a dry-run of `production.yml`.
5. Search git history for the leaked value. If it was ever committed, treat the commit as compromised and rotate again after rewriting or isolating that history.

Never paste a token into chat, a pull request, documentation, a test fixture, or a workflow log.
