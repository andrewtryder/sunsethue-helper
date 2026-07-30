## Summary

<!-- What changed and why -->

## Checklist

- [ ] `CI=1 npm run ci` passes locally (or I understand why CI will cover it)
- [ ] No production secrets, personal emails, or real D1 ids in the diff
- [ ] Tests cover new behavior; synthetic data only
- [ ] Docs updated when behavior or configuration changed
- [ ] Conventional commit title (and commits) matching the change

## Security-sensitive?

- [ ] No changes under `worker/auth.js`, `functions/api/`, `.github/workflows/`, or Wrangler templates
- [ ] If there *are* such changes: describe the threat model impact below

<!-- threat model notes, if any -->
