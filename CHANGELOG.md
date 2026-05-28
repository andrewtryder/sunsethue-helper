# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.5.2] - 2026-05-28

### Fixed
- Refactored `public/app.js` to preserve the Google Material Symbols font-icons on the search and save buttons during state transitions (preventing icons from being overwritten by plain text strings).

## [1.5.1] - 2026-05-28

### Fixed
- Adjusted Firestore security rules in `firestore.rules` to remove `email_verified == true` checks, allowing users logging in via email/password credentials to successfully perform read/write actions.

## [1.5.0] - 2026-05-27

### Added
- Smooth full-screen loading screen overlay (`#loading-overlay`) with transition fade-out to prevent page-reload auth state layout flickering.
- Keyboard navigation accessibility (up/down arrow keys, Enter, and Escape keys) to the address autocomplete suggestions dropdown in the dashboard location form.
- Direct database query limit `.limit(10)` to the Cloud Function locations Firestore pull to save database read operations.

### Changed
- Configured Cloud Functions (`scheduledReportAM`, `scheduledReportPM`, and `triggerReport`) to bind and fetch sensitive API keys and SMTP credentials securely from **GCP Secret Manager**.
- Hardened alert banners logic in `public/app.js` with map-based timeout tracking to resolve overlapping message timer bugs.

## [1.4.0] - 2026-05-27

### Changed
- Relocated design system file `design.md` from the root directory to `docs/design.md` for better repository organization.
- Updated automated extractor script `scripts/extract-stitch.js` to output to the new `docs/design.md` location.
- Refactored backend tests in `functions/test.js` to import helper functions directly from `functions/index.js` instead of duplicating them.
- Hardened Firestore security rules in `firestore.rules` to restrict read/write access strictly to `owner@example.com` with a verified email.

## [1.3.0] - 2026-05-27

### Added
- Zero-dependency frontend structural validation suite (`scripts/test-frontend.js`) using native Node.js test runner to assert crucial HTML DOM element IDs and CSS selectors are intact.
- Local Git `pre-commit` hooks wrapper (`scripts/pre-commit.sh`) to automatically validate both frontend and backend tests before committing code locally.
- Git hooks automated installer script (`scripts/setup-git-hooks.sh`).
- Project change tracking documentation (`CHANGELOG.md`).

### Changed
- Integrated frontend structural tests into the GitHub Actions CI pipeline (`.github/workflows/firebase-deploy.yml`) to abort cloud deployments if HTML/CSS structures are broken.

---

## [1.2.0] - 2026-05-27

### Added
- Local version control initialized using Git.
- CI/CD automated deployment workflow with GitHub Actions (`.github/workflows/firebase-deploy.yml`) to deploy to Firebase on push to the `main` branch.
- Project description and quick-start instructions in `README.md` at the root folder.
- Saved planning design artifacts in `docs/`.

### Fixed
- Replaced Docker-based `w9jds/firebase-action` with native Node `npx firebase-tools` inside GitHub Actions workflow to solve environment initialization crashes.

---

## [1.1.0] - 2026-05-27

### Added
- Redesigned the main dashboard into a tabbed layout separating **Main Forecast**, **Manage Locations**, and **Execution Logs** for simplified UX.
- Built a Live Forecast Dashboard preview table inside the **Main Forecast** tab mirroring the daily email reports.
- Added visual color-coded badges (Spectacular, Good, Muted) with translucent styling in the dashboard table.
- Added resilient try-catch wrappers around the frontend JS rendering cycles (`renderLocations()` and `renderForecastDashboard()`) to log and print errors inside the UI instead of freezing.

### Changed
- Upgraded the backend Cloud Functions Node.js runtime environment to **Node.js 22** in `functions/package.json`.
- Removed the logs popup modal window and its respective DOM selectors.

### Fixed
- Solved a rendering bug where the forecast dashboard comparison table would not clear or update when the location list became empty.

---

## [1.0.0] - 2026-05-27

### Added
- Fully cloud-hosted architecture deployed on Firebase (`sunsethue-helper-12345`).
- Secure administrative sign-in restricted to `owner@example.com` using Firebase Authentication.
- Dynamic geocoding coordinate lookup proxy (`searchCoordinates`) and Photon API autocomplete dropdown search on the client side.
- Device geolocation retrieval ("Use Current Location") with macOS compatibility configurations.
- v2 Cloud Scheduler functions (`scheduledReportAM` and `scheduledReportPM`) running daily at 6:00 AM and 6:00 PM Eastern.
- Automated email delivery of forecast reports via Nodemailer and Gmail SMTP app passwords.
- Cloud logging collection (`runs`) tracking execution run outcomes in Firestore.
