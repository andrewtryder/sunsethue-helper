# Sunsethue Helper Implementation Plan: Tabbed UI & API Credit Analysis

We will redesign the web application to use a tabbed layout dividing the interface into three clean sections: **Main (Forecast Dashboard)**, **Locations (CRUD Management)**, and **Logs (Execution History)**. We will also confirm the backend scheduler logic and answer your API credit usage question.

---

## 1. Sunsethue API Credit Calculation

Here is the credit calculation based on the Sunsethue API specifications:
*   **Daily Runs**: 2 scheduled runs (6:00 AM & 6:00 PM Eastern).
*   **Monitored Locations**: 10 active locations.
*   **Query Range**: `days=2` (retrieves forecast events for today and tomorrow).
*   **Events Per Query**: A 2-day range typically returns 4 events per location (2 sunrises + 2 sunsets).
*   **Credit Cost per Event**: 5 credits (with full ray-tracing model data enabled, which is required for quality scores).
*   **Calculation**:
    *   *Per Location Query*: 4 events × 5 credits = 20 credits.
    *   *Per Run (10 Locations)*: 10 locations × 20 credits = 200 credits.
    *   *Per Day (2 Runs)*: 2 runs × 200 credits = **400 credits/day**.
*   **Quota Impact**: Since Sunsethue's free tier provides **1,000 credits/day**, your daily consumption of 400 credits is well within the free limits (40% utilization) and will be **100% free**.

---

## 2. Scheduler & Caching Behavior

The backend Cloud Functions (`scheduledReportAM` and `scheduledReportPM`) are already aligned with your requested logic:
1. They run automatically twice daily at **6:00 AM** and **6:00 PM** Eastern Time.
2. They query the API, store/cache the results directly in each location's document in Firestore (`latestSunriseQuality`, etc.), and then immediately send the email report.
3. The frontend displays the cached values from Firestore.
4. As you noted, if you add or modify a location, it will display "No forecast cached" or the previous cache until the next scheduled 12-hour run (or until you manually click "Send Test Email Now" to force a run). This data lag is normal and acceptable. No changes to the backend codebase are needed.

---

## 3. Proposed Changes (Tabbed UI Redesign)

We will modify the frontend to transition from the current grid/modal design to a tabbed navigation system.

### [MODIFY] [index.html](file:///Users/atr/code/sunsethue-helper/public/index.html)
- Add a new tab navigation header (`.tabs-navigation`) with buttons for **Main Forecast**, **Manage Locations**, and **Execution Logs**.
- Restructure the page into three tab panels (`.tab-pane`):
  1.  **Main Forecast Tab**: Contains the forecast summary table showing all locations' cached scores, manual trigger buttons, and the last updated timestamp.
  2.  **Manage Locations Tab**: Contains the 2-column grid allowing location edits/deletions and the geocoding add form.
  3.  **Execution Logs Tab**: Renders the history list of execution runs (formerly in the logs modal) as a full-screen scrollable layout.
- Remove the "View Execution Logs" button and the obsolete Modal DOM markup.

### [MODIFY] [style.css](file:///Users/atr/code/sunsethue-helper/public/style.css)
- Add class styling for the tab navigation container (`.tabs-navigation`) and tab buttons (`.tab-btn`).
- Add active states and hover effects using CSS variables and glassmorphic designs.
- Style the tab panel wrapper (`.tab-pane`) to control visibility with animations.
- Set up a clean, full-width scrollable container for the Logs tab (`.logs-tab-container`).

### [MODIFY] [app.js](file:///Users/atr/code/sunsethue-helper/public/app.js)
- Remove references and event listeners for the obsolete logs modal.
- Add tab switching event listeners that toggle active classes on the buttons and panes.
- Retain the Firestore snapshots for `locations` and `runs` to update their respective tabs in real-time.

---

## 4. Verification Plan

### Manual Verification
1. Open the updated web application and sign in with `atr000@gmail.com`.
2. Confirm the three tabs are visible at the top and styled beautifully.
3. Test clicking between the tabs:
   - **Main Forecast** should show the comparison table, last run time, and "Send Test Email Now" trigger.
   - **Manage Locations** should show the form and the edit/delete options.
   - **Execution Logs** should show the list of runs in full width.
4. Add a location in the *Manage Locations* tab, then click *Main Forecast* to verify it appears in the comparison table with a "No forecast cached" status.
5. Click **Send Test Email Now** on the Main tab to run a manual trigger, and verify that the table updates with fresh forecast scores and the logs tab updates with a new run entry in real-time.
