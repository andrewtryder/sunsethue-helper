const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

/**
 * Formats a UTC ISO string into America/New_York timezone.
 * E.g., 2026-05-27T12:44:00.000Z -> Wed, May 27, 8:44 AM
 */
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

/**
 * Returns HTML badge styling for quality scores.
 */
function getQualityBadge(quality) {
  if (quality === null || quality === undefined) {
    return `<span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold; background-color: #2a2a2a; color: #888;">N/A</span>`;
  }
  
  const percentage = Math.round(quality * 100);
  let bgColor, textColor, label;
  
  if (percentage >= 60) {
    // Premium quality
    bgColor = "#ffd4d6";
    textColor = "#d92b3a";
    label = "Spectacular";
  } else if (percentage >= 30) {
    // Fair/Good quality
    bgColor = "#fef3c7";
    textColor = "#b45309";
    label = "Good";
  } else {
    // Low quality
    bgColor = "#f3f4f6";
    textColor = "#4b5563";
    label = "Muted";
  }
  
  return `<span style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold; background-color: ${bgColor}; color: ${textColor}; display: inline-block;">${percentage}% (${label})</span>`;
}

/**
 * Core function to query Sunsethue API and send the daily report.
 */
async function runAndSendReport(triggerType) {
  const apiKey = process.env.SUNSETHUE_API_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const emailTo = process.env.EMAIL_TO;

  console.log(`Starting daily report check. Trigger: ${triggerType}. Target Email: ${emailTo}`);

  try {
    if (!apiKey || apiKey === "PLACEHOLDER") {
      throw new Error("SUNSETHUE_API_KEY environment variable is not configured.");
    }
    if (!gmailUser || !gmailPass || gmailPass === "PLACEHOLDER_GMAIL_APP_PASSWORD") {
      throw new Error("Gmail SMTP configuration environment variables are missing or not set.");
    }

    // 1. Fetch locations from Firestore
    const locationsSnapshot = await db.collection("locations").orderBy("createdAt", "asc").limit(10).get();
    const locations = [];
    locationsSnapshot.forEach(doc => {
      locations.push({ id: doc.id, ...doc.data() });
    });

    if (locations.length === 0) {
      console.log("No locations found in Firestore. Skipping email.");
      // Log run with 0 locations
      await db.collection("runs").add({
        timestamp: Date.now(),
        triggerType: triggerType,
        status: "success",
        locationsCount: 0,
        results: [],
        error: null
      });
      return;
    }

    // Cap at 10 locations to ensure credits are not exhausted and emails are brief
    const activeLocations = locations.slice(0, 10);
    const now = Date.now();
    const results = [];

    // 2. Fetch forecast data for each location
    for (const loc of activeLocations) {
      try {
        console.log(`Fetching forecast for location: ${loc.name} (${loc.latitude}, ${loc.longitude})`);
        
        const response = await fetch(
          `https://api.sunsethue.com/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&days=2&key=${apiKey}`
        );
        
        if (!response.ok) {
          throw new Error(`API returned HTTP status ${response.status}`);
        }
        
        const json = await response.json();
        if (!json || !json.data) {
          throw new Error("Invalid API response format");
        }

        // Filter and sort events to find the NEXT sunrise and NEXT sunset
        const events = json.data;
        
        const sunriseEvents = events
          .filter(e => e.type === "sunrise" && new Date(e.time).getTime() > now)
          .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const sunsetEvents = events
          .filter(e => e.type === "sunset" && new Date(e.time).getTime() > now)
          .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const nextSunrise = sunriseEvents[0] || null;
        const nextSunset = sunsetEvents[0] || null;

        results.push({
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          sunrise: nextSunrise,
          sunset: nextSunset,
          error: null
        });

        // Cache the latest forecast data directly in the location document
        await db.collection("locations").doc(loc.id).update({
          latestSunriseTime: nextSunrise ? nextSunrise.time : null,
          latestSunriseQuality: nextSunrise ? nextSunrise.quality : null,
          latestSunriseText: nextSunrise ? nextSunrise.quality_text : null,
          latestSunsetTime: nextSunset ? nextSunset.time : null,
          latestSunsetQuality: nextSunset ? nextSunset.quality : null,
          latestSunsetText: nextSunset ? nextSunset.quality_text : null,
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

        // Log the error in the location document
        await db.collection("locations").doc(loc.id).update({
          lastForecastUpdate: Date.now(),
          forecastError: error.message
        });
      }
    }

    // 3. Generate HTML email content
    const reportTimeText = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "short"
    });

    let tableRowsHtml = "";
    for (const res of results) {
      if (res.error) {
        tableRowsHtml += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 16px; font-weight: bold; color: #1f2937;">${escapeHtml(res.name)}</td>
            <td colspan="2" style="padding: 12px 16px; color: #dc2626; font-style: italic;">
              Error querying API: ${escapeHtml(res.error)}
            </td>
          </tr>
        `;
      } else {
        const sunriseTime = res.sunrise ? formatTimeET(res.sunrise.time) : "N/A";
        const sunriseQuality = res.sunrise ? getQualityBadge(res.sunrise.quality) : "N/A";
        
        const sunsetTime = res.sunset ? formatTimeET(res.sunset.time) : "N/A";
        const sunsetQuality = res.sunset ? getQualityBadge(res.sunset.quality) : "N/A";

        tableRowsHtml += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 16px; font-weight: bold; color: #1f2937;">
              ${escapeHtml(res.name)}
              <div style="font-size: 11px; color: #6b7280; font-weight: normal; margin-top: 4px; font-family: monospace;">
                ${res.latitude.toFixed(4)}, ${res.longitude.toFixed(4)}
              </div>
            </td>
            <td style="padding: 16px; color: #374151; vertical-align: middle;">
              <div style="font-size: 14px; font-weight: 500;">${sunriseTime}</div>
              <div style="margin-top: 6px;">${sunriseQuality}</div>
            </td>
            <td style="padding: 16px; color: #374151; vertical-align: middle;">
              <div style="font-size: 14px; font-weight: 500;">${sunsetTime}</div>
              <div style="margin-top: 6px;">${sunsetQuality}</div>
            </td>
          </tr>
        `;
      }
    }

    const htmlEmail = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Sunsethue Quality Report</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; color: #333;">
        <div style="max-width: 650px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
          
          <!-- Sunset Gradient Header -->
          <div style="background: linear-gradient(135deg, #ff5e62 0%, #ff9966 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
            <span style="font-size: 40px;">🌅</span>
            <h1 style="margin: 10px 0 5px 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Sunsethue Forecast Report</h1>
            <p style="margin: 0; font-size: 14px; opacity: 0.9;">Generated on ${reportTimeText} (${triggerType})</p>
          </div>
          
          <!-- Main Content -->
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb; background-color: #f9fafb;">
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 40%;">Location</th>
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 30%;">Next Sunrise</th>
                  <th style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; width: 30%;">Next Sunset</th>
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

    // 4. Configure Nodemailer transport using Gmail App Password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });

    // 5. Send Mail
    const subject = `🌅 Sunsethue Forecast: Next Sunrise & Sunset Quality (${triggerType === "AM" ? "Morning" : triggerType === "PM" ? "Evening" : "On-Demand Test"})`;
    
    const mailOptions = {
      from: `"Sunsethue Helper" <${gmailUser}>`,
      to: emailTo,
      subject: subject,
      html: htmlEmail
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email dispatched successfully! Message ID:", info.messageId);

    // 6. Write success/warning log to Firestore
    const hasErrors = results.some(r => r.error);
    await db.collection("runs").add({
      timestamp: Date.now(),
      triggerType: triggerType,
      status: hasErrors ? "warning" : "success",
      locationsCount: activeLocations.length,
      results: results.map(r => ({
        name: r.name,
        status: r.error ? "error" : "success",
        error: r.error || null
      })),
      error: null
    });

  } catch (globalError) {
    console.error("Global report execution failed:", globalError);
    // Write failure log to Firestore
    try {
      await db.collection("runs").add({
        timestamp: Date.now(),
        triggerType: triggerType,
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

// Helper function to escape HTML inside templates
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Scheduled Cloud Function (AM): Triggers daily at 6:00 AM Eastern Time
 */
exports.scheduledReportAM = onSchedule({
  schedule: "0 6 * * *",
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 120,
  secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"]
}, async (event) => {
  try {
    await runAndSendReport("AM");
  } catch (error) {
    console.error("Error in scheduledReportAM:", error);
  }
});

/**
 * Scheduled Cloud Function (PM): Triggers daily at 6:00 PM Eastern Time
 */
exports.scheduledReportPM = onSchedule({
  schedule: "0 18 * * *",
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 120,
  secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"]
}, async (event) => {
  try {
    await runAndSendReport("PM");
  } catch (error) {
    console.error("Error in scheduledReportPM:", error);
  }
});

/**
 * HTTPS Cloud Function: Manual trigger endpoint for testing (routed from /api/triggerReport)
 */
exports.triggerReport = onRequest({ cors: true, memory: "256MiB", timeoutSeconds: 60, secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"] }, async (req, res) => {
  // Check request type
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Retrieve authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing auth header" });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    // Verify user ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Restrict access specifically to owner@example.com
    if (decodedToken.email !== "owner@example.com") {
      res.status(403).json({ error: "Forbidden: Unauthorized user account." });
      return;
    }

    // Call the core report engine
    await runAndSendReport("Manual Test");
    
    res.status(200).json({ success: true, message: "Report processed and email sent." });
  } catch (error) {
    console.error("Error in triggerReport onRequest:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * HTTPS Cloud Function: Geocoding search proxy to avoid CORS and User-Agent blocking from browsers.
 * Routed from /api/searchCoordinates
 */
exports.searchCoordinates = onRequest({ cors: true, memory: "256MiB", timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Retrieve authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing auth header" });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    // Verify user ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Restrict access specifically to owner@example.com
    if (decodedToken.email !== "owner@example.com") {
      res.status(403).json({ error: "Forbidden: Unauthorized user account." });
      return;
    }

    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: "Missing search query" });
      return;
    }

    console.log(`Nominatim search via proxy: "${query}"`);

    // Fetch from OpenStreetMap Nominatim with custom User-Agent
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SunsethueHelper/1.0 (owner@example.com)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in searchCoordinates proxy:", error);
    res.status(500).json({ error: error.message });
  }
});

// Export helper functions for testing
exports.formatTimeET = formatTimeET;
exports.getQualityBadge = getQualityBadge;

