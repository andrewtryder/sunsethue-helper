import test from "node:test";
import assert from "node:assert/strict";
import { handleScheduledReport } from "../../worker/cron.js";

/**
 * The Worker cron fires hourly in UTC and worker/cron.js decides which report to
 * send from the Eastern Time wall clock. These cases pin the UTC instants that
 * map to 6am / 12pm / 6pm ET on both sides of each DST transition.
 *
 * 2026 US DST: starts Sun Mar 8 (EST -05:00 -> EDT -04:00),
 *              ends   Sun Nov 1 (EDT -04:00 -> EST -05:00).
 */
const CASES = [
  { label: "winter 6am ET (EST, UTC-5)", utc: "2026-01-15T11:00:00Z", expected: "AM" },
  { label: "winter noon ET (EST, UTC-5)", utc: "2026-01-15T17:00:00Z", expected: "NOON" },
  { label: "winter 6pm ET (EST, UTC-5)", utc: "2026-01-15T23:00:00Z", expected: "PM" },
  { label: "summer 6am ET (EDT, UTC-4)", utc: "2026-07-15T10:00:00Z", expected: "AM" },
  { label: "summer noon ET (EDT, UTC-4)", utc: "2026-07-15T16:00:00Z", expected: "NOON" },
  { label: "summer 6pm ET (EDT, UTC-4)", utc: "2026-07-15T22:00:00Z", expected: "PM" },
  { label: "day DST starts, 6am EDT", utc: "2026-03-08T10:00:00Z", expected: "AM" },
  { label: "day DST starts, EST 6am offset no longer matches", utc: "2026-03-08T11:00:00Z", expected: null },
  { label: "day DST ends, 6am EST", utc: "2026-11-01T11:00:00Z", expected: "AM" },
  { label: "day DST ends, EDT 6am offset no longer matches", utc: "2026-11-01T10:00:00Z", expected: null },
  { label: "off-hour is skipped", utc: "2026-07-15T13:00:00Z", expected: null },
  { label: "midnight ET is skipped", utc: "2026-07-15T04:00:00Z", expected: null }
];

function recordingDeps(now) {
  const dispatched = [];
  return {
    dispatched,
    deps: {
      now,
      runAndSendReport: async (triggerType) => {
        dispatched.push(triggerType);
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
  assert.equal(await handleScheduledReport({}, {}, onTime.deps), "AM");

  const tooLate = recordingDeps("2026-07-15T10:31:00Z");
  assert.equal(await handleScheduledReport({}, {}, tooLate.deps), null);
  assert.deepEqual(tooLate.dispatched, []);
});

test("a failing report run does not throw out of the scheduled handler", async () => {
  const result = await handleScheduledReport(
    {},
    {},
    {
      now: "2026-07-15T10:00:00Z",
      runAndSendReport: async () => {
        throw new Error("smtp exploded");
      }
    }
  );
  assert.equal(result, "AM");
});

test("scheduled execution never inspects an Access token", async () => {
  let sawRequest = false;
  await handleScheduledReport(
    { cron: "0 * * * *" },
    {
      get headers() {
        sawRequest = true;
        return null;
      }
    },
    { now: "2026-07-15T10:00:00Z", runAndSendReport: async () => {} }
  );
  assert.equal(sawRequest, false);
});
