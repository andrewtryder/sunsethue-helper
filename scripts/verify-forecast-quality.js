#!/usr/bin/env node

const {
  normalizeQualityToUnit,
  qualityToPercent,
  selectNextSunEvents
} = require("../functions/lib/helpers");

function printUsage() {
  console.error("Usage: node scripts/verify-forecast-quality.js <latitude> <longitude>");
  console.error("Requires SUNSETHUE_API_KEY in the environment.");
}

function formatEventLine(event, label) {
  if (!event) {
    console.log(`${label}: none`);
    return;
  }

  const normalized = normalizeQualityToUnit(event.quality);
  const displayPercent = qualityToPercent(event.quality);

  console.log(`${label}:`);
  console.log(`  time: ${event.time}`);
  console.log(`  type: ${event.type}`);
  console.log(`  quality (raw): ${event.quality}`);
  console.log(`  quality (normalized): ${normalized}`);
  console.log(`  quality_text: ${event.quality_text ?? "n/a"}`);
  console.log(`  display percent: ${displayPercent ?? "n/a"}%`);
}

async function main() {
  const latitude = process.argv[2];
  const longitude = process.argv[3];
  const apiKey = process.env.SUNSETHUE_API_KEY;

  if (!latitude || !longitude) {
    printUsage();
    process.exit(1);
  }

  if (!apiKey) {
    console.error("Missing SUNSETHUE_API_KEY environment variable.");
    process.exit(1);
  }

  const url = `https://api.sunsethue.com/forecast?latitude=${latitude}&longitude=${longitude}&days=2&key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error(`API returned HTTP ${response.status}`);
    process.exit(1);
  }

  const json = await response.json();
  if (!json || !Array.isArray(json.data)) {
    console.error("Unexpected API response format.");
    process.exit(1);
  }

  const now = Date.now();
  console.log(`Location: ${latitude}, ${longitude}`);
  console.log(`Now: ${new Date(now).toISOString()}`);
  console.log("");

  console.log("All forecast events:");
  for (const event of json.data) {
    const percent = qualityToPercent(event.quality);
    console.log(
      `- ${event.type} @ ${event.time} | raw=${event.quality} | normalized=${normalizeQualityToUnit(event.quality)} | ${percent ?? "n/a"}% | ${event.quality_text ?? "n/a"}`
    );
  }

  console.log("");
  const { nextSunrise, nextSunset } = selectNextSunEvents(json.data, now);
  console.log("Selected for report email:");
  formatEventLine(nextSunrise, "Next sunrise");
  console.log("");
  formatEventLine(nextSunset, "Next sunset");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
