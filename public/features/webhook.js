export function initWebhook({ api, showSuccess, showError, CREDENTIAL_ADMIN_HEADER, fetchNotificationSettings, capabilities }) {
  const statusEl = document.getElementById("webhook-credentials-status");

  document.getElementById("webhook-credentials-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capabilities?.mutations || !capabilities?.credentialManagement) {
      if (statusEl) {
        statusEl.className = "pane-subtext error";
        statusEl.textContent = "Webhook configuration is disabled in the static demo.";
      }
      return;
    }
    if (statusEl) statusEl.className = "status-badge muted";
    try {
      const putRes = await api.send("/api/webhook-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...CREDENTIAL_ADMIN_HEADER },
        body: JSON.stringify({
          url: document.getElementById("webhook-url")?.value || "",
          signingSecret: document.getElementById("webhook-signing-secret")?.value || ""
        })
      });
      if (!putRes.ok) throw new Error("Unable to save webhook credentials.");
      // Persist current enable switch alongside credentials (switch also auto-saves on change).
      const enabled = Boolean(document.getElementById("notification-webhook-enabled")?.checked);
      const settingsRes = await api.send("/api/notification-settings");
      const settings = await settingsRes.json();
      await api.send("/api/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: settings.emailEnabled,
          emailTo: settings.emailTo,
          pushoverEnabled: settings.pushoverEnabled,
          pushoverDevice: settings.pushoverDevice,
          pushoverPriority: settings.pushoverPriority,
          pushoverSound: settings.pushoverSound,
          webhookEnabled: enabled
        })
      });
      showSuccess("Webhook saved.");
      await fetchNotificationSettings();
    } catch (error) {
      showError(error.message);
    }
  });

  document.getElementById("test-webhook-btn")?.addEventListener("click", async () => {
    if (!capabilities?.mutations) {
      showError("Testing webhook is disabled in the static demo.");
      return;
    }
    try {
      const response = await api.send("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "webhook" })
      });
      if (!response.ok) throw new Error("Webhook test failed.");
      showSuccess("Webhook test queued.");
    } catch (error) {
      showError(error.message);
    }
  });

  document.getElementById("remove-webhook-btn")?.addEventListener("click", async () => {
    if (!capabilities?.credentialManagement) {
      showError("Removing webhook is disabled in the static demo.");
      return;
    }
    try {
      await api.send("/api/webhook-credentials", {
        method: "DELETE",
        headers: { ...CREDENTIAL_ADMIN_HEADER }
      });
      showSuccess("Webhook removed.");
      await fetchNotificationSettings();
    } catch (error) {
      showError(error.message);
    }
  });
}
