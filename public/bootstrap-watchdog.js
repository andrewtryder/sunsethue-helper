/**
 * Independent of app.js module loading. Clears a stuck loading overlay
 * and offers Retry when bootstrap never finishes.
 */
(function bootstrapWatchdog() {
  var TIMEOUT_MS = 10000;

  function hideOverlay() {
    var overlay = document.getElementById("loading-overlay");
    if (overlay && !overlay.classList.contains("fade-out")) {
      overlay.classList.add("fade-out");
    }
  }

  function showFatalBanner() {
    var existing = document.getElementById("bootstrap-fatal-banner");
    if (existing) return;
    var banner = document.createElement("div");
    banner.id = "bootstrap-fatal-banner";
    banner.setAttribute("role", "alert");
    banner.style.cssText =
      "position:fixed;left:0;right:0;top:0;z-index:1100;padding:12px 16px;" +
      "background:#7f1d1d;color:#fff;font:14px/1.4 system-ui,sans-serif;" +
      "display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;";
    banner.innerHTML =
      "<span>Sunsethue Helper could not finish loading.</span>" +
      "<button type=\"button\" id=\"bootstrap-fatal-retry\" " +
      "style=\"border:0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer;\">Retry</button>";
    document.body.appendChild(banner);
    var retry = document.getElementById("bootstrap-fatal-retry");
    if (retry) {
      retry.addEventListener("click", function () {
        location.reload();
      });
    }
  }

  setTimeout(function () {
    var overlay = document.getElementById("loading-overlay");
    if (!overlay || overlay.classList.contains("fade-out")) return;
    hideOverlay();
    showFatalBanner();
  }, TIMEOUT_MS);
})();
