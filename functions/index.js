const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const helpers = require("./lib/helpers");
const { runAndSendReport } = require("./lib/report");
const { handleTriggerReport, handleSearchCoordinates, handleGetApiCredits } = require("./lib/handlers");

admin.initializeApp();
const db = admin.firestore();

const reportDeps = {
  db,
  fetch,
  createTransport: nodemailer.createTransport,
  env: process.env
};

async function runScheduledReport(triggerType) {
  try {
    await runAndSendReport(triggerType, reportDeps);
  } catch (error) {
    console.error(`Error in scheduled report (${triggerType}):`, error);
  }
}

exports.scheduledReportAM = onSchedule({
  schedule: "0 6 * * *",
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 120,
  secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"]
}, async () => {
  await runScheduledReport("AM");
});

exports.scheduledReportPM = onSchedule({
  schedule: "0 18 * * *",
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 120,
  secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"]
}, async () => {
  await runScheduledReport("PM");
});

exports.triggerReport = onRequest({
  cors: true,
  memory: "256MiB",
  timeoutSeconds: 60,
  secrets: ["SUNSETHUE_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_TO"]
}, async (req, res) => {
  await handleTriggerReport(req, res, {
    verifyIdToken: (token) => admin.auth().verifyIdToken(token),
    runAndSendReport: (triggerType) => runAndSendReport(triggerType, reportDeps)
  });
});

exports.searchCoordinates = onRequest({
  cors: true,
  memory: "256MiB",
  timeoutSeconds: 30
}, async (req, res) => {
  await handleSearchCoordinates(req, res, {
    verifyIdToken: (token) => admin.auth().verifyIdToken(token),
    fetch
  });
});

exports.getApiCredits = onRequest({
  cors: true,
  memory: "256MiB",
  timeoutSeconds: 30,
  secrets: ["SUNSETHUE_API_KEY"]
}, async (req, res) => {
  await handleGetApiCredits(req, res, {
    verifyIdToken: (token) => admin.auth().verifyIdToken(token),
    fetch,
    env: process.env
  });
});

Object.assign(exports, helpers);
Object.assign(exports, { runAndSendReport, handleTriggerReport, handleSearchCoordinates, handleGetApiCredits });
