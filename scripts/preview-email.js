#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { buildHtmlEmail } = require("../functions/lib/report");
const { buildEmailSubject } = require("../functions/lib/helpers");

const args = process.argv.slice(2);
const triggerType = args.includes("--am") ? "AM" : "PM";
const shouldOpen = !args.includes("--no-open");

const dummyResults = [
  {
    name: "Sandown, NH",
    latitude: 42.9286,
    longitude: -71.187,
    sunrise: {
      time: "2026-06-08T09:12:00.000Z",
      quality: 0.52,
      quality_text: "Good"
    },
    sunset: {
      time: "2026-06-08T23:45:00.000Z",
      quality: 0.78,
      quality_text: "Great"
    },
    error: null
  },
  {
    name: "Boston, MA",
    latitude: 42.3601,
    longitude: -71.0589,
    sunrise: {
      time: "2026-06-08T09:05:00.000Z",
      quality: 0.22,
      quality_text: "Fair"
    },
    sunset: {
      time: "2026-06-08T23:38:00.000Z",
      quality: 0.08,
      quality_text: "Low"
    },
    error: null
  },
  {
    name: "Remote Cabin",
    latitude: 44.5,
    longitude: -71.2,
    sunrise: null,
    sunset: null,
    error: "API returned HTTP status 503"
  }
];

const reportTimeText = new Date().toLocaleString("en-US", {
  timeZone: "America/New_York",
  dateStyle: "full",
  timeStyle: "short"
});

const html = buildHtmlEmail(dummyResults, triggerType, reportTimeText);
const outputDir = path.join(__dirname, "..", ".tmp");
const outputFile = path.join(outputDir, `email-preview-${triggerType.toLowerCase()}.html`);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, html, "utf8");

console.log(`Email preview written to ${outputFile}`);
console.log(`Subject: ${buildEmailSubject(triggerType)}`);
console.log(`Trigger: ${triggerType} (use --am for morning column order)`);

if (!shouldOpen) {
  process.exit(0);
}

try {
  if (process.platform === "darwin") {
    execSync(`open "${outputFile}"`, { stdio: "ignore" });
  } else if (process.platform === "win32") {
    execSync(`start "" "${outputFile}"`, { stdio: "ignore", shell: true });
  } else {
    execSync(`xdg-open "${outputFile}"`, { stdio: "ignore" });
  }
  console.log("Opened preview in your default browser.");
} catch {
  console.log("Could not open a browser automatically. Open the file path above manually.");
}
