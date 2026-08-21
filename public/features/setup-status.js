import { escapeHtml } from "../lib/helpers.js";

/**
 * Build the Delivery channels setup-status label.
 * Optional unused channels must not mark setup incomplete.
 *
 * @param {{
 *   deliveryChannels?: { configured?: number, enabled?: number, ready?: boolean },
 *   email?: string,
 *   pushover?: string,
 *   webhook?: string,
 *   browserPushDevices?: string
 * }} status
 * @returns {{ state: "ready"|"partial"|"missing", text: string }}
 */
export function summarizeDeliveryChannels(status) {
  const summary = status?.deliveryChannels;
  if (summary && typeof summary.configured === "number" && typeof summary.enabled === "number") {
    if (summary.enabled > 0) {
      return {
        state: "ready",
        text: `${summary.configured} configured · ${summary.enabled} enabled`
      };
    }
    if (summary.configured > 0) {
      return {
        state: "partial",
        text: `${summary.configured} configured · None enabled`
      };
    }
    return { state: "partial", text: "None enabled" };
  }

  // Legacy payloads without deliveryChannels: treat any ready channel as enough.
  const channelStates = [status?.email, status?.pushover, status?.webhook, status?.browserPushDevices];
  const readyCount = channelStates.filter((state) => state === "ready").length;
  if (readyCount > 0) {
    return {
      state: "ready",
      text: `${readyCount} configured · ${readyCount} enabled`
    };
  }
  return { state: "partial", text: "None enabled" };
}

export function initSetupStatus({ api }) {
  async function fetchSetupChecklist() {
    const list = document.getElementById("setup-checklist");
    if (!list) return;
    try {
      const status = await api.get("/api/setup-status");
      const delivery = summarizeDeliveryChannels(status);
      const accessState = status.accessReady === false ? "missing" : "ready";
      const items = [
        ["Access", accessState, accessState === "ready" ? "Ready" : "Missing"],
        ["Database", status.databaseTables, status.databaseTables === "ready" ? "Ready" : (status.databaseTables === "missing" ? "Missing" : "Not configured")],
        ["Forecast API", status.forecastApiKey, status.forecastApiKey === "ready" ? "Ready" : (status.forecastApiKey === "missing" ? "Missing" : "Not configured")],
        ["Delivery channels", delivery.state, delivery.text]
      ];
      list.innerHTML = items.map(([label, , text]) => (
        `<li><strong>${escapeHtml(label)}</strong><span class="setup-checklist-value">${escapeHtml(text)}</span></li>`
      )).join("");
    } catch {
      list.innerHTML = "<li>Unable to load setup status.</li>";
    }
  }

  return { fetchSetupChecklist };
}
