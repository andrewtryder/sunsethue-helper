import { escapeHtml } from "../lib/helpers.js";

const THRESHOLD_OPTIONS = [
  ["", "Always"],
  ["20", "20%+"],
  ["40", "40%+"],
  ["50", "50%+"],
  ["60", "60%+"],
  ["70", "70%+"],
  ["80", "80%+"],
  ["off", "Off"]
];

const CHANNEL_LABELS = {
  email: "Email",
  pushover: "Pushover",
  webpush: "Browser",
  webhook: "Webhook"
};

function formatCoords(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return "Coordinates unavailable";
  }
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

function ruleValue(rule) {
  const enabled = rule?.enabled !== false && rule?.enabled !== 0;
  if (!enabled) return "off";
  return rule?.thresholdPercent == null ? "" : String(rule.thresholdPercent);
}

export function initThresholds({ api, showSuccess, showError, getLocationsList, capabilities }) {
  async function fetchLocationRules() {
    const data = await api.get("/api/location-notification-rules");
    renderLocationRules(data.rules || []);
  }

  function renderSegmentedControl(locationId, channel, currentValue) {
    const disabled = !capabilities?.mutations;
    const buttons = THRESHOLD_OPTIONS.map(([value, label]) => {
      const pressed = currentValue === value;
      return `<button type="button"
        class="segmented-btn${pressed ? " is-selected" : ""}"
        role="radio"
        aria-checked="${pressed ? "true" : "false"}"
        data-rule-location="${locationId}"
        data-rule-channel="${channel}"
        data-threshold-value="${value}"
        ${disabled ? "disabled" : ""}>${label}</button>`;
    }).join("");
    return `<div class="segmented-control" role="radiogroup" aria-label="${CHANNEL_LABELS[channel] || channel} threshold for location">${buttons}</div>`;
  }

  function renderLocationRules(rules) {
    const host = document.getElementById("location-rules-grid");
    if (!host) return;
    const locationsList = getLocationsList();
    const byLocation = new Map();
    for (const rule of rules) {
      if (!byLocation.has(rule.locationId)) byLocation.set(rule.locationId, []);
      byLocation.get(rule.locationId).push(rule);
    }
    if (!locationsList.length) {
      host.innerHTML = "<p class=\"pane-subtext\">Add locations to configure thresholds.</p>";
      return;
    }

    host.innerHTML = locationsList.map((loc) => {
      const locRules = byLocation.get(loc.id) || [];
      const channels = ["email", "pushover", "webpush", "webhook"].map((channel) => {
        const rule = locRules.find((r) => r.channel === channel);
        const value = ruleValue(rule);
        return `<div class="location-rule-channel">
          <span class="location-rule-channel-label">${CHANNEL_LABELS[channel] || channel}</span>
          ${renderSegmentedControl(loc.id, channel, value)}
        </div>`;
      }).join("");

      return `<details class="location-rule-row">
        <summary class="location-rule-summary">
          <span class="location-rule-name">${escapeHtml(loc.name)}</span>
          <span class="location-rule-meta">${escapeHtml(formatCoords(loc.latitude, loc.longitude))}</span>
          <span class="location-rule-status">using check times above</span>
        </summary>
        <div class="location-rule-customize">
          <p class="pane-subtext">Customize notification thresholds for this location.</p>
          ${channels}
        </div>
      </details>`;
    }).join("");

    host.querySelectorAll("[data-threshold-value]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!capabilities?.mutations || btn.disabled) return;
        const locationId = btn.getAttribute("data-rule-location");
        const channel = btn.getAttribute("data-rule-channel");
        const value = btn.getAttribute("data-threshold-value") ?? "";
        const enabled = value !== "off";
        const thresholdPercent = !enabled || value === "" ? null : Number(value);
        const group = btn.closest(".segmented-control");
        group?.querySelectorAll(".segmented-btn").forEach((sibling) => {
          const selected = sibling === btn;
          sibling.classList.toggle("is-selected", selected);
          sibling.setAttribute("aria-checked", selected ? "true" : "false");
        });
        try {
          const response = await api.send("/api/location-notification-rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locationId, channel, enabled, thresholdPercent, eventScope: "either" })
          });
          if (!response.ok) throw new Error("Unable to save rule.");
          showSuccess("Notification rule saved.");
        } catch (error) {
          showError(error.message);
          await fetchLocationRules();
        }
      });
    });
  }

  const copyBtn = document.getElementById("rules-copy-all-btn");
  if (copyBtn && !capabilities?.mutations) {
    copyBtn.disabled = true;
    copyBtn.title = "Copying rules is disabled in the static demo.";
  }

  copyBtn?.addEventListener("click", async () => {
    if (!capabilities?.mutations) return;
    const locationsList = getLocationsList();
    if (!locationsList[0]) return;
    try {
      await api.send("/api/location-notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy-to-all", sourceLocationId: locationsList[0].id })
      });
    } catch { return; }
    await fetchLocationRules();
    showSuccess("Rules copied to all locations.");
  });

  const resetBtn = document.getElementById("rules-reset-btn");
  if (resetBtn && !capabilities?.mutations) {
    resetBtn.disabled = true;
    resetBtn.title = "Resetting rules is disabled in the static demo.";
  }

  resetBtn?.addEventListener("click", async () => {
    if (!capabilities?.mutations) return;
    try {
      await api.send("/api/location-notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-defaults" })
      });
    } catch { return; }
    await fetchLocationRules();
    showSuccess("Rules reset to 50% defaults.");
  });

  return { fetchLocationRules };
}
