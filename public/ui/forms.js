export function setStatusBadge(el, configured, detailTitle = "") {
  if (!el) return;
  el.textContent = configured ? "Configured" : "Not configured";
  el.classList.toggle("success", configured);
  el.classList.toggle("muted", !configured);
  if (detailTitle) {
    el.title = detailTitle;
  } else {
    el.removeAttribute("title");
  }
}
