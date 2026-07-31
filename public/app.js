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

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit"
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric"
});
const dateTimeFormatterMedium = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short"
});
const timeFormatterShort = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeStyle: "short"
});

const DEBUG = typeof window !== "undefined" && (
  window.location.search.includes("debug=true") || 
  localStorage.getItem("debug") === "true"
);

// Same-origin API through Pages Functions -> private Worker service binding.
// Local Pages (`npm run dev`) also uses relative /api/* via the service binding.
const API_BASE = "";

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

const logsListContainer = document.getElementById("logs-list-container");

const locationsListContainer = document.getElementById("locations-list-container");
const emptyStateView = document.getElementById("empty-state-view");
const locationsCountBadge = document.getElementById("locations-count-badge");
const forecastCardsContainer = document.getElementById("forecast-cards-container");
const forecastEmptyState = document.getElementById("forecast-empty-state");
const dashboardLastUpdated = document.getElementById("dashboard-last-updated");

const dbSuccessBanner = document.getElementById("db-success-banner");
const dbErrorBanner = document.getElementById("db-error-banner");

const triggerTestBtn = document.getElementById("trigger-test-btn");
const triggerStatus = document.getElementById("trigger-status");
const triggerStatusText = document.getElementById("trigger-status-text");

const emailSuccessModal = document.getElementById("email-success-modal");
const emailSuccessModalMessage = document.getElementById("email-success-modal-message");
const emailSuccessModalClose = document.getElementById("email-success-modal-close");
const emailSuccessModalDone = document.getElementById("email-success-modal-done");

const apiCreditsStatus = document.getElementById("api-credits-status");
const notificationSettingsForm = document.getElementById("notification-settings-form");
const notificationEmailEnabled = document.getElementById("notification-email-enabled");
const notificationEmailTo = document.getElementById("notification-email-to");
const notificationPushoverEnabled = document.getElementById("notification-pushover-enabled");
const notificationDevice = document.getElementById("notification-device");
const notificationPriority = document.getElementById("notification-priority");
const notificationSound = document.getElementById("notification-sound");
const notificationEmailStatus = document.getElementById("notification-email-status");
const notificationPushoverStatus = document.getElementById("notification-pushover-status");
const notificationDeliveries = document.getElementById("notification-deliveries");
const gmailCredentialsForm = document.getElementById("gmail-credentials-form");
const gmailCredentialsStatus = document.getElementById("gmail-credentials-status");
const gmailUserInput = document.getElementById("gmail-user");
const gmailAppPasswordInput = document.getElementById("gmail-app-password");
const gmailEmailFromInput = document.getElementById("gmail-email-from");
const pushoverCredentialsForm = document.getElementById("pushover-credentials-form");
const pushoverCredentialsStatus = document.getElementById("pushover-credentials-status");
const pushoverAppTokenInput = document.getElementById("pushover-app-token");
const pushoverUserKeyInput = document.getElementById("pushover-user-key");

const CREDENTIAL_ADMIN_HEADER = { "X-Sunsethue-Admin": "credentials" };

// State
let locationsList = [];

// Banner Utility
const bannerTimeouts = new Map();

function showBanner(bannerElement, message, duration = 5000) {
  if (!bannerElement) return;
  if (bannerTimeouts.has(bannerElement)) {
    clearTimeout(bannerTimeouts.get(bannerElement));
  }
  bannerElement.textContent = message;
  bannerElement.classList.add("show");
  bannerElement.style.display = "block";
  
  if (duration > 0) {
    const timeoutId = setTimeout(() => {
      bannerElement.classList.remove("show");
      bannerElement.style.display = "none";
      bannerTimeouts.delete(bannerElement);
    }, duration);
    bannerTimeouts.set(bannerElement, timeoutId);
  }
}

function hideBanner(bannerElement) {
  if (!bannerElement) return;
  if (bannerTimeouts.has(bannerElement)) {
    clearTimeout(bannerTimeouts.get(bannerElement));
    bannerTimeouts.delete(bannerElement);
  }
  bannerElement.style.display = "none";
  bannerElement.textContent = "";
}

function showEmailSuccessModal() {
  if (!emailSuccessModal) return;
  if (emailSuccessModalMessage) {
    emailSuccessModalMessage.textContent = `Success! Test report email sent.`;
  }
  emailSuccessModal.classList.remove("hidden");
  emailSuccessModal.classList.add("is-open");
  emailSuccessModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  emailSuccessModalDone?.focus();
}

function hideEmailSuccessModal() {
  if (!emailSuccessModal) return;
  emailSuccessModal.classList.add("hidden");
  emailSuccessModal.classList.remove("is-open");
  emailSuccessModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

if (emailSuccessModalClose) {
  emailSuccessModalClose.addEventListener("click", hideEmailSuccessModal);
}
if (emailSuccessModalDone) {
  emailSuccessModalDone.addEventListener("click", hideEmailSuccessModal);
}
if (emailSuccessModal) {
  emailSuccessModal.addEventListener("click", (event) => {
    if (event.target === emailSuccessModal) {
      hideEmailSuccessModal();
    }
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && emailSuccessModal?.classList.contains("is-open")) {
    hideEmailSuccessModal();
  }
});

// Load Initial Data
async function initApp() {
  const loader = document.getElementById("loading-overlay");
  try {
    appContainer.classList.remove("hidden");
    document.body.classList.add("app-visible");

    // Locations and runs power the primary UI, so their failures must surface
    // loudly. Notification settings and delivery history are secondary — a
    // notification-provider outage should not black out the main dashboard.
    await Promise.all([fetchLocations(), fetchRuns()]);
    const notificationOutcomes = await Promise.allSettled([
      fetchNotificationSettings(),
      fetchNotificationDeliveries(),
      fetchProviderCredentials()
    ]);
    for (const outcome of notificationOutcomes) {
      if (outcome.status === "rejected") {
        console.warn("Notification panel failed to load:", outcome.reason);
        showBanner(dbErrorBanner, "Notification panel temporarily unavailable.", 6000);
        break;
      }
    }
  } catch (error) {
    console.error("Initialization failed: ", error);
    showBanner(dbErrorBanner, `Initialization Error: ${error.message}`, 0);
  } finally {
    if (loader) {
      loader.classList.add("fade-out");
    }
  }
}

async function fetchNotificationSettings() {
  const response = await fetch(`${API_BASE}/api/notification-settings`);
  if (!response.ok) throw new Error("Failed to load notification settings.");
  const settings = await response.json();
  notificationEmailEnabled.checked = settings.emailEnabled;
  notificationEmailTo.value = settings.emailTo || "";
  notificationPushoverEnabled.checked = settings.pushoverEnabled;
  notificationDevice.value = settings.pushoverDevice || "";
  notificationPriority.value = String(settings.pushoverPriority);
  notificationSound.value = settings.pushoverSound || "";
  notificationEmailStatus.textContent = settings.emailConfigured ? "Email transport configured" : "Email transport not configured";
  notificationPushoverStatus.textContent = settings.pushoverConfigured ? "Pushover configured" : "Pushover not configured";
}

function formatCredentialUpdatedAt(value) {
  if (!value) return "";
  try {
    return ` · updated ${new Date(value).toLocaleString()}`;
  } catch {
    return "";
  }
}

function applyProviderCredentialStatus(status, { merge = false } = {}) {
  if (gmailCredentialsStatus && (!merge || status?.email !== undefined)) {
    if (status?.email?.configured) {
      gmailCredentialsStatus.textContent = `Configured: ${status.email.gmailUserMasked || "masked"}${status.email.emailFromMasked ? ` · from ${status.email.emailFromMasked}` : ""}${formatCredentialUpdatedAt(status.email.updatedAt)}`;
    } else if (!merge || status?.email) {
      gmailCredentialsStatus.textContent = "Not configured";
    }
  }
  if (pushoverCredentialsStatus && (!merge || status?.pushover !== undefined)) {
    if (status?.pushover?.configured) {
      pushoverCredentialsStatus.textContent = `Configured · app token ${status.pushover.appTokenPresent ? "present" : "missing"} · user key ${status.pushover.userKeyPresent ? "present" : "missing"}${formatCredentialUpdatedAt(status.pushover.updatedAt)}`;
    } else if (!merge || status?.pushover) {
      pushoverCredentialsStatus.textContent = "Not configured";
    }
  }
  // Never prepopulate secret fields.
  if (gmailAppPasswordInput) gmailAppPasswordInput.value = "";
  if (pushoverAppTokenInput) pushoverAppTokenInput.value = "";
  if (pushoverUserKeyInput) pushoverUserKeyInput.value = "";
}

async function fetchProviderCredentials() {
  const response = await fetch(`${API_BASE}/api/provider-credentials`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message || "Failed to load provider credentials.";
    const code = payload?.error?.code;
    throw new Error(code ? `${message} (${code})` : message);
  }
  applyProviderCredentialStatus(await response.json());
}

async function refreshProviderCredentialsAfterMutation(partialStatus) {
  // Apply the mutation response immediately so the UI updates even if GET flakes.
  if (partialStatus) applyProviderCredentialStatus(partialStatus, { merge: true });
  try {
    await fetchProviderCredentials();
  } catch (error) {
    // Keep the success banner / applied status; surface reload failure separately.
    showBanner(dbErrorBanner, error.message);
  }
}

async function fetchNotificationDeliveries() {
  const response = await fetch(`${API_BASE}/api/notification-deliveries`);
  if (!response.ok) throw new Error("Failed to load delivery history.");
  const deliveries = await response.json();
  notificationDeliveries.replaceChildren();
  if (!deliveries.length) { notificationDeliveries.textContent = "No notification deliveries yet."; return; }
  const list = document.createElement("ul");
  deliveries.forEach((delivery) => {
    const item = document.createElement("li");
    item.textContent = `${delivery.channel}: ${delivery.status} · attempts ${delivery.attempts}${delivery.lastErrorCode ? ` · ${delivery.lastErrorCode}` : ""}`;
    list.appendChild(item);
  });
  notificationDeliveries.appendChild(list);
}

notificationSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { emailEnabled: notificationEmailEnabled.checked, emailTo: notificationEmailTo.value || null, pushoverEnabled: notificationPushoverEnabled.checked, pushoverDevice: notificationDevice.value || null, pushoverPriority: Number(notificationPriority.value), pushoverSound: notificationSound.value || null };
  try {
    const response = await fetch(`${API_BASE}/api/notification-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Notification settings were not accepted.");
    showBanner(dbSuccessBanner, "Notification settings saved.");
    await fetchNotificationSettings();
  } catch (error) { showBanner(dbErrorBanner, error.message); }
});

gmailCredentialsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("save-gmail-credentials-btn");
  saveBtn && (saveBtn.disabled = true);
  try {
    const body = {
      gmailUser: gmailUserInput?.value || "",
      gmailAppPassword: gmailAppPasswordInput?.value || "",
      emailFrom: gmailEmailFromInput?.value || ""
    };
    const response = await fetch(`${API_BASE}/api/provider-credentials/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...CREDENTIAL_ADMIN_HEADER },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || "Unable to save Gmail credentials.";
      const code = payload?.error?.code;
      throw new Error(code ? `${message} (${code})` : message);
    }
    const payload = await response.json();
    if (gmailAppPasswordInput) gmailAppPasswordInput.value = "";
    showBanner(dbSuccessBanner, "Gmail credentials saved.");
    await refreshProviderCredentialsAfterMutation({ email: payload.email });
    await fetchNotificationSettings().catch(() => {});
  } catch (error) {
    showBanner(dbErrorBanner, error.message);
  } finally {
    saveBtn && (saveBtn.disabled = false);
    saveBtn?.focus();
  }
});

document.getElementById("remove-gmail-credentials-btn")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  if (!window.confirm("Remove Gmail credentials? Email delivery will be disabled until new credentials are saved.")) {
    btn.focus();
    return;
  }
  btn.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/provider-credentials/email`, {
      method: "DELETE",
      headers: { ...CREDENTIAL_ADMIN_HEADER }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || "Unable to remove Gmail credentials.";
      const code = payload?.error?.code;
      throw new Error(code ? `${message} (${code})` : message);
    }
    const payload = await response.json();
    showBanner(dbSuccessBanner, "Gmail credentials removed.");
    await refreshProviderCredentialsAfterMutation({ email: payload.email });
    await fetchNotificationSettings().catch(() => {});
  } catch (error) {
    showBanner(dbErrorBanner, error.message);
  } finally {
    btn.disabled = false;
    btn.focus();
  }
});

pushoverCredentialsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("save-pushover-credentials-btn");
  saveBtn && (saveBtn.disabled = true);
  try {
    const body = {
      appToken: pushoverAppTokenInput?.value || "",
      userKey: pushoverUserKeyInput?.value || ""
    };
    const response = await fetch(`${API_BASE}/api/provider-credentials/pushover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...CREDENTIAL_ADMIN_HEADER },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || "Unable to save Pushover credentials.";
      const code = payload?.error?.code;
      throw new Error(code ? `${message} (${code})` : message);
    }
    const payload = await response.json();
    if (pushoverAppTokenInput) pushoverAppTokenInput.value = "";
    if (pushoverUserKeyInput) pushoverUserKeyInput.value = "";
    showBanner(dbSuccessBanner, "Pushover credentials saved.");
    await refreshProviderCredentialsAfterMutation({ pushover: payload.pushover });
    await fetchNotificationSettings().catch(() => {});
  } catch (error) {
    showBanner(dbErrorBanner, error.message);
  } finally {
    saveBtn && (saveBtn.disabled = false);
    saveBtn?.focus();
  }
});

document.getElementById("remove-pushover-credentials-btn")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  if (!window.confirm("Remove Pushover credentials? Pushover delivery will be disabled until new credentials are saved.")) {
    btn.focus();
    return;
  }
  btn.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/provider-credentials/pushover`, {
      method: "DELETE",
      headers: { ...CREDENTIAL_ADMIN_HEADER }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || "Unable to remove Pushover credentials.";
      const code = payload?.error?.code;
      throw new Error(code ? `${message} (${code})` : message);
    }
    const payload = await response.json();
    showBanner(dbSuccessBanner, "Pushover credentials removed.");
    await refreshProviderCredentialsAfterMutation({ pushover: payload.pushover });
    await fetchNotificationSettings().catch(() => {});
  } catch (error) {
    showBanner(dbErrorBanner, error.message);
  } finally {
    btn.disabled = false;
    btn.focus();
  }
});

async function testNotification(channel) {
  const response = await fetch(`${API_BASE}/api/notifications/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = payload?.error?.code;
    if (code === "PROVIDER_NOT_CONFIGURED" || code === "EMAIL_NOT_CONFIGURED" || code === "PUSHOVER_NOT_CONFIGURED") {
      throw new Error("Credentials are not configured for this channel.");
    }
    if (code === "INVALID_EMAIL_ADDRESS") {
      throw new Error(payload?.error?.message || "Set an email destination in notification settings before sending a test.");
    }
    if (code === "RATE_LIMITED") throw new Error("Rate limited. Try again in a minute.");
    throw new Error("Test notification could not be queued.");
  }
  showBanner(dbSuccessBanner, `${channel === "email" ? "Email" : "Pushover"} test queued.`);
  await fetchNotificationDeliveries();
}

document.getElementById("test-email-btn")?.addEventListener("click", () => testNotification("email").catch((error) => showBanner(dbErrorBanner, error.message)));
document.getElementById("test-pushover-btn")?.addEventListener("click", () => testNotification("pushover").catch((error) => showBanner(dbErrorBanner, error.message)));

// Fetch Locations
async function fetchLocations() {
  try {
    const response = await fetch(`${API_BASE}/api/locations`);
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

// Fetch Runs
async function fetchRuns() {
  try {
    const response = await fetch(`${API_BASE}/api/runs`);
    if (!response.ok) {
      throw new Error(`Failed to load logs: ${response.statusText}`);
    }
    const logs = await response.json();
    renderLogs(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
  }
}

// Render Locations Card List
function renderLocations() {
  try {
    if (DEBUG) console.log("renderLocations called. locationsList:", locationsList);
    locationsCountBadge.textContent = `${locationsList.length} / 10`;
    locationsListContainer.innerHTML = "";
    
    if (locationsList.length === 0) {
      locationsListContainer.appendChild(emptyStateView);
      emptyStateView.classList.remove("hidden");
      renderForecastDashboard();
      return;
    }
    
    emptyStateView.classList.add("hidden");
    
    // ⚡ Bolt Performance Optimization:
    // Using a DocumentFragment avoids triggering a costly DOM reflow and repaint
    // on every single loop iteration. Batching DOM insertions significantly reduces
    // main thread blocking time.
    const fragment = document.createDocumentFragment();

    locationsList.forEach((location) => {
      const card = document.createElement("div");
      card.className = "location-card";
      
      const sunriseBadge = getForecastBadgeHtml(location.latestSunriseQuality, location.latestSunriseText);
      const sunsetBadge = getForecastBadgeHtml(location.latestSunsetQuality, location.latestSunsetText);
      
      const sunriseTimeText = location.latestSunriseTime 
        ? timeFormatter.format(Date.parse(location.latestSunriseTime))
        : "—";
      const sunsetTimeText = location.latestSunsetTime 
        ? timeFormatter.format(Date.parse(location.latestSunsetTime))
        : "—";

      let errorSection = "";
      if (location.forecastError) {
        errorSection = `<div class="forecast-error-text" style="margin-top:6px;">⚠️ ${escapeHtml(location.forecastError)}</div>`;
      }

      card.innerHTML = `
        <div class="location-info" style="flex:1;">
          <h3>${escapeHtml(location.name)}</h3>
          <div class="location-coords">${formatCoordinateDisplay(location.latitude, location.longitude)}</div>
          <div class="location-badges">
            <span class="location-badge-chip"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">wb_twilight</span> ${sunriseTimeText} ${sunriseBadge}</span>
            <span class="location-badge-chip"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">wb_sunny</span> ${sunsetTimeText} ${sunsetBadge}</span>
          </div>
          ${errorSection}
        </div>
        <div class="location-actions">
          <button class="btn-icon edit-btn" data-id="${location.id}" title="Edit" aria-label="Edit location ${escapeHtml(location.name)}">
            <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">edit</span>
          </button>
          <button class="btn-icon btn-icon-danger delete-btn" data-id="${location.id}" title="Delete" aria-label="Delete location ${escapeHtml(location.name)}">
            <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">delete</span>
          </button>
        </div>
      `;
      
      fragment.appendChild(card);
    });
    
    locationsListContainer.appendChild(fragment);

    // Attach event listeners to buttons
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const locId = e.currentTarget.getAttribute("data-id");
        startEditLocation(locId);
      });
    });
    
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const locId = e.currentTarget.getAttribute("data-id");
        deleteLocation(locId);
      });
    });

    // Render Forecast Dashboard Cards
    renderForecastDashboard();
  } catch (error) {
    console.error("Error in renderLocations:", error);
    showBanner(dbErrorBanner, "Render Error (Locations): " + error.message, 0);
  }
}

// Render Forecast Dashboard
function formatForecastColumnDate(isoTime) {
  if (!isoTime) return "";
  const formatted = dateFormatter.format(Date.parse(isoTime));
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
    if (DEBUG) console.log("renderForecastDashboard called. locationsList:", locationsList);
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
      <div class="forecast-table-header-events">
        ${isSunsetFirst
          ? `<div class="forecast-table-header-col">Next Sunset ${formatForecastColumnDate(headerSunsetTime)}</div>
             <div class="forecast-table-header-col">Next Sunrise ${formatForecastColumnDate(headerSunriseTime)}</div>`
          : `<div class="forecast-table-header-col">Next Sunrise ${formatForecastColumnDate(headerSunriseTime)}</div>
             <div class="forecast-table-header-col">Next Sunset ${formatForecastColumnDate(headerSunsetTime)}</div>`
        }
      </div>
    `;
    table.appendChild(header);

    locationsList.forEach((location) => {
      const hasForecast = location.latestSunriseTime !== undefined && location.latestSunriseTime !== null;
      const sunriseBadge = getForecastBadgeHtml(location.latestSunriseQuality, location.latestSunriseText);
      const sunsetBadge = getForecastBadgeHtml(location.latestSunsetQuality, location.latestSunsetText);

      const sunriseTimeText = location.latestSunriseTime
        ? timeFormatter.format(Date.parse(location.latestSunriseTime))
        : null;
      const sunsetTimeText = location.latestSunsetTime
        ? timeFormatter.format(Date.parse(location.latestSunsetTime))
        : null;

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
      row.innerHTML = `
        <div class="forecast-table-location">${escapeHtml(location.name)}</div>
        <div class="forecast-table-events">
          ${isSunsetFirst ? sunsetColHtml : sunriseColHtml}
          <div class="forecast-event-separator">|</div>
          ${isSunsetFirst ? sunriseColHtml : sunsetColHtml}
        </div>
      `;
      table.appendChild(row);
    });

    forecastCardsContainer.appendChild(table);

    if (dashboardLastUpdated) {
      if (maxTimestamp > 0) {
        const timeStr = dateTimeFormatterMedium.format(maxTimestamp);
        dashboardLastUpdated.textContent = `Last Run: ${timeStr} ET`;
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

// CRUD Actions
locationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
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
      // Edit mode via API
      const response = await fetch(`${API_BASE}/api/locations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, latitude, longitude })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      showBanner(dbSuccessBanner, `Location "${name}" updated successfully.`);
      resetForm();
    } else {
      // Create mode via API
      if (!canAddLocation(locationsList.length)) {
        showBanner(dbErrorBanner, "Limit reached: You can monitor a maximum of 10 locations.");
        return;
      }
      const response = await fetch(`${API_BASE}/api/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, latitude, longitude })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      showBanner(dbSuccessBanner, `Location "${name}" added successfully.`);
      resetForm();
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
  const loc = locationsList.find(l => l.id === id);
  if (!loc) return;
  
  locationIdInput.value = loc.id;
  locationNameInput.value = loc.name;
  locationLatInput.value = loc.latitude;
  locationLngInput.value = loc.longitude;
  
  formTitle.textContent = "Edit Location";
  saveLocationBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span><span>Update Location</span>';
  cancelEditBtn.classList.remove("hidden");
  locationNameInput.focus();
}

function resetForm() {
  locationIdInput.value = "";
  locationNameInput.value = "";
  locationLatInput.value = "";
  locationLngInput.value = "";
  
  formTitle.textContent = "Add Location";
  saveLocationBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span><span>Save Location</span>';
  cancelEditBtn.classList.add("hidden");
}

cancelEditBtn.addEventListener("click", resetForm);

async function deleteLocation(id) {
  const loc = locationsList.find(l => l.id === id);
  if (!loc) return;
  
  if (confirm(`Are you sure you want to delete "${loc.name}"?`)) {
    try {
      const response = await fetch(`${API_BASE}/api/locations/${id}`, {
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

// Test Trigger for Daily Email Functions
triggerTestBtn.addEventListener("click", async () => {
  if (locationsList.length === 0) {
    showBanner(dbErrorBanner, "Cannot trigger test: You need to add at least 1 location.");
    return;
  }

  const originalTriggerLabel = triggerTestBtn.textContent;

  try {
    triggerTestBtn.disabled = true;
    triggerTestBtn.textContent = "Sending…";
    triggerStatus.classList.remove("hidden");
    
    const reportResponse = await fetch(`${API_BASE}/api/triggerReport`, {
      method: "POST"
    });
    
    const result = await reportResponse.json();
    
    if (!reportResponse.ok) {
      throw new Error(result.error || "Failed to trigger email report.");
    }
    
    showEmailSuccessModal();
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
    triggerTestBtn.textContent = originalTriggerLabel;
    triggerStatus.classList.add("hidden");
  }
});

// Geolocation Handler
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

// Address Search Handler
async function performAddressSearch() {
  const queryText = searchAddressInput.value.trim();
  if (!queryText) {
    showBanner(dbErrorBanner, "Please enter an address or city to search.");
    return;
  }
  
  searchAddressBtn.disabled = true;
  const searchIcon = searchAddressBtn.querySelector(".material-symbols-outlined");
  if (searchIcon) searchIcon.textContent = "hourglass_empty";
  
  try {
    const response = await fetch(`${API_BASE}/api/searchCoordinates`, {
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
    const searchIcon = searchAddressBtn.querySelector(".material-symbols-outlined");
    if (searchIcon) searchIcon.textContent = "search";
  }
}

searchAddressBtn.addEventListener("click", performAddressSearch);

// Autocomplete Suggestions logic & Key-nav
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
      const response = await fetch(`${API_BASE}/api/autocomplete`, {
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
  
  // ⚡ Bolt Performance Optimization:
  // Using a DocumentFragment avoids triggering a costly DOM reflow and repaint
  // on every single loop iteration. Batching DOM insertions significantly reduces
  // main thread blocking time.
  const fragment = document.createDocumentFragment();

  features.forEach((feature, index) => {
    const props = feature.properties;
    const coords = feature.geometry.coordinates; // [Lng, Lat]
    
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

// Close suggestion dropdown if clicking outside
document.addEventListener("click", (e) => {
  if (!searchAddressInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
    searchSuggestions.classList.add("hidden");
    searchAddressInput.setAttribute('aria-expanded', 'false');
    searchAddressInput.removeAttribute('aria-activedescendant');
    activeSuggestionIndex = -1;
  }
});

// Logs Rendering function
function formatApiCreditsLabel(credits) {
  const limitPart = credits.limit != null ? ` / ${credits.limit}` : "";
  let label = `Requests remaining: ${credits.remaining}${limitPart}`;

  if (credits.resetAt) {
    const resetText = timeFormatterShort.format(credits.resetAt);
    label += ` · resets ${resetText} ET`;
  }

  return label;
}

async function fetchApiCreditsStatus() {
  if (!apiCreditsStatus) return;

  apiCreditsStatus.classList.remove("error");
  apiCreditsStatus.textContent = "Loading API credits…";

  try {
    const response = await fetch(`${API_BASE}/api/getApiCredits`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to load API credits.");
    }
    apiCreditsStatus.textContent = formatApiCreditsLabel(result);
  } catch (error) {
    console.error(error);
    apiCreditsStatus.classList.add("error");
    apiCreditsStatus.textContent = `Unable to load API credits: ${error.message}`;
  }
}

function renderLogs(logs) {
  logsListContainer.innerHTML = "";
  
  if (logs.length === 0) {
    logsListContainer.innerHTML = '<div class="empty-state">No execution logs found yet.</div>';
    return;
  }
  
  // ⚡ Bolt Performance Optimization:
  // Using a DocumentFragment avoids triggering a costly DOM reflow and repaint
  // on every single loop iteration. Batching DOM insertions significantly reduces
  // main thread blocking time.
  const fragment = document.createDocumentFragment();

  logs.forEach((log) => {
    const logItem = document.createElement("div");
    logItem.className = "log-item";
    
    const dateText = dateTimeFormatterMedium.format(log.timestamp);
    
    let statusClass = getLogStatusClass(log.status);
    const statusText = log.status.toUpperCase();
    
    let detailsHtml = "";
    if (log.error) {
      detailsHtml = `<div class="log-details" style="color: var(--error);">Error: ${escapeHtml(log.error)}</div>`;
    } else if (log.results && log.results.length > 0) {
      const resultsText = log.results.map(r => {
        const dot = r.status === "error" ? "🔴" : "🟢";
        return `${dot} ${escapeHtml(r.name)} (${r.status === "error" ? "Failed" : "Success"})`;
      }).join("<br>");
      detailsHtml = `<div class="log-details">${resultsText}</div>`;
    }
    
    logItem.innerHTML = `
      <div class="log-item-header">
        <span class="log-time">${dateText}</span>
        <span class="log-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="log-summary-row">
        Trigger: <strong>${escapeHtml(log.triggerType)}</strong> | Locations: <strong>${log.locationsCount}</strong>
      </div>
      ${detailsHtml}
    `;
    
    fragment.appendChild(logItem);
  });

  logsListContainer.appendChild(fragment);
}

// Tab Switching logic
const allNavButtons = document.querySelectorAll(".nav-tab, .bottom-nav-item");
const tabPanes = document.querySelectorAll(".tab-pane");

function switchTab(targetTab) {
  allNavButtons.forEach(b => {
    if (b.getAttribute("data-tab") === targetTab) {
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

  if (targetTab === "logs") {
    fetchApiCreditsStatus();
  }
}

allNavButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");
    if (targetTab) switchTab(targetTab);
  });
});

// Run
initApp();
