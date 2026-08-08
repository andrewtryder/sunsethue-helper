import {
  escapeHtml,
  getForecastBadgeHtml,
  canAddLocation,
  validateCoordinates,
  formatCoordinateDisplay,
  getLogStatusClass,
  buildPhotonDisplayName,
  moveSuggestionIndex,
  shouldSearchAutocomplete,
  mapGeolocationError
} from "./lib/helpers.js";
import {
  resolveDisplayTimeZone,
  formatTimeWithZone,
  formatDateWithZone,
  formatDateTimeMediumWithZone,
  formatTimeShortWithZone
} from "./lib/time-format.js";
import { initApi, CREDENTIAL_ADMIN_HEADER } from "./lib/api-client.js";
import { showBanner, hideBanner } from "./ui/banners.js";
import { initEmailSuccessModal } from "./ui/dialog.js";
import { initNotifications } from "./features/notifications.js";
import { initSchedule } from "./features/schedule.js";
import { initThresholds } from "./features/thresholds.js";
import { initWebhook } from "./features/webhook.js";
import { initHealth } from "./features/health.js";
import { initHistory } from "./features/history.js";
import { initSetupStatus } from "./features/setup-status.js";
// API
const { api, DEMO_MODE, DEMO_READ_ONLY } = initApi();

export const capabilities = Object.freeze({
  liveApi: !DEMO_MODE,
  mutations: !DEMO_MODE,
  webPush: !DEMO_MODE,
  credentialManagement: !DEMO_MODE,
  externalRequests: !DEMO_MODE
});

// DOM Elements
const appContainer = document.getElementById("app-container");
const locationForm = document.getElementById("location-form");
const locationIdInput = document.getElementById("edit-location-id");
const locationNameInput = document.getElementById("location-name");
const locationLatInput = document.getElementById("location-lat");
const locationLngInput = document.getElementById("location-lng");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const saveLocationBtn = document.getElementById("save-location-btn");
const formTitle = document.getElementById("form-title");

const searchAddressInput = document.getElementById("search-address");
const searchAddressBtn = document.getElementById("search-address-btn");
const useCurrentLocationBtn = document.getElementById("use-current-location-btn");
const searchSuggestions = document.getElementById("search-suggestions");

if (!capabilities.externalRequests) {
  if (searchAddressInput) {
    searchAddressInput.disabled = true;
    searchAddressInput.title = "Address search is disabled in the static demo";
    searchAddressInput.placeholder = "Address search disabled in demo";
  }
  if (searchAddressBtn) {
    searchAddressBtn.disabled = true;
    searchAddressBtn.title = "Address search is disabled in the static demo";
  }
  if (useCurrentLocationBtn) {
    useCurrentLocationBtn.disabled = true;
    useCurrentLocationBtn.title = "Geolocation is disabled in the static demo";
  }
}
const logsListContainer = document.getElementById("logs-list-container");

const locationsListContainer = document.getElementById("locations-list-container");
const emptyStateView = document.getElementById("empty-state-view");
const locationsCountBadge = document.getElementById("locations-count-badge");
const forecastCardsContainer = document.getElementById("forecast-cards-container");
const forecastEmptyState = document.getElementById("forecast-empty-state");
const dashboardLastUpdated = document.getElementById("dashboard-last-updated");
const locationDrawer = document.getElementById("location-drawer");
const locationDrawerOverlay = document.getElementById("location-drawer-overlay");
const openLocationDrawerBtn = document.getElementById("open-location-drawer-btn");
const closeLocationDrawerBtn = document.getElementById("close-location-drawer-btn");

const dbSuccessBanner = document.getElementById("db-success-banner");
const dbErrorBanner = document.getElementById("db-error-banner");

const triggerTestBtn = document.getElementById("trigger-test-btn");
const triggerStatus = document.getElementById("trigger-status");
const triggerStatusText = document.getElementById("trigger-status-text");

const apiCreditsStatus = document.getElementById("api-credits-status");

// State
let locationsList = [];
let activityFilter = "runs";
let cachedRuns = [];
let cachedDeliveries = [];
let editingLocationId = null;
let expandedActivityIds = new Set();
let currentApplicationSettings = null;
let currentDisplayTimeZone = "America/New_York";

function updateDisplayTimeZone(settings) {
  currentApplicationSettings = settings;
  if (!settings) return;
  let deviceZone = undefined;
  try { deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
  currentDisplayTimeZone = resolveDisplayTimeZone(settings, deviceZone);
  renderForecastDashboard();
  if (activityFilter === "runs" || activityFilter === "deliveries") {
    renderActivityList();
  }
}

// Banner helpers bound to the shared banner elements
const showSuccess = (msg, duration) => showBanner(dbSuccessBanner, msg, duration);
const showError = (msg, duration) => showBanner(dbErrorBanner, msg, duration);

// Modal
const emailModal = initEmailSuccessModal();

// ── Location Drawer ──────────────────────────────────────────────────

function openLocationDrawer() {
  if (!locationDrawer) return;
  locationDrawer.classList.add("open");
  locationDrawer.setAttribute("aria-hidden", "false");
  if (locationDrawerOverlay) {
    locationDrawerOverlay.hidden = false;
    locationDrawerOverlay.classList.add("open");
  }
  document.body.classList.add("drawer-open");
  locationNameInput?.focus();
}

function closeLocationDrawer() {
  if (!locationDrawer) return;
  locationDrawer.classList.remove("open");
  locationDrawer.setAttribute("aria-hidden", "true");
  if (locationDrawerOverlay) {
    locationDrawerOverlay.classList.remove("open");
    locationDrawerOverlay.hidden = true;
  }
  document.body.classList.remove("drawer-open");
  resetForm();
}

openLocationDrawerBtn?.addEventListener("click", () => {
  resetForm();
  openLocationDrawer();
});
closeLocationDrawerBtn?.addEventListener("click", closeLocationDrawer);
locationDrawerOverlay?.addEventListener("click", closeLocationDrawer);

// ── Notification deliveries (shared state lives here) ────────────────

async function fetchNotificationDeliveries() {
  const response = await api.send("/api/notification-deliveries");
  if (!response.ok) throw new Error("Failed to load delivery history.");
  cachedDeliveries = await response.json();
  if (activityFilter === "deliveries") {
    renderActivityList();
  }
}

// ── Feature wiring ───────────────────────────────────────────────────

const { fetchNotificationSettings, fetchProviderCredentials } = initNotifications({
  api, 
  showBanner, 
  showSuccess, 
  showError, 
  DEMO_READ_ONLY,
  capabilities,
  CREDENTIAL_ADMIN_HEADER,
  fetchDeliveries: () => fetchNotificationDeliveries()
});

let globalScheduleTimes = ["06:00", "12:00", "18:00"];

const { fetchApplicationSettings } = initSchedule({
  api,
  showSuccess,
  showError,
  DEMO_READ_ONLY,
  capabilities,
  onSettingsUpdate: (data) => {
    if (Array.isArray(data?.scheduleTimes)) {
      globalScheduleTimes = data.scheduleTimes;
    }
    updateDisplayTimeZone(data);
  }
});

const { fetchLocationRules } = initThresholds({
  api,
  showSuccess,
  showError,
  locationsListContainer,
  DEMO_READ_ONLY,
  capabilities,
  getLocationsList: () => locationsList,
  getGlobalScheduleTimes: () => globalScheduleTimes,
  refreshLocations: () => fetchLocations()
});

initWebhook({
  api, 
  showSuccess, 
  showError, 
  DEMO_READ_ONLY,
  capabilities,
  CREDENTIAL_ADMIN_HEADER,
  fetchNotificationSettings
});

const { fetchOperationalStatus } = initHealth({ 
  api, 
  showSuccess, 
  showError, 
  DEMO_READ_ONLY,
  capabilities,
  formatDateTime: (iso) => formatDateTimeMediumWithZone(iso, currentDisplayTimeZone) 
});

const { refreshHistoryCounts } = initHistory({
  api, 
  showBanner, 
  showSuccess, 
  showError, 
  DEMO_READ_ONLY,
  capabilities,
  afterClear: () => Promise.all([
    fetchRuns(),
    fetchNotificationDeliveries(),
    fetchOperationalStatus()
  ])
});

const { fetchSetupChecklist } = initSetupStatus({ api, capabilities });

// ── Init ─────────────────────────────────────────────────────────────

let settingsStatePromise = null;
let activityStatePromise = null;

async function loadBrowserNotifications() {
  try {
    const { initBrowserNotifications } = await import("./features/browser-notifications.js");
    return initBrowserNotifications({
      api,
      showSuccess,
      showError,
      DEMO_READ_ONLY,
      capabilities
    });
  } catch (error) {
    console.warn("Browser notifications are unavailable.", error);
    const host = document.getElementById("web-push-devices");
    if (host) {
      host.textContent = "Browser notifications unavailable in this browser.";
    }
    const btn = document.getElementById("enable-web-push-btn");
    if (btn) {
      btn.disabled = true;
      btn.title = "Browser notifications unavailable in this browser";
    }
    return { fetchWebPushDevices: async () => {} };
  }
}

async function loadSettingsState() {
  if (settingsStatePromise) return settingsStatePromise;
  settingsStatePromise = (async () => {
    const browserNotifications = await loadBrowserNotifications();
    const outcomes = await Promise.allSettled([
      fetchNotificationSettings(),
      fetchProviderCredentials(),
      fetchOperationalStatus(),
      fetchSetupChecklist(),
      refreshHistoryCounts(),
      fetchLocationRules(),
      browserNotifications.fetchWebPushDevices()
    ]);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        console.warn("Settings panel failed to load:", outcome.reason);
        showBanner(dbErrorBanner, "Settings panel temporarily unavailable.", 6000);
        break;
      }
    }
  })();
  try {
    await settingsStatePromise;
  } catch (error) {
    settingsStatePromise = null;
    throw error;
  }
  return settingsStatePromise;
}

async function loadActivityState() {
  if (activityStatePromise) return activityStatePromise;
  activityStatePromise = (async () => {
    const outcomes = await Promise.allSettled([
      fetchNotificationDeliveries(),
      fetchApiCreditsStatus()
    ]);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        console.warn("Activity panel failed to load:", outcome.reason);
      }
    }
    renderActivityList();
  })();
  try {
    await activityStatePromise;
  } catch (error) {
    activityStatePromise = null;
    throw error;
  }
  return activityStatePromise;
}

function hideLoader() {
  const loader = document.getElementById("loading-overlay");
  if (loader) loader.classList.add("fade-out");
}

async function initApp() {
  try {
    appContainer.classList.remove("hidden");
    document.body.classList.add("app-visible");

    // Forecast-critical only — never block first paint on Secrets Store / credentials.
    await Promise.allSettled([
      fetchLocations(),
      fetchRuns(),
      fetchApplicationSettings()
    ]);
  } catch (error) {
    console.error("Initialization failed: ", error);
    showBanner(dbErrorBanner, `Initialization Error: ${error.message}`, 0);
  } finally {
    hideLoader();
  }
}

// ── Locations ────────────────────────────────────────────────────────

async function fetchLocations() {
  try {
    const response = await api.send("/api/locations");
    if (!response.ok) {
      throw new Error(`Failed to load locations: ${response.statusText}`);
    }
    locationsList = await response.json();
    renderLocations();
  } catch (error) {
    console.error("Error fetching locations:", error);
    showBanner(dbErrorBanner, "Failed to load locations: " + error.message);
  }
}

async function fetchRuns() {
  try {
    const response = await api.send("/api/runs");
    if (!response.ok) {
      throw new Error(`Failed to load logs: ${response.statusText}`);
    }
    cachedRuns = await response.json();
    if (activityFilter === "runs") {
      renderActivityList();
    }
  } catch (error) {
    console.error("Error fetching logs:", error);
  }
}

function renderLocations() {
  try {
    locationsCountBadge.textContent = `${locationsList.length} / 10`;
    locationsListContainer.innerHTML = "";

    if (locationsList.length === 0) {
      editingLocationId = null;
      locationsListContainer.appendChild(emptyStateView);
      emptyStateView.classList.remove("hidden");
      renderForecastDashboard();
      return;
    }

    emptyStateView.classList.add("hidden");

    const fragment = document.createDocumentFragment();

    const header = document.createElement("div");
    header.className = "location-table-header";
    header.innerHTML = `
      <div class="location-col-name">Name</div>
      <div class="location-col-coords">Coordinates</div>
      <div class="location-col-actions">Actions</div>
    `;
    fragment.appendChild(header);

    locationsList.forEach((location) => {
      const row = document.createElement("div");
      const isEditing = editingLocationId === location.id;
      row.className = "location-row" + (isEditing ? " is-editing" : "");
      row.setAttribute("data-id", location.id);

      if (isEditing) {
        row.innerHTML = `
          <div class="location-col-name">
            <input type="text" class="form-input location-inline-name" value="${escapeHtml(location.name)}" aria-label="Location name" required>
          </div>
          <div class="location-col-coords location-inline-coords">
            <input type="number" step="any" class="form-input location-inline-lat" value="${location.latitude}" aria-label="Latitude" min="-90" max="90" required>
            <input type="number" step="any" class="form-input location-inline-lng" value="${location.longitude}" aria-label="Longitude" min="-180" max="180" required>
          </div>
          <div class="location-col-actions location-actions">
            <button type="button" class="btn-icon save-inline-btn" data-id="${location.id}" title="Save" aria-label="Save location ${escapeHtml(location.name)}">
              <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">check</span>
            </button>
            <button type="button" class="btn-icon cancel-inline-btn" data-id="${location.id}" title="Cancel" aria-label="Cancel editing ${escapeHtml(location.name)}">
              <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
            </button>
          </div>
        `;
      } else {
        row.innerHTML = `
          <div class="location-col-name">${escapeHtml(location.name)}</div>
          <div class="location-col-coords">${formatCoordinateDisplay(location.latitude, location.longitude)}</div>
          <div class="location-col-actions location-actions">
            <button type="button" class="btn-icon edit-btn" data-id="${location.id}" title="Edit" aria-label="Edit location ${escapeHtml(location.name)}">
              <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">edit</span>
            </button>
            <button type="button" class="btn-icon btn-icon-danger delete-btn" data-id="${location.id}" title="Delete" aria-label="Delete location ${escapeHtml(location.name)}">
              <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">delete</span>
            </button>
          </div>
        `;
      }

      fragment.appendChild(row);
    });

    locationsListContainer.appendChild(fragment);

    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        startEditLocation(e.currentTarget.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        deleteLocation(e.currentTarget.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".save-inline-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const locId = e.currentTarget.getAttribute("data-id");
        const row = e.currentTarget.closest(".location-row");
        if (!row) return;
        const name = row.querySelector(".location-inline-name")?.value.trim();
        const latitude = parseFloat(row.querySelector(".location-inline-lat")?.value);
        const longitude = parseFloat(row.querySelector(".location-inline-lng")?.value);
        await saveInlineLocationEdit(locId, { name, latitude, longitude }, e.currentTarget);
      });
    });

    document.querySelectorAll(".cancel-inline-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingLocationId = null;
        renderLocations();
      });
    });

    if (editingLocationId) {
      const nameInput = locationsListContainer.querySelector(".location-inline-name");
      nameInput?.focus();
      nameInput?.select();
    }

    renderForecastDashboard();
  } catch (error) {
    console.error("Error in renderLocations:", error);
    showBanner(dbErrorBanner, "Render Error (Locations): " + error.message, 0);
  }
}

// ── Forecast Dashboard ───────────────────────────────────────────────

function formatForecastColumnDate(isoTime) {
  if (!isoTime) return "";
  const formatted = formatDateWithZone(Date.parse(isoTime), currentDisplayTimeZone);
  return `(${formatted})`;
}

function buildForecastEventColumnHtml({ timeText, badgeHtml, mobileLabel, errorHtml, emptyHtml }) {
  if (errorHtml) {
    return `<div class="forecast-event-col">${errorHtml}</div>`;
  }
  if (emptyHtml) {
    return `<div class="forecast-event-col">${emptyHtml}</div>`;
  }

  return `
    <div class="forecast-event-col">
      <span class="forecast-event-mobile-label">${mobileLabel}:</span>
      <span class="forecast-event-time">${timeText}</span>
      ${badgeHtml}
    </div>
  `;
}

function renderForecastDashboard() {
  try {
    if (!forecastCardsContainer) return;

    Array.from(forecastCardsContainer.children).forEach(child => {
      if (child !== forecastEmptyState) child.remove();
    });

    if (locationsList.length === 0) {
      if (forecastEmptyState) forecastEmptyState.classList.remove("hidden");
      if (dashboardLastUpdated) dashboardLastUpdated.textContent = "Last Run: N/A";
      return;
    }

    if (forecastEmptyState) forecastEmptyState.classList.add("hidden");

    let maxTimestamp = 0;
    let headerSunriseTime = null;
    let headerSunsetTime = null;

    locationsList.forEach((location) => {
      if (location.lastForecastUpdate && location.lastForecastUpdate > maxTimestamp) {
        maxTimestamp = location.lastForecastUpdate;
      }
      if (!headerSunriseTime && location.latestSunriseTime) {
        headerSunriseTime = location.latestSunriseTime;
      }
      if (!headerSunsetTime && location.latestSunsetTime) {
        headerSunsetTime = location.latestSunsetTime;
      }
    });

    const isSunsetFirst = headerSunriseTime && headerSunsetTime && Date.parse(headerSunsetTime) < Date.parse(headerSunriseTime);

    const table = document.createElement("div");
    table.className = "forecast-table";

    const header = document.createElement("div");
    header.className = "forecast-table-header";
    header.innerHTML = `
      <div class="forecast-table-header-location">Location</div>
      ${isSunsetFirst
        ? `<div class="forecast-table-header-col">Next Sunset ${formatForecastColumnDate(headerSunsetTime)}</div>
           <div class="forecast-table-header-col">Next Sunrise ${formatForecastColumnDate(headerSunriseTime)}</div>`
        : `<div class="forecast-table-header-col">Next Sunrise ${formatForecastColumnDate(headerSunriseTime)}</div>
           <div class="forecast-table-header-col">Next Sunset ${formatForecastColumnDate(headerSunsetTime)}</div>`
      }
    `;
    table.appendChild(header);

    locationsList.forEach((location) => {
      const hasForecast = location.latestSunriseTime !== undefined && location.latestSunriseTime !== null;
      const sunriseBadge = getForecastBadgeHtml(location.latestSunriseQuality, location.latestSunriseText);
      const sunsetBadge = getForecastBadgeHtml(location.latestSunsetQuality, location.latestSunsetText);

      const sunriseTimeText = location.latestSunriseTime
        ? formatTimeWithZone(Date.parse(location.latestSunriseTime), currentDisplayTimeZone)
        : "—";
      const sunsetTimeText = location.latestSunsetTime
        ? formatTimeWithZone(Date.parse(location.latestSunsetTime), currentDisplayTimeZone)
        : "—";

      let sunriseColHtml;
      let sunsetColHtml;

      if (location.forecastError) {
        const errHtml = `<span class="forecast-error-text">⚠️ ${escapeHtml(location.forecastError)}</span>`;
        sunriseColHtml = buildForecastEventColumnHtml({ errorHtml: errHtml });
        sunsetColHtml = buildForecastEventColumnHtml({ errorHtml: errHtml });
      } else if (!hasForecast) {
        const emptyHtml = `<span class="forecast-no-data">No forecast cached yet</span>`;
        sunriseColHtml = buildForecastEventColumnHtml({ emptyHtml });
        sunsetColHtml = buildForecastEventColumnHtml({ emptyHtml });
      } else {
        sunriseColHtml = buildForecastEventColumnHtml({
          timeText: sunriseTimeText,
          badgeHtml: sunriseBadge,
          mobileLabel: "Sunrise"
        });
        sunsetColHtml = buildForecastEventColumnHtml({
          timeText: sunsetTimeText,
          badgeHtml: sunsetBadge,
          mobileLabel: "Sunset"
        });
      }

      const row = document.createElement("div");
      row.className = "forecast-table-row";
      row.id = `forecast-row-${location.id}`;
      row.innerHTML = `
        <div class="forecast-table-location">${escapeHtml(location.name)}</div>
        ${isSunsetFirst ? sunsetColHtml : sunriseColHtml}
        ${isSunsetFirst ? sunriseColHtml : sunsetColHtml}
      `;
      table.appendChild(row);
    });

    forecastCardsContainer.appendChild(table);

    if (dashboardLastUpdated) {
      if (maxTimestamp > 0) {
        const timeStr = formatDateTimeMediumWithZone(maxTimestamp, currentDisplayTimeZone);
        dashboardLastUpdated.textContent = `Last Run: ${timeStr}`;
      } else {
        dashboardLastUpdated.textContent = "Last Run: Never";
      }
    }
  } catch (error) {
    console.error("Error in renderForecastDashboard:", error);
    if (forecastCardsContainer) {
      forecastCardsContainer.innerHTML = `<div class="empty-state"><p>⚠️ Render Error: ${escapeHtml(error.message)}</p></div>`;
    }
  }
}

// ── Location CRUD ────────────────────────────────────────────────────

async function updateLocation(id, { name, latitude, longitude }) {
  const response = await api.send(`/api/locations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, latitude, longitude })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}

async function saveInlineLocationEdit(id, { name, latitude, longitude }, saveBtn) {
  if (!capabilities.mutations) {
    showBanner(dbErrorBanner, "Editing locations is disabled in the static demo.");
    return;
  }
  if (!name) {
    showBanner(dbErrorBanner, "Location Name is required.");
    return;
  }
  if (!validateCoordinates(latitude, longitude)) {
    showBanner(dbErrorBanner, "Latitude and Longitude must be valid numbers.");
    return;
  }

  const originalHtml = saveBtn?.innerHTML;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></span>';
  }

  try {
    await updateLocation(id, { name, latitude, longitude });
    showBanner(dbSuccessBanner, `Location "${name}" updated successfully.`);
    editingLocationId = null;
    await fetchLocations();
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Database Error: " + error.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

locationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!capabilities.mutations) {
    showBanner(dbErrorBanner, "Editing locations is disabled in the static demo.");
    return;
  }

  const id = locationIdInput.value;
  const name = locationNameInput.value.trim();
  const latitude = parseFloat(locationLatInput.value);
  const longitude = parseFloat(locationLngInput.value);

  if (!name) {
    showBanner(dbErrorBanner, "Location Name is required.");
    return;
  }

  if (!validateCoordinates(latitude, longitude)) {
    showBanner(dbErrorBanner, "Latitude and Longitude must be valid numbers.");
    return;
  }

  saveLocationBtn.disabled = true;
  const originalSaveText = saveLocationBtn.innerHTML;
  saveLocationBtn.innerHTML = '<span class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></span><span>Saving...</span>';

  try {
    if (id) {
      await updateLocation(id, { name, latitude, longitude });
      showBanner(dbSuccessBanner, `Location "${name}" updated successfully.`);
      closeLocationDrawer();
    } else {
      if (!canAddLocation(locationsList.length)) {
        showBanner(dbErrorBanner, "Limit reached: You can monitor a maximum of 10 locations.");
        return;
      }
      const response = await api.send("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, latitude, longitude })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      showBanner(dbSuccessBanner, `Location "${name}" added successfully.`);
      closeLocationDrawer();
    }
    await fetchLocations();
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Database Error: " + error.message);
  } finally {
    saveLocationBtn.disabled = false;
    saveLocationBtn.innerHTML = originalSaveText;
  }
});

function startEditLocation(id) {
  editingLocationId = id;
  renderLocations();
}

function resetForm() {
  locationIdInput.value = "";
  locationNameInput.value = "";
  locationLatInput.value = "";
  locationLngInput.value = "";

  formTitle.textContent = "Add Location";
  saveLocationBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span><span>Save Location</span>';
}

cancelEditBtn.addEventListener("click", closeLocationDrawer);

async function deleteLocation(id) {
  if (!capabilities.mutations) {
    showBanner(dbErrorBanner, "Deleting locations is disabled in the static demo.");
    return;
  }
  const loc = locationsList.find(l => l.id === id);
  if (!loc) return;

  if (confirm(`Are you sure you want to delete "${loc.name}"?`)) {
    try {
      const response = await api.send(`/api/locations/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      showBanner(dbSuccessBanner, `Location "${loc.name}" deleted.`);
      if (locationIdInput.value === id) {
        resetForm();
      }
      await fetchLocations();
    } catch (error) {
      console.error(error);
      showBanner(dbErrorBanner, "Delete failed: " + error.message);
    }
  }
}

// ── Trigger Report ───────────────────────────────────────────────────

triggerTestBtn.addEventListener("click", async () => {
  if (!capabilities.mutations) {
    showBanner(dbErrorBanner, "Manual report execution is disabled in the static demo.");
    return;
  }
  if (locationsList.length === 0) {
    showBanner(dbErrorBanner, "Cannot trigger test: You need to add at least 1 location.");
    return;
  }

  try {
    triggerTestBtn.disabled = true;
    triggerStatus.classList.remove("hidden");
    triggerStatus.setAttribute("aria-hidden", "false");
    if (triggerStatusText) triggerStatusText.textContent = "Sending…";

    const reportResponse = await api.send("/api/triggerReport", {
      method: "POST"
    });

    const result = await reportResponse.json();

    if (!reportResponse.ok) {
      throw new Error(result.error || "Failed to trigger email report.");
    }

    emailModal.show();
    await Promise.all([
      fetchApiCreditsStatus(),
      fetchRuns(),
      fetchLocations()
    ]);
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Trigger Failed: " + error.message);
  } finally {
    triggerTestBtn.disabled = false;
    triggerStatus.classList.add("hidden");
    triggerStatus.setAttribute("aria-hidden", "true");
  }
});

// ── Geolocation ──────────────────────────────────────────────────────

useCurrentLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showBanner(dbErrorBanner, "Geolocation is not supported by your browser.");
    return;
  }

  useCurrentLocationBtn.disabled = true;
  const originalText = useCurrentLocationBtn.textContent;
  useCurrentLocationBtn.textContent = "📍 Locating...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      locationLatInput.value = position.coords.latitude.toFixed(6);
      locationLngInput.value = position.coords.longitude.toFixed(6);
      showBanner(dbSuccessBanner, "Current location loaded.");
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = originalText;

      if (!locationNameInput.value) {
        locationNameInput.value = "Current Location";
      }
    },
    (error) => {
      console.error(error);
      let errMsg = mapGeolocationError(error.code, error);
      showBanner(dbErrorBanner, errMsg);
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = originalText;
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
  );
});

// ── Address Search & Autocomplete ────────────────────────────────────

async function performAddressSearch() {
  if (!capabilities.externalRequests) {
    showBanner(dbErrorBanner, "Address search is disabled in the static demo.");
    return;
  }
  const queryText = searchAddressInput.value.trim();
  if (!queryText) {
    showBanner(dbErrorBanner, "Please enter an address or city to search.");
    return;
  }

  searchAddressBtn.disabled = true;
  const searchIcon = searchAddressBtn.querySelector(".material-symbols-outlined");
  if (searchIcon) searchIcon.textContent = "hourglass_empty";

  try {
    const response = await api.send("/api/searchCoordinates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryText })
    });

    if (!response.ok) {
      const errorJson = await response.json();
      throw new Error(errorJson.error || "Search service failed.");
    }
    const results = await response.json();

    if (results && results.length > 0) {
      const match = results[0];
      const lat = parseFloat(match.lat);
      const lon = parseFloat(match.lon);

      locationLatInput.value = lat.toFixed(6);
      locationLngInput.value = lon.toFixed(6);

      if (!locationNameInput.value || locationNameInput.value === "Current Location") {
        const shortName = match.display_name.split(",")[0].trim();
        locationNameInput.value = shortName;
      }

      showBanner(dbSuccessBanner, `Found: ${match.display_name}`);
      searchAddressInput.value = "";
      searchSuggestions.classList.add("hidden");
      searchAddressInput.setAttribute('aria-expanded', 'false');
      searchAddressInput.removeAttribute('aria-activedescendant');
    } else {
      showBanner(dbErrorBanner, "No locations found. Try a different search term.");
    }
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Search failed: " + error.message);
  } finally {
    searchAddressBtn.disabled = false;
    const icon = searchAddressBtn.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "search";
  }
}

searchAddressBtn.addEventListener("click", performAddressSearch);

let autocompleteTimeout = null;
let activeSuggestionIndex = -1;
let currentSuggestions = [];

searchAddressInput.addEventListener("keydown", (e) => {
  const items = searchSuggestions.querySelectorAll(".suggestion-item");

  if (items.length === 0) {
    if (e.key === "Enter") {
      e.preventDefault();
      performAddressSearch();
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSuggestionIndex = moveSuggestionIndex(activeSuggestionIndex, 1, items.length);
    updateActiveSuggestion(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSuggestionIndex = moveSuggestionIndex(activeSuggestionIndex, -1, items.length);
    updateActiveSuggestion(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
      items[activeSuggestionIndex].click();
    } else {
      performAddressSearch();
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    searchSuggestions.classList.add("hidden");
    searchAddressInput.setAttribute('aria-expanded', 'false');
    searchAddressInput.removeAttribute('aria-activedescendant');
    activeSuggestionIndex = -1;
  }
});

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    if (index === activeSuggestionIndex) {
      item.classList.add("active");
      item.setAttribute("aria-selected", "true");
      searchAddressInput.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    }
  });
}

searchAddressInput.addEventListener("input", () => {
  clearTimeout(autocompleteTimeout);

  if (!capabilities.externalRequests) {
    searchSuggestions.classList.add("hidden");
    searchSuggestions.innerHTML = "";
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    return;
  }

  const queryText = searchAddressInput.value.trim();
  if (!shouldSearchAutocomplete(queryText)) {
    searchSuggestions.classList.add("hidden");
    searchAddressInput.setAttribute('aria-expanded', 'false');
    searchAddressInput.removeAttribute('aria-activedescendant');
    searchSuggestions.innerHTML = "";
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    return;
  }

  autocompleteTimeout = setTimeout(async () => {
    try {
      const response = await api.send("/api/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText })
      });
      if (!response.ok) return;
      const data = await response.json();

      if (data && data.features && data.features.length > 0) {
        renderSuggestions(data.features);
      } else {
        searchSuggestions.classList.add("hidden");
        searchAddressInput.setAttribute('aria-expanded', 'false');
        searchAddressInput.removeAttribute('aria-activedescendant');
        searchSuggestions.innerHTML = "";
        currentSuggestions = [];
        activeSuggestionIndex = -1;
      }
    } catch (err) {
      console.error("Autocomplete error:", err);
    }
  }, 250);
});

function renderSuggestions(features) {
  searchSuggestions.innerHTML = "";
  searchSuggestions.classList.remove("hidden");
  searchAddressInput.setAttribute('aria-expanded', 'true');
  activeSuggestionIndex = -1;
  currentSuggestions = features;

  const fragment = document.createDocumentFragment();

  features.forEach((feature, index) => {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    const displayName = buildPhotonDisplayName(props);

    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.id = `suggestion-${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.textContent = displayName;
    item.setAttribute("data-index", index);

    item.addEventListener("click", () => {
      const lon = coords[0];
      const lat = coords[1];

      locationLatInput.value = lat.toFixed(6);
      locationLngInput.value = lon.toFixed(6);
      locationNameInput.value = props.name;

      searchAddressInput.value = "";
      searchSuggestions.classList.add("hidden");
      searchAddressInput.setAttribute('aria-expanded', 'false');
      searchAddressInput.removeAttribute('aria-activedescendant');
      searchSuggestions.innerHTML = "";
      currentSuggestions = [];
      activeSuggestionIndex = -1;

      showBanner(dbSuccessBanner, `Selected location: ${displayName}`);
      locationNameInput.focus();
    });

    fragment.appendChild(item);
  });

  searchSuggestions.appendChild(fragment);
}

document.addEventListener("click", (e) => {
  if (!searchAddressInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
    searchSuggestions.classList.add("hidden");
    searchAddressInput.setAttribute('aria-expanded', 'false');
    searchAddressInput.removeAttribute('aria-activedescendant');
    activeSuggestionIndex = -1;
  }
});

// ── API Credits ──────────────────────────────────────────────────────

async function fetchApiCreditsStatus() {
  if (!apiCreditsStatus) return;

  apiCreditsStatus.classList.remove("error");
  apiCreditsStatus.textContent = "Loading API credits…";

  try {
    const response = await api.send("/api/getApiCredits");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to load API credits.");
    }
    
    if (result && typeof result.remaining === "number") {
      let label = `${result.remaining} / ${result.limit}`;
      if (result.resetAt) {
        const resetText = formatTimeShortWithZone(result.resetAt, currentDisplayTimeZone);
        label += ` · resets ${resetText}`;
      }
      apiCreditsStatus.textContent = label;
    }
  } catch (error) {
    console.error(error);
    apiCreditsStatus.classList.add("error");
    apiCreditsStatus.textContent = `Unable to load API credits: ${error.message}`;
  }
}

// ── Activity List ────────────────────────────────────────────────────

function buildActivityListItem({
  itemKey,
  summaryText,
  badgeClass,
  badgeText,
  detailsHtml = "",
  expandable = false
}) {
  const isExpanded = expandable && expandedActivityIds.has(itemKey);
  const logItem = document.createElement("div");
  logItem.className = "log-item" + (isExpanded ? " expanded" : "") + (expandable ? " is-expandable" : "");
  logItem.setAttribute("data-activity-key", itemKey);
  if (expandable) {
    logItem.setAttribute("role", "button");
    logItem.setAttribute("tabindex", "0");
    logItem.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  }

  logItem.innerHTML = `
    <div class="log-item-summary">
      <div class="log-item-summary-main">
        ${expandable ? `<span class="material-symbols-outlined log-item-chevron" aria-hidden="true">expand_more</span>` : ""}
        <span class="log-time">${summaryText}</span>
      </div>
      <span class="log-badge ${badgeClass}">${badgeText}</span>
    </div>
    ${expandable ? `<div class="log-item-details"${isExpanded ? "" : " hidden"}>${detailsHtml}</div>` : ""}
  `;

  if (expandable) {
    const toggle = () => {
      if (expandedActivityIds.has(itemKey)) {
        expandedActivityIds.delete(itemKey);
        logItem.classList.remove("expanded");
        logItem.setAttribute("aria-expanded", "false");
        logItem.querySelector(".log-item-details")?.setAttribute("hidden", "");
      } else {
        expandedActivityIds.add(itemKey);
        logItem.classList.add("expanded");
        logItem.setAttribute("aria-expanded", "true");
        logItem.querySelector(".log-item-details")?.removeAttribute("hidden");
      }
    };
    logItem.addEventListener("click", toggle);
    logItem.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  }

  return logItem;
}

function renderActivityList() {
  if (!logsListContainer) return;
  logsListContainer.innerHTML = "";

  const selfTestNote = document.getElementById("activity-selftest-summary");
  if (selfTestNote && window.__lastSelfTestSummary) {
    selfTestNote.textContent = window.__lastSelfTestSummary;
    selfTestNote.hidden = false;
  }

  if (activityFilter === "deliveries") {
    if (!cachedDeliveries.length) {
      logsListContainer.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">notifications</span><p>No notification deliveries yet.</p></div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    cachedDeliveries.forEach((delivery, index) => {
      const status = String(delivery.status || "unknown").toLowerCase();
      const badgeClass = status.includes("fail") || status.includes("error")
        ? "failure"
        : status.includes("warn") || status.includes("pending") || status.includes("retry")
          ? "warning"
          : "success";
      const timeText = delivery.updatedAt || delivery.createdAt
        ? formatDateTimeMediumWithZone(Date.parse(delivery.updatedAt || delivery.createdAt), currentDisplayTimeZone)
        : "—";
      const itemKey = `delivery:${delivery.id || index}`;
      const hasDetails = Boolean(delivery.lastErrorCode);
      fragment.appendChild(buildActivityListItem({
        itemKey,
        summaryText: `${timeText} · ${escapeHtml(delivery.channel || "—")} · ${delivery.attempts ?? 0} attempts`,
        badgeClass,
        badgeText: escapeHtml(String(delivery.status || "UNKNOWN").toUpperCase()),
        expandable: hasDetails,
        detailsHtml: hasDetails
          ? `<div class="log-detail-chips"><span class="log-detail-chip log-detail-chip-error">Error: ${escapeHtml(delivery.lastErrorCode)}</span></div>`
          : ""
      }));
    });
    logsListContainer.appendChild(fragment);
    return;
  }

  if (!cachedRuns.length) {
    logsListContainer.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">history</span><p>No execution logs found yet.</p></div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  cachedRuns.forEach((log, index) => {
    const dateText = formatDateTimeMediumWithZone(log.timestamp, currentDisplayTimeZone);
    const statusClass = getLogStatusClass(log.status);
    const statusText = log.status.toUpperCase();
    const itemKey = `run:${log.id || index}`;

    let detailsHtml = "";
    let expandable = false;
    if (log.error) {
      expandable = true;
      detailsHtml = `<div class="log-detail-chips"><span class="log-detail-chip log-detail-chip-error">Error: ${escapeHtml(log.error)}</span></div>`;
    } else if (log.results && log.results.length > 0) {
      expandable = true;
      const chips = log.results.map((r) => {
        const failed = r.status === "error";
        const label = `${escapeHtml(r.name)} · ${failed ? "Failed" : "Success"}`;
        return `<span class="log-detail-chip${failed ? " log-detail-chip-error" : ""}">${label}</span>`;
      }).join("");
      detailsHtml = `<div class="log-detail-chips">${chips}</div>`;
    }

    fragment.appendChild(buildActivityListItem({
      itemKey,
      summaryText: `${dateText} · ${escapeHtml(log.triggerType)} · ${log.locationsCount} locations`,
      badgeClass: statusClass,
      badgeText: statusText,
      expandable,
      detailsHtml
    }));
  });

  logsListContainer.appendChild(fragment);
}

function setActivityFilter(filter) {
  activityFilter = filter === "deliveries" ? "deliveries" : "runs";
  document.querySelectorAll(".activity-filter-btn").forEach((btn) => {
    const isActive = btn.getAttribute("data-activity-filter") === activityFilter;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (logsListContainer) {
    logsListContainer.setAttribute(
      "aria-labelledby",
      activityFilter === "deliveries" ? "activity-filter-deliveries" : "activity-filter-runs"
    );
  }
  renderActivityList();
}

document.querySelectorAll(".activity-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.getAttribute("data-activity-filter");
    if (filter) setActivityFilter(filter);
  });
});

// ── Tab Switching ────────────────────────────────────────────────────

const allNavButtons = document.querySelectorAll(".nav-tab, .bottom-nav-item, .settings-gear-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

function switchTab(targetTab) {
  allNavButtons.forEach(b => {
    const tab = b.getAttribute("data-tab");
    const isActive = tab === targetTab;
    if (b.classList.contains("bottom-nav-item") && targetTab === "settings") {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
      return;
    }
    if (isActive) {
      b.classList.add("active");
      b.setAttribute("aria-selected", "true");
    } else {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    }
  });
  tabPanes.forEach(p => p.classList.remove("active"));
  const activePane = document.getElementById(`pane-${targetTab}`);
  if (activePane) activePane.classList.add("active");

  if (targetTab === "activity") {
    void loadActivityState();
  }
  if (targetTab === "settings") {
    void loadSettingsState();
  }
}

allNavButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");
    if (targetTab) switchTab(targetTab);
  });
});

const logoHomeBtn = document.getElementById("logo-home-btn");
if (logoHomeBtn) {
  logoHomeBtn.addEventListener("click", () => switchTab("main"));
}

// ── Keyboard shortcuts ───────────────────────────────────────────────

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && emailModal.isOpen()) {
    emailModal.hide();
    return;
  }
  if (event.key === "Escape" && locationDrawer?.classList.contains("open")) {
    closeLocationDrawer();
    return;
  }
  if (event.key === "Escape" && editingLocationId) {
    editingLocationId = null;
    renderLocations();
  }
});

// ── Run ──────────────────────────────────────────────────────────────

initApp();
