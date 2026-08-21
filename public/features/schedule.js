import {
  DEFAULT_SCHEDULE_TIMEZONE,
  buildTimezoneSelectHtml,
  isValidIanaTimeZone
} from "../lib/time-format.js";

const MAX_SCHEDULE_SLOTS = 8;
const SCHEDULED_REPORT_CHANNELS = [
  { id: "email", label: "Email" },
  { id: "pushover", label: "Pushover" },
  { id: "webpush", label: "Browser Push" },
  { id: "webhook", label: "Webhook" }
];

function formatHourLabel(slot) {
  const labelHour = Number(String(slot).slice(0, 2));
  if (labelHour === 0) return "12:00 AM";
  if (labelHour < 12) return `${labelHour}:00 AM`;
  if (labelHour === 12) return "12:00 PM";
  return `${labelHour - 12}:00 PM`;
}

export function initSchedule({
  api,
  showSuccess,
  showError,
  onSettingsUpdate,
  capabilities,
  getChannelAvailability = () => ({ email: true, pushover: true, webpush: true, webhook: true })
}) {
  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
  const SCHEDULE_PRESETS = {
    once: ["06:00"],
    twice: ["06:00", "18:00"],
    three: ["06:00", "12:00", "18:00"],
    four: ["00:00", "06:00", "12:00", "18:00"]
  };

  let selectedTimes = ["06:00", "12:00", "18:00"];
  let scheduledReportsEnabled = false;
  let scheduledReportTimes = [];
  let scheduledReportChannels = [];

  function populateTimezoneSelect(selectedValue) {
    const select = document.getElementById("schedule-timezone");
    if (!select) return;
    const value = selectedValue && isValidIanaTimeZone(selectedValue)
      ? selectedValue
      : DEFAULT_SCHEDULE_TIMEZONE;
    select.innerHTML = buildTimezoneSelectHtml(value);
    select.value = value;
    if (select.value !== value && isValidIanaTimeZone(value)) {
      const option = document.createElement("option");
      option.value = value;
      option.selected = true;
      option.textContent = value;
      select.appendChild(option);
      select.value = value;
    }
  }

  function selectedScheduleSlots() {
    return [...selectedTimes].sort();
  }

  function reconcileScheduledReportTimes(checkTimes = selectedTimes) {
    const allowed = new Set(checkTimes);
    scheduledReportTimes = scheduledReportTimes.filter((slot) => allowed.has(slot));
  }

  function channelAvailabilityHint(channel, globallyAvailable) {
    if (globallyAvailable) return "Ready";
    if (channel === "webpush") return "Register a device first";
    return "Enable this channel above first";
  }

  function renderScheduledReportOptions() {
    const options = document.getElementById("scheduled-reports-options");
    const enabledInput = document.getElementById("scheduled-reports-enabled");
    if (enabledInput) enabledInput.checked = scheduledReportsEnabled;
    if (options) options.hidden = !scheduledReportsEnabled;

    const timesHost = document.getElementById("scheduled-report-times");
    if (timesHost) {
      const checkSet = new Set(selectedTimes);
      const selectedSet = new Set(scheduledReportTimes.filter((slot) => checkSet.has(slot)));
      timesHost.innerHTML = selectedTimes.length
        ? selectedTimes.map((slot) => `
            <label class="report-time-pill">
              <input type="checkbox" data-scheduled-report-time="${slot}" ${selectedSet.has(slot) ? "checked" : ""} ${!capabilities?.mutations ? "disabled" : ""}>
              <span class="report-time-pill-ui">${formatHourLabel(slot)}</span>
            </label>`).join("")
        : "<p class=\"pane-subtext\">Add default forecast check times first.</p>";

      timesHost.querySelectorAll("[data-scheduled-report-time]").forEach((input) => {
        input.addEventListener("change", () => {
          const slot = input.getAttribute("data-scheduled-report-time");
          if (input.checked) {
            if (!scheduledReportTimes.includes(slot)) scheduledReportTimes.push(slot);
          } else {
            scheduledReportTimes = scheduledReportTimes.filter((t) => t !== slot);
          }
          scheduledReportTimes.sort();
          updateScheduledReportsHelp();
        });
      });
    }

    const channelsHost = document.getElementById("scheduled-report-channels");
    const availability = getChannelAvailability() || {};
    const channelHints = [];
    if (channelsHost) {
      channelsHost.innerHTML = SCHEDULED_REPORT_CHANNELS.map(({ id, label }) => {
        const globallyAvailable = availability[id] !== false;
        const hint = channelAvailabilityHint(id, globallyAvailable);
        if (!globallyAvailable) {
          channelHints.push(
            id === "webpush"
              ? "Browser Push has no enabled devices"
              : `${label} is globally disabled`
          );
        }
        return `
          <label class="scheduled-report-channel${!globallyAvailable ? " is-unavailable" : ""}">
            <span class="scheduled-report-channel-copy">
              <span class="scheduled-report-channel-name">${label}</span>
              <span class="scheduled-report-channel-hint">${hint}</span>
            </span>
            <input type="checkbox" data-scheduled-report-channel="${id}" ${scheduledReportChannels.includes(id) ? "checked" : ""} ${!capabilities?.mutations ? "disabled" : ""}>
            <span class="scheduled-report-channel-check" aria-hidden="true"></span>
          </label>`;
      }).join("");

      channelsHost.querySelectorAll("[data-scheduled-report-channel]").forEach((input) => {
        input.addEventListener("change", () => {
          const channel = input.getAttribute("data-scheduled-report-channel");
          if (input.checked) {
            if (!scheduledReportChannels.includes(channel)) scheduledReportChannels.push(channel);
          } else {
            scheduledReportChannels = scheduledReportChannels.filter((c) => c !== channel);
          }
          updateScheduledReportsHelp();
        });
      });
    }

    const hints = document.getElementById("scheduled-report-channel-hints");
    if (hints) {
      hints.textContent = channelHints.length
        ? `${channelHints.join(". ")}. Selection is kept and used when the channel is re-enabled.`
        : "";
    }
    updateScheduledReportsHelp();
  }

  function populateSelfTestTimeSelect(selectedValue = "10:00") {
    const select = document.getElementById("weekly-self-test-time");
    if (!select || select.tagName !== "SELECT") return;
    const value = HOUR_OPTIONS.includes(selectedValue) ? selectedValue : "10:00";
    select.innerHTML = HOUR_OPTIONS.map((slot) => (
      `<option value="${slot}" ${slot === value ? "selected" : ""}>${slot}</option>`
    )).join("");
    select.value = value;
  }

  function updateScheduledReportsHelp() {
    const help = document.getElementById("scheduled-reports-help");
    if (!help) return;
    if (!scheduledReportsEnabled) {
      help.textContent = "";
      return;
    }
    if (scheduledReportTimes.length === 0 || scheduledReportChannels.length === 0) {
      help.textContent = "Enable at least one report time and one delivery channel before saving.";
      return;
    }
    help.textContent = "";
  }

  function renderSchedulePills(selected) {
    selectedTimes = [...new Set(selected || [])]
      .filter((slot) => HOUR_OPTIONS.includes(slot))
      .sort()
      .slice(0, MAX_SCHEDULE_SLOTS);
    reconcileScheduledReportTimes(selectedTimes);

    const host = document.getElementById("schedule-times-pills")
      || document.getElementById("schedule-times-checkboxes");
    if (!host) return;

    if (host.id === "schedule-times-pills") {
      host.innerHTML = selectedTimes.map((slot) => `
        <span class="time-pill" role="listitem" data-schedule-slot="${slot}">
          <span>${formatHourLabel(slot)}</span>
          <button type="button" class="time-pill-remove" data-remove-slot="${slot}" aria-label="Remove ${formatHourLabel(slot)}" ${!capabilities?.mutations ? "disabled" : ""}>&times;</button>
        </span>`).join("") || "<p class=\"pane-subtext\">No check times selected.</p>";

      host.querySelectorAll("[data-remove-slot]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!capabilities?.mutations) return;
          const slot = btn.getAttribute("data-remove-slot");
          renderSchedulePills(selectedTimes.filter((t) => t !== slot));
        });
      });
    } else {
      const set = new Set(selectedTimes);
      host.innerHTML = HOUR_OPTIONS.map((slot) => {
        const ampm = formatHourLabel(slot);
        return `<label><input type="checkbox" data-schedule-slot="${slot}" ${set.has(slot) ? "checked" : ""}> ${ampm}</label>`;
      }).join("");
    }

    const addSelect = document.getElementById("add-schedule-time-select");
    if (addSelect) {
      const available = HOUR_OPTIONS.filter((slot) => !selectedTimes.includes(slot));
      const atMax = selectedTimes.length >= MAX_SCHEDULE_SLOTS;
      addSelect.disabled = !capabilities?.mutations || atMax || available.length === 0;
      addSelect.innerHTML = `<option value="">${atMax ? "Maximum 8 times" : "Add time…"}</option>`
        + available.map((slot) => `<option value="${slot}">${formatHourLabel(slot)}</option>`).join("");
    }

    renderScheduledReportOptions();
  }

  const renderScheduleCheckboxes = renderSchedulePills;

  async function fetchApplicationSettings() {
    const data = await api.get("/api/application-settings");
    const tz = data.scheduleTimezone && isValidIanaTimeZone(data.scheduleTimezone)
      ? data.scheduleTimezone
      : DEFAULT_SCHEDULE_TIMEZONE;
    populateTimezoneSelect(tz);
    const label = document.getElementById("schedule-timezone-label");
    if (label) label.textContent = `Timezone: ${tz}`;
    scheduledReportsEnabled = data.scheduledReportsEnabled === true;
    scheduledReportTimes = Array.isArray(data.scheduledReportTimes) ? [...data.scheduledReportTimes] : [];
    scheduledReportChannels = Array.isArray(data.scheduledReportChannels) ? [...data.scheduledReportChannels] : [];
    renderSchedulePills(data.scheduleTimes || ["06:00", "12:00", "18:00"]);
    const selfEnabled = document.getElementById("weekly-self-test-enabled");
    if (selfEnabled) selfEnabled.checked = data.weeklySelfTestEnabled !== false;
    const selfMode = document.getElementById("weekly-self-test-mode");
    if (selfMode) selfMode.value = data.weeklySelfTestMode || "passive";
    const selfDay = document.getElementById("weekly-self-test-day");
    if (selfDay) selfDay.value = String(data.weeklySelfTestDay ?? 0);
    populateSelfTestTimeSelect(data.weeklySelfTestTime || "10:00");
    const quota = document.getElementById("quota-estimator");
    if (quota && data.quota) {
      const q = data.quota;
      const used = Number(q.estimatedRequestsPer30Days) || 0;
      const credits = q.remainingCredits != null
        ? ` · ${Number(q.remainingCredits)} credits remaining`
        : "";
      quota.innerHTML = `
        <p class="quota-label">~${used} forecast requests / 30 days${credits}</p>
        <small class="quota-footnote">Forecast API usage is based on forecast checks × locations. Scheduled reports and quality-alert channels reuse those forecast results and do not add forecast API calls. Manual forecast refreshes are excluded from this estimate. ${q.scheduledRunsPerDay} checks/day × ${q.activeLocations} locations = ${q.estimatedRequestsPerDay}/day.</small>`;
    }

    if (typeof onSettingsUpdate === "function") {
      onSettingsUpdate({
        ...data,
        scheduleTimezone: tz,
        displayTimezoneMode: "schedule",
        displayTimezone: null
      });
    }
    return data;
  }

  document.getElementById("scheduled-reports-enabled")?.addEventListener("change", (event) => {
    scheduledReportsEnabled = Boolean(event.target.checked);
    renderScheduledReportOptions();
  });

  document.getElementById("application-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capabilities?.mutations) {
      showError("Saving application settings is disabled in the static demo.");
      return;
    }
    const scheduleTimezone = document.getElementById("schedule-timezone")?.value?.trim() || "";
    if (!scheduleTimezone || !isValidIanaTimeZone(scheduleTimezone)) {
      showError("Choose a valid IANA timezone before saving.");
      return;
    }
    reconcileScheduledReportTimes();
    if (scheduledReportsEnabled && (scheduledReportTimes.length === 0 || scheduledReportChannels.length === 0)) {
      showError("Scheduled reports need at least one report time and one delivery channel.");
      updateScheduledReportsHelp();
      return;
    }
    const body = {
      scheduleTimezone,
      displayTimezoneMode: "schedule",
      displayTimezone: null,
      scheduleTimes: selectedScheduleSlots(),
      weeklySelfTestEnabled: document.getElementById("weekly-self-test-enabled")?.checked !== false,
      weeklySelfTestMode: document.getElementById("weekly-self-test-mode")?.value || "passive",
      weeklySelfTestDay: Number(document.getElementById("weekly-self-test-day")?.value || 0),
      weeklySelfTestTime: document.getElementById("weekly-self-test-time")?.value || "10:00",
      scheduledReportsEnabled,
      scheduledReportTimes: [...scheduledReportTimes].sort(),
      scheduledReportChannels: [...scheduledReportChannels]
    };
    try {
      const response = await api.send("/api/application-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || payload?.error?.code || "Schedule settings were not accepted.");
      }
      showSuccess("Settings saved.");
      await fetchApplicationSettings();
    } catch (error) {
      showError(error.message);
    }
  });

  document.getElementById("add-schedule-time-select")?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!value || !capabilities?.mutations) {
      event.target.value = "";
      return;
    }
    if (selectedTimes.includes(value) || selectedTimes.length >= MAX_SCHEDULE_SLOTS) {
      event.target.value = "";
      return;
    }
    renderSchedulePills([...selectedTimes, value]);
    event.target.value = "";
  });

  document.querySelectorAll("[data-schedule-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!capabilities?.mutations) return;
      const key = btn.getAttribute("data-schedule-preset");
      renderSchedulePills(SCHEDULE_PRESETS[key] || SCHEDULE_PRESETS.three);
    });
  });

  if (!capabilities?.mutations) {
    const tzSelect = document.getElementById("schedule-timezone");
    if (tzSelect) {
      tzSelect.disabled = true;
      tzSelect.title = "Changing timezone is disabled in the static demo.";
    }
    const enabledToggle = document.getElementById("scheduled-reports-enabled");
    if (enabledToggle) enabledToggle.disabled = true;
    for (const id of [
      "weekly-self-test-enabled",
      "weekly-self-test-mode",
      "weekly-self-test-day",
      "weekly-self-test-time"
    ]) {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    }
  }

  populateTimezoneSelect(DEFAULT_SCHEDULE_TIMEZONE);
  populateSelfTestTimeSelect("10:00");
  renderScheduledReportOptions();

  return {
    fetchApplicationSettings,
    renderScheduleCheckboxes,
    selectedScheduleSlots,
    refreshScheduledReportChannelHints: renderScheduledReportOptions
  };
}
