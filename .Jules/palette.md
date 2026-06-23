## 2024-06-25 - Added aria labels to icon buttons and hid decorative icons
**Learning:** Google Material Icons (`material-symbols-outlined`) render text within the element (e.g. `wb_sunny`, `search`). Without `aria-hidden="true"`, screen readers might read the literal text instead of identifying it as a decorative icon. Also, icon-only buttons need descriptive `aria-label` attributes for accessibility.
**Action:** When adding or working with material icons, always use `aria-hidden="true"` and pair them with `aria-label` on interactive parent elements.
## 2024-06-25 - Dynamic notification banners accessibility
**Learning:** Empty notification containers that are populated with text via JavaScript (like toast notifications or banners) need `aria-live` attributes to ensure screen readers announce the text when it is injected. Otherwise, visually impaired users will not receive the notification feedback.
**Action:** Always add `role="status" aria-live="polite"` for success/informational banners and `role="alert" aria-live="assertive"` for error banners directly in the HTML markup for dynamic containers.
