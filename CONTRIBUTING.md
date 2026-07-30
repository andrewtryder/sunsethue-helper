# Contributing

Thanks for considering a contribution. This project is a personal Cloudflare
Pages + Worker app with Zero Trust Access in front. Keep production credentials
out of the repository and out of pull requests.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Local development (no production credentials)

1. Copy the examples and fill in **synthetic** values only:

   ```bash
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```

2. Generate local Wrangler configs from the tracked templates:

   ```bash
   npm run config:generate
   ```

3. Apply the schema to a local D1 database and start the stack:

   ```bash
   npm run db:schema:local
   npm run dev
   ```

`DEV_AUTH_BYPASS` defaults to `false` in `.dev.vars.example`. Enable it only on
loopback for local UI work — never in production.

Do not paste Cloudflare API tokens, Access JWTs, SMTP passwords, Sunsethue keys,
or real D1 database ids into tracked files, issues, or PR descriptions.

## Tests and CI

```bash
npm ci
CI=1 npm run ci
```

That gate runs ESLint (including security rules), `npm audit`, shellcheck,
workflow policy checks, Wrangler validation, and the full coverage suite.

Additional checks:

```bash
npm run lint:workflows
npm run audit:release   # requires pinned gitleaks + trufflehog locally
```

## Security-sensitive files

Treat changes to these paths as security-sensitive and keep diffs small:

- `worker/auth.js` — Access JWT validation and auth bypass controls
- `functions/api/[[path]].js` — Pages → Worker service-binding proxy
- `.github/workflows/` — CI/CD permissions and secret access
- `schema.sql` — D1 schema
- `wrangler.example.toml` / `wrangler.worker.example.toml` — deployment templates
- `scripts/public-release-audit.mjs` / `scripts/lib/scanner-versions.mjs`

## Synthetic test data only

- Unit and integration tests must use placeholder emails (`owner@example.com`),
  hosts (`app.example.com`), and fake JWKS/SMTP/Sunsethue responses.
- Do not call real third-party services from tests.
- Do not load production `.env` values into the test suite.

## Third-party services

Local and CI runs should not depend on live Cloudflare, Gmail, Nominatim, or
Sunsethue credentials. Scripts that manage Access or deploy production are for
operators with their own accounts — document required variables, never embed
them.

## Commit and pull request conventions

- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
  (Angular style), e.g. `feat(frontend): add loading overlay fade transition`.
- Pull request titles must also be conventional commits; CI validates both.
- Prefer a scope that matches the area changed (`frontend`, `functions`,
  `firestore` is not used here — prefer `worker`, `pages`, `ci`, `docs`, etc.).
- Keep PRs focused. Use the pull request template checklist.
- Do not force-push to `main`. Do not add write-enabled pull request workflows.

## Reporting vulnerabilities

See [SECURITY.md](SECURITY.md). Use private GitHub Security Advisories — not
public issues.
