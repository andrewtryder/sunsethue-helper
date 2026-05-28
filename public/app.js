import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const displayUserEmail = document.getElementById("display-user-email");
const logoutBtn = document.getElementById("logout-btn");

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

const authErrorBanner = document.getElementById("auth-error-banner");
const dbSuccessBanner = document.getElementById("db-success-banner");
const dbErrorBanner = document.getElementById("db-error-banner");

const triggerTestBtn = document.getElementById("trigger-test-btn");
const triggerStatus = document.getElementById("trigger-status");
const triggerStatusText = document.getElementById("trigger-status-text");

// Firebase references
let auth = null;
let db = null;
let locationsList = [];

// Initialize Firebase dynamically from hosting environment
async function initFirebase() {
  try {
    const response = await fetch("/__/firebase/init.json");
    if (!response.ok) {
      throw new Error("Could not fetch Firebase config. Ensure you are running under Firebase Hosting or Emulators.");
    }
    const config = await response.json();
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    
    setupAuthListeners();
  } catch (error) {
    console.error("Firebase init failed: ", error);
    showBanner(authErrorBanner, `Initialization Error: ${error.message}. Please run this app via Firebase CLI (e.g. 'npx firebase emulators:start').`, 0);
    const loader = document.getElementById("loading-overlay");
    if (loader) loader.classList.add("fade-out");
  }
}

// Banner Utility
const bannerTimeouts = new Map();

function showBanner(bannerElement, message, duration = 5000) {
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
  if (bannerTimeouts.has(bannerElement)) {
    clearTimeout(bannerTimeouts.get(bannerElement));
    bannerTimeouts.delete(bannerElement);
  }
  bannerElement.style.display = "none";
  bannerElement.textContent = "";
}

// 1. Setup Auth Listeners
let isFirstAuthCheck = true;

function setupAuthListeners() {
  onAuthStateChanged(auth, (user) => {
    const hideLoader = () => {
      if (isFirstAuthCheck) {
        isFirstAuthCheck = false;
        const loader = document.getElementById("loading-overlay");
        if (loader) loader.classList.add("fade-out");
      }
    };

    if (user) {
      // Security check: restrict email to atr000@gmail.com
      if (user.email !== "atr000@gmail.com") {
        showBanner(authErrorBanner, "Access Denied: Only atr000@gmail.com is authorized.", 10000);
        signOut(auth);
        hideLoader();
        return;
      }
      
      // Logged in
      displayUserEmail.textContent = user.email;
      authContainer.classList.add("hidden");
      appContainer.classList.remove("hidden");
      document.body.classList.add("app-visible");
      hideBanner(authErrorBanner);
      
      setupFirestoreListeners();
      hideLoader();
    } else {
      // Logged out
      authContainer.classList.remove("hidden");
      appContainer.classList.add("hidden");
      document.body.classList.remove("app-visible");
      locationsList = [];
      if (firestoreUnsubscribe) firestoreUnsubscribe();
      if (firestoreLogsUnsubscribe) firestoreLogsUnsubscribe();
      hideLoader();
    }
  });
}

// Login form
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  
  if (email !== "atr000@gmail.com") {
    showBanner(authErrorBanner, "Access Denied: Only atr000@gmail.com is authorized.");
    return;
  }

  try {
    hideBanner(authErrorBanner);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    let errorMsg = "Failed to sign in. Please check your credentials.";
    if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
      errorMsg = "Invalid email or password.";
    } else if (error.code === "auth/invalid-credential") {
      errorMsg = "Invalid credentials provided.";
    }
    showBanner(authErrorBanner, errorMsg);
  }
});

// Logout btn
logoutBtn.addEventListener("click", () => {
  signOut(auth).catch(err => {
    console.error(err);
    showBanner(dbErrorBanner, "Failed to log out: " + err.message);
  });
});

// 2. Setup Database Listeners
let firestoreUnsubscribe = null;
let firestoreLogsUnsubscribe = null;
function setupFirestoreListeners() {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
  }
  if (firestoreLogsUnsubscribe) {
    firestoreLogsUnsubscribe();
  }
  
  // Locations listener
  const q = query(collection(db, "locations"), orderBy("createdAt", "asc"));
  firestoreUnsubscribe = onSnapshot(q, (snapshot) => {
    locationsList = [];
    snapshot.forEach((doc) => {
      locationsList.push({ id: doc.id, ...doc.data() });
    });
    
    renderLocations();
  }, (error) => {
    console.error("Firestore snapshot error: ", error);
    showBanner(dbErrorBanner, "Failed to fetch locations: " + error.message);
  });

  // Logs listener (fetch last 20)
  const logsQuery = query(collection(db, "runs"), orderBy("timestamp", "desc"), limit(20));
  firestoreLogsUnsubscribe = onSnapshot(logsQuery, (snapshot) => {
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    renderLogs(logs);
  }, (error) => {
    console.error("Firestore logs error: ", error);
  });
}

// 3. Render Locations Card List
function getForecastBadgeHtml(quality, text) {
  if (quality === undefined || quality === null) {
    return `<span class="badge badge-muted">N/A</span>`;
  }
  const percentage = Math.round(quality * 100);
  if (percentage >= 60) {
    return `<span class="badge badge-great">${percentage}% (${text || 'Great'})</span>`;
  } else if (percentage >= 30) {
    return `<span class="badge badge-fair">${percentage}% (${text || 'Fair'})</span>`;
  }
  return `<span class="badge badge-muted">${percentage}% (${text || 'Low'})</span>`;
}

function renderLocations() {
  try {
    console.log("renderLocations called. locationsList:", locationsList);
    locationsCountBadge.textContent = `${locationsList.length} / 10`;
    locationsListContainer.innerHTML = "";
    
    if (locationsList.length === 0) {
      locationsListContainer.appendChild(emptyStateView);
      emptyStateView.classList.remove("hidden");
      renderForecastDashboard();
      return;
    }
    
    emptyStateView.classList.add("hidden");
    
    locationsList.forEach((location) => {
      const card = document.createElement("div");
      card.className = "location-card";
      
      const sunriseBadge = getForecastBadgeHtml(location.latestSunriseQuality, location.latestSunriseText);
      const sunsetBadge = getForecastBadgeHtml(location.latestSunsetQuality, location.latestSunsetText);
      
      const sunriseTimeText = location.latestSunriseTime 
        ? new Date(location.latestSunriseTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : "—";
      const sunsetTimeText = location.latestSunsetTime 
        ? new Date(location.latestSunsetTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : "—";

      let errorSection = "";
      if (location.forecastError) {
        errorSection = `<div class="forecast-error-text" style="margin-top:6px;">⚠️ ${escapeHtml(location.forecastError)}</div>`;
      }

      card.innerHTML = `
        <div class="location-info" style="flex:1;">
          <h3>${escapeHtml(location.name)}</h3>
          <div class="location-coords">${(location.latitude || 0).toFixed(4)}° N / ${Math.abs(location.longitude || 0).toFixed(4)}° W</div>
          <div class="location-badges">
            <span class="location-badge-chip"><span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">wb_twilight</span> ${sunriseTimeText} ${sunriseBadge}</span>
            <span class="location-badge-chip"><span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;">wb_sunny</span> ${sunsetTimeText} ${sunsetBadge}</span>
          </div>
          ${errorSection}
        </div>
        <div class="location-actions">
          <button class="btn-icon edit-btn" data-id="${location.id}" title="Edit">
            <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
          </button>
          <button class="btn-icon btn-icon-danger delete-btn" data-id="${location.id}" title="Delete">
            <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
          </button>
        </div>
      `;
      
      locationsListContainer.appendChild(card);
    });
    
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

// 3.1 Render Forecast Dashboard (Card Layout)
function renderForecastDashboard() {
  try {
    console.log("renderForecastDashboard called. locationsList:", locationsList);
    if (!forecastCardsContainer) return;
    
    // Remove old location cards (keep the empty-state node)
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
    
    locationsList.forEach((location) => {
      const hasForecast = location.latestSunriseTime !== undefined && location.latestSunriseTime !== null;
      if (location.lastForecastUpdate && location.lastForecastUpdate > maxTimestamp) {
        maxTimestamp = location.lastForecastUpdate;
      }
      
      const sunriseBadge = getForecastBadgeHtml(location.latestSunriseQuality, location.latestSunriseText);
      const sunsetBadge  = getForecastBadgeHtml(location.latestSunsetQuality,  location.latestSunsetText);
      
      const sunriseTimeText = location.latestSunriseTime 
        ? new Date(location.latestSunriseTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : null;
      const sunsetTimeText = location.latestSunsetTime 
        ? new Date(location.latestSunsetTime).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : null;
      const sunriseDateText = location.latestSunriseTime
        ? new Date(location.latestSunriseTime).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })
        : null;
      const sunsetDateText = location.latestSunsetTime
        ? new Date(location.latestSunsetTime).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })
        : null;
      
      const lat  = (location.latitude  || 0).toFixed(2);
      const lng  = Math.abs(location.longitude || 0).toFixed(2);
      const lngDir = (location.longitude || 0) < 0 ? "W" : "E";

      let sunriseRowHtml;
      let sunsetRowHtml;

      if (location.forecastError) {
        const errHtml = `<span class="forecast-error-text">⚠️ ${escapeHtml(location.forecastError)}</span>`;
        sunriseRowHtml = errHtml;
        sunsetRowHtml  = errHtml;
      } else if (!hasForecast) {
        sunriseRowHtml = `<span class="forecast-no-data">No forecast cached yet</span>`;
        sunsetRowHtml  = `<span class="forecast-no-data">No forecast cached yet</span>`;
      } else {
        sunriseRowHtml = `
          <div class="forecast-time">${sunriseTimeText}</div>
          <div class="forecast-label">Next Sunrise${sunriseDateText ? ', ' + sunriseDateText : ''}</div>
        `;
        sunsetRowHtml = `
          <div class="forecast-time">${sunsetTimeText}</div>
          <div class="forecast-label">Next Sunset${sunsetDateText ? ', ' + sunsetDateText : ''}</div>
        `;
      }

      const card = document.createElement("div");
      card.className = "location-forecast-card";
      card.innerHTML = `
        <div>
          <h2 class="forecast-card-title">${escapeHtml(location.name)}</h2>
          <p class="forecast-card-coords">${lat}° N / ${lng}° ${lngDir}</p>
        </div>
        <div class="forecast-rows">
          <div class="forecast-row">
            <div class="forecast-row-left">
              <span class="material-symbols-outlined forecast-icon">wb_twilight</span>
              <div>${sunriseRowHtml}</div>
            </div>
            ${hasForecast && !location.forecastError ? sunriseBadge : ''}
          </div>
          <div class="forecast-row">
            <div class="forecast-row-left">
              <span class="material-symbols-outlined forecast-icon">wb_sunny</span>
              <div>${sunsetRowHtml}</div>
            </div>
            ${hasForecast && !location.forecastError ? sunsetBadge : ''}
          </div>
        </div>
      `;
      
      forecastCardsContainer.appendChild(card);
    });
    
    if (dashboardLastUpdated) {
      if (maxTimestamp > 0) {
        const timeStr = new Date(maxTimestamp).toLocaleString("en-US", {
          timeZone: "America/New_York",
          dateStyle: "medium",
          timeStyle: "short"
        });
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

// HTML Escaping Utility
function escapeHtml(str) {
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

// 4. CRUD Actions
locationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const id = locationIdInput.value;
  const name = locationNameInput.value.trim();
  const latitude = parseFloat(locationLatInput.value);
  const longitude = parseFloat(locationLngInput.value);
  
  if (isNaN(latitude) || isNaN(longitude)) {
    showBanner(dbErrorBanner, "Latitude and Longitude must be valid numbers.");
    return;
  }
  
  try {
    if (id) {
      // Edit mode
      await updateDoc(doc(db, "locations", id), {
        name,
        latitude,
        longitude
      });
      showBanner(dbSuccessBanner, `Location "${name}" updated successfully.`);
      resetForm();
    } else {
      // Create mode
      if (locationsList.length >= 10) {
        showBanner(dbErrorBanner, "Limit reached: You can monitor a maximum of 10 locations.");
        return;
      }
      
      await addDoc(collection(db, "locations"), {
        name,
        latitude,
        longitude,
        createdAt: new Date().getTime()
      });
      showBanner(dbSuccessBanner, `Location "${name}" added successfully.`);
      resetForm();
    }
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Database Error: " + error.message);
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
  saveLocationBtn.textContent = "Update Location";
  cancelEditBtn.classList.remove("hidden");
  
  locationNameInput.focus();
}

function resetForm() {
  locationIdInput.value = "";
  locationNameInput.value = "";
  locationLatInput.value = "";
  locationLngInput.value = "";
  
  formTitle.textContent = "Add Location";
  saveLocationBtn.textContent = "Save Location";
  cancelEditBtn.classList.add("hidden");
}

cancelEditBtn.addEventListener("click", resetForm);

async function deleteLocation(id) {
  const loc = locationsList.find(l => l.id === id);
  if (!loc) return;
  
  if (confirm(`Are you sure you want to delete "${loc.name}"?`)) {
    try {
      await deleteDoc(doc(db, "locations", id));
      showBanner(dbSuccessBanner, `Location "${loc.name}" deleted.`);
      if (locationIdInput.value === id) {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      showBanner(dbErrorBanner, "Delete failed: " + error.message);
    }
  }
}

// 5. Test Trigger for Daily Email Functions
triggerTestBtn.addEventListener("click", async () => {
  if (locationsList.length === 0) {
    showBanner(dbErrorBanner, "Cannot trigger test: You need to add at least 1 location.");
    return;
  }
  
  try {
    triggerTestBtn.disabled = true;
    triggerStatus.classList.remove("hidden");
    triggerStatusText.textContent = "Requesting email report dispatch...";
    
    // Retrieve Auth ID Token to pass to Cloud Function for authentication
    const user = auth.currentUser;
    if (!user) throw new Error("User not signed in.");
    const idToken = await user.getIdToken();
    
    // Call the https v2 function (configured to fetch locations and send email)
    // We'll write the Cloud Function as a POST endpoint at /triggerReport
    // In production, we'll map the function or call its URL directly.
    // If running in local emulator, Cloud Functions are at e.g., http://127.0.0.1:5001/<project-id>/us-central1/triggerReport
    // We can fetch the endpoint dynamically based on the current location.
    
    const isEmulator = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    let functionUrl = "";
    
    if (isEmulator) {
      // Find the project name from the global config
      const response = await fetch("/__/firebase/init.json");
      const config = await response.json();
      functionUrl = `http://127.0.0.1:5001/${config.projectId}/us-central1/triggerReport`;
    } else {
      // In production hosting, we can rewrite the path /api/triggerReport to the Cloud Function
      // or we can call it using the Cloud Function URL. Let's use the local relative path redirect configured in firebase.json redirects/rewrites
      functionUrl = "/api/triggerReport";
    }
    
    const reportResponse = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      }
    });
    
    const result = await reportResponse.json();
    
    if (!reportResponse.ok) {
      throw new Error(result.error || "Failed to trigger email report.");
    }
    
    showBanner(dbSuccessBanner, "Success! Test report email sent to atr000@gmail.com.");
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Trigger Failed: " + error.message);
  } finally {
    triggerTestBtn.disabled = false;
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
      
      // Auto-fill a name if empty
      if (!locationNameInput.value) {
        locationNameInput.value = "Current Location";
      }
    },
    (error) => {
      console.error(error);
      let errMsg = "Failed to get current location.";
      if (error.code === error.PERMISSION_DENIED) {
        errMsg = "Geolocation permission denied. Please allow access in browser.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errMsg = "Location unavailable. Please specify coordinates manually.";
      } else if (error.code === error.TIMEOUT) {
        errMsg = "Geolocation request timed out. Please specify coordinates manually.";
      }
      showBanner(dbErrorBanner, errMsg);
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = originalText;
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
  );
});

// Address Search Handler (Fallback for manual submission)
async function performAddressSearch() {
  const queryText = searchAddressInput.value.trim();
  if (!queryText) {
    showBanner(dbErrorBanner, "Please enter an address or city to search.");
    return;
  }
  
  searchAddressBtn.disabled = true;
  searchAddressBtn.textContent = "⌛";
  
  try {
    // Retrieve Auth ID Token for secure proxy access
    const user = auth.currentUser;
    if (!user) throw new Error("User not signed in.");
    const idToken = await user.getIdToken();
    
    // Determine endpoint URL
    const isEmulator = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    let functionUrl = "";
    if (isEmulator) {
      const response = await fetch("/__/firebase/init.json");
      const config = await response.json();
      functionUrl = `http://127.0.0.1:5001/${config.projectId}/us-central1/searchCoordinates`;
    } else {
      functionUrl = "/api/searchCoordinates";
    }

    // Call geocoding proxy function
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
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
      
      // Auto-fill location name if empty or if it matches placeholder text
      if (!locationNameInput.value || locationNameInput.value === "Current Location") {
        const shortName = match.display_name.split(",")[0].trim();
        locationNameInput.value = shortName;
      }
      
      showBanner(dbSuccessBanner, `Found: ${match.display_name}`);
      searchAddressInput.value = "";
      searchSuggestions.classList.add("hidden");
    } else {
      showBanner(dbErrorBanner, "No locations found. Try a different search term.");
    }
  } catch (error) {
    console.error(error);
    showBanner(dbErrorBanner, "Search failed: " + error.message);
  } finally {
    searchAddressBtn.disabled = false;
    searchAddressBtn.textContent = "🔍";
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
    activeSuggestionIndex++;
    if (activeSuggestionIndex >= items.length) {
      activeSuggestionIndex = 0;
    }
    updateActiveSuggestion(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSuggestionIndex--;
    if (activeSuggestionIndex < 0) {
      activeSuggestionIndex = items.length - 1;
    }
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
    activeSuggestionIndex = -1;
  }
});

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    if (index === activeSuggestionIndex) {
      item.classList.add("active");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("active");
    }
  });
}

searchAddressInput.addEventListener("input", () => {
  clearTimeout(autocompleteTimeout);
  
  const queryText = searchAddressInput.value.trim();
  if (queryText.length < 3) {
    searchSuggestions.classList.add("hidden");
    searchSuggestions.innerHTML = "";
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    return;
  }
  
  // Debounce API calls (wait 250ms after user stops typing)
  autocompleteTimeout = setTimeout(async () => {
    try {
      // Fetch from Photon API (Fast, CORS-enabled geocoding suggestions based on OSM)
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryText)}&limit=5`;
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      
      if (data && data.features && data.features.length > 0) {
        renderSuggestions(data.features);
      } else {
        searchSuggestions.classList.add("hidden");
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
  activeSuggestionIndex = -1;
  currentSuggestions = features;
  
  features.forEach((feature, index) => {
    const props = feature.properties;
    const coords = feature.geometry.coordinates; // [Lng, Lat]
    
    // Construct user-friendly display name (e.g. "Paris, Ile-de-France, France")
    const parts = [
      props.name,
      props.state || props.county,
      props.country
    ].filter(Boolean);
    
    const displayName = parts.join(", ");
    
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = displayName;
    item.setAttribute("data-index", index);
    
    item.addEventListener("click", () => {
      // Photon returns [Lng, Lat] in GeoJSON format
      const lon = coords[0];
      const lat = coords[1];
      
      locationLatInput.value = lat.toFixed(6);
      locationLngInput.value = lon.toFixed(6);
      
      // Auto-populate location name
      locationNameInput.value = props.name;
      
      // Reset search field and suggestions
      searchAddressInput.value = "";
      searchSuggestions.classList.add("hidden");
      searchSuggestions.innerHTML = "";
      currentSuggestions = [];
      activeSuggestionIndex = -1;
      
      showBanner(dbSuccessBanner, `Selected location: ${displayName}`);
      locationNameInput.focus();
    });
    
    searchSuggestions.appendChild(item);
  });
}

// Close suggestion dropdown if clicking outside
document.addEventListener("click", (e) => {
  if (!searchAddressInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
    searchSuggestions.classList.add("hidden");
    activeSuggestionIndex = -1;
  }
});

// Logs Rendering function
function renderLogs(logs) {
  logsListContainer.innerHTML = "";
  
  if (logs.length === 0) {
    logsListContainer.innerHTML = '<div class="empty-state">No execution logs found yet.</div>';
    return;
  }
  
  logs.forEach((log) => {
    const logItem = document.createElement("div");
    logItem.className = "log-item";
    
    const dateText = new Date(log.timestamp).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short"
    });
    
    let statusClass = "success";
    if (log.status === "warning") statusClass = "warning";
    if (log.status === "failure") statusClass = "failure";
    
    const statusText = log.status.toUpperCase();
    
    let detailsHtml = "";
    if (log.error) {
      detailsHtml = `<div class="log-details" style="color: var(--error-color);">Error: ${escapeHtml(log.error)}</div>`;
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
    
    logsListContainer.appendChild(logItem);
  });
}

// Tab Switching logic — covers desktop nav, mobile segment nav, and bottom nav
const allNavButtons = document.querySelectorAll(".nav-tab, .bottom-nav-item");
const tabPanes = document.querySelectorAll(".tab-pane");

function switchTab(targetTab) {
  // Update all nav buttons across all surfaces
  allNavButtons.forEach(b => {
    if (b.getAttribute("data-tab") === targetTab) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
  // Show/hide panes
  tabPanes.forEach(p => p.classList.remove("active"));
  const activePane = document.getElementById(`pane-${targetTab}`);
  if (activePane) activePane.classList.add("active");
}

allNavButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");
    if (targetTab) switchTab(targetTab);
  });
});

// Run
initFirebase();
