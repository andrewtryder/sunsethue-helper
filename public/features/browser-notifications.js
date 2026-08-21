export function initBrowserNotifications({
  api,
  showSuccess,
  showError,
  DEMO_READ_ONLY,
  capabilities,
  onDevicesChanged
}) {
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  function reportDevicesChanged(counts) {
    if (typeof onDevicesChanged === "function") {
      onDevicesChanged(counts);
    }
  }

  function notificationPermission() {
    try {
      return typeof Notification !== "undefined" ? Notification.permission : "default";
    } catch {
      return "default";
    }
  }

  const pushBtn = document.getElementById("enable-web-push-btn");
  if (pushBtn && !capabilities?.webPush) {
    pushBtn.disabled = true;
    pushBtn.textContent = "Available in a deployed instance";
    pushBtn.title = "Browser Push is disabled in the static demo.";
  }

  function renderPermissionPendingRegistration(host) {
    host.innerHTML = `
      <p class="pane-subtext" id="webpush-permission-pending" role="status">Permission granted · Device not registered</p>
      <div class="form-actions form-actions-compact">
        <button type="button" class="btn btn-secondary" id="retry-web-push-registration-btn" ${!capabilities?.webPush || !capabilities?.mutations ? "disabled" : ""}>
          Retry registration
        </button>
      </div>`;
    host.querySelector("#retry-web-push-registration-btn")?.addEventListener("click", () => {
      registerThisDevice({ isRetry: true }).catch(() => {});
    });
  }

  function renderDeviceRows(host, devices) {
    host.innerHTML = devices.map((device) => {
      const enabled = Boolean(device.enabled);
      const name = device.deviceName || "This device";
      const actions = enabled
        ? `<button type="button" class="btn btn-secondary" data-push-test="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Send test notification</button>
           <button type="button" class="btn btn-secondary" data-push-disable="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Disable</button>
           <button type="button" class="btn btn-secondary" data-push-remove="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Remove</button>`
        : `<button type="button" class="btn btn-secondary" data-push-enable="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Enable</button>
           <button type="button" class="btn btn-secondary" data-push-remove="${device.id}" ${!capabilities?.mutations ? "disabled" : ""}>Remove</button>`;
      return `<div class="settings-toggle-row webpush-device-row" data-device-id="${device.id}">
        <span>${name} — ${enabled ? "Enabled" : "Disabled"}</span>
        <div class="webpush-device-actions">${actions}</div>
      </div>`;
    }).join("");

    host.querySelectorAll("[data-push-test]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          const response = await api.send("/api/notifications/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "webpush" })
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const code = payload?.error?.code;
            if (code === "PROVIDER_NOT_CONFIGURED") {
              throw new Error("No browser push devices are enabled.");
            }
            if (code === "RATE_LIMITED") throw new Error("Rate limited. Try again in a minute.");
            throw new Error("Browser push test could not be queued.");
          }
          showSuccess("Browser push test queued.");
        } catch (error) {
          showError(error.message);
        }
      });
    });

    host.querySelectorAll("[data-push-enable]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          const response = await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-enable")}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true })
          });
          if (!response.ok) throw new Error("Unable to enable this device.");
          await fetchWebPushDevices();
        } catch (error) {
          showError(error.message);
        }
      });
    });

    host.querySelectorAll("[data-push-disable]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          const response = await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-disable")}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false })
          });
          if (!response.ok) throw new Error("Unable to disable this device.");
          await fetchWebPushDevices();
        } catch (error) {
          showError(error.message);
        }
      });
    });

    host.querySelectorAll("[data-push-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          if (!capabilities?.mutations) return;
          const response = await api.send(`/api/web-push/subscriptions/${btn.getAttribute("data-push-remove")}`, {
            method: "DELETE"
          });
          if (!response.ok) throw new Error("Unable to remove this device.");
          await fetchWebPushDevices();
        } catch (error) {
          showError(error.message);
        }
      });
    });
  }

  async function fetchWebPushDevices() {
    const response = await api.send("/api/web-push/subscriptions");
    if (!response.ok) throw new Error("Failed to load browser devices.");
    const data = await response.json();
    const host = document.getElementById("web-push-devices");
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const enabledCount = devices.filter((d) => d.enabled).length;
    const deviceCount = devices.length;
    const counts = { enabledCount, deviceCount };

    const subtitle = document.getElementById("webpush-channel-subtitle");
    if (subtitle) {
      subtitle.textContent = deviceCount
        ? `${enabledCount} device${enabledCount === 1 ? "" : "s"} enabled · ${deviceCount} registered`
        : notificationPermission() === "granted"
          ? "Permission granted · Device not registered"
          : "No devices registered yet";
    }
    const webpushPill = document.getElementById("webpush-enabled-pill");
    if (webpushPill) {
      const on = enabledCount > 0;
      webpushPill.classList.toggle("on", on);
      webpushPill.classList.toggle("off", !on);
      webpushPill.innerHTML = `<span class="dot" aria-hidden="true"></span>${on ? `${enabledCount} enabled` : "No devices"}`;
    }

    if (host) {
      if (!deviceCount) {
        if (notificationPermission() === "granted") {
          renderPermissionPendingRegistration(host);
        } else {
          host.innerHTML = "<p class=\"pane-subtext\">No devices registered yet.</p>";
        }
      } else {
        renderDeviceRows(host, devices);
      }
    }

    if (pushBtn && capabilities?.webPush) {
      pushBtn.hidden = false;
      pushBtn.disabled = false;
      pushBtn.textContent = deviceCount ? "Register another device" : "Enable on this device";
    }

    reportDevicesChanged(counts);
    return counts;
  }

  async function registerThisDevice({ isRetry = false } = {}) {
    try {
      if (!capabilities?.webPush) throw new Error("Browser Push is disabled in the static demo.");
      if (DEMO_READ_ONLY) throw new Error("DEMO_READ_ONLY");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Browser push is not supported in this browser.");
      }

      let registration;
      try {
        await navigator.serviceWorker.register("./service-worker.js");
      } catch {
        throw new Error("Could not register the service worker for browser push.");
      }
      try {
        registration = await navigator.serviceWorker.ready;
      } catch {
        throw new Error("Service worker is not ready for browser push.");
      }
      if (!registration?.pushManager) {
        throw new Error("Push messaging is unavailable in this browser.");
      }

      let permission = notificationPermission();
      if (permission !== "granted") {
        try {
          permission = await Notification.requestPermission();
        } catch {
          throw new Error("Notification permission could not be requested.");
        }
      }
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      let subscription;
      try {
        subscription = await registration.pushManager.getSubscription();
      } catch {
        throw new Error("Could not read the existing browser push subscription.");
      }

      if (!subscription) {
        let vapid;
        try {
          const vapidRes = await api.send("/api/web-push/vapid-public-key");
          if (!vapidRes.ok) throw new Error("vapid_http");
          vapid = await vapidRes.json();
        } catch {
          throw new Error("Could not load the Web Push public key from the server.");
        }
        if (!vapid?.publicKey) {
          throw new Error("Web Push is not configured on the server.");
        }
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapid.publicKey)
          });
        } catch {
          throw new Error("Could not create a browser push subscription.");
        }
      }

      const json = subscription.toJSON();
      if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
        throw new Error("Browser push subscription is incomplete.");
      }

      const deviceName = window.prompt("Name this device", "This device") || "This device";
      let createResponse;
      try {
        createResponse = await api.send("/api/web-push/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            deviceName
          })
        });
      } catch {
        throw new Error("Could not reach Sunsethue to register this device.");
      }
      if (!createResponse.ok) {
        throw new Error("Sunsethue rejected this browser push registration.");
      }
      const created = await createResponse.json().catch(() => null);
      const createdId = created?.device?.id || null;

      let verifyResponse;
      try {
        verifyResponse = await api.send("/api/web-push/subscriptions");
      } catch {
        throw new Error("Registered locally, but could not verify the device list.");
      }
      if (!verifyResponse.ok) {
        throw new Error("Registered locally, but could not verify the device list.");
      }
      const verified = await verifyResponse.json().catch(() => null);
      const devices = Array.isArray(verified?.devices) ? verified.devices : [];
      const matched = devices.find((device) => (
        (createdId && device.id === createdId)
        || device.deviceName === deviceName
      ));
      if (!matched || !matched.enabled) {
        throw new Error("Registration did not appear as an enabled device. Try again.");
      }

      showSuccess(isRetry
        ? "Browser push registration completed."
        : "Browser notifications enabled on this device.");
      await fetchWebPushDevices();
    } catch (error) {
      showError(error.message);
      throw error;
    }
  }

  pushBtn?.addEventListener("click", () => {
    registerThisDevice().catch(() => {});
  });

  return { fetchWebPushDevices, registerThisDevice };
}
