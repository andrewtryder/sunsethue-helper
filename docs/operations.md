# Operations

## Notification health

Prefer **Notification health** / overview in Settings, backed by `GET /api/notification-health`:

- Overall state: `healthy` | `degraded` | `action_required` | `disabled`
- Per-channel status, schedule/quota, threshold skip samples, latest self-test
- Aggregates only — no secret names, endpoints, keys, store IDs, or Access config

`GET /api/setup-status` powers the first-run checklist (Ready / Missing / Not configured).

## Weekly self-test

Configured in Settings → General (`weeklySelfTest*`). Cron claims `SELFTEST:…` occurrence keys:

- **Passive:** readiness checks only; writes `health_check_runs`
- **Active:** enqueues `WEEKLY_SELF_TEST` outbox jobs for enabled configured channels

## Clear history

`GET /api/history/export` and `POST /api/history/clear` remove terminal records only. Clearing all history requires `confirm: "CLEAR"`. An `admin_audit_events` row (`history_cleared`) survives the wipe. Pending/processing outbox, locations, settings, credentials, locks, and limiters are never deleted.

## Suggested alert conditions

| Condition | Severity |
|-----------|----------|
| No successful scheduled report in 8–12 hours | High |
| Pending outbox job older than 30 minutes | High |
| Permanently failed delivery exists | Medium |
| Repeated credential-admin failures | High |
| D1 schema preflight failure | Blocker |
| Production verification failure | Blocker |

## Retention

Hourly cron prunes:

- Outbox rows in `sent` / `failed` / `skipped` older than 90 days
- `runs` older than 90 days
- Stale `provider_credential_status.lastValidationCode` older than 90 days
- `health_check_runs` older than 90 days

Adjust `pruneOperationalData` retain window if needed.

## Schedule and thresholds

Report schedule times and timezone live in `application_settings`. Locations may override with their own `scheduleTimes` (NULL inherits the global schedule). The Worker keeps an hourly UTC cron and evaluates local whole-hour slots with occurrence dedupe (`scheduled_occurrences`), fetching only locations due for that slot. Per-location channel thresholds live in `location_notification_rules`. Skipped deliveries use `NO_LOCATION_ABOVE_THRESHOLD` when no location qualifies.

## Operator CLIs

- `npm run doctor` — read-only checklist (token, D1 tables, Secrets Store, private Workers, Pages binding, cron, Access redirect)
- `npm run setup` — interactive first-time orchestrator; never collects Gmail/Pushover in the terminal
- `npm run demo:build` — static demo artifact for GitHub Pages
