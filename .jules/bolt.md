## $(date +%Y-%m-%d) - [Concurrent API requests in backend reports]
**Learning:** Cloudflare Workers running D1 queries and fetch calls sequentially for multiple locations creates linear scaling in execution time, often hitting worker latency limits. Using Promise.all for asynchronous work like API calls and D1 updates solves this perfectly since JavaScript concurrency handles it efficiently.
**Action:** When a backend function loops over items that need independent API calls and database updates, map them into an array of Promises and use Promise.all to perform the operations concurrently instead of blocking the main thread sequentially.

## Commit messages
- Use Conventional Commits: `type(scope): imperative subject` (max 72 characters on the subject line).
- Wrap body lines at 80 characters; do not write single-line body paragraphs.
- Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
## 2025-06-23 - [Cache Intl.DateTimeFormat Instances]
**Learning:** Instantiating `Intl.DateTimeFormat` objects inside functions that execute frequently (such as scheduled tasks or hot loops) introduces unnecessary parsing latency overhead in V8/Cloudflare Workers.
**Action:** When using `Intl.DateTimeFormat`, cache the instance globally or at the module level. This optimizes formatting operations to near zero overhead by reusing the same engine format cache instead of re-instantiating on every tick.
## 2025-06-25 - [Single-pass Array Filtering over Chained Methods]
**Learning:** Chaining array methods like `.filter().sort()` containing expensive date operations (like `new Date().getTime()`) causes significant CPU overhead in backend processing paths, scaling poorly over large event sets.
**Action:** Replace `.filter().sort()` combinations on temporal data with a single `O(N)` loop to minimize instantiations, avoid intermediate array allocations, and optimize hot path performance in the worker.
## 2026-06-26 - [Use DocumentFragment to batch DOM insertions]
**Learning:** Inserting elements into the DOM one-by-one inside a loop causes synchronous reflows and repaints in the browser, blocking the main thread and slowing down rendering.
**Action:** Create a `DocumentFragment` using `document.createDocumentFragment()`, append all generated elements to it inside the loop, and then append the fragment to the container once outside the loop. This minimizes DOM interactions and drastically reduces reflows/repaints.
