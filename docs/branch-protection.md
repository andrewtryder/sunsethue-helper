# Branch protection

Recommended settings for `main` on your deployment repository (`DEPLOY_REPOSITORY`). These are repository settings; the workflows enforce the corresponding policy in code, but GitHub still has to require the checks.

This repository is designed for a single human maintainer. Do **not** require a second-person approval when that would make merges impossible. Do require the automated validation check.

## Required settings for `main`

| Setting | Value |
| --- | --- |
| Require a pull request before merging | On |
| Require status checks to pass before merging | On |
| Required status checks | The checks published by `Validate` (`Commit and title conventions`, `Static analysis and configuration`, `Tests and coverage`) |
| Require branches to be up to date before merging | On when practical |
| Require conversation resolution before merging | On |
| Restrict who can push to matching branches | Only maintainers; no force push |
| Allow force pushes | Off |
| Allow deletions | Off |
| Do not allow bypassing the above settings | On where the plan supports it |
| Require approvals | Off (single maintainer) or 1 if a second reviewer is available |

## Production environment

Create a GitHub Environment named `production`.

| Setting | Value |
| --- | --- |
| Deployment branches | Restricted to `main` |
| Required reviewers | Optional. Enable when a second person can approve; leave off for the solo maintainer |
| Wait timer | Optional |
| Environment variables and secrets | See [cloudflare-credentials.md](cloudflare-credentials.md) |

Every Cloudflare-touching job in `production.yml` and `rollback.yml` references this environment. Untrusted branches therefore cannot read production credentials.

## Why the commit-message fixer was removed

The previous `fix-commit-messages.yml` workflow:

- granted `contents: write` on pull requests
- rewrote history with `git filter-branch`
- force-pushed the contributor's branch

That combination is unsafe: a compromised or malicious PR can receive a write-capable checkout and mutate the branch. Commit-message enforcement is now check-only (`scripts/check-commit-messages.sh`). Invalid messages fail the PR with the required format and never modify the branch.

## PR validation must receive no production secrets

The reusable `validate.yml` workflow declares `permissions: contents: read` and never references Cloudflare, SMTP, Gmail, Sunsethue, Access, or production D1 secrets. The workflow security checker fails the build if a future PR workflow reintroduces a secret read.

## Applying these settings

Settings are not changed automatically by this repository. Apply them in the GitHub UI:

1. Settings → Branches → Add / edit the `main` protection rule with the table above.
2. Settings → Environments → New environment → `production`, restrict to `main`, add the variables and secrets listed in [cloudflare-credentials.md](cloudflare-credentials.md).
3. Confirm the required status check names match the job names after the first green run of `Validate`.
