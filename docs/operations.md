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
