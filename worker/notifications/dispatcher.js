import * as db from "../db.js";
import { logSafe } from "../http.js";
import { asNotificationError, NotificationError } from "./errors.js";
import { sendEmail } from "./email.js";
import { sendPushover } from "./pushover.js";
import { getSettings } from "./settings.js";

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export function nextAttemptAt(now, attempts) {
  return now + (RETRY_DELAYS[attempts] ?? RETRY_DELAYS.at(-1));
}

async function deliver(job, env, deps) {
  if (job.channel === "email") return sendEmail(job, env, deps);
  if (job.channel === "pushover") return sendPushover(job, env, deps);
  throw new NotificationError("UNSUPPORTED_CHANNEL");
}

export async function dispatchPendingNotifications(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const jobs = await db.getOutboxJobs(env, now, deps.limit ?? 20);
  const settings = await getSettings(env);
  const outcomes = [];
  for (const candidate of jobs) {
    const claimed = await db.claimOutboxJob(env, candidate.id, now, now + LEASE_MS);
    if (!claimed) continue;
    const job = { ...candidate, settings };
    const startedAt = Date.now();
    try {
      const result = await deliver(job, env, deps);
      await db.completeOutboxJob(env, job.id, now, result.providerMessageId);
      logSafe("info", "Notification delivered", { code: "NOTIFICATION_SENT", outboxId: job.id, channel: job.channel, attempt: Number(job.attempts) + 1, duration: Date.now() - startedAt });
      outcomes.push({ id: job.id, channel: job.channel, status: "sent" });
    } catch (error) {
      const normalized = asNotificationError(error);
      const attempts = Number(job.attempts) + 1;
      const terminal = !normalized.retryable || attempts >= MAX_ATTEMPTS;
      await db.failOutboxJob(env, job.id, {
        attempts,
        nextAttemptAt: nextAttemptAt(now, attempts),
        code: normalized.code,
        terminal
      });
      logSafe("warn", "Notification delivery failed", { code: normalized.code, outboxId: job.id, channel: job.channel, attempt: attempts, duration: Date.now() - startedAt });
      outcomes.push({ id: job.id, channel: job.channel, status: terminal ? "failed" : "pending", code: normalized.code, duration: Date.now() - startedAt });
    }
  }
  return outcomes;
}
