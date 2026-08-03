export function initHistory({ api, DEMO_READ_ONLY, showSuccess, showError, afterClear }) {
  function selectedHistoryScopes() {
    const all = document.querySelector("[data-history-scope=\"all\"]");
    if (all?.checked) return ["all"];
    return [...document.querySelectorAll("[data-history-scope]:checked")]
      .map((el) => el.getAttribute("data-history-scope"))
      .filter((s) => s && s !== "all");
  }

  async function refreshHistoryCounts() {
    const host = document.getElementById("clear-history-counts");
    const confirmWrap = document.getElementById("clear-history-confirm-wrap");
    if (!host) return;
    const scopes = selectedHistoryScopes();
    if (confirmWrap) confirmWrap.hidden = !scopes.includes("all");
    if (scopes.length === 0) {
      host.textContent = "Select at least one scope.";
      return;
    }
    try {
      const response = await api.send("/api/history/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes, preview: true })
      });
      if (!response.ok) throw new Error("preview failed");
      const data = await response.json();
      host.textContent = Object.entries(data.counts || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    } catch (error) {
      host.textContent = error?.message === "DEMO_READ_ONLY"
        ? "Demo mode — clear/export disabled."
        : "Unable to preview counts.";
    }
  }

  document.getElementById("clear-history-scopes")?.addEventListener("change", () => {
    const all = document.querySelector("[data-history-scope=\"all\"]");
    if (all?.checked) {
      document.querySelectorAll("[data-history-scope]").forEach((el) => {
        if (el !== all) el.checked = false;
      });
    }
    refreshHistoryCounts();
  });

  document.getElementById("history-export-btn")?.addEventListener("click", async () => {
    const status = document.getElementById("clear-history-status");
    try {
      if (DEMO_READ_ONLY) throw new Error("DEMO_READ_ONLY");
      const scopes = selectedHistoryScopes();
      const response = await api.send(`/api/history/export?scopes=${encodeURIComponent(scopes.join(","))}`);
      if (!response.ok) throw new Error("Export failed");
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sunsethue-history-export.json";
      a.click();
      URL.revokeObjectURL(url);
      if (status) status.textContent = "Export downloaded.";
    } catch (error) {
      if (status) status.textContent = error?.message === "DEMO_READ_ONLY" ? "Demo mode — export disabled." : "Export failed.";
    }
  });

  document.getElementById("history-clear-btn")?.addEventListener("click", async () => {
    const status = document.getElementById("clear-history-status");
    try {
      if (DEMO_READ_ONLY) throw new Error("DEMO_READ_ONLY");
      const scopes = selectedHistoryScopes();
      if (scopes.length === 0) throw new Error("Select a scope");
      const confirmValue = document.getElementById("clear-history-confirm")?.value || "";
      const response = await api.send("/api/history/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes, confirm: confirmValue })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.code || "Clear failed");
      }
      if (status) status.textContent = "History cleared.";
      await Promise.all([afterClear(), refreshHistoryCounts()]);
    } catch (error) {
      if (status) {
        status.textContent = error?.message === "DEMO_READ_ONLY"
          ? "Demo mode — clear disabled."
          : `Clear failed: ${error.message}`;
      }
    }
  });

  return { refreshHistoryCounts };
}
