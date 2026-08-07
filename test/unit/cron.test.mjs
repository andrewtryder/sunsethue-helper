import test from "node:test";
import assert from "node:assert/strict";
import { handleScheduledReport } from "../../worker/services/scheduler.js";

/**
 * The Worker cron fires hourly in UTC and worker/services/scheduler.js decides which report to
 * send from the configured schedule timezone wall clock (default America/New_York).
 *
 * 2026 US DST: starts Sun Mar 8 (EST -05:00 -> EDT -04:00),
 *              ends   Sun Nov 1 (EDT -04:00 -> EST -05:00).
 */
const CASES = [
  { label: "winter 6am ET (EST, UTC-5)", utc: "2026-01-15T11:00:00Z", expected: "SCHEDULED:06:00" },
  { label: "winter noon ET (EST, UTC-5)", utc: "2026-01-15T17:00:00Z", expected: "SCHEDULED:12:00" },
  { label: "winter 6pm ET (EST, UTC-5)", utc: "2026-01-15T23:00:00Z", expected: "SCHEDULED:18:00" },
  { label: "summer 6am ET (EDT, UTC-4)", utc: "2026-07-15T10:00:00Z", expected: "SCHEDULED:06:00" },
  { label: "summer noon ET (EDT, UTC-4)", utc: "2026-07-15T16:00:00Z", expected: "SCHEDULED:12:00" },
  { label: "summer 6pm ET (EDT, UTC-4)", utc: "2026-07-15T22:00:00Z", expected: "SCHEDULED:18:00" },
  { label: "day DST starts, 6am EDT", utc: "2026-03-08T10:00:00Z", expected: "SCHEDULED:06:00" },
  { label: "day DST starts, EST 6am offset no longer matches", utc: "2026-03-08T11:00:00Z", expected: null },
  { label: "day DST ends, 6am EST", utc: "2026-11-01T11:00:00Z", expected: "SCHEDULED:06:00" },
  { label: "day DST ends, EDT 6am offset no longer matches", utc: "2026-11-01T10:00:00Z", expected: null },
  { label: "off-hour is skipped", utc: "2026-07-15T13:00:00Z", expected: null },
  { label: "midnight ET is skipped by default schedule", utc: "2026-07-15T04:00:00Z", expected: null }
];

function recordingDeps(now, {
  locations = [{ id: "loc-1", scheduleTimes: null }],
  scheduleTimes = ["06:00", "12:00", "18:00"]
} = {}) {
  const dispatched = [];
  const reportArgs = [];
  const claimed = new Set();
  return {
    dispatched,
    reportArgs,
    deps: {
      now,
      getApplicationSettings: async () => ({
        scheduleTimezone: "America/New_York",
        scheduleTimes
      }),
      getLocations: async () => locations,
      claimScheduledOccurrence: async (_env, key) => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      bindOccurrenceRun: async () => {},
      dispatchPendingNotifications: async () => [],
      runAndSendReport: async (triggerType, _env, deps) => {
        dispatched.push(triggerType);
        reportArgs.push({ triggerType, locationIds: (deps?.locations || []).map((loc) => loc.id) });
        return { runId: "run-1" };
      }
    }
  };
}

for (const testCase of CASES) {
  test(`cron dispatch: ${testCase.label}`, async () => {
    const { dispatched, deps } = recordingDeps(testCase.utc);
    const result = await handleScheduledReport({}, {}, deps);

    assert.equal(result, testCase.expected);
    assert.deepEqual(dispatched, testCase.expected ? [testCase.expected] : []);
  });
}

test("cron only fires near the top of the hour", async () => {
  const onTime = recordingDeps("2026-07-15T10:07:00Z");
  assert.equal(await handleScheduledReport({}, {}, onTime.deps), "SCHEDULED:06:00");

  const tooLate = recordingDeps("2026-07-15T10:31:00Z");
  assert.equal(await handleScheduledReport({}, {}, tooLate.deps), null);
  assert.deepEqual(tooLate.dispatched, []);
});

test("occurrence keys are not claimed twice", async () => {
  const { deps, dispatched } = recordingDeps("2026-07-15T10:00:00Z");
  assert.equal(await handleScheduledReport({}, {}, deps), "SCHEDULED:06:00");
  assert.equal(await handleScheduledReport({}, {}, deps), null);
  assert.deepEqual(dispatched, ["SCHEDULED:06:00"]);
});

test("a failing report run does not throw out of the scheduled handler", async () => {
  const base = recordingDeps("2026-07-15T10:00:00Z");
  const result = await handleScheduledReport(
    {},
    {},
    {
      ...base.deps,
      runAndSendReport: async () => {
        throw new Error("smtp exploded");
      }
    }
  );
  assert.equal(result, "SCHEDULED:06:00");
});

test("scheduled execution never inspects an Access token", async () => {
  let sawRequest = false;
  const base = recordingDeps("2026-07-15T10:00:00Z");
  await handleScheduledReport(
    { cron: "0 * * * *" },
    {
      get headers() {
        sawRequest = true;
        return {};
      }
    },
    base.deps
  );
  assert.equal(sawRequest, false);
});

test("cron includes only locations due for the slot", async () => {
  // 09:00 America/New_York in summer = 13:00 UTC
  const { deps, dispatched, reportArgs } = recordingDeps("2026-07-15T13:00:00Z", {
    scheduleTimes: ["06:00", "12:00", "18:00"],
    locations: [
      { id: "inherit", scheduleTimes: null },
      { id: "custom-due", scheduleTimes: ["09:00"] },
      { id: "custom-skip", scheduleTimes: ["15:00"] }
    ]
  });
  assert.equal(await handleScheduledReport({}, {}, deps), "SCHEDULED:09:00");
  assert.deepEqual(dispatched, ["SCHEDULED:09:00"]);
  assert.deepEqual(reportArgs[0].locationIds, ["custom-due"]);
});

test("cron skips when no location is due even if global schedule matches", async () => {
  const { deps, dispatched } = recordingDeps("2026-07-15T10:00:00Z", {
    scheduleTimes: ["06:00", "12:00", "18:00"],
    locations: [
      { id: "custom-only", scheduleTimes: ["09:00"] }
    ]
  });
  assert.equal(await handleScheduledReport({}, {}, deps), null);
  assert.deepEqual(dispatched, []);
});
