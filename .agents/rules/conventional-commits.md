# Conventional Commits

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) as validated by commitlint (Angular style).

## Format

```
type(scope): imperative subject

Optional body paragraph.

Optional footer: BREAKING CHANGE: description
```

- **type** (required): one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **scope** (required): noun in parentheses, e.g. `feat(frontend):`, `fix(firestore):`, `ci(repo):`
- **subject** (required): imperative mood, lowercase, no trailing period, max 72 characters on the first line
- **breaking changes**: prefix with `type!:` or add a `BREAKING CHANGE:` footer

## Examples

```
feat(frontend): add loading overlay fade transition
fix(firestore): allow email/password users without email_verified
ci(repo): add commitlint validation to pull request workflow
docs: update changelog for v1.5.3
refactor(functions): limit firestore location query to 10 reads
```

## When creating commits

- Only create commits when the user explicitly asks.
- Use a HEREDOC for multi-line commit messages.
- Prefer a scope that matches the area changed (`frontend`, `functions`, `firestore`, `ci`, `docs`).
- Do not use generic subjects like "update files" or "fix bug" — be specific about what changed.
