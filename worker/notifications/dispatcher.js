import * as db from "../db.js";
import { logSafe } from "../http.js";
import { asNotificationError, NotificationError } from "./errors.js";
import { sendEmail } from "./email.js";
import { sendPushover } from "./pushover.js";
import { sendWebhook } from "./webhook.js";
import { sendWebPush } from "./webpush.js";

// Longer than any per-provider timeout (SMTP ~30s, Pushover ~10s) so a slow
// provider cannot expire its own lease and get double-invoked.
const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export function nextAttemptAt(now, attempts) {
  return now + (RETRY_DELAYS[attempts] ?? RETRY_DELAYS.at(-1));
}

async function deliver(job, env, deps) {
  if (job.channel === "email") return sendEmail(job, env, deps);
  if (job.channel === "pushover") return sendPushover(job, env, deps);
  if (job.channel === "webhook") return sendWebhook(job, env, deps);
  if (job.channel === "webpush") return sendWebPush(job, env, deps);
  throw new NotificationError("UNSUPPORTED_CHANNEL");
}

/**
 * Reconstruct the per-job "settings" shape that email and pushover adapters
 * expect, using the delivery snapshot columns captured at enqueue time. This
 * keeps a mid-flight settings change (e.g. owner disables Pushover after a job
 * was enqueued) from swapping the target device or address behind the sender.
 */
function snapshotSettings(job) {
  return {
    emailTo: job.deliveryEmailTo ?? null,
    pushoverDevice: job.deliveryPushoverDevice ?? null,
    pushoverPriority: job.deliveryPushoverPriority ?? 0,
    pushoverSound: job.deliveryPushoverSound ?? null
  };
}

export async function dispatchPendingNotifications(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const jobs = await db.getOutboxJobs(env, now, deps.limit ?? 20);
  const outcomes = [];
  for (const candidate of jobs) {
    const leaseToken = crypto.randomUUID();
    const claimed = await db.claimOutboxJob(env, candidate.id, now, now + LEASE_MS, leaseToken);
    if (!claimed) continue;
    const job = { ...candidate, settings: snapshotSettings(candidate) };
    const startedAt = Date.now();
    try {
      const result = await deliver(job, env, deps);
      const completed = await db.completeOutboxJob(env, job.id, leaseToken, now, result.providerMessageId);
      if (!completed) {
        // A parallel claimer or expired-lease recovery took over the job.
        // Log and drop the outcome; the winning caller will report its own.
        logSafe("warn", "Notification lease was lost mid-flight", { code: "LEASE_LOST", outboxId: job.id, channel: job.channel });
        continue;
      }
      logSafe("info", "Notification delivered", { code: "NOTIFICATION_SENT", outboxId: job.id, channel: job.channel, attempt: Number(job.attempts) + 1, duration: Date.now() - startedAt });
      outcomes.push({ id: job.id, channel: job.channel, status: "sent" });
    } catch (error) {
      const normalized = asNotificationError(error);
      const attempts = Number(job.attempts) + 1;
      const terminal = !normalized.retryable || attempts >= MAX_ATTEMPTS;
      const applied = await db.failOutboxJob(env, job.id, leaseToken, {
        attempts,
        nextAttemptAt: nextAttemptAt(now, attempts),
        code: normalized.code,
        terminal
      });
      if (!applied) {
        logSafe("warn", "Notification lease was lost mid-flight", { code: "LEASE_LOST", outboxId: job.id, channel: job.channel });
        continue;
      }
      logSafe("warn", "Notification delivery failed", { code: normalized.code, outboxId: job.id, channel: job.channel, attempt: attempts, duration: Date.now() - startedAt, reason: String(normalized.detail || normalized.cause?.message || "").slice(0, 200) });
      outcomes.push({ id: job.id, channel: job.channel, status: terminal ? "failed" : "pending", code: normalized.code, duration: Date.now() - startedAt });
    }
  }
  return outcomes;
}
