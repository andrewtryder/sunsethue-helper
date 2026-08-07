import { escapeHtml } from "../lib/helpers.js";

const MAX_SCHEDULE_SLOTS = 8;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

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

function formatHourLabel(slot) {
  const labelHour = Number(String(slot).slice(0, 2));
  if (labelHour === 0) return "12:00 AM";
  if (labelHour < 12) return `${labelHour}:00 AM`;
  if (labelHour === 12) return "12:00 PM";
  return `${labelHour - 12}:00 PM`;
}

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

function normalizeTimes(times) {
  return [...new Set((times || []).filter((slot) => HOUR_OPTIONS.includes(slot)))]
    .sort()
    .slice(0, MAX_SCHEDULE_SLOTS);
}

function locationUsesCustomSchedule(loc) {
  return Array.isArray(loc?.scheduleTimes) && loc.scheduleTimes.length > 0;
}

function scheduleStatusLabel(loc) {
  if (locationUsesCustomSchedule(loc)) {
    const n = loc.scheduleTimes.length;
    return `custom schedule (${n} time${n === 1 ? "" : "s"})`;
  }
  return "using check times above";
}

export function initThresholds({
  api,
  showSuccess,
  showError,
  getLocationsList,
  getGlobalScheduleTimes = () => ["06:00", "12:00", "18:00"],
  refreshLocations = async () => {},
  capabilities
}) {
  let cachedRules = [];

  async function fetchLocationRules() {
    const data = await api.get("/api/location-notification-rules");
    cachedRules = data.rules || [];
    renderLocationRules(cachedRules);
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

  function renderLocationScheduleEditor(loc) {
    const custom = locationUsesCustomSchedule(loc);
    const times = custom ? normalizeTimes(loc.scheduleTimes) : [];
    const disabled = !capabilities?.mutations;
    const available = HOUR_OPTIONS.filter((slot) => !times.includes(slot));
    const atMax = times.length >= MAX_SCHEDULE_SLOTS;
    const pills = times.length
      ? times.map((slot) => `
          <span class="time-pill" role="listitem" data-location-schedule-slot="${slot}">
            <span>${formatHourLabel(slot)}</span>
            <button type="button" class="time-pill-remove" data-location-id="${loc.id}" data-remove-location-slot="${slot}" aria-label="Remove ${formatHourLabel(slot)}" ${disabled ? "disabled" : ""}>&times;</button>
          </span>`).join("")
      : "<p class=\"pane-subtext\">No custom times yet — add at least one, or turn custom schedule off.</p>";

    return `<div class="location-schedule-block" data-location-schedule="${loc.id}">
      <label class="settings-toggle-row">
        <input type="checkbox" data-custom-schedule-toggle="${loc.id}" ${custom ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span>Use custom check times</span>
      </label>
      <p class="pane-subtext">${custom
        ? "This location is checked only at the times below."
        : `Inherits global check times (${normalizeTimes(getGlobalScheduleTimes()).map(formatHourLabel).join(", ") || "none"}).`}</p>
      <div class="location-schedule-editor" ${custom ? "" : "hidden"}>
        <div class="time-pills" role="list">${pills}</div>
        <label class="visually-hidden" for="add-location-time-${loc.id}">Add check time</label>
        <select id="add-location-time-${loc.id}" class="form-input time-pill-add-select" data-add-location-time="${loc.id}" ${disabled || atMax || !available.length ? "disabled" : ""}>
          <option value="">${atMax ? "Maximum 8 times" : "Add time…"}</option>
          ${available.map((slot) => `<option value="${slot}">${formatHourLabel(slot)}</option>`).join("")}
        </select>
      </div>
    </div>`;
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

    const openIds = new Set(
      [...host.querySelectorAll("details.location-rule-row[open]")].map((el) => el.getAttribute("data-location-id"))
    );

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

      return `<details class="location-rule-row" data-location-id="${loc.id}" ${openIds.has(loc.id) ? "open" : ""}>
        <summary class="location-rule-summary">
          <span class="location-rule-name">${escapeHtml(loc.name)}</span>
          <span class="location-rule-meta">${escapeHtml(formatCoords(loc.latitude, loc.longitude))}</span>
          <span class="location-rule-status">${escapeHtml(scheduleStatusLabel(loc))}</span>
        </summary>
        <div class="location-rule-customize">
          <p class="pane-subtext">Customize check times and notification thresholds for this location.</p>
          ${renderLocationScheduleEditor(loc)}
          ${channels}
        </div>
      </details>`;
    }).join("");

    bindThresholdHandlers(host);
    bindScheduleHandlers(host);
  }

  function bindThresholdHandlers(host) {
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

  async function saveLocationSchedule(locationId, scheduleTimes) {
    if (!capabilities?.mutations) {
      throw new Error("Saving location schedules is disabled in the static demo.");
    }
    const response = await api.send(`/api/locations/${locationId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleTimes })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || "Unable to save location schedule.");
    }
    await refreshLocations();
    renderLocationRules(cachedRules);
    showSuccess(scheduleTimes == null ? "Location now uses global check times." : "Custom check times saved.");
  }

  function bindScheduleHandlers(host) {
    host.querySelectorAll("[data-custom-schedule-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", async () => {
        const locationId = toggle.getAttribute("data-custom-schedule-toggle");
        try {
          if (!toggle.checked) {
            await saveLocationSchedule(locationId, null);
            return;
          }
          const globalTimes = normalizeTimes(getGlobalScheduleTimes());
          const seed = globalTimes.length ? globalTimes : ["06:00"];
          await saveLocationSchedule(locationId, seed);
        } catch (error) {
          showError(error.message);
          await refreshLocations();
          renderLocationRules(cachedRules);
        }
      });
    });

    host.querySelectorAll("[data-add-location-time]").forEach((select) => {
      select.addEventListener("change", async () => {
        const locationId = select.getAttribute("data-add-location-time");
        const value = select.value;
        select.value = "";
        if (!value) return;
        const loc = getLocationsList().find((item) => item.id === locationId);
        const next = normalizeTimes([...(loc?.scheduleTimes || []), value]);
        if (!next.length) return;
        try {
          await saveLocationSchedule(locationId, next);
        } catch (error) {
          showError(error.message);
        }
      });
    });

    host.querySelectorAll("[data-remove-location-slot]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const locationId = btn.getAttribute("data-location-id");
        const slot = btn.getAttribute("data-remove-location-slot");
        const loc = getLocationsList().find((item) => item.id === locationId);
        const next = normalizeTimes((loc?.scheduleTimes || []).filter((item) => item !== slot));
        try {
          if (!next.length) {
            await saveLocationSchedule(locationId, null);
            return;
          }
          await saveLocationSchedule(locationId, next);
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

  return { fetchLocationRules, renderLocationRules: () => renderLocationRules(cachedRules) };
}
