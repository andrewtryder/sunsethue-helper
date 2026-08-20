import { escapeHtml, formatColumnDateET, getQualityBadge } from "../helpers.js";
import { NotificationError } from "./errors.js";
import { inferDeliveryPurpose, parseNotificationPayload } from "./payload.js";
import { resolveEmailTransport } from "./resolve-email-transport.js";
import { validateEmailAddress } from "./settings.js";
import { formatDateTimeMediumWithZone, isValidIanaTimeZone, DEFAULT_SCHEDULE_TIMEZONE } from "../../shared/time-format.js";

const SMTP_TIMEOUT_MS = 30_000;

function parseMailbox(value) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) throw new NotificationError("INVALID_EMAIL_ADDRESS");
  const clean = value.trim();
  const open = clean.indexOf("<");
  const close = clean.lastIndexOf(">");
  const parsed = open >= 0 || close >= 0
    ? { name: clean.slice(0, open).trim().replaceAll('"', ""), email: clean.slice(open + 1, close).trim() }
    : { name: "", email: clean };
  if ((open >= 0 && (close !== clean.length - 1 || open === 0)) || (close >= 0 && open < 0)) {
    throw new NotificationError("INVALID_EMAIL_ADDRESS");
  }
  if (!validateEmailAddress(parsed.email)) throw new NotificationError("INVALID_EMAIL_ADDRESS");
  return parsed;
}

function toReportResults(payload) {
  return payload.locations.map((location) => ({
    name: location.name,
    triggeredEvents: location.triggeredEvents || [],
    sunrise: location.sunrise ? { time: location.sunrise.time, quality: location.sunrise.quality, quality_text: location.sunrise.text } : null,
    sunset: location.sunset ? { time: location.sunset.time, quality: location.sunset.quality, quality_text: location.sunset.text } : null,
    error: location.errorCode ? "Forecast unavailable" : null
  }));
}

function headerTimes(results) {
  const result = results.find((item) => !item.error);
  return { sunrise: result?.sunrise?.time || null, sunset: result?.sunset?.time || null };
}

function formatSlotLabel(triggerType) {
  const match = typeof triggerType === "string" ? /^SCHEDULED:(\d{2}):00$/.exec(triggerType) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

export function buildEmailSubject(payload) {
  const purpose = inferDeliveryPurpose(payload.triggerType, payload.deliveryPurpose ?? null);
  if (purpose === "scheduled_report") {
    const slot = formatSlotLabel(payload.triggerType);
    return slot ? `Sunsethue Scheduled Report — ${slot}` : "Sunsethue Scheduled Report";
  }
  if (purpose === "quality_alert") return "Sunsethue Quality Alert";
  if (purpose === "self_test") return "Sunsethue Self-Test";
  return "Sunsethue Test";
}

export function buildHtmlEmail(results, payloadOrTrigger, reportTimeText, dashboardUrl) {
  const payload = typeof payloadOrTrigger === "string"
    ? { triggerType: payloadOrTrigger, deliveryPurpose: null }
    : (payloadOrTrigger || { triggerType: "TEST", deliveryPurpose: null });
  const purpose = inferDeliveryPurpose(payload.triggerType, payload.deliveryPurpose ?? null);
  const sunsetFirst = payload.triggerType === "AM" || payload.triggerType === "NOON";
  const headers = headerTimes(results);
  const firstHeader = sunsetFirst ? `Next Sunset ${formatColumnDateET(headers.sunset)}` : `Next Sunrise ${formatColumnDateET(headers.sunrise)}`;
  const secondHeader = sunsetFirst ? `Next Sunrise ${formatColumnDateET(headers.sunrise)}` : `Next Sunset ${formatColumnDateET(headers.sunset)}`;
  const rows = results.map((result) => {
    if (result.error) {
      return `<tr><td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;font-size:16px;font-weight:600;">${escapeHtml(result.name)}</td><td colspan="2" style="padding:14px 8px;border-bottom:1px solid #e5e7eb;color:#dc2626;">Forecast unavailable</td></tr>`;
    }
    const sunriseMark = result.triggeredEvents?.includes("sunrise") ? "★ " : "";
    const sunsetMark = result.triggeredEvents?.includes("sunset") ? "★ " : "";
    const sunrise = result.sunrise ? `${sunriseMark}${getQualityBadge(result.sunrise.quality, result.sunrise.quality_text)}` : "N/A";
    const sunset = result.sunset ? `${sunsetMark}${getQualityBadge(result.sunset.quality, result.sunset.quality_text)}` : "N/A";
    return `<tr><td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;font-size:16px;font-weight:600;">${escapeHtml(result.name)}</td><td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;">${sunsetFirst ? sunset : sunrise}</td><td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;">${sunsetFirst ? sunrise : sunset}</td></tr>`;
  }).join("");
  const link = dashboardUrl ? `<p style="margin:8px 0 0 0;"><a href="${escapeHtml(dashboardUrl)}" style="color:#2563eb;">Manage locations in your private dashboard</a>.</p>` : "";
  const heading = purpose === "scheduled_report"
    ? "Scheduled forecast report"
    : purpose === "quality_alert"
      ? "Quality alert"
      : purpose === "self_test"
        ? "Weekly self-test"
        : "Test notification";
  const supporting = purpose === "scheduled_report"
    ? `Routine report for locations checked at ${formatSlotLabel(payload.triggerType) || "this time"}.`
    : purpose === "quality_alert"
      ? "One or more locations met your configured alert threshold."
      : "This message was sent as a test.";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:24px 16px;"><h1 style="font-size:24px;">${escapeHtml(heading)}</h1><p style="color:#6b7280;">${escapeHtml(supporting)}</p><p style="color:#6b7280;">${escapeHtml(reportTimeText)}</p><table style="width:100%;border-collapse:collapse;background:#fff;"><thead><tr><th>Location</th><th>${escapeHtml(firstHeader)}</th><th>${escapeHtml(secondHeader)}</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:24px;text-align:center;color:#9ca3af;"><p>Sent automatically by Sunsethue Helper.</p>${link}</div></div></body></html>`;
}

function withTimeout(promise, ms, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NotificationError(code, { retryable: true })), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function sendEmail(job, env, deps = {}) {
  const transport = await resolveEmailTransport(env);
  const payload = parseNotificationPayload(job.payload);
  const from = parseMailbox(transport.emailFrom || `Sunsethue Helper <${transport.gmailUser}>`);
  const recipient = job.deliveryEmailTo || job.settings?.emailTo;
  if (typeof recipient !== "string" || recipient.trim() === "") {
    throw new NotificationError("INVALID_EMAIL_ADDRESS");
  }
  const to = parseMailbox(recipient);
  let dashboardUrl = payload.dashboardUrl;
  if (dashboardUrl) {
    try { const url = new URL(dashboardUrl); if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(); dashboardUrl = url.toString(); } catch { throw new NotificationError("INVALID_DASHBOARD_URL"); }
  }
  const timeZone = isValidIanaTimeZone(payload.displayTimezone)
    ? payload.displayTimezone
    : DEFAULT_SCHEDULE_TIMEZONE;
  const reportTimeText = formatDateTimeMediumWithZone(payload.generatedAt, timeZone)
    || new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "short" }).format(payload.generatedAt);
  const loadMailer = deps.loadMailer || (() => import("worker-mailer"));
  try {
    const { WorkerMailer } = await loadMailer();
    const mailer = await withTimeout(
      WorkerMailer.connect({ host: "smtp.gmail.com", port: 465, secure: true, credentials: { username: transport.gmailUser, password: transport.gmailAppPassword }, authType: ["plain", "login"] }),
      SMTP_TIMEOUT_MS,
      "SMTP_TIMEOUT"
    );
    await withTimeout(
      mailer.send({
        from,
        to: { email: to.email },
        subject: buildEmailSubject(payload),
        html: buildHtmlEmail(toReportResults(payload), payload, reportTimeText, dashboardUrl)
      }),
      SMTP_TIMEOUT_MS,
      "SMTP_TIMEOUT"
    );
    return { providerMessageId: null };
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    const msg = error?.message?.toLowerCase() || "";
    let code = "SMTP_DELIVERY_FAILED";
    if (msg.includes("auth")) code = "SMTP_AUTH_REJECTED";
    else if (msg.includes("conn") || msg.includes("refused")) code = "SMTP_CONNECTION_REFUSED";
    else if (msg.includes("tls") || msg.includes("cert")) code = "SMTP_TLS_FAILURE";
    throw new NotificationError(code, { retryable: true });
  }
}
