export const AUTHORIZED_EMAIL = "atr000@gmail.com";
export const MAX_LOCATIONS = 10;

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeQualityToUnit(quality) {
  if (quality === null || quality === undefined) {
    return null;
  }

  const numeric = Number(quality);
  if (Number.isNaN(numeric)) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric;
  }

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  return null;
}

export function qualityToPercent(quality) {
  const normalized = normalizeQualityToUnit(quality);
  if (normalized === null) {
    return null;
  }
  return Math.round(normalized * 100);
}

function getForecastFallbackLabel(percentage) {
  if (percentage >= 60) {
    return "Great";
  }
  if (percentage >= 30) {
    return "Fair";
  }
  return "Low";
}

function formatForecastLabel(text, percentage) {
  if (!text) {
    return getForecastFallbackLabel(percentage);
  }

  const trimmed = String(text).trim();
  if (trimmed === `${percentage}%` || trimmed === String(percentage)) {
    return getForecastFallbackLabel(percentage);
  }

  return trimmed;
}

export function getForecastBadgeHtml(quality, text) {
  const percentage = qualityToPercent(quality);
  if (percentage === null) {
    return `<span class="badge badge-muted">N/A</span>`;
  }

  const label = formatForecastLabel(text, percentage);

  if (percentage >= 60) {
    return `<span class="badge badge-great">${percentage}% (${label})</span>`;
  }
  if (percentage >= 30) {
    return `<span class="badge badge-fair">${percentage}% (${label})</span>`;
  }
  return `<span class="badge badge-muted">${percentage}% (${label})</span>`;
}

export function isAuthorizedEmail(email) {
  return email === AUTHORIZED_EMAIL;
}

export function isEmulatorHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getFunctionUrl(functionName, { isEmulator, projectId }) {
  if (isEmulator) {
    return `http://127.0.0.1:5001/${projectId}/us-central1/${functionName}`;
  }
  return `/api/${functionName}`;
}

export function canAddLocation(currentCount, maxLocations = MAX_LOCATIONS) {
  return currentCount < maxLocations;
}

export function validateCoordinates(latitude, longitude) {
  return !Number.isNaN(latitude) && !Number.isNaN(longitude);
}

export function formatCoordinateDisplay(latitude, longitude) {
  const lat = (latitude || 0).toFixed(4);
  const lng = Math.abs(longitude || 0).toFixed(4);
  return `${lat}° N / ${lng}° W`;
}

export function formatDashboardCoordinateDisplay(latitude, longitude) {
  const lat = (latitude || 0).toFixed(2);
  const lng = Math.abs(longitude || 0).toFixed(2);
  const lngDir = (longitude || 0) < 0 ? "W" : "E";
  return `${lat}° N / ${lng}° ${lngDir}`;
}

export function getLogStatusClass(status) {
  if (status === "warning") return "warning";
  if (status === "failure") return "failure";
  return "success";
}

export function buildPhotonDisplayName(properties) {
  return [properties.name, properties.state || properties.county, properties.country]
    .filter(Boolean)
    .join(", ");
}

export function moveSuggestionIndex(currentIndex, direction, itemCount) {
  if (itemCount === 0) return -1;
  let nextIndex = currentIndex + direction;
  if (nextIndex >= itemCount) nextIndex = 0;
  if (nextIndex < 0) nextIndex = itemCount - 1;
  return nextIndex;
}

export function shouldSearchAutocomplete(queryText, minLength = 3) {
  return queryText.trim().length >= minLength;
}

export function mapAuthErrorCode(code) {
  if (code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Invalid email or password.";
  }
  if (code === "auth/invalid-credential") {
    return "Invalid credentials provided.";
  }
  return "Failed to sign in. Please check your credentials.";
}

export function mapGeolocationError(code, errorCodes) {
  if (code === errorCodes.PERMISSION_DENIED) {
    return "Geolocation permission denied. Please allow access in browser.";
  }
  if (code === errorCodes.POSITION_UNAVAILABLE) {
    return "Location unavailable. Please specify coordinates manually.";
  }
  if (code === errorCodes.TIMEOUT) {
    return "Geolocation request timed out. Please specify coordinates manually.";
  }
  return "Failed to get current location.";
}
