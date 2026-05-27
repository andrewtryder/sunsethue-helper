# 🌅 Sunsethue Helper

Sunsethue Helper is a secure, cloud-hosted private web application built on Firebase that manages location coordinates, queries the Sunsethue forecast API, and emails daily reports summarizing the upcoming sunrise and sunset quality forecasts.

---

## ✨ Features

*   **📊 Live Forecast Dashboard**: Visualizes cached forecast quality indicators (Spectacular, Good, Muted) and timezone-adjusted event times from the previous run.
*   **📍 Location Management (CRUD)**: Manage up to 10 coordinates with direct device geolocation ("Use Current Location") and Photon API geocoding search autocomplete.
*   **📋 Run Execution Logs**: Timeline log showing the execution history and status of the last 20 scheduler or manual runs.
*   **📧 Automated Email Reports**: Sends HTML reports to `owner@example.com` daily at 6:00 AM and 6:00 PM Eastern Time.
*   **🔒 Complete Privacy**: Restricts application logins and manual triggers strictly to `owner@example.com`.

---

## 🛠️ Architecture

*   **Frontend**: Single Page Application (HTML/CSS/JS) styled with a premium glassmorphic dark-mode interface, served via **Firebase Hosting**.
*   **Database**: **Cloud Firestore** storing coordinates (`locations` collection) and logs (`runs` collection) with robust security rules.
*   **Backend**: **Cloud Functions** v2 (Node.js 22 runtime) containing the scheduler triggers and an HTTP trigger proxy for manual runs.
*   **SMTP Transporter**: Nodemailer configured using Gmail App Passwords to deliver reports.

---

## 🚀 CI/CD Automated Deployment

Deployments are automated via **GitHub Actions**. Whenever you push to the `main` branch, the workflow:
1. Installs Node.js dependencies.
2. Runs unit tests inside the `functions/` directory.
3. Automatically deploys frontend assets to Firebase Hosting and upgrades Cloud Functions to Node 22.

### Local commands:
- Run backend tests: `npm test --prefix functions`
- Deploy manually: `npx firebase-tools deploy`
