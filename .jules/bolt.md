## $(date +%Y-%m-%d) - [Concurrent API requests in backend reports]
**Learning:** Cloudflare Workers running D1 queries and fetch calls sequentially for multiple locations creates linear scaling in execution time, often hitting worker latency limits. Using Promise.all for asynchronous work like API calls and D1 updates solves this perfectly since JavaScript concurrency handles it efficiently.
**Action:** When a backend function loops over items that need independent API calls and database updates, map them into an array of Promises and use Promise.all to perform the operations concurrently instead of blocking the main thread sequentially.

## Commit messages
- Use Conventional Commits: `type(scope): imperative subject` (max 72 characters on the subject line).
- Wrap body lines at 80 characters; do not write single-line body paragraphs.
- Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
