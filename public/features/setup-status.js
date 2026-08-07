import { escapeHtml } from "../lib/helpers.js";

export function initSetupStatus({ api, capabilities }) {
  async function fetchSetupChecklist() {
    const list = document.getElementById("setup-checklist");
    if (!list) return;
    try {
      const status = await api.get("/api/setup-status");
      const channelStates = [status.email, status.pushover, status.webhook, status.browserPushDevices];
      const channelsReady = channelStates.every((state) => state === "ready");
      const channelsMissing = channelStates.some((state) => state === "missing");
      const channelsLabel = channelsReady
        ? "Ready"
        : channelsMissing
          ? "Missing"
          : "Not configured";

      const items = [
        ["Access", "ready"],
        ["Database tables", status.databaseTables],
        ["Forecast API key", status.forecastApiKey],
        ["Channels", channelsReady ? "ready" : (channelsMissing ? "missing" : "partial")]
      ];
      list.innerHTML = items.map(([label, state]) => {
        const text = state === "ready"
          ? "Ready"
          : state === "missing"
            ? "Missing"
            : label === "Channels"
              ? channelsLabel
              : "Not configured";
        return `<li><strong>${escapeHtml(label)}</strong>: ${text}</li>`;
      }).join("");
    } catch {
      list.innerHTML = "<li>Unable to load setup status.</li>";
    }
  }

  return { fetchSetupChecklist };
}
