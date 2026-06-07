function formatTimeET(utcString) {
  if (!utcString) return "N/A";
  try {
    const date = new Date(utcString);
    return date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid Date";
  }
}

function normalizeQualityToUnit(quality) {
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

function qualityToPercent(quality) {
  const normalized = normalizeQualityToUnit(quality);
  if (normalized === null) {
    return null;
  }
  return Math.round(normalized * 100);
}

function getQualityFallbackLabel(percentage) {
  if (percentage >= 60) {
    return "Spectacular";
  }
  if (percentage >= 30) {
    return "Good";
  }
  return "Muted";
}

function getQualityBadge(quality, qualityText) {
  const percentage = qualityToPercent(quality);
  if (percentage === null) {
    return `<span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold; background-color: #2a2a2a; color: #888;">N/A</span>`;
  }

  let bgColor;
  let textColor;

  if (percentage >= 60) {
    bgColor = "#ffd4d6";
    textColor = "#d92b3a";
  } else if (percentage >= 30) {
    bgColor = "#fef3c7";
    textColor = "#b45309";
  } else {
    bgColor = "#f3f4f6";
    textColor = "#4b5563";
  }

  const label = qualityText ? escapeHtml(String(qualityText)) : getQualityFallbackLabel(percentage);

  return `<span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold; background-color: ${bgColor}; color: ${textColor}; display: inline-block;">${percentage}% (${label})</span>`;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildForecastEventSnapshot(event) {
  if (!event) {
    return null;
  }

  const normalizedQuality = normalizeQualityToUnit(event.quality);

  return {
    time: event.time || null,
    type: event.type || null,
    quality: event.quality ?? null,
    normalizedQuality,
    qualityText: event.quality_text || null,
    displayPercent: normalizedQuality !== null ? Math.round(normalizedQuality * 100) : null
  };
}

function normalizeForecastEvent(event) {
  if (!event) {
    return null;
  }

  const normalizedQuality = normalizeQualityToUnit(event.quality);
  if (normalizedQuality === null && event.quality !== null && event.quality !== undefined) {
    console.warn("Invalid forecast quality value:", event.quality, "for event at", event.time);
  }

  return {
    ...event,
    quality: normalizedQuality
  };
}

function selectNextSunEvents(events, nowMs = Date.now()) {
  const sunriseEvents = events
    .filter((event) => event.type === "sunrise" && new Date(event.time).getTime() > nowMs)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const sunsetEvents = events
    .filter((event) => event.type === "sunset" && new Date(event.time).getTime() > nowMs)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return {
    nextSunrise: sunriseEvents[0] || null,
    nextSunset: sunsetEvents[0] || null
  };
}

function validateReportEnv(env = process.env) {
  if (!env.SUNSETHUE_API_KEY || env.SUNSETHUE_API_KEY === "PLACEHOLDER") {
    throw new Error("SUNSETHUE_API_KEY environment variable is not configured.");
  }
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD || env.GMAIL_APP_PASSWORD === "PLACEHOLDER_GMAIL_APP_PASSWORD") {
    throw new Error("Gmail SMTP configuration environment variables are missing or not set.");
  }
}

function buildEmailSubject(triggerType) {
  const label = triggerType === "AM"
    ? "Morning"
    : triggerType === "PM"
      ? "Evening"
      : "On-Demand Test";
  return `🌅 Sunsethue Forecast: Next Sunrise & Sunset Quality (${label})`;
}

module.exports = {
  formatTimeET,
  normalizeQualityToUnit,
  qualityToPercent,
  getQualityBadge,
  escapeHtml,
  buildForecastEventSnapshot,
  normalizeForecastEvent,
  selectNextSunEvents,
  validateReportEnv,
  buildEmailSubject
};
