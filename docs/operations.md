# Operations

## Operational status

Authenticated `GET /api/operational-status` returns a non-sensitive snapshot for the Settings panel:

- `lastScheduledRunAt` / `lastSuccessfulRunAt`
- `pendingDeliveries` / `failedDeliveries` / `oldestPendingDeliveryAgeSeconds`
- `emailTransport` / `pushoverTransport` (`secrets_store` | `not_configured`)
- `requiredTablesPresent`

Never includes secret names, values, store IDs, Access configuration, or account identifiers.

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

Adjust `pruneOperationalData` retain window if needed.

## Schedule and thresholds (R1+)

Report schedule times and timezone live in `application_settings`. The Worker keeps an hourly UTC cron and evaluates local whole-hour slots with occurrence dedupe (`scheduled_occurrences`). Per-location channel thresholds live in `location_notification_rules`. Skipped deliveries use `NO_LOCATION_ABOVE_THRESHOLD` when no location qualifies.

Existing D1 installs: run `npm run db:upgrade:r1` then `npm run db:upgrade:r2` after a Time Travel bookmark (see [secrets-store-credentials.md](secrets-store-credentials.md)). Roadmap for health dashboard / self-test / clear history: [design/notification-platform-roadmap.md](design/notification-platform-roadmap.md).
