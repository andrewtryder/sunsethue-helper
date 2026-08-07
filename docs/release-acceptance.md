# Release Acceptance Matrix

This document defines the repeatable regression tests critical to the platform's reliability. These scenarios should be verified during major releases to ensure notification delivery and platform operations remain stable.

## Scenario Matrix

Mark each item when verified. Prefer Notification Health, Activity, and delivery history over ad-hoc guesswork.

### Schedule and timezone
- [ ] Custom schedule times persist and fire on the expected whole-hour slots
- [ ] Schedule timezone changes shift “next report” and occurrence keys correctly
- [ ] DST-adjacent behavior (spring forward / fall back) matches the schedule timezone (no skipped permanent hole or double-fire beyond expected local rules)

### Thresholds and channels
- [ ] Per-location thresholds for **email**
- [ ] Per-location thresholds for **Pushover**
- [ ] Per-location thresholds for **browser push**
- [ ] Per-location thresholds for **webhook**
- [ ] A report where **all** locations fall below threshold produces an explainable skip (e.g. `NO_LOCATION_ABOVE_THRESHOLD`) and no false “channel broken” signal
- [ ] Email, Pushover, browser push, and webhook deliver together on a qualifying multi-channel run

### Browser push devices
- [ ] Desktop browser push
- [ ] Android browser push
- [ ] Installed iPhone Home Screen (standalone) web app push
- [ ] Expired or revoked push subscriptions are marked stale/revoked and stop generating repeated hard failures after cleanup

### Webhook edge cases
- [ ] `2xx` success recorded as delivered
- [ ] `429` retry / backoff behavior
- [ ] Invalid signature rejected by the receiver without leaking the signing secret into logs or health payloads

### Self-test and history
- [ ] Passive weekly self-test runs on schedule
- [ ] Active weekly self-test (opt-in) delivers via the normal outbox path
- [ ] Scoped history deletion leaves locations, settings, credentials, subscriptions, and pending jobs intact

## Observed results

Append rows during release validation. Do not claim a pass until the scenario was observed.

| Date | Scenario | Expected | Actual | Pass / fail |
| --- | --- | --- | --- | --- |
| | | | | |

## Sign-off

| Field | Value |
| --- | --- |
| Validation started | |
| Validation ended | |
| Blockers | |
| Sign-off | |
