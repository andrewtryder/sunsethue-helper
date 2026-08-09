import { escapeHtml } from "../lib/helpers.js";

const MAX_SCHEDULE_SLOTS = 8;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
const QUALITY_THRESHOLDS = [20, 40, 50, 60, 70, 80];
const CHANNELS = ["email", "pushover", "webpush", "webhook"];

const CHANNEL_LABELS = {
  email: "Email",
  pushover: "Pushover",
  webpush: "Browser push",
  webhook: "Webhook"
};

const CHANNEL_ICONS = {
  email: "mail",
  pushover: "notifications",
  webpush: "smartphone",
  webhook: "webhook"
};

function formatHourLabel(slot) {
  const labelHour = Number(String(slot).slice(0, 2));
  if (labelHour === 0) return "12:00 AM";
  if (labelHour < 12) return `${labelHour}:00 AM`;
  if (labelHour === 12) return "12:00 PM";
  return `${labelHour - 12}:00 PM`;
}

function formatCoords(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "Coordinates unavailable";
  }
  const latDir = latitude >= 0 ? "N" : "S";
  const lngDir = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lngDir}`;
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

function scheduleSummaryLabel(loc) {
  if (locationUsesCustomSchedule(loc)) {
    const n = loc.scheduleTimes.length;
    return `Custom · ${n} check${n === 1 ? "" : "s"}/day`;
  }
  return "Default check times";
}

function thresholdSummaryLabel(value) {
  if (value === "off") return "Off";
  if (value === "") return "Always";
  return `≥${value}%`;
}

function getGlobalChannelEnabled(channel) {
  const id = {
    email: "notification-email-enabled",
    pushover: "notification-pushover-enabled",
    webhook: "notification-webhook-enabled"
  }[channel];
  if (!id) return true; // browser push is device-based
  const el = document.getElementById(id);
  return el ? Boolean(el.checked) : true;
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
  let rulesLoaded = false;
  let drawerLocationId = null;

  function setLocationCount(count) {
    const badge = document.getElementById("locations-count-badge");
    if (badge) badge.textContent = `${count} of 10`;
  }

  async function fetchLocationRules() {
    const data = await api.get("/api/location-notification-rules");
    cachedRules = data.rules || [];
    rulesLoaded = true;
    renderLocationRules(cachedRules);
    if (drawerLocationId) {
      const loc = getLocationsList().find((item) => item.id === drawerLocationId);
      if (loc) renderDrawerLocationConfig(loc);
    }
  }

  async function refreshLocationConfiguration() {
    try {
      await refreshLocations();
      await fetchLocationRules();
    } catch (error) {
      rulesLoaded = true;
      renderLocationRules(cachedRules);
      showError(error.message || "Unable to load location notification settings.");
    }
  }

  function renderRuleControl(locationId, channel, currentValue) {
    const disabled = !capabilities?.mutations;
    const threshold = QUALITY_THRESHOLDS.includes(Number(currentValue)) ? Number(currentValue) : 50;
    const thresholdSelected = currentValue !== "" && currentValue !== "off";
    const label = CHANNEL_LABELS[channel] || channel;

    return `<div class="rule-control" role="group" aria-label="${label} notification rule">
      <button type="button"
        class="rule-choice${currentValue === "" ? " is-selected" : ""}"
        data-rule-location="${locationId}"
        data-rule-channel="${channel}"
        data-threshold-value=""
        aria-pressed="${currentValue === "" ? "true" : "false"}"
        ${disabled ? "disabled" : ""}>Always</button>
      <label class="rule-threshold-select${thresholdSelected ? " is-selected" : ""}">
        <span class="visually-hidden">Minimum ${label} quality</span>
        <select data-rule-location="${locationId}"
          data-rule-channel="${channel}"
          data-threshold-select
          aria-label="Minimum ${label} quality"
          ${disabled ? "disabled" : ""}>
          ${QUALITY_THRESHOLDS.map((value) => `<option value="${value}" ${threshold === value ? "selected" : ""}>${value}%+</option>`).join("")}
        </select>
      </label>
      <button type="button"
        class="rule-choice${currentValue === "off" ? " is-selected" : ""}"
        data-rule-location="${locationId}"
        data-rule-channel="${channel}"
        data-threshold-value="off"
        aria-pressed="${currentValue === "off" ? "true" : "false"}"
        ${disabled ? "disabled" : ""}>Off</button>
    </div>`;
  }

  function renderLocationRuleControls(loc, locRules) {
    return CHANNELS.map((channel) => {
      const rule = locRules.find((item) => item.channel === channel);
      const value = ruleValue(rule);
      const globallyOn = getGlobalChannelEnabled(channel);
      const body = globallyOn
        ? renderRuleControl(loc.id, channel, value)
        : `<p class="pane-subtext channel-global-off-note">Off globally — enable it in Settings to use it here.</p>`;

      return `<div class="location-rule-channel drawer-rule-channel${!globallyOn ? " is-global-off" : ""}">
        <span class="location-rule-channel-label">
          <span class="material-symbols-outlined" aria-hidden="true">${CHANNEL_ICONS[channel]}</span>
          ${CHANNEL_LABELS[channel] || channel}
        </span>
        ${body}
      </div>`;
    }).join("");
  }

  function renderLocationScheduleEditor(loc) {
    const custom = locationUsesCustomSchedule(loc);
    const times = custom ? normalizeTimes(loc.scheduleTimes) : [];
    const disabled = !capabilities?.mutations;
    const available = HOUR_OPTIONS.filter((slot) => !times.includes(slot));
    const atMax = times.length >= MAX_SCHEDULE_SLOTS;
    const inherited = normalizeTimes(getGlobalScheduleTimes());
    const pills = times.length
      ? times.map((slot) => `
          <span class="time-pill location-time-pill" role="listitem" data-location-schedule-slot="${slot}">
            <span>${formatHourLabel(slot)}</span>
            <button type="button" class="time-pill-remove" data-location-id="${loc.id}" data-remove-location-slot="${slot}" aria-label="Remove ${formatHourLabel(slot)}" ${disabled ? "disabled" : ""}>&times;</button>
          </span>`).join("")
      : "";

    return `<div class="location-schedule-block" data-location-schedule="${loc.id}">
      <div class="location-customize-heading">
        <div>
          <strong>${custom ? "Custom check times" : "Using default check times"}</strong>
          <p class="pane-subtext">${custom
        ? "This location is checked only at the times below."
        : `Inherits ${inherited.map(formatHourLabel).join(", ") || "no default times"}.`}</p>
        </div>
        <label class="switch location-schedule-switch">
          <input type="checkbox" data-custom-schedule-toggle="${loc.id}" ${custom ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <span class="switch-ui" aria-hidden="true"></span>
          <span class="visually-hidden">Use custom check times for ${escapeHtml(loc.name)}</span>
        </label>
      </div>
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

  function clearDrawerHosts() {
    drawerLocationId = null;
    const scheduleHost = document.getElementById("location-drawer-schedule-host");
    const rulesHost = document.getElementById("location-drawer-rules-host");
    if (scheduleHost) {
      scheduleHost.innerHTML = "<p class=\"pane-subtext\">Save the location first to configure a custom schedule.</p>";
    }
    if (rulesHost) {
      rulesHost.innerHTML = "<p class=\"pane-subtext\">Save the location first to configure notification thresholds.</p>";
    }
  }

  function renderDrawerLocationConfig(loc) {
    const scheduleHost = document.getElementById("location-drawer-schedule-host");
    const rulesHost = document.getElementById("location-drawer-rules-host");
    if (!scheduleHost || !rulesHost || !loc?.id) {
      clearDrawerHosts();
      return;
    }
    drawerLocationId = loc.id;
    const locRules = cachedRules.filter((rule) => rule.locationId === loc.id);
    scheduleHost.innerHTML = renderLocationScheduleEditor(loc);
    rulesHost.innerHTML = `<div class="location-rule-channel-grid">${renderLocationRuleControls(loc, locRules)}</div>`;
    bindThresholdHandlers(scheduleHost);
    bindScheduleHandlers(scheduleHost);
    bindThresholdHandlers(rulesHost);
  }

  function renderLocationRules(rules) {
    const host = document.getElementById("location-rules-grid");
    if (!host) return;
    const locationsList = getLocationsList();
    setLocationCount(locationsList.length);

    const byLocation = new Map();
    for (const rule of rules) {
      if (!byLocation.has(rule.locationId)) byLocation.set(rule.locationId, []);
      byLocation.get(rule.locationId).push(rule);
    }

    if (!locationsList.length) {
      host.innerHTML = `<div class="empty-state location-config-empty">
        <span class="material-symbols-outlined" aria-hidden="true">add_location_alt</span>
        <p>No locations yet.<br>Add a location to configure check times and notifications.</p>
      </div>`;
      return;
    }

    host.innerHTML = locationsList.map((loc) => {
      const locRules = byLocation.get(loc.id) || [];
      const channelDots = CHANNELS.map((channel) => {
        const rule = locRules.find((item) => item.channel === channel);
        const on = ruleValue(rule) !== "off" && getGlobalChannelEnabled(channel);
        return `<span class="channel-dot${on ? " on" : ""}" title="${CHANNEL_LABELS[channel]}${on ? " on" : " off"}">
          <span class="material-symbols-outlined" aria-hidden="true">${CHANNEL_ICONS[channel]}</span>
        </span>`;
      }).join("");

      const emailRule = ruleValue(locRules.find((r) => r.channel === "email"));
      const thresholdLine = `Threshold ${thresholdSummaryLabel(emailRule)}`;
      const custom = locationUsesCustomSchedule(loc);

      return `<article class="loc-rule-card" data-location-id="${loc.id}">
        <div class="loc-rule-top">
          <div class="loc-rule-name">
            <span class="pin" aria-hidden="true">🌅</span>
            <div>
              ${escapeHtml(loc.name)}
              <span class="coords">${escapeHtml(formatCoords(loc.latitude, loc.longitude))}</span>
            </div>
          </div>
          <button type="button" class="icon-btn" data-location-edit="${loc.id}" aria-label="Edit ${escapeHtml(loc.name)}" ${!capabilities?.mutations ? "disabled" : ""}>
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          </button>
        </div>
        <div class="loc-rule-meta-row">
          <div class="channel-dots">${channelDots}</div>
          <span class="hint-text">${escapeHtml(thresholdLine)}</span>
        </div>
        <div class="hint-text loc-rule-schedule-line${custom ? " is-custom" : ""}">
          <span class="material-symbols-outlined" aria-hidden="true">schedule</span>
          ${escapeHtml(scheduleSummaryLabel(loc))}
        </div>
      </article>`;
    }).join("");

    bindLocationActions(host);
  }

  async function persistRule(locationId, channel, value) {
    const enabled = value !== "off";
    const thresholdPercent = !enabled || value === "" ? null : Number(value);
    const response = await api.send("/api/location-notification-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, channel, enabled, thresholdPercent, eventScope: "either" })
    });
    if (!response.ok) throw new Error("Unable to save notification rule.");
    const existing = cachedRules.find((rule) => rule.locationId === locationId && rule.channel === channel);
    if (existing) {
      existing.enabled = enabled;
      existing.thresholdPercent = thresholdPercent;
    } else {
      cachedRules.push({ locationId, channel, enabled, thresholdPercent, eventScope: "either" });
    }
    renderLocationRules(cachedRules);
    if (drawerLocationId === locationId) {
      const loc = getLocationsList().find((item) => item.id === locationId);
      if (loc) renderDrawerLocationConfig(loc);
    }
    showSuccess("Notification rule saved.");
  }

  function bindThresholdHandlers(host) {
    host.querySelectorAll("[data-threshold-value]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!capabilities?.mutations || btn.disabled) return;
        try {
          await persistRule(
            btn.getAttribute("data-rule-location"),
            btn.getAttribute("data-rule-channel"),
            btn.getAttribute("data-threshold-value") ?? ""
          );
        } catch (error) {
          showError(error.message);
          await fetchLocationRules();
        }
      });
    });

    host.querySelectorAll("[data-threshold-select]").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!capabilities?.mutations || select.disabled) return;
        try {
          await persistRule(
            select.getAttribute("data-rule-location"),
            select.getAttribute("data-rule-channel"),
            select.value
          );
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
    if (drawerLocationId === locationId) {
      const loc = getLocationsList().find((item) => item.id === locationId);
      if (loc) renderDrawerLocationConfig(loc);
    }
    showSuccess(scheduleTimes == null ? "Location now uses default check times." : "Custom check times saved.");
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
          await saveLocationSchedule(locationId, next.length ? next : null);
        } catch (error) {
          showError(error.message);
        }
      });
    });
  }

  function openLocationEditor(loc) {
    if (!capabilities?.mutations || !loc) return;
    const drawer = document.getElementById("location-drawer");
    const overlay = document.getElementById("location-drawer-overlay");
    const idInput = document.getElementById("edit-location-id");
    const nameInput = document.getElementById("location-name");
    const latInput = document.getElementById("location-lat");
    const lngInput = document.getElementById("location-lng");
    const title = document.getElementById("form-title");

    if (idInput) idInput.value = loc.id;
    if (nameInput) nameInput.value = loc.name || "";
    if (latInput) latInput.value = String(loc.latitude ?? "");
    if (lngInput) lngInput.value = String(loc.longitude ?? "");
    if (title) title.textContent = `Edit location — ${loc.name || ""}`;

    drawer?.classList.add("open");
    drawer?.setAttribute("aria-hidden", "false");
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add("open");
    }
    document.body.classList.add("drawer-open");
    renderDrawerLocationConfig(loc);
    nameInput?.focus();
    nameInput?.select();
  }

  function bindLocationActions(host) {
    host.querySelectorAll("[data-location-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = getLocationsList().find((item) => item.id === btn.getAttribute("data-location-edit"));
        if (loc) openLocationEditor(loc);
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
      const response = await api.send("/api/location-notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy-to-all", sourceLocationId: locationsList[0].id })
      });
      if (!response.ok) throw new Error("Unable to copy rules.");
      await fetchLocationRules();
      showSuccess("Rules copied to all locations.");
    } catch (error) {
      showError(error.message);
    }
  });

  const resetBtn = document.getElementById("rules-reset-btn");
  if (resetBtn && !capabilities?.mutations) {
    resetBtn.disabled = true;
    resetBtn.title = "Resetting rules is disabled in the static demo.";
  }
  resetBtn?.addEventListener("click", async () => {
    if (!capabilities?.mutations) return;
    try {
      const response = await api.send("/api/location-notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-defaults" })
      });
      if (!response.ok) throw new Error("Unable to reset rules.");
      await fetchLocationRules();
      showSuccess("Rules reset to 50% defaults.");
    } catch (error) {
      showError(error.message);
    }
  });

  for (const tab of document.querySelectorAll('[data-tab="locations"]')) {
    tab.addEventListener("click", () => void refreshLocationConfiguration());
  }

  const legacyHost = document.getElementById("locations-list-container");
  if (legacyHost && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => {
      if (rulesLoaded && document.getElementById("pane-locations")?.classList.contains("active")) {
        renderLocationRules(cachedRules);
      }
    });
    observer.observe(legacyHost, { childList: true, subtree: true });
  }

  return {
    fetchLocationRules,
    refreshLocationConfiguration,
    renderLocationRules: () => renderLocationRules(cachedRules),
    renderDrawerLocationConfig,
    clearDrawerHosts,
    openLocationEditor
  };
}
