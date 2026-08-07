import { setStatusBadge } from "../ui/forms.js";

export function initNotifications({ api, showBanner, showSuccess, showError, CREDENTIAL_ADMIN_HEADER, fetchDeliveries, capabilities }) {
  const notificationEmailEnabled = document.getElementById("notification-email-enabled");
  const notificationEmailTo = document.getElementById("notification-email-to");
  const notificationPushoverEnabled = document.getElementById("notification-pushover-enabled");
  const notificationDevice = document.getElementById("notification-device");
  const notificationPriority = document.getElementById("notification-priority");
  const notificationSound = document.getElementById("notification-sound");
  const notificationEmailStatus = document.getElementById("notification-email-status");
  const notificationPushoverStatus = document.getElementById("notification-pushover-status");
  const gmailCredentialsForm = document.getElementById("gmail-credentials-form");
  const gmailCredentialsStatus = document.getElementById("gmail-credentials-status");
  const gmailUserInput = document.getElementById("gmail-user");
  const gmailAppPasswordInput = document.getElementById("gmail-app-password");
  const gmailEmailFromInput = document.getElementById("gmail-email-from");
  const pushoverCredentialsForm = document.getElementById("pushover-credentials-form");
  const pushoverCredentialsStatus = document.getElementById("pushover-credentials-status");
  const pushoverAppTokenInput = document.getElementById("pushover-app-token");
  const pushoverUserKeyInput = document.getElementById("pushover-user-key");

  function syncSwitchAria(el) {
    if (el) el.setAttribute("aria-checked", el.checked ? "true" : "false");
  }

  function applyProviderCredentialStatus(status, { merge = false } = {}) {
    if (gmailCredentialsStatus && (!merge || status?.email !== undefined)) {
      if (status?.email?.configured) {
        const detail = [
          status.email.gmailUserMasked || "masked",
          status.email.emailFromMasked ? `from ${status.email.emailFromMasked}` : null,
          status.email.updatedAt ? `updated ${new Date(status.email.updatedAt).toLocaleString()}` : null
        ].filter(Boolean).join(" · ");
        setStatusBadge(gmailCredentialsStatus, true, detail);
      } else if (!merge || status?.email) {
        setStatusBadge(gmailCredentialsStatus, false);
      }
    }
    if (pushoverCredentialsStatus && (!merge || status?.pushover !== undefined)) {
      if (status?.pushover?.configured) {
        const detail = [
          `app token ${status.pushover.appTokenPresent ? "present" : "missing"}`,
          `user key ${status.pushover.userKeyPresent ? "present" : "missing"}`,
          status.pushover.updatedAt ? `updated ${new Date(status.pushover.updatedAt).toLocaleString()}` : null
        ].filter(Boolean).join(" · ");
        setStatusBadge(pushoverCredentialsStatus, true, detail);
      } else if (!merge || status?.pushover) {
        setStatusBadge(pushoverCredentialsStatus, false);
      }
    }
    if (gmailAppPasswordInput) gmailAppPasswordInput.value = "";
    if (pushoverAppTokenInput) pushoverAppTokenInput.value = "";
    if (pushoverUserKeyInput) pushoverUserKeyInput.value = "";
  }

  function readNotificationSettingsBody() {
    return {
      emailEnabled: Boolean(notificationEmailEnabled?.checked),
      emailTo: notificationEmailTo?.value || null,
      pushoverEnabled: Boolean(notificationPushoverEnabled?.checked),
      pushoverDevice: notificationDevice?.value || null,
      pushoverPriority: Number(notificationPriority?.value ?? 0),
      pushoverSound: notificationSound?.value || null,
      webhookEnabled: Boolean(document.getElementById("notification-webhook-enabled")?.checked)
    };
  }

  async function saveNotificationSettings({ successMessage = "Notification settings saved." } = {}) {
    if (!capabilities?.mutations) {
      throw new Error("Saving notification settings is disabled in the static demo.");
    }
    const response = await api.send("/api/notification-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readNotificationSettingsBody())
    });
    if (!response.ok) throw new Error("Notification settings were not accepted.");
    if (successMessage) showSuccess(successMessage);
    await fetchNotificationSettings();
  }

  async function fetchNotificationSettings() {
    const response = await api.send("/api/notification-settings");
    if (!response.ok) throw new Error("Failed to load notification settings.");
    const settings = await response.json();
    if (notificationEmailEnabled) {
      notificationEmailEnabled.checked = settings.emailEnabled;
      syncSwitchAria(notificationEmailEnabled);
    }
    if (notificationEmailTo) notificationEmailTo.value = settings.emailTo || "";
    if (notificationPushoverEnabled) {
      notificationPushoverEnabled.checked = settings.pushoverEnabled;
      syncSwitchAria(notificationPushoverEnabled);
    }
    if (notificationDevice) notificationDevice.value = settings.pushoverDevice || "";
    if (notificationPriority) notificationPriority.value = String(settings.pushoverPriority);
    if (notificationSound) notificationSound.value = settings.pushoverSound || "";
    const webhookEnabledEl = document.getElementById("notification-webhook-enabled");
    if (webhookEnabledEl) {
      webhookEnabledEl.checked = Boolean(settings.webhookEnabled);
      syncSwitchAria(webhookEnabledEl);
    }
    const webhookStatus = document.getElementById("webhook-credentials-status");
    if (webhookStatus) {
      webhookStatus.textContent = settings.webhookConfigured
        ? (settings.webhookMaskedHostname ? `Configured · ${settings.webhookMaskedHostname}` : "Configured")
        : "Not configured";
      webhookStatus.classList.toggle("success", settings.webhookConfigured);
      webhookStatus.classList.toggle("muted", !settings.webhookConfigured);
    }
    if (notificationEmailStatus) {
      notificationEmailStatus.textContent = settings.emailConfigured ? "Configured" : "Not configured";
      notificationEmailStatus.classList.toggle("success", settings.emailConfigured);
      notificationEmailStatus.classList.toggle("muted", !settings.emailConfigured);
    }
    if (notificationPushoverStatus) {
      notificationPushoverStatus.textContent = settings.pushoverConfigured ? "Configured" : "Not configured";
      notificationPushoverStatus.classList.toggle("success", settings.pushoverConfigured);
      notificationPushoverStatus.classList.toggle("muted", !settings.pushoverConfigured);
    }
  }

  async function fetchProviderCredentials() {
    try {
      const response = await api.send("/api/provider-credentials", { timeoutMs: 5_000 });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message || "Credential status temporarily unavailable.";
        const code = payload?.error?.code;
        throw new Error(code ? `${message} (${code})` : message);
      }
      applyProviderCredentialStatus(await response.json());
    } catch (error) {
      if (gmailCredentialsStatus) {
        gmailCredentialsStatus.textContent = "Credential status temporarily unavailable";
        gmailCredentialsStatus.classList.remove("success");
        gmailCredentialsStatus.classList.add("muted");
      }
      if (pushoverCredentialsStatus) {
        pushoverCredentialsStatus.textContent = "Credential status temporarily unavailable";
        pushoverCredentialsStatus.classList.remove("success");
        pushoverCredentialsStatus.classList.add("muted");
      }
      throw error;
    }
  }

  async function refreshProviderCredentialsAfterMutation(partialStatus) {
    if (partialStatus) applyProviderCredentialStatus(partialStatus, { merge: true });
    try {
      await fetchProviderCredentials();
    } catch (error) {
      showError(error.message);
    }
  }

  async function testNotification(channel) {
    if (!capabilities?.mutations) {
      throw new Error(`Testing ${channel} is disabled in the static demo.`);
    }
    const response = await api.send("/api/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload?.error?.code;
      if (code === "PROVIDER_NOT_CONFIGURED" || code === "EMAIL_NOT_CONFIGURED" || code === "PUSHOVER_NOT_CONFIGURED") {
        throw new Error("Credentials are not configured for this channel.");
      }
      if (code === "INVALID_EMAIL_ADDRESS") {
        throw new Error(payload?.error?.message || "Set an email destination in notification settings before sending a test.");
      }
      if (code === "RATE_LIMITED") throw new Error("Rate limited. Try again in a minute.");
      throw new Error("Test notification could not be queued.");
    }
    showSuccess(`${channel === "email" ? "Email" : "Pushover"} test queued.`);
    await fetchDeliveries();
  }

  async function onEnableToggle(event) {
    const el = event.currentTarget;
    syncSwitchAria(el);
    try {
      await saveNotificationSettings({
        successMessage: el.checked ? "Channel enabled." : "Channel disabled."
      });
    } catch (error) {
      showError(error.message);
      try {
        await fetchNotificationSettings();
      } catch {
        /* ignore reload errors after failed save */
      }
    }
  }

  const webhookEnabledInput = document.getElementById("notification-webhook-enabled");
  for (const el of [notificationEmailEnabled, notificationPushoverEnabled, webhookEnabledInput]) {
    if (!el) continue;
    if (!capabilities?.mutations) {
      el.disabled = true;
      el.title = "Channel toggles are disabled in the static demo.";
    }
    el.addEventListener("change", onEnableToggle);
    syncSwitchAria(el);
  }

  document.getElementById("save-email-settings-btn")?.addEventListener("click", async () => {
    try {
      await saveNotificationSettings({ successMessage: "Email settings saved." });
    } catch (error) {
      showError(error.message);
    }
  });

  document.getElementById("save-pushover-settings-btn")?.addEventListener("click", async () => {
    try {
      await saveNotificationSettings({ successMessage: "Pushover settings saved." });
    } catch (error) {
      showError(error.message);
    }
  });

  gmailCredentialsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capabilities?.credentialManagement) {
      gmailCredentialsStatus.className = "pane-subtext error";
      gmailCredentialsStatus.textContent = "Credential management is disabled in the static demo.";
      return;
    }
    const saveBtn = document.getElementById("save-gmail-credentials-btn");
    saveBtn && (saveBtn.disabled = true);
    try {
      const body = {
        gmailUser: gmailUserInput?.value || "",
        gmailAppPassword: gmailAppPasswordInput?.value || "",
        emailFrom: gmailEmailFromInput?.value || ""
      };
      const response = await api.send("/api/provider-credentials/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...CREDENTIAL_ADMIN_HEADER },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message || "Unable to save Gmail credentials.";
        const code = payload?.error?.code;
        throw new Error(code ? `${message} (${code})` : message);
      }
      const payload = await response.json();
      if (gmailAppPasswordInput) gmailAppPasswordInput.value = "";
      showSuccess("Gmail credentials saved.");
      await refreshProviderCredentialsAfterMutation({ email: payload.email });
      await fetchNotificationSettings().catch(() => {});
    } catch (error) {
      showError(error.message);
    } finally {
      saveBtn && (saveBtn.disabled = false);
      saveBtn?.focus();
    }
  });

  document.getElementById("remove-gmail-credentials-btn")?.addEventListener("click", async (event) => {
    if (!capabilities?.credentialManagement) {
      gmailCredentialsStatus.className = "pane-subtext error";
      gmailCredentialsStatus.textContent = "Credential management is disabled in the static demo.";
      return;
    }
    const btn = event.currentTarget;
    if (!window.confirm("Remove Gmail credentials? Email delivery will be disabled until new credentials are saved.")) {
      btn.focus();
      return;
    }
    btn.disabled = true;
    try {
      const response = await api.send("/api/provider-credentials/email", {
        method: "DELETE",
        headers: { ...CREDENTIAL_ADMIN_HEADER }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message || "Unable to remove Gmail credentials.";
        const code = payload?.error?.code;
        throw new Error(code ? `${message} (${code})` : message);
      }
      const payload = await response.json();
      showSuccess("Gmail credentials removed.");
      await refreshProviderCredentialsAfterMutation({ email: payload.email });
      await fetchNotificationSettings().catch(() => {});
    } catch (error) {
      showError(error.message);
    } finally {
      btn.disabled = false;
      btn.focus();
    }
  });

  pushoverCredentialsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!capabilities?.credentialManagement) {
      pushoverCredentialsStatus.className = "pane-subtext error";
      pushoverCredentialsStatus.textContent = "Credential management is disabled in the static demo.";
      return;
    }
    const saveBtn = document.getElementById("save-pushover-credentials-btn");
    saveBtn && (saveBtn.disabled = true);
    try {
      const body = {
        appToken: pushoverAppTokenInput?.value || "",
        userKey: pushoverUserKeyInput?.value || ""
      };
      const response = await api.send("/api/provider-credentials/pushover", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...CREDENTIAL_ADMIN_HEADER },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message || "Unable to save Pushover credentials.";
        const code = payload?.error?.code;
        throw new Error(code ? `${message} (${code})` : message);
      }
      const payload = await response.json();
      if (pushoverAppTokenInput) pushoverAppTokenInput.value = "";
      if (pushoverUserKeyInput) pushoverUserKeyInput.value = "";
      showSuccess("Pushover credentials saved.");
      await refreshProviderCredentialsAfterMutation({ pushover: payload.pushover });
      await fetchNotificationSettings().catch(() => {});
    } catch (error) {
      showError(error.message);
    } finally {
      saveBtn && (saveBtn.disabled = false);
      saveBtn?.focus();
    }
  });

  document.getElementById("remove-pushover-credentials-btn")?.addEventListener("click", async (event) => {
    if (!capabilities?.credentialManagement) {
      pushoverCredentialsStatus.className = "pane-subtext error";
      pushoverCredentialsStatus.textContent = "Credential management is disabled in the static demo.";
      return;
    }
    const btn = event.currentTarget;
    if (!window.confirm("Remove Pushover credentials? Pushover delivery will be disabled until new credentials are saved.")) {
      btn.focus();
      return;
    }
    btn.disabled = true;
    try {
      const response = await api.send("/api/provider-credentials/pushover", {
        method: "DELETE",
        headers: { ...CREDENTIAL_ADMIN_HEADER }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message || "Unable to remove Pushover credentials.";
        const code = payload?.error?.code;
        throw new Error(code ? `${message} (${code})` : message);
      }
      const payload = await response.json();
      showSuccess("Pushover credentials removed.");
      await refreshProviderCredentialsAfterMutation({ pushover: payload.pushover });
      await fetchNotificationSettings().catch(() => {});
    } catch (error) {
      showError(error.message);
    } finally {
      btn.disabled = false;
      btn.focus();
    }
  });

  document.getElementById("test-email-btn")?.addEventListener("click", () =>
    testNotification("email").catch((error) => showError(error.message)));
  document.getElementById("test-pushover-btn")?.addEventListener("click", () =>
    testNotification("pushover").catch((error) => showError(error.message)));

  return { fetchNotificationSettings, fetchProviderCredentials, saveNotificationSettings };
}
