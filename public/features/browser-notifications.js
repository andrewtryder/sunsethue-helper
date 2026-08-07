export function initBrowserNotifications({ api, showSuccess, showError, DEMO_READ_ONLY, capabilities }) {
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  const pushBtn = document.getElementById("enable-web-push-btn");
  if (pushBtn && !capabilities?.webPush) {
    pushBtn.disabled = true;
    pushBtn.textContent = "Available in a deployed instance";
    pushBtn.title = "Browser Push is disabled in the static demo.";
  }

  async function fetchWebPushDevices() {
    const response = await api.send("/api/web-push/subscriptions");
    if (!response.ok) throw new Error("Failed to load browser devices.");
    const data = await response.json();
    const host = document.getElementById("web-push-devices");
    if (!host) return;
    const devices = data.devices || [];
    const subtitle = document.getElementById("webpush-channel-subtitle");
    if (subtitle) {
      const enabledCount = devices.filter((d) => d.enabled).length;
      subtitle.textContent = devices.length
        ? `${enabledCount} device${enabledCount === 1 ? "" : "s"} enabled · ${devices.length} registered`
        : "No devices registered yet";
    }
    if (!devices.length) {
      host.innerHTML = "<p class=\"pane-subtext\">No devices registered yet.</p>";
      return;
    }
    host.innerHTML = devices.map((device) =>
      `<div class="settings-toggle-row"><span>${device.deviceName} — ${device.enabled ? "Enabled" : "Disabled"}</span>
        <button type="button" class="btn btn-secondary" data-push-disable="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Disable</button>
        <button type="button" class="btn btn-secondary" data-push-remove="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Remove</button></div>`
    ).join("");
    host.querySelectorAll("[data-push-disable]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-disable")}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false })
          });
        } catch { /* demo mode */ }
        await fetchWebPushDevices();
      });
    });
    host.querySelectorAll("[data-push-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-remove")}`, {
            method: "DELETE"
          });
        } catch { /* demo mode */ }
        await fetchWebPushDevices();
      });
    });
  }

  pushBtn?.addEventListener("click", async () => {
    try {
      if (!capabilities?.webPush) throw new Error("Browser Push is disabled in the static demo.");
      if (DEMO_READ_ONLY) throw new Error("DEMO_READ_ONLY");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Browser push is not supported in this browser.");
      }
      const reg = await navigator.serviceWorker.register("./service-worker.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const vapidRes = await api.send("/api/web-push/vapid-public-key");
      const vapid = await vapidRes.json();
      if (!vapid.publicKey) throw new Error("Web Push is not configured on the server.");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey)
      });
      const json = sub.toJSON();
      const deviceName = window.prompt("Name this device", "This device") || "This device";
      const response = await api.send("/api/web-push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          deviceName
        })
      });
      if (!response.ok) throw new Error("Unable to register this device.");
      showSuccess("Browser notifications enabled on this device.");
      await fetchWebPushDevices();
    } catch (error) {
      showError(error.message);
    }
  });

  return { fetchWebPushDevices };
}
