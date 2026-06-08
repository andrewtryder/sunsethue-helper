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

function formatEventDateLabel(utcString) {
  if (!utcString) {
    return "";
  }
  return formatColumnDateET(utcString).replace(/^\(|\)$/g, "");
}

function buildForecastEventBlock(event, eventLabel) {
  if (!event) {
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${eventLabel}</div>
        <div style="font-size:15px;color:#9ca3af;">N/A</div>
      </div>
    `;
  }

  const dateLabel = formatEventDateLabel(event.time);
  const time = formatTimeOnlyET(event.time);
  const qualityHtml = getQualityBadge(event.quality, event.quality_text);
  const heading = dateLabel ? `${eventLabel} · ${dateLabel}` : eventLabel;

  return `
    <div style="margin-bottom:14px;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">${heading}</div>
      <div style="display:block;">
        <span style="font-size:17px;font-weight:600;color:#1a1a1a;margin-right:10px;">${time}</span>
        ${qualityHtml}
      </div>
    </div>
  `;
}

function buildEmailLocationBlocks(results, triggerType) {
  const isAM = triggerType === "AM";
  let blocksHtml = "";

  for (const result of results) {
    if (result.error) {
      blocksHtml += `
        <div style="margin-bottom:16px;padding:16px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:18px;font-weight:600;color:#1a1a1a;margin-bottom:8px;">${escapeHtml(result.name)}</div>
          <div style="font-size:14px;color:#dc2626;">Error querying API: ${escapeHtml(result.error)}</div>
        </div>
      `;
      continue;
    }

    const sunriseBlock = buildForecastEventBlock(result.sunrise, "Sunrise");
    const sunsetBlock = buildForecastEventBlock(result.sunset, "Sunset");
    const firstBlock = isAM ? sunsetBlock : sunriseBlock;
    const secondBlock = isAM ? sunriseBlock : sunsetBlock;

    blocksHtml += `
      <div style="margin-bottom:16px;padding:16px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:18px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">${escapeHtml(result.name)}</div>
        ${firstBlock}
        ${secondBlock}
      </div>
    `;
  }

  return blocksHtml;
}

function buildHtmlEmail(results, triggerType, reportTimeText) {
  const locationBlocksHtml = buildEmailLocationBlocks(results, triggerType);

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
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.5;color:#6b7280;">${reportTimeText} · ${triggerType} report</p>
        ${locationBlocksHtml}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;line-height:1.5;color:#9ca3af;">
          <p style="margin:0;">Sent automatically by Sunsethue Helper.</p>
          <p style="margin:8px 0 0 0;">Manage locations in your private dashboard.</p>
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
  buildEmailLocationBlocks,
  buildEmailTableRows: buildEmailLocationBlocks,
  buildHtmlEmail,
  runAndSendReport
};
