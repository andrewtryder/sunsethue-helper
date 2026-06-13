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
*   **Backend**: **Cloud Functions** v2 (Node.js 24 runtime) containing the scheduler triggers and an HTTP trigger proxy for manual runs.
*   **SMTP Transporter**: Nodemailer configured using Gmail App Passwords to deliver reports.

---

## 🚀 CI/CD Automated Deployment

Deployments are automated via **GitHub Actions**. Whenever you push to the `main` branch, the workflow:
1. Installs Node.js dependencies.
2. Runs unit tests inside the `functions/` directory.
3. Automatically deploys frontend assets to Firebase Hosting and upgrades Cloud Functions to Node 24.

### Local commands:
- Run backend tests: `npm test --prefix functions`
- Run all unit tests: `npm test`
- Run E2E tests (Node 24, Java 21+, Firebase emulators): `npm run test:e2e`
- On macOS without Java on PATH: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`
- Deploy manually: `npx firebase-tools deploy`

E2E is not required on pull requests; run it locally or trigger the **E2E** workflow manually in GitHub Actions.

---

## 🔧 Configuration & Debugging

### Environment Variables
This application uses the following environment variables:
*   `SUNSETHUE_API_KEY`: The API key for queries to the Sunsethue API.
*   `GMAIL_USER`: The Gmail address used to send out automated reports (via SMTP).
*   `GMAIL_APP_PASSWORD`: A secure Google App Password for the SMTP server.
*   `EMAIL_TO`: The email address where daily reports are sent (also used as the authorized client-side login email).
*   `EMAIL_FROM`: (Optional) The `From` display/header for automated emails (e.g., `"Sunsethue Helper" <your-email@example.com>`). Defaults to `GMAIL_USER`.

Set these variables locally in `functions/.env.local` (and `functions/.secret.local` for emulator testing), or as secrets in GitHub Actions and Google Cloud Secret Manager.

### Client-Side Debug Mode
By default, verbose render cycle logs (which output locations and coordinates) are disabled. To enable client-side debugging:
*   Append `?debug=true` to the browser URL (e.g., `http://localhost:5000/?debug=true`), or
*   Run `localStorage.setItem('debug', 'true')` in your browser's developer tools console and refresh the page.

