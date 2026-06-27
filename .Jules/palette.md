## 2024-06-25 - Added aria labels to icon buttons and hid decorative icons
**Learning:** Google Material Icons (`material-symbols-outlined`) render text within the element (e.g. `wb_sunny`, `search`). Without `aria-hidden="true"`, screen readers might read the literal text instead of identifying it as a decorative icon. Also, icon-only buttons need descriptive `aria-label` attributes for accessibility.
**Action:** When adding or working with material icons, always use `aria-hidden="true"` and pair them with `aria-label` on interactive parent elements.## 2024-06-25 - Accessibility improvements for dynamic notification banners
**Learning:** Empty dynamic notification containers populated via JavaScript must have `role="status" aria-live="polite"` (for success/info) or `role="alert" aria-live="assertive"` (for errors) directly in the HTML markup to ensure screen readers announce updates.
**Action:** When adding notification banners, ensure proper ARIA roles and live regions are configured.
## 2024-06-25 - Essential global styles for keyboard accessibility and interaction feedback
**Learning:** Adding a global `:focus-visible` ring provides critical feedback for keyboard users navigating interactive elements (like buttons and links), while generic `button:disabled, input:disabled` states provide essential visual feedback for screen-reader and sighted users during loading or validation events (e.g. `opacity: 0.5; cursor: not-allowed`).
**Action:** Always verify that interactive elements show focus rings on keyboard navigation and provide explicit visual cues when disabled.

## 2024-06-25 - ARIA Tab Roles for Navigation
**Learning:** Custom tab implementations (like those using `nav-tab` buttons to show/hide `tab-pane` divs) are completely opaque to screen readers without ARIA attributes. A screen reader user won't know they are navigating a tabbed interface or which tab is active.
**Action:** Always implement the `role="tablist"`, `role="tab"`, and `role="tabpanel"` pattern for custom tabs. Remember to bind `aria-controls` on the tabs to the panel IDs, `aria-labelledby` on the panels to the tab IDs, and dynamically update `aria-selected` in JS when the active tab changes.

## 2024-10-27 - Adding focus visible styles for keyboard navigation
**Learning:** The project's interactive elements lacked explicit focus indicators, which made keyboard navigation difficult. Adding `:focus-visible` styles to buttons, links, and elements with `tabindex="0"` improves accessibility without impacting the visual experience for mouse users.
**Action:** When working on interactive elements, always consider their focus states. Adding global focus styles using `:focus-visible` and the project's `--primary` color is an effective way to address this systematically.


## 2024-10-27 - Visual Required Indicators and Validation Feedback
**Learning:** Adding the `required` attribute to HTML inputs alone isn't always enough for good UX, especially if `novalidate` might be used on the form (preventing native popups) or if users don't use screen readers. Visual indicators (like a red asterisk) make required fields immediately clear. Additionally, explicit front-end validation checks that produce clear, accessible error banners are vital for actionable feedback when a user submits an empty required field.
**Action:** When creating forms, include explicit visual cues (e.g. `<span class="required-indicator" aria-hidden="true" title="required">*</span>`) for required fields. Ensure custom JavaScript submission handlers provide immediate, friendly error messages if required data is missing.
