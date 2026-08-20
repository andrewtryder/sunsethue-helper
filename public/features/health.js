import { escapeHtml } from "../lib/helpers.js";

const CHANNEL_SUBTITLE_IDS = {
  email: "email-channel-subtitle",
  pushover: "pushover-channel-subtitle",
  web_push: "webpush-channel-subtitle",
  webpush: "webpush-channel-subtitle",
  browser_push: "webpush-channel-subtitle",
  webhook: "webhook-channel-subtitle"
};

function channelKey(name) {
  return String(name || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function formatChannelSubtitle(ch, formatDateTime) {
  const configured = ch.configured ? "Configured" : "Not configured";
  const enabled = ch.enabled == null ? null : (ch.enabled ? "On" : "Off");
  const lastOk = ch.lastSuccessAt ? `Last success ${formatDateTime(ch.lastSuccessAt)}` : "No success yet";
  const lastFail = ch.lastFailureCode
    ? `Last failure ${ch.lastFailureCode}${ch.lastFailureAt ? ` · ${formatDateTime(ch.lastFailureAt)}` : ""}`
    : "No failures";
  const parts = [configured];
  if (enabled) parts.push(enabled);
  if (ch.devicesEnabled != null) {
    parts.push(`${ch.devicesEnabled} device${ch.devicesEnabled === 1 ? "" : "s"} enabled`);
  }
  if (ch.maskedHostname) parts.push(ch.maskedHostname);
  parts.push(lastOk, lastFail);
  return parts.join(" · ");
}

export function initHealth({ api, formatDateTime = (v) => v, capabilities }) {
  async function fetchOperationalStatus() {
    const summary = document.getElementById("notification-health-summary");
    const skipsHost = document.getElementById("notification-health-skips");
    const selfTestHost = document.getElementById("notification-health-selftest");
    try {
      const health = await api.get("/api/notification-health");
      const stateLabel = {
        healthy: "Healthy",
        degraded: "Degraded",
        action_required: "Action required",
        disabled: "Disabled"
      }[health.state] || health.state;
      const lastCheckAt = health.lastForecastCheckAt || health.lastReportAt;
      const lastReportText = lastCheckAt ? formatDateTime(lastCheckAt) : "never";
      const summaryText = `${stateLabel} · last forecast check ${lastReportText}`;
      if (summary) summary.textContent = summaryText;

      for (const ch of health.channels || []) {
        const key = channelKey(ch.channel);
        const subtitleId = CHANNEL_SUBTITLE_IDS[key] || CHANNEL_SUBTITLE_IDS[key.replace(/_/g, "")];
        const el = subtitleId ? document.getElementById(subtitleId) : null;
        if (el) el.textContent = formatChannelSubtitle(ch, formatDateTime);
      }

      if (skipsHost) {
        const skips = health.skips || [];
        skipsHost.innerHTML = skips.length
          ? `<strong>Recent quality-alert skips</strong><ul>${skips.map((s) => `<li>${escapeHtml(s.channel)} · ${escapeHtml(s.code)} · ${escapeHtml(s.createdAt ? formatDateTime(s.createdAt) : s.createdAt)}</li>`).join("")}</ul>`
          : "<p class=\"pane-subtext\">No recent quality-alert skips.</p>";
      }
      if (selfTestHost) {
        selfTestHost.textContent = health.selfTest
          ? `Latest self-test: ${health.selfTest.checkType} · ${health.selfTest.status} · ${health.selfTest.code || ""}`
          : "No self-test runs yet.";
        window.__lastSelfTestSummary = selfTestHost.textContent;
      }
    } catch {
      if (summary) summary.textContent = "Unable to load notification health.";
      if (selfTestHost) selfTestHost.textContent = "Unable to load self-test status.";
      for (const id of new Set(Object.values(CHANNEL_SUBTITLE_IDS))) {
        const el = document.getElementById(id);
        if (el) el.textContent = "Status temporarily unavailable";
      }
      if (skipsHost) skipsHost.innerHTML = "";
    }
  }

  return { fetchOperationalStatus };
}
