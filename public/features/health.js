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
    const summary = document.getElementById("notification-health-summary")
      || document.getElementById("ops-status-summary");
    const channelsHost = document.getElementById("notification-health-channels");
    const scheduleHost = document.getElementById("notification-health-schedule");
    const skipsHost = document.getElementById("notification-health-skips");
    const selfTestHost = document.getElementById("notification-health-selftest");
    const legacyList = document.getElementById("ops-status-list");
    if (!summary) return;
    try {
      const health = await api.get("/api/notification-health");
      const stateLabel = {
        healthy: "Healthy",
        degraded: "Degraded",
        action_required: "Action required",
        disabled: "Disabled"
      }[health.state] || health.state;
      const lastReportText = health.lastReportAt ? formatDateTime(health.lastReportAt) : "never";
      summary.textContent = `${stateLabel} · last report ${lastReportText}`;

      for (const ch of health.channels || []) {
        const key = channelKey(ch.channel);
        const subtitleId = CHANNEL_SUBTITLE_IDS[key] || CHANNEL_SUBTITLE_IDS[key.replace(/_/g, "")];
        const el = subtitleId ? document.getElementById(subtitleId) : null;
        if (el) el.textContent = formatChannelSubtitle(ch, formatDateTime);
      }

      if (channelsHost) {
        channelsHost.innerHTML = (health.channels || []).map((ch) => `
          <article class="health-channel-card">
            <h4>${escapeHtml(ch.channel)}</h4>
            <p>${ch.enabled ? "Enabled" : "Off"} · ${ch.configured ? "Configured" : "Not configured"}</p>
            <p>Qualifying locations: ${ch.qualifyingLocationCount}</p>
            <p>Pending ${ch.pending} · Failed ${ch.failed}</p>
            <p>Last success: ${ch.lastSuccessAt ? formatDateTime(ch.lastSuccessAt) : "—"}</p>
            <p>Last failure: ${ch.lastFailureCode || "—"}</p>
            ${ch.devicesEnabled != null ? `<p>Devices: ${ch.devicesEnabled} enabled · ${ch.devicesStale || 0} stale · ${ch.devicesRevoked || 0} revoked</p>` : ""}
            ${ch.maskedHostname ? `<p>Host: ${escapeHtml(ch.maskedHostname)} · signing ${ch.signingEnabled ? "on" : "off"}</p>` : ""}
          </article>`).join("");
      }
      if (scheduleHost && health.schedule) {
        const q = health.schedule.quota || {};
        scheduleHost.innerHTML = `<strong>Schedule</strong> (${escapeHtml(health.schedule.timeZone || "")}): ${(health.schedule.times || []).join(", ")}
          <br>Quota estimate: ${q.estimatedRequestsPerDay ?? "—"}/day · next: ${health.nextScheduled?.slot || "—"}`;
      }
      if (skipsHost) {
        const skips = health.skips || [];
        skipsHost.innerHTML = skips.length
          ? `<strong>Recent threshold skips</strong><ul>${skips.map((s) => `<li>${escapeHtml(s.channel)} · ${escapeHtml(s.code)} · ${escapeHtml(s.createdAt ? formatDateTime(s.createdAt) : s.createdAt)}</li>`).join("")}</ul>`
          : "<p class=\"pane-subtext\">No recent threshold skips.</p>";
      }
      if (selfTestHost) {
        selfTestHost.textContent = health.selfTest
          ? `Latest self-test: ${health.selfTest.checkType} · ${health.selfTest.status} · ${health.selfTest.code || ""}`
          : "No self-test runs yet.";
        window.__lastSelfTestSummary = selfTestHost.textContent;
      }
      if (legacyList) {
        legacyList.replaceChildren();
      }
      const legacySummary = document.getElementById("ops-status-summary");
      if (legacySummary && legacySummary !== summary) {
        legacySummary.textContent = summary.textContent;
      }
    } catch {
      summary.textContent = "Unable to load notification health.";
    }
  }

  return { fetchOperationalStatus };
}
