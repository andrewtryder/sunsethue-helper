const MAX_SCHEDULE_SLOTS = 8;

function formatHourLabel(slot) {
  const labelHour = Number(String(slot).slice(0, 2));
  if (labelHour === 0) return "12:00 AM";
  if (labelHour < 12) return `${labelHour}:00 AM`;
  if (labelHour === 12) return "12:00 PM";
  return `${labelHour - 12}:00 PM`;
}

export function initSchedule({ api, showSuccess, showError, onSettingsUpdate, capabilities }) {
  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
  const SCHEDULE_PRESETS = {
    once: ["06:00"],
    twice: ["06:00", "18:00"],
    three: ["06:00", "12:00", "18:00"],
    four: ["00:00", "06:00", "12:00", "18:00"]
  };

  let selectedTimes = ["06:00", "12:00", "18:00"];

  function populateTimezoneDatalist() {
    const list = document.getElementById("iana-timezone-list");
    if (!list || typeof Intl.supportedValuesOf !== "function") return;
    list.innerHTML = Intl.supportedValuesOf("timeZone")
      .map((tz) => `<option value="${tz}"></option>`)
      .join("");
  }

  function selectedScheduleSlots() {
    return [...selectedTimes].sort();
  }

  function renderSchedulePills(selected) {
    selectedTimes = [...new Set(selected || [])]
      .filter((slot) => HOUR_OPTIONS.includes(slot))
      .sort()
      .slice(0, MAX_SCHEDULE_SLOTS);

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
      // Legacy checkbox host fallback
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
  }

  // Back-compat alias used by older call sites / tests
  const renderScheduleCheckboxes = renderSchedulePills;

  async function fetchApplicationSettings() {
    const data = await api.get("/api/application-settings");
    const tzInput = document.getElementById("schedule-timezone");
    if (tzInput) tzInput.value = data.scheduleTimezone || "America/New_York";
    const label = document.getElementById("schedule-timezone-label");
    if (label) label.textContent = `Timezone: ${data.scheduleTimezone || "America/New_York"}`;
    for (const radio of document.querySelectorAll('input[name="display-timezone-mode"]')) {
      radio.checked = radio.value === (data.displayTimezoneMode || "schedule");
    }
    const displayTz = document.getElementById("display-timezone");
    if (displayTz) {
      displayTz.value = data.displayTimezone || "";
      displayTz.hidden = data.displayTimezoneMode !== "selected";
    }
    renderSchedulePills(data.scheduleTimes || ["06:00", "12:00", "18:00"]);
    const selfEnabled = document.getElementById("weekly-self-test-enabled");
    if (selfEnabled) selfEnabled.checked = data.weeklySelfTestEnabled !== false;
    const selfMode = document.getElementById("weekly-self-test-mode");
    if (selfMode) selfMode.value = data.weeklySelfTestMode || "passive";
    const selfDay = document.getElementById("weekly-self-test-day");
    if (selfDay) selfDay.value = String(data.weeklySelfTestDay ?? 0);
    const selfTime = document.getElementById("weekly-self-test-time");
    if (selfTime) selfTime.value = data.weeklySelfTestTime || "10:00";
    const quota = document.getElementById("quota-estimator");
    if (quota && data.quota) {
      const q = data.quota;
      quota.innerHTML = `<strong>Estimated Sunsethue usage</strong><br>
        ${q.scheduledRunsPerDay} runs/day × ${q.activeLocations} locations = ${q.estimatedRequestsPerDay} requests/day
        (~${q.estimatedRequestsPer30Days}/30 days).
        ${q.remainingCredits != null ? ` Remaining credits: ${q.remainingCredits}.` : ""}
        <br><small>Channels, thresholds, and delivery retries do not add forecast quota. Manual reports are not included.</small>`;
    }

    if (typeof onSettingsUpdate === "function") {
      onSettingsUpdate(data);
    }
    return data;
  }

  document.getElementById("application-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capabilities?.mutations) {
      showError("Saving application settings is disabled in the static demo.");
      return;
    }
    const mode = document.querySelector('input[name="display-timezone-mode"]:checked')?.value || "schedule";
    const body = {
      scheduleTimezone: document.getElementById("schedule-timezone")?.value || "America/New_York",
      displayTimezoneMode: mode,
      displayTimezone: document.getElementById("display-timezone")?.value || null,
      scheduleTimes: selectedScheduleSlots(),
      weeklySelfTestEnabled: document.getElementById("weekly-self-test-enabled")?.checked !== false,
      weeklySelfTestMode: document.getElementById("weekly-self-test-mode")?.value || "passive",
      weeklySelfTestDay: Number(document.getElementById("weekly-self-test-day")?.value || 0),
      weeklySelfTestTime: document.getElementById("weekly-self-test-time")?.value || "10:00"
    };
    try {
      const response = await api.send("/api/application-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Schedule settings were not accepted.");
      showSuccess("Schedule settings saved.");
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

  document.getElementById("save-check-times-btn")?.addEventListener("click", () => {
    document.getElementById("application-settings-form")?.requestSubmit();
  });
  if (!capabilities?.mutations) {
    const saveTimesBtn = document.getElementById("save-check-times-btn");
    if (saveTimesBtn) {
      saveTimesBtn.disabled = true;
      saveTimesBtn.title = "Saving schedule settings is disabled in the static demo.";
    }
  }

  document.querySelectorAll("[data-schedule-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!capabilities?.mutations) return;
      const key = btn.getAttribute("data-schedule-preset");
      renderSchedulePills(SCHEDULE_PRESETS[key] || SCHEDULE_PRESETS.three);
    });
  });

  document.querySelectorAll('input[name="display-timezone-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const displayTz = document.getElementById("display-timezone");
      if (displayTz) {
        displayTz.hidden = document.querySelector('input[name="display-timezone-mode"]:checked')?.value !== "selected";
      }
    });
  });

  populateTimezoneDatalist();

  return { fetchApplicationSettings, renderScheduleCheckboxes, selectedScheduleSlots };
}
