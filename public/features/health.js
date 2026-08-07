import { escapeHtml } from "../lib/helpers.js";

export function initHealth({ api, formatDateTime = (v) => v }) {
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
