const {
  formatTimeET,
  getQualityBadge,
  escapeHtml,
  selectNextSunEvents,
  validateReportEnv,
  buildEmailSubject,
  buildForecastEventSnapshot,
  normalizeForecastEvent
} = require("./helpers");

function buildEmailTableRows(results, triggerType) {
  const isAM = triggerType === "AM";
  let tableRowsHtml = "";

  for (const result of results) {
    if (result.error) {
      tableRowsHtml += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 16px; font-weight: bold; color: #1f2937;">${escapeHtml(result.name)}</td>
            <td colspan="2" style="padding: 12px 16px; color: #dc2626; font-style: italic;">
              Error querying API: ${escapeHtml(result.error)}
            </td>
          </tr>
        `;
      continue;
    }

    const sunriseTime = result.sunrise ? formatTimeET(result.sunrise.time) : "N/A";
    const sunriseQuality = result.sunrise
      ? getQualityBadge(result.sunrise.quality, result.sunrise.quality_text)
      : "N/A";
    const sunsetTime = result.sunset ? formatTimeET(result.sunset.time) : "N/A";
    const sunsetQuality = result.sunset
      ? getQualityBadge(result.sunset.quality, result.sunset.quality_text)
      : "N/A";

    const sunriseTd = `
          <td style="padding: 16px; color: #374151; vertical-align: middle;">
            <div style="font-size: 14px; font-weight: 500;">${sunriseTime}</div>
            <div style="margin-top: 6px;">${sunriseQuality}</div>
          </td>
        `;
    const sunsetTd = `
          <td style="padding: 16px; color: #374151; vertical-align: middle;">
            <div style="font-size: 14px; font-weight: 500;">${sunsetTime}</div>
            <div style="margin-top: 6px;">${sunsetQuality}</div>
          </td>
        `;

    tableRowsHtml += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 16px; font-weight: bold; color: #1f2937;">
              ${escapeHtml(result.name)}
              <div style="font-size: 11px; color: #6b7280; font-weight: normal; margin-top: 4px; font-family: monospace;">
                ${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}
              </div>
            </td>
            ${isAM ? sunsetTd : sunriseTd}
            ${isAM ? sunriseTd : sunsetTd}
          </tr>
        `;
  }

  return tableRowsHtml;
}

function buildHtmlEmail(results, triggerType, reportTimeText) {
  const isAM = triggerType === "AM";
  const tableRowsHtml = buildEmailTableRows(results, triggerType);

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Sunsethue Quality Report</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; color: #333;">
        <div style="max-width: 650px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, #ff5e62 0%, #ff9966 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
            <span style="font-size: 40px;">🌅</span>
            <h1 style="margin: 10px 0 5px 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Sunsethue Forecast Report</h1>
            <p style="margin: 0; font-size: 14px; opacity: 0.9;">Generated on ${reportTimeText} (${triggerType})</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb; background-color: #f9fafb;">
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 40%;">Location</th>
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 30%;">${isAM ? "Next Sunset" : "Next Sunrise"}</th>
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 30%;">${isAM ? "Next Sunrise" : "Next Sunset"}</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
            <div style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
              <p style="margin: 0;">This email was sent automatically to you because you set up Sunsethue Helper.</p>
              <p style="margin: 4px 0 0 0;">Manage your locations via your private dashboard.</p>
            </div>
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

async function runAndSendReport(triggerType, deps) {
  const db = deps.db;
  const fetchFn = deps.fetch;
  const createTransport = deps.createTransport;
  const env = deps.env;
  const now = deps.now ?? Date.now;

  console.log(`Starting daily report check. Trigger: ${triggerType}. Target Email: ${env.EMAIL_TO}`);

  try {
    validateReportEnv(env);

    const locationsSnapshot = await db.collection("locations").orderBy("createdAt", "asc").limit(10).get();
    const locations = [];
    locationsSnapshot.forEach((doc) => {
      locations.push({ id: doc.id, ...doc.data() });
    });

    if (locations.length === 0) {
      console.log("No locations found in Firestore. Skipping email.");
      await db.collection("runs").add({
        timestamp: Date.now(),
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

        const response = await fetchFn(
          `https://api.sunsethue.com/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&days=2&key=${env.SUNSETHUE_API_KEY}`
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

        await db.collection("locations").doc(loc.id).update({
          latestSunriseTime: sunrise ? sunrise.time : null,
          latestSunriseQuality: sunrise ? sunrise.quality : null,
          latestSunriseText: sunrise ? sunrise.quality_text : null,
          latestSunsetTime: sunset ? sunset.time : null,
          latestSunsetQuality: sunset ? sunset.quality : null,
          latestSunsetText: sunset ? sunset.quality_text : null,
          lastForecastUpdate: Date.now(),
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

        await db.collection("locations").doc(loc.id).update({
          lastForecastUpdate: Date.now(),
          forecastError: error.message
        });
      }
    }

    const reportTimeText = new Date(now).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short"
    });

    const htmlEmail = buildHtmlEmail(results, triggerType, reportTimeText);
    const transporter = createTransport({
      service: "gmail",
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD
      }
    });

    const mailOptions = {
      from: `"Sunsethue Helper" <${env.GMAIL_USER}>`,
      to: env.EMAIL_TO,
      subject: buildEmailSubject(triggerType),
      html: htmlEmail
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email dispatched successfully! Message ID:", info.messageId);

    const hasErrors = results.some((result) => result.error);
    await db.collection("runs").add({
      timestamp: Date.now(),
      triggerType,
      status: hasErrors ? "warning" : "success",
      locationsCount: activeLocations.length,
      results: results.map(buildRunResultEntry),
      error: null
    });
  } catch (globalError) {
    console.error("Global report execution failed:", globalError);
    try {
      await db.collection("runs").add({
        timestamp: Date.now(),
        triggerType,
        status: "failure",
        locationsCount: 0,
        results: [],
        error: globalError.message
      });
    } catch (logError) {
      console.error("Failed to write failure log to Firestore:", logError);
    }
    throw globalError;
  }
}

module.exports = {
  buildEmailTableRows,
  buildHtmlEmail,
  runAndSendReport
};
