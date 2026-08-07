export function initThresholds({ api, showSuccess, showError, getLocationsList, capabilities }) {
  async function fetchLocationRules() {
    const data = await api.get("/api/location-notification-rules");
    renderLocationRules(data.rules || []);
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
    const thresholdOptions = [
      ["", "Always"],
      ["20", "20%+"],
      ["40", "40%+"],
      ["50", "50%+"],
      ["60", "60%+"],
      ["70", "70%+"],
      ["80", "80%+"],
      ["off", "Off"]
    ];
    host.innerHTML = locationsList.map((loc) => {
      const locRules = byLocation.get(loc.id) || [];
      const cells = ["email", "pushover", "webpush", "webhook"].map((channel) => {
        const rule = locRules.find((r) => r.channel === channel);
        const enabled = rule?.enabled !== false && rule?.enabled !== 0;
        const threshold = !enabled ? "off" : (rule?.thresholdPercent == null ? "" : String(rule.thresholdPercent));
        const options = thresholdOptions.map(([value, label]) =>
          `<option value="${value}" ${threshold === value ? "selected" : ""}>${label}</option>`
        ).join("");
        return `<label>${channel}<select data-rule-location="${loc.id}" data-rule-channel="${channel}" ${!capabilities?.mutations ? "disabled title=\"Disabled in the static demo\"" : ""}>${options}</select></label>`;
      }).join("");
      return `<div class="form-card"><strong>${loc.name}</strong><div class="settings-field-grid">${cells}</div></div>`;
    }).join("");
    host.querySelectorAll("select[data-rule-location]").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!capabilities?.mutations) return;
        const locationId = select.getAttribute("data-rule-location");
        const channel = select.getAttribute("data-rule-channel");
        const value = select.value;
        const enabled = value !== "off";
        const thresholdPercent = !enabled || value === "" ? null : Number(value);
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
