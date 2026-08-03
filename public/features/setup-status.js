import { escapeHtml } from "../lib/helpers.js";

export function initSetupStatus({ api }) {
  async function fetchSetupChecklist() {
    const list = document.getElementById("setup-checklist");
    if (!list) return;
    try {
      const status = await api.get("/api/setup-status");
      const items = [
        ["Access", "ready"],
        ["Database tables", status.databaseTables],
        ["Forecast API key", status.forecastApiKey],
        ["Email", status.email],
        ["Pushover", status.pushover],
        ["Webhook", status.webhook],
        ["Browser push", status.browserPushDevices]
      ];
      list.innerHTML = items.map(([label, state]) => {
        const text = state === "ready" ? "Ready" : state === "missing" ? "Missing" : "Not configured";
        return `<li><strong>${escapeHtml(label)}</strong>: ${text}</li>`;
      }).join("");
    } catch {
      list.innerHTML = "<li>Unable to load setup status.</li>";
    }
  }

  return { fetchSetupChecklist };
}
