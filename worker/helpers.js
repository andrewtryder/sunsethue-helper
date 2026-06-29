const timeFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

const timeOnlyFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit"
});

const columnDateFormatterET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric"
});

export function formatTimeET(utcString) {
  if (!utcString) return "N/A";
  try {
    const date = Date.parse(utcString);
    return timeFormatterET.format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid Date";
  }
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

function getQualityFallbackLabel(percentage) {
  if (percentage >= 60) {
    return "Spectacular";
  }
  if (percentage >= 30) {
    return "Good";
  }
  return "Muted";
}

export function getQualityDotColor(percentage) {
  if (percentage === null) {
    return null;
  }
  if (percentage >= 50) {
    return "#34d399";
  }
  if (percentage >= 15) {
    return "#f97316";
  }
  return "#ef4444";
}

function formatQualityLabel(qualityText, percentage) {
  if (!qualityText) {
    return getQualityFallbackLabel(percentage);
  }

  const trimmed = String(qualityText).trim();
  if (trimmed === `${percentage}%` || trimmed === String(percentage)) {
    return getQualityFallbackLabel(percentage);
  }

  return trimmed;
}

export function formatTimeOnlyET(utcString) {
  if (!utcString) {
    return "N/A";
  }
  return timeOnlyFormatterET.format(Date.parse(utcString));
}

export function formatColumnDateET(utcString) {
  if (!utcString) {
    return "";
  }
  const formatted = columnDateFormatterET.format(Date.parse(utcString));
  return `(${formatted})`;
}

export function getQualityBadge(quality, qualityText) {
  const percentage = qualityToPercent(quality);
  if (percentage === null) {
    return `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#9ca3af;">N/A</span>`;
  }

  const dotColor = getQualityDotColor(percentage);
  const label = escapeHtml(formatQualityLabel(qualityText, percentage));
  const fontWeight = "600";

  // Determine readable text color based on background color
  let textColor = "#ffffff";
  if (percentage >= 50) {
    // For light green (#34d399), dark green text is much more readable
    textColor = "#064e3b";
  }

  return `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background-color:${dotColor};color:${textColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:${fontWeight};white-space:nowrap;">${percentage}% (${label})</span>`;
}

export function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildForecastEventSnapshot(event) {
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

export function normalizeForecastEvent(event) {
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

// ⚡ Bolt Performance Optimization:
// Replaced O(n log n) filter+sort chain with a single O(n) pass.
// This reduces CPU cycles when parsing multiple forecast events for multiple locations
// by finding the minimum future time directly without array allocation and sorting overhead.
export function selectNextSunEvents(events, nowMs = Date.now()) {
  let nextSunrise = null;
  let nextSunset = null;
  let minSunriseTime = Infinity;
  let minSunsetTime = Infinity;

  for (const event of events) {
    // ⚡ Bolt Performance Optimization:
    // Using Date.parse() instead of new Date().getTime() avoids allocating a new Date
    // object on the heap for every event, significantly reducing memory churn and CPU
    // overhead in this hot loop.
    const timeMs = Date.parse(event.time);
    if (timeMs > nowMs) {
      if (event.type === "sunrise" && timeMs < minSunriseTime) {
        minSunriseTime = timeMs;
        nextSunrise = event;
      } else if (event.type === "sunset" && timeMs < minSunsetTime) {
        minSunsetTime = timeMs;
        nextSunset = event;
      }
    }
  }

  return {
    nextSunrise,
    nextSunset
  };
}

export function validateReportEnv(env) {
  if (!env.SUNSETHUE_API_KEY || env.SUNSETHUE_API_KEY === "PLACEHOLDER") {
    throw new Error("SUNSETHUE_API_KEY environment variable is not configured.");
  }
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD || env.GMAIL_APP_PASSWORD === "PLACEHOLDER_GMAIL_APP_PASSWORD") {
    throw new Error("Gmail SMTP configuration environment variables are missing or not set.");
  }
  if (!env.EMAIL_TO) {
    throw new Error("EMAIL_TO environment variable is not configured.");
  }
}

export function buildEmailSubject(triggerType) {
  const label = triggerType === "AM"
    ? "Morning"
    : triggerType === "PM"
      ? "Evening"
      : triggerType === "NOON"
        ? "Midday"
        : "On-Demand Test";
  return `🌅 Sunsethue Forecast: Next Sunrise & Sunset Quality (${label})`;
}
