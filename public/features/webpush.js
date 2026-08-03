export function initWebPush({ api, showSuccess, showError, DEMO_READ_ONLY }) {
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function fetchWebPushDevices() {
    const response = await api.send("/api/web-push/subscriptions");
    if (!response.ok) throw new Error("Failed to load browser devices.");
    const data = await response.json();
    const host = document.getElementById("web-push-devices");
    if (!host) return;
    const devices = data.devices || [];
    if (!devices.length) {
      host.innerHTML = "<p class=\"pane-subtext\">No devices registered yet.</p>";
      return;
    }
    host.innerHTML = devices.map((device) =>
      `<div class="settings-toggle-row"><span>${device.deviceName} — ${device.enabled ? "Enabled" : "Disabled"}</span>
        <button type="button" class="btn btn-secondary" data-push-disable="${device.id}">Disable</button>
        <button type="button" class="btn btn-secondary" data-push-remove="${device.id}">Remove</button></div>`
    ).join("");
    host.querySelectorAll("[data-push-disable]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
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
          await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-remove")}`, {
            method: "DELETE"
          });
        } catch { /* demo mode */ }
        await fetchWebPushDevices();
      });
    });
  }

  document.getElementById("enable-web-push-btn")?.addEventListener("click", async () => {
    try {
      if (DEMO_READ_ONLY) throw new Error("DEMO_READ_ONLY");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Browser push is not supported in this browser.");
      }
      const reg = await navigator.serviceWorker.register("/service-worker.js");
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
