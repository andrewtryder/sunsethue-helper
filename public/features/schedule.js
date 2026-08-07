export function initSchedule({ api, showSuccess, showError, onSettingsUpdate }) {
  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
  const SCHEDULE_PRESETS = {
    once: ["06:00"],
    twice: ["06:00", "18:00"],
    three: ["06:00", "12:00", "18:00"],
    four: ["00:00", "06:00", "12:00", "18:00"]
  };

  function populateTimezoneDatalist() {
    const list = document.getElementById("iana-timezone-list");
    if (!list || typeof Intl.supportedValuesOf !== "function") return;
    list.innerHTML = Intl.supportedValuesOf("timeZone")
      .map((tz) => `<option value="${tz}"></option>`)
      .join("");
  }

  function renderScheduleCheckboxes(selected) {
    const host = document.getElementById("schedule-times-checkboxes");
    if (!host) return;
    const set = new Set(selected || []);
    host.innerHTML = HOUR_OPTIONS.map((slot) => {
      const labelHour = Number(slot.slice(0, 2));
      const ampm = labelHour === 0 ? "12:00 AM" : labelHour < 12 ? `${labelHour}:00 AM` : labelHour === 12 ? "12:00 PM" : `${labelHour - 12}:00 PM`;
      return `<label><input type="checkbox" data-schedule-slot="${slot}" ${set.has(slot) ? "checked" : ""}> ${ampm}</label>`;
    }).join("");
  }

  function selectedScheduleSlots() {
    return [...document.querySelectorAll("[data-schedule-slot]:checked")].map((el) => el.getAttribute("data-schedule-slot"));
  }

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
    renderScheduleCheckboxes(data.scheduleTimes || ["06:00", "12:00", "18:00"]);
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

  document.querySelectorAll("[data-schedule-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-schedule-preset");
      renderScheduleCheckboxes(SCHEDULE_PRESETS[key] || SCHEDULE_PRESETS.three);
    });
  });

  document.querySelectorAll('input[name="display-timezone-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const displayTz = document.getElementById("display-timezone");
      if (displayTz) displayTz.hidden = radio.value !== "selected" || !radio.checked
        ? document.querySelector('input[name="display-timezone-mode"]:checked')?.value !== "selected"
        : false;
    });
  });

  populateTimezoneDatalist();

  return { fetchApplicationSettings };
}
