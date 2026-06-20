import * as db from "./db.js";
import {
  formatColumnDateET,
  getQualityBadge,
  escapeHtml,
  buildForecastEventSnapshot,
  normalizeForecastEvent,
  selectNextSunEvents,
  validateReportEnv,
  buildEmailSubject
} from "./helpers.js";

function parseEmailAddress(addressString) {
  const clean = addressString.trim();
  if (clean.includes("<") && clean.endsWith(">")) {
    const parts = clean.split("<");
    const namePart = parts[0].trim().replace(/^"/, "").replace(/"$/, "").trim();
    const emailPart = parts[1].replace(">", "").trim();
    return { name: namePart, email: emailPart };
  }
  return { name: "", email: clean };
}

function getHeaderEventTimes(results) {
  for (const result of results) {
    if (result.error) {
      continue;
    }
    return {
      sunrise: result.sunrise?.time || null,
      sunset: result.sunset?.time || null
    };
  }
  return { sunrise: null, sunset: null };
}

function buildForecastEventCell(event) {
  if (!event) {
    return `<span style="font-size:14px;color:#9ca3af;">N/A</span>`;
  }
  return getQualityBadge(event.quality, event.quality_text);
}

function buildEmailTableRows(results, triggerType) {
  const isSunsetFirst = triggerType === "AM" || triggerType === "NOON";
  let tableRowsHtml = "";

  for (const result of results) {
    if (result.error) {
      tableRowsHtml += `
        <tr>
          <td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;font-size:16px;font-weight:600;color:#1a1a1a;vertical-align:top;">${escapeHtml(result.name)}</td>
          <td colspan="2" style="padding:14px 8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#dc2626;vertical-align:top;">
            Error querying API: ${escapeHtml(result.error)}
          </td>
        </tr>
      `;
      continue;
    }

    const sunriseCell = buildForecastEventCell(result.sunrise);
    const sunsetCell = buildForecastEventCell(result.sunset);
    const firstCol = isSunsetFirst ? sunsetCell : sunriseCell;
    const secondCol = isSunsetFirst ? sunriseCell : sunsetCell;

    tableRowsHtml += `
      <tr>
        <td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;font-size:16px;font-weight:600;color:#1a1a1a;vertical-align:top;">${escapeHtml(result.name)}</td>
        <td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${firstCol}</td>
        <td style="padding:14px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${secondCol}</td>
      </tr>
    `;
  }

  return tableRowsHtml;
}

export function buildHtmlEmail(results, triggerType, reportTimeText, webappUrl) {
  const isSunsetFirst = triggerType === "AM" || triggerType === "NOON";
  const tableRowsHtml = buildEmailTableRows(results, triggerType);
  const headerTimes = getHeaderEventTimes(results);
  const sunriseHeaderDate = formatColumnDateET(headerTimes.sunrise);
  const sunsetHeaderDate = formatColumnDateET(headerTimes.sunset);
  const firstHeader = isSunsetFirst
    ? `Next Sunset ${sunsetHeaderDate}`.trim()
    : `Next Sunrise ${sunriseHeaderDate}`.trim();
  const secondHeader = isSunsetFirst
    ? `Next Sunrise ${sunriseHeaderDate}`.trim()
    : `Next Sunset ${sunsetHeaderDate}`.trim();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Sunsethue Forecast Report</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f5;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
        <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;line-height:1.3;color:#1a1a1a;">Sunrise &amp; Sunset Forecast</h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#6b7280;">${reportTimeText} · ${triggerType} report</p>
        <table style="width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background-color:#f9fafb;">
              <th style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;text-align:left;color:#6b7280;width:28%;">Location</th>
              <th style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;text-align:left;color:#6b7280;width:36%;">${firstHeader}</th>
              <th style="padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;text-align:left;color:#6b7280;width:36%;">${secondHeader}</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;line-height:1.5;color:#9ca3af;">
          <p style="margin:0;">Sent automatically by Sunsethue Helper.</p>
          <p style="margin:8px 0 0 0;">
            <a href="${webappUrl}" style="color:#2563eb;text-decoration:underline;">Manage locations in your private dashboard</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildRunResultEntry(result) {
  return {
    name: result.name,
    status: result.error ? "error" : "success",
    error: result.error || null,
    forecast: result.error
      ? null
      : {
          sunrise: buildForecastEventSnapshot(result.sunrise),
          sunset: buildForecastEventSnapshot(result.sunset)
        }
  };
}

export async function runAndSendReport(triggerType, env) {
  const now = Date.now();
  console.log(`Starting report run. Trigger: ${triggerType}. Target Email: ${env.EMAIL_TO}`);

  try {
    validateReportEnv(env);

    const locations = await db.getLocations(env);
    if (locations.length === 0) {
      console.log("No locations found in D1. Skipping email.");
      await db.addRun(env, {
        id: crypto.randomUUID(),
        timestamp: now,
        triggerType,
        status: "success",
        locationsCount: 0,
        results: [],
        error: null
      });
      return;
    }

    const activeLocations = locations.slice(0, 10);
    const results = [];

    for (const loc of activeLocations) {
      try {
        console.log(`Fetching forecast for location: ${loc.name} (${loc.latitude}, ${loc.longitude})`);

        const cleanApiKey = String(env.SUNSETHUE_API_KEY).trim();
        const response = await fetch(
          `https://api.sunsethue.com/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&days=2&key=${cleanApiKey}`
        );

        if (!response.ok) {
          throw new Error(`API returned HTTP status ${response.status}`);
        }

        const json = await response.json();
        if (!json || !json.data) {
          throw new Error("Invalid API response format");
        }

        const { nextSunrise, nextSunset } = selectNextSunEvents(json.data, now);
        const sunrise = normalizeForecastEvent(nextSunrise);
        const sunset = normalizeForecastEvent(nextSunset);

        console.log(`Forecast selected for ${loc.name}:`, JSON.stringify({
          latitude: loc.latitude,
          longitude: loc.longitude,
          sunrise: buildForecastEventSnapshot(nextSunrise),
          sunset: buildForecastEventSnapshot(nextSunset)
        }));

        results.push({
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          sunrise,
          sunset,
          error: null
        });

        await db.updateLocationForecast(env, loc.id, {
          latestSunriseTime: sunrise ? sunrise.time : null,
          latestSunriseQuality: sunrise ? sunrise.quality : null,
          latestSunriseText: sunrise ? sunrise.quality_text : null,
          latestSunsetTime: sunset ? sunset.time : null,
          latestSunsetQuality: sunset ? sunset.quality : null,
          latestSunsetText: sunset ? sunset.quality_text : null,
          lastForecastUpdate: now,
          forecastError: null
        });
      } catch (error) {
        console.error(`Error querying Sunsethue API for ${loc.name}:`, error);
        results.push({
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          sunrise: null,
          sunset: null,
          error: error.message
        });

        await db.updateLocationForecast(env, loc.id, {
          lastForecastUpdate: now,
          forecastError: error.message
        });
      }
    }

    const reportTimeText = new Date(now).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short"
    });

    const webappUrl = env.WEBAPP_URL || "https://sunsethue-helper.pages.dev";
    const htmlEmail = buildHtmlEmail(results, triggerType, reportTimeText, webappUrl);
    
    const { WorkerMailer } = await import("worker-mailer");
    console.log("Connecting to SMTP server via worker-mailer...");
    const mailer = await WorkerMailer.connect({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      credentials: {
        username: env.GMAIL_USER,
        password: env.GMAIL_APP_PASSWORD
      },
      authType: ["plain", "login"]
    });

    const parsedFrom = parseEmailAddress(env.EMAIL_FROM || `"Sunsethue Helper" <${env.GMAIL_USER}>`);

    console.log("Sending email...");
    await mailer.send({
      from: {
        name: parsedFrom.name,
        email: parsedFrom.email
      },
      to: {
        email: env.EMAIL_TO
      },
      subject: buildEmailSubject(triggerType),
      html: htmlEmail
    });
    console.log("Email dispatched successfully via worker-mailer!");

    const hasErrors = results.some((result) => result.error);
    await db.addRun(env, {
      id: crypto.randomUUID(),
      timestamp: now,
      triggerType,
      status: hasErrors ? "warning" : "success",
      locationsCount: activeLocations.length,
      results: results.map(buildRunResultEntry),
      error: null
    });
  } catch (globalError) {
    console.error("Global report execution failed:", globalError);
    try {
      await db.addRun(env, {
        id: crypto.randomUUID(),
        timestamp: now,
        triggerType,
        status: "failure",
        locationsCount: 0,
        results: [],
        error: globalError.message
      });
    } catch (logError) {
      console.error("Failed to write failure log to D1 database:", logError);
    }
    throw globalError;
  }
}
