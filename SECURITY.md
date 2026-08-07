# Security Policy

## Supported versions

Only the latest commit on `main` is supported. Older tags and release branches
do not receive security backports unless explicitly noted in a GitHub Security
Advisory.

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub Security Advisories
for this repository:

https://github.com/andrewtryder/sunsethue-helper/security/advisories/new

Do **not** open a public issue for a suspected vulnerability.

### What to include

- A clear description of the issue and its impact
- Steps to reproduce, preferably against a local clone with synthetic data
- Affected commit SHA or release tag, if known
- Any suggested fix

### What not to include

- Real production credentials, API tokens, Access JWTs, or app passwords
- Unredacted production logs, emails, or database dumps
- Personal email addresses or live hostnames that are not already public

If a log or screenshot is necessary, redact secrets first. The public-release
audit redacts findings as `abcd…yz (len N, sha256:…)` — use a similar style.

## Response process

1. The maintainer acknowledges the report (target: within 7 days).
2. The issue is triaged and, if confirmed, fixed on a private branch when
   practical.
3. A fix is released on `main`, with a GitHub Security Advisory when warranted.
4. Credit is given to the reporter unless anonymity is requested.

There is no bug bounty program for this personal project.

## Local hardening expectations

Contributors must never commit `.env`, `.dev.vars`, generated Wrangler configs,
or `.release-audit.local.json`. See [CONTRIBUTING.md](CONTRIBUTING.md).
