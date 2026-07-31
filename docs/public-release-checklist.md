# Public release checklist

Use this checklist before making the repository public or publishing a fork
that others will clone. The goal is fail-closed: if any gate fails, do not
publish.

## 1. Sanitize the current tree

- [ ] Instance-specific values live only in ignored files (`.env`, `.dev.vars`,
      generated `wrangler.toml` / `wrangler.worker.toml`) or GitHub environment
      configuration — never in tracked source.
- [ ] Tracked examples use placeholders (`owner@example.com`,
      `{{D1_DATABASE_ID}}`, `app.example.com`).
- [ ] `.dev.vars.example` defaults to `DEV_AUTH_BYPASS=false`.
- [ ] `CI=1 npm run ci` passes.

## 2. Run the public-release audit

Install the pinned scanners (versions are defined in
`scripts/lib/scanner-versions.mjs`):

```bash
brew install gitleaks trufflehog
gitleaks version   # must report 8.30.1
trufflehog --version  # must report 3.96.0
```

Optionally create a gitignored needle file with private identifiers that
scanners might miss (personal hostnames, Access audience tags, D1 ids). Emails,
API tokens, and the D1 id are also auto-collected from local `.env` /
`.dev.vars` when present. Hostnames are **not** auto-collected — add them here
when you want to audit historical tags and branches:

```bash
cp .release-audit.local.example.json .release-audit.local.json  # if present
# or write {"needles":["your-private-value", ...]} yourself
```

Run the audit:

```bash
npm run audit:release
```

By default the identifier pass searches the current branch and all tags (the
usual publication surface). For an exhaustive scan of every local branch:

```bash
npm run audit:release -- --all-refs
```

Delete or sanitize stale remote branches before making the repository public;
otherwise historical hostnames on abandoned branches will remain reachable.

- [ ] Exit code is `0`.
- [ ] `.tmp/public-release-audit.json` reports `"ok": true`.
- [ ] The report never contains raw secret values (only redacted fingerprints).

The weekly/manual [security workflow](../.github/workflows/security.yml) runs
the same scanners via digest-pinned container images and does **not** receive
production secrets.

## 3. Manual credential revocation and rotation

Even a clean tree is not enough if historical credentials were ever exposed.
Rotate anything that might have been committed, logged, or shared:

| Credential | Where to revoke / rotate | Notes |
| --- | --- | --- |
| Cloudflare API token | Cloudflare dashboard → My Profile → API Tokens | Create a new token, update the GitHub `production` secret **and** the credential-admin Worker secret, then delete the old token |
| Cloudflare Access application / policy | Zero Trust → Access → Applications | Confirm only the intended email is allowed; rotate any service tokens |
| Access `POLICY_AUD` / team domain | Zero Trust → Access | Update Worker secrets after any application rebuild |
| SMTP / Gmail app password | Google Account → Security → App passwords | Revoke the old app password; update via Notifications UI (Secrets Store) or Stage 1 Worker secret |
| Pushover tokens | Pushover dashboard | Rotate app/user keys via Notifications UI or Stage 1 Worker secrets |
| Sunsethue API key | Sunsethue account / API settings | Rotate and update the Worker secret |
| D1 database id | Cloudflare dashboard → Workers → D1 | The id itself is not a password, but treat a leaked production id as an inventory disclosure; confirm the database is not publicly reachable |
| GitHub Actions secrets | Repository → Settings → Environments → production | Re-enter rotated values; never paste them into issues or PRs |

## 4. Decide how to publish

### Preferred when history is already clean

If `npm run audit:release` passes against the full history (branches and tags):

- [ ] Make the existing repository public, or push to a new public remote.
- [ ] Confirm GitHub Secret Scanning / push protection is enabled.

### Fallback when history cleanup is unsafe

If credentials remain in history and a rewrite would break clones, forks, or
open PRs:

1. Create a **new** empty public repository.
2. Export a sanitized tree (for example a squashed single commit from a clean
   working copy), not a force-pushed rewrite of the private history.
3. Point docs and package metadata at the new repository URL.
4. Archive or keep the old repository private.
5. Rotate every credential listed above before or immediately after publication.

Do **not** force-push a rewritten history to a repository that already has
external collaborators unless everyone agrees and re-clones.

## 5. Governance gates

- [ ] `LICENSE` is MIT and matches `package.json` `"license"`.
- [ ] `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` are present.
- [ ] `.github/CODEOWNERS` and issue/PR templates are present.
- [ ] `docs/third-party.md` lists dependency and data-source attribution.

## 6. Final publication block

**Do not publish** if any of the following is true:

- `npm run audit:release` exits non-zero
- The security workflow is failing on `main`
- Any production secret still appears (even redacted) in a finding you have not
  rotated
- Tracked files still contain a personal email or a real D1 UUID
