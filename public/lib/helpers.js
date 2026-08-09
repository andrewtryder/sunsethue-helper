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

export function getQualityTierClass(percentage) {
  if (percentage == null || Number.isNaN(Number(percentage))) {
    return "quality-na";
  }
  if (percentage >= 80) return "q-great";
  if (percentage >= 60) return "q-good";
  if (percentage >= 40) return "q-fair";
  return "q-poor";
}

function getForecastFallbackLabel(percentage) {
  if (percentage >= 80) return "Great";
  if (percentage >= 60) return "Good";
  if (percentage >= 40) return "Fair";
  return "Poor";
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
    return `<span class="quality-indicator quality-na"><span class="quality-text">N/A</span></span>`;
  }

  const label = escapeHtml(formatForecastLabel(text, percentage));
  const clamped = Math.max(0, Math.min(100, percentage));
  const tier = getQualityTierClass(clamped);

  return `<span class="quality-indicator ${tier}"><span class="quality-stack"><span class="quality-badge">${label}</span><span class="quality-meter" role="meter" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100" aria-label="Quality ${percentage}%"><span class="quality-meter-fill" style="width:${clamped}%"></span></span></span><span class="quality-percent">${percentage}%</span></span>`;
}

export function canAddLocation(currentCount, maxLocations = MAX_LOCATIONS) {
  return currentCount < maxLocations;
}

export function validateCoordinates(latitude, longitude) {
  const latVal = Number(latitude);
  const lngVal = Number(longitude);
  return (
    !Number.isNaN(latVal) && latVal >= -90 && latVal <= 90 &&
    !Number.isNaN(lngVal) && lngVal >= -180 && lngVal <= 180
  );
}

export function formatCoordinateDisplay(latitude, longitude) {
  const latDir = (latitude || 0) >= 0 ? "N" : "S";
  const lngDir = (longitude || 0) >= 0 ? "E" : "W";
  const lat = Math.abs(latitude || 0).toFixed(4);
  const lng = Math.abs(longitude || 0).toFixed(4);
  return `${lat}° ${latDir} / ${lng}° ${lngDir}`;
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
