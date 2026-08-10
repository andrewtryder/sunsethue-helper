export function setStatusBadge(el, configured, detailTitle = "") {
  if (!el) return;
  el.textContent = configured ? "Configured" : "No credentials";
  el.classList.toggle("success", configured);
  el.classList.toggle("muted", !configured);
  el.classList.toggle("on", configured);
  el.classList.toggle("off", !configured);
  if (detailTitle) {
    el.title = detailTitle;
  } else {
    el.removeAttribute("title");
  }
}

export function syncEnabledPill(el, enabled, { onLabel = "Enabled", offLabel = "Disabled" } = {}) {
  if (!el) return;
  el.classList.toggle("on", enabled);
  el.classList.toggle("off", !enabled);
  el.innerHTML = `<span class="dot" aria-hidden="true"></span>${enabled ? onLabel : offLabel}`;
}
