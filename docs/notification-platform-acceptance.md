# Notification platform — production acceptance and soak

Validate every newly added notification-platform path in production for at least
several scheduled cycles before further architecture changes.

**Covered by:** [#70](https://github.com/andrewtryder/sunsethue-helper/pull/70)
(scheduling, thresholds, Web Push, webhook, R1/R2 upgrade scripts) and
[#71](https://github.com/andrewtryder/sunsethue-helper/pull/71) (health,
self-test, clear history, doctor/setup/upgrade, static demo).

Design background: [design/notification-platform-roadmap.md](design/notification-platform-roadmap.md).

## Objectives

| Goal | Target |
| --- | --- |
| Soak duration | At least several scheduled report cycles on the live schedule |
| Coverage | Every checklist item below exercised at least once |
| Architecture freeze | No structural deploy-topology changes until this log is complete |

## Prerequisites

Complete these before starting soak. Do not treat a failed Production preflight
as a soft pass.

- [ ] Production Access app is healthy and the authorized email can sign in
- [ ] R1–R3 D1 upgrades applied (`npm run upgrade`, or the reviewed
      `db:upgrade:r1` / `db:upgrade:r2` / `db:upgrade:r3` scripts)
- [ ] D1 Time Travel bookmark captured before any schema work
- [ ] Production workflow green after upgrade (deploy + `verify:production`)
- [ ] Email, Pushover, Web Push VAPID, and webhook transports configured as needed
- [ ] Disposable Cloudflare project (or isolated D1 + Workers names) available for
      `doctor` / `setup` / `upgrade` drills — never point those drills at production
      identifiers by accident

Useful operators docs: [deployment.md](deployment.md),
[operations.md](operations.md), [rollback.md](rollback.md).

## Soak checklist

Mark each item when verified in production (or on the disposable env where
noted). Prefer Notification Health, Activity, and delivery history over ad-hoc
guesswork.

### Schedule and timezone

- [ ] Custom schedule times persist and fire on the expected whole-hour slots
- [ ] Schedule timezone changes shift “next report” and occurrence keys correctly
- [ ] DST-adjacent behavior (spring forward / fall back) matches the schedule
      timezone — no skipped permanent hole or double-fire beyond expected local rules

### Thresholds and channels

- [ ] Per-location thresholds for **email**
- [ ] Per-location thresholds for **Pushover**
- [ ] Per-location thresholds for **browser push**
- [ ] Per-location thresholds for **webhook**
- [ ] A report where **all** locations fall below threshold produces an explainable
      skip (e.g. `NO_LOCATION_ABOVE_THRESHOLD`) and no false “channel broken” signal
- [ ] Email, Pushover, browser push, and webhook deliver together on a qualifying
      multi-channel run

### Browser push devices

- [ ] Desktop browser push (note browser + OS in the matrix below)
- [ ] Android browser push
- [ ] Installed iPhone Home Screen (standalone) web app push
- [ ] Expired or revoked push subscriptions are marked stale/revoked and stop
      generating repeated hard failures after cleanup

### Webhook edge cases

Exercise against a controlled endpoint (not a production customer system):

- [ ] `2xx` success recorded as delivered
- [ ] `4xx` client error path (no endless retry when permanent)
- [ ] `429` retry / backoff behavior
- [ ] `5xx` retry behavior
- [ ] Timeout / network failure retry behavior
- [ ] Invalid signature rejected by the receiver (or sender signing misconfig
      detected) without leaking the signing secret into logs or health payloads

### Self-test and history

- [ ] Passive weekly self-test runs on schedule (no provider delivery)
- [ ] Active weekly self-test (opt-in) delivers via the normal outbox path
- [ ] History export for selected scopes
- [ ] Scoped history deletion leaves locations, settings, credentials,
      subscriptions, and pending jobs intact
- [ ] “Clear all history” requires typing `CLEAR`
- [ ] Administrative `history_cleared` (or equivalent) audit entry is retained
      after the clear

### Tooling and demo

- [ ] `npm run doctor` against a **disposable** environment
- [ ] `npm run setup` against a **disposable** environment
- [ ] `npm run upgrade` against a **disposable** environment
- [ ] Static demo mode makes **no** production API requests (fixtures only;
      mutations disabled / `DEMO_READ_ONLY`)

## Platform / browser matrix

Fill during soak. Leave `Pending` until exercised.

| Platform | Browser / OS version | Tester | Date | Result / notes |
| --- | --- | --- | --- | --- |
| Desktop | Pending | | | Pending |
| Android | Pending | | | Pending |
| iPhone Home Screen | Pending | | | Pending |

## Observed results

Append rows during soak. Do not claim a pass until the scenario was observed.

| Date | Scenario | Expected | Actual | Pass / fail |
| --- | --- | --- | --- | --- |
| | | | | |

## Soak summary

| Field | Value |
| --- | --- |
| Soak started | Pending |
| Soak ended | Pending |
| Scheduled cycles observed | Pending |
| Blockers | Pending |
| Sign-off | Pending |

When this summary is signed off, architecture follow-ups (for example moving
static assets onto the Worker) may proceed with less risk of silent regression
in the notification paths above.
