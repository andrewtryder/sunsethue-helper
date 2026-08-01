# Notification platform roadmap (Releases 3–4)

This document captures planned work **after** Releases 1–2 (scheduling, thresholds, outbox rebuild, browser push, signed webhook). It is design guidance only — not an implementation checklist for the current tree.

Releases 1–2 ship in code. Releases 3–4 stay here until separately scheduled.

## Defaults carried forward

| Decision | Default |
| --- | --- |
| Schedule timezone | `America/New_York` |
| Display timezone | Schedule timezone |
| Schedule | `06:00`, `12:00`, `18:00` |
| Custom schedule limit | Eight whole-hour slots daily |
| Existing location threshold | Always |
| New location threshold | 50% |
| Threshold evaluation | Sunrise and sunset independently |
| Browser push devices | Multiple |
| Webhook destinations | One initially |
| Weekly self-test | Passive, Sunday 10:00 AM |
| Active weekly sends | Opt-in |
| Clear history | Terminal records only |
| Installer priority | Interactive CLI before architecture changes |
| Static demo host | GitHub Pages |

## Non-goals already decided for R1–R2

- No full migration framework (only reviewed operator upgrade scripts)
- No “each location’s timezone” display mode
- No multi-webhook destinations

---

## Release 3 — Operational controls

### Notification health dashboard

Expand operational status into a user-facing **Notification Health** page.

**Summary header**

- Overall state: Healthy / Degraded / Action required / Disabled
- Last report age
- Next scheduled report (local schedule timezone)

**Channel cards** (email, Pushover, browser push, webhook)

- Enabled, configured, qualifying locations
- Last success / failure, pending / failed counts, oldest pending, last test, transport source, next retry
- Browser push: enabled / stale / revoked device counts
- Webhook: masked hostname, last HTTP status class, signing enabled

**Schedule and quota card**

- Configured times and schedule timezone
- Estimated Sunsethue usage (runs × locations; 30-day estimate)
- Explanatory copy: channels/thresholds/retries do not add forecast quota; manual runs excluded

**Threshold explanations**

- Surface skipped deliveries such as `NO_LOCATION_ABOVE_THRESHOLD` so “nothing was sent” is explainable

**API**

- Protected `GET /api/notification-health`
- Aggregates only — no secret names, endpoints, subscription keys, store IDs, Access configuration, or raw provider errors

### Weekly self-test

Two modes, scheduled in application schedule timezone (default Sunday 10:00 AM). Hourly cron determines due occurrences — no extra Cloudflare Cron Trigger.

**Passive (default)**

- Required D1 tables, schedule config, Secrets Store documents, transport readiness, browser subscription structural validity, webhook config validity, latest scheduled report age, oldest pending delivery, forecast API credits, recent cron execution
- No provider delivery

**Active (opt-in)**

- Real test delivery through every enabled channel via the normal outbox path
- Trigger type: `WEEKLY_SELF_TEST`
- Do not bypass retries, leases, or delivery history

**Logging table:** `health_check_runs` — controlled, non-sensitive details only (`checkType`, `provider`, `status`, `code`, timings).

Settings fields already reserved on `application_settings` in R1 (`weeklySelfTest*`); R3 wires UI and scheduler behavior.

### Clear history

Label: **Clear history** (not “Clear logs”).

**Selectable scopes:** report history; completed deliveries; failed deliveries; self-test history; credential-admin audit history; all historical data.

**Never delete:** locations, settings, provider credentials, browser subscriptions, pending/processing jobs, report locks, rate limiter rows.

**Confirmation:** show counts; for “Clear all history” require typing `CLEAR`; offer Export first / Cancel / Clear history. Run deletion in a D1 transaction or batch. Record a minimal `history_cleared` audit event that is not removed by the same transaction.

---

## Release 4 — Adoption

### Interactive setup (`npm run setup` / `npx create-sunsethue-helper`)

Wizard should: check Node/Wrangler; authenticate Cloudflare; select account; ask project names; create/reuse D1; apply `schema.sql`; create/reuse Secrets Store + provider sentinels; generate Wrangler configs; deploy credential-admin, API Worker, Pages; create Access exact-email app; upload Worker secrets; run production verification; print next steps for Gmail/Pushover in the UI.

Do **not** collect Gmail/Pushover credentials in the terminal.

### Doctor (`npm run doctor`)

Read-only report: token, D1, required tables, Secrets Store, provider docs, private Workers, Pages binding, Access app, cron, production Access redirect.

### Guided upgrade (`npm run upgrade`)

Compare schema requirements; apply only explicit reviewed upgrade scripts; deploy in order; verify; print rollback identifiers.

### First-run setup checklist (UI)

Access, database, forecast API key, email, Pushover, browser push devices, webhook — Ready / Missing / Not configured.

### Static demo (GitHub Pages)

Recommended URL: `https://andrewtryder.github.io/sunsethue-helper/`

Refactor frontend around a data-client interface (`createDemoClient` vs `createApiClient`). Demo: permanent banner; synthetic fixtures; no API/credentials/Access/SW push; mutations return `DEMO_READ_ONLY` or disabled; reset on reload; link to repo and self-hosting.

README should link: View static demo / View screenshots / Deploy your own instance.

### Later architecture note

Moving static frontend from Pages into Worker static assets could remove one deploy component; credential-admin Worker remains if management-token isolation is preserved. Build the setup wizard before changing architecture.

---

## Suggested sequencing after R1–R2

1. Notification health API + UI
2. Weekly self-test (passive then active)
3. Clear history + export
4. Setup wizard + doctor
5. Guided upgrade command
6. First-run checklist UI
7. GitHub Pages demo + README links
