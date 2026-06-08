const {
  formatTimeOnlyET,
  formatColumnDateET,
  getQualityBadge,
  escapeHtml,
  buildForecastEventSnapshot,
  normalizeForecastEvent,
  selectNextSunEvents,
  validateReportEnv,
  buildEmailSubject
} = require("./helpers");

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

function buildForecastEventCell(event, mobileLabel) {
  if (!event) {
    return `<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#c4c7c8;">N/A</span>`;
  }

  const time = formatTimeOnlyET(event.time);
  const qualityHtml = getQualityBadge(event.quality, event.quality_text);

  return `
    <div style="margin-bottom:4px;color:#e5e2e1;font-size:14px;font-weight:500;">${mobileLabel ? `${mobileLabel} ` : ""}${time}</div>
    <div>${qualityHtml}</div>
  `;
}

function buildEmailTableRows(results, triggerType) {
  const isAM = triggerType === "AM";
  let tableRowsHtml = "";

  for (const result of results) {
    if (result.error) {
      tableRowsHtml += `
        <tr>
          <td style="padding:24px 0;border-bottom:1px solid #201f1f;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(result.name)}</td>
          <td colspan="2" style="padding:24px 0;border-bottom:1px solid #201f1f;color:#ffb4ab;font-family:'JetBrains Mono',monospace;font-size:12px;">
            Error querying API: ${escapeHtml(result.error)}
          </td>
        </tr>
      `;
      continue;
    }

    const sunriseCell = buildForecastEventCell(result.sunrise, "");
    const sunsetCell = buildForecastEventCell(result.sunset, "");

    const firstCol = isAM ? sunsetCell : sunriseCell;
    const secondCol = isAM ? sunriseCell : sunsetCell;

    tableRowsHtml += `
      <tr>
        <td style="padding:24px 0;border-bottom:1px solid #201f1f;color:#ffffff;font-size:18px;font-weight:600;vertical-align:top;width:25%;">
          ${escapeHtml(result.name)}
        </td>
        <td style="padding:24px 0;border-bottom:1px solid #201f1f;vertical-align:top;width:37.5%;text-align:right;">
          ${firstCol}
        </td>
        <td style="padding:24px 0;border-bottom:1px solid #201f1f;vertical-align:top;width:37.5%;text-align:right;">
          ${secondCol}
        </td>
      </tr>
    `;
  }

  return tableRowsHtml;
}

function buildHtmlEmail(results, triggerType, reportTimeText) {
  const isAM = triggerType === "AM";
  const tableRowsHtml = buildEmailTableRows(results, triggerType);
  const headerTimes = getHeaderEventTimes(results);
  const sunriseHeaderDate = formatColumnDateET(headerTimes.sunrise);
  const sunsetHeaderDate = formatColumnDateET(headerTimes.sunset);
  const firstHeader = isAM
    ? `Next Sunset ${sunsetHeaderDate}`.trim()
    : `Next Sunrise ${sunriseHeaderDate}`.trim();
  const secondHeader = isAM
    ? `Next Sunrise ${sunriseHeaderDate}`.trim()
    : `Next Sunset ${sunsetHeaderDate}`.trim();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Sunsethue Forecast Report</title>
    </head>
    <body style="margin:0;padding:0;background-color:#141313;color:#e5e2e1;font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:650px;margin:0 auto;padding:32px 24px;">
        <h1 style="margin:0 0 8px 0;font-size:32px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Forecast Dashboard</h1>
        <p style="margin:0 0 32px 0;font-family:'JetBrains Mono',monospace;font-size:12px;color:#c4c7c8;">Generated ${reportTimeText} (${triggerType})</p>
        <table style="width:100%;border-collapse:collapse;text-align:left;">
          <thead>
            <tr>
              <th style="padding:8px 0;border-bottom:1px solid #201f1f;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:#c4c7c8;text-align:left;width:25%;">Location</th>
              <th style="padding:8px 0;border-bottom:1px solid #201f1f;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:#c4c7c8;text-align:right;width:37.5%;">${firstHeader}</th>
              <th style="padding:8px 0;border-bottom:1px solid #201f1f;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:#c4c7c8;text-align:right;width:37.5%;">${secondHeader}</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #353434;text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:#8e9192;">
          <p style="margin:0;">This email was sent automatically to you because you set up Sunsethue Helper.</p>
          <p style="margin:8px 0 0 0;">Manage your locations via your private dashboard.</p>
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
  const now = deps.now ?? Date.now();

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
