globalThis[Symbol.for("nook.app.modules")].register("offline", (app) => {
  "use strict";

  // Optional browser capabilities for hosted offline access and eviction
  // resistance. file:// remains fully functional without this module's APIs.
  const { api, elements, ui } = app;
  let registration = null;
  let updateRequested = false;

  const showError = (...args) => api.showError(...args);
  const showToast = (...args) => api.showToast(...args);

  function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return "unknown";
    if (value < 1024) return `${Math.round(value)} B`;
    const units = ["KiB", "MiB", "GiB"];
    let amount = value / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    return `${amount < 10 ? amount.toFixed(1) : Math.round(amount)} ${unit}`;
  }

  async function refreshStorageHealth() {
    if (!elements.storageHealthMessage) return;
    if (!navigator.storage) {
      elements.storageHealthMessage.textContent = "Storage usage and persistence are not reported by this browser.";
      elements.requestPersistence?.classList.add("is-hidden");
      return;
    }
    try {
      const [estimate, persisted] = await Promise.all([
        typeof navigator.storage.estimate === "function" ? navigator.storage.estimate() : null,
        typeof navigator.storage.persisted === "function" ? navigator.storage.persisted() : false,
      ]);
      const usage = estimate?.usage;
      const quota = estimate?.quota;
      const usageText = Number.isFinite(usage) && Number.isFinite(quota)
        ? `${formatBytes(usage)} used of about ${formatBytes(quota)}`
        : "Usage is not reported";
      elements.storageHealthMessage.textContent = `${usageText}. ${persisted ? "Persistent storage is enabled." : "Storage may still be evicted by the browser."}`;
      const canRequest = !persisted && typeof navigator.storage.persist === "function";
      elements.requestPersistence?.classList.toggle("is-hidden", !canRequest);
    } catch {
      elements.storageHealthMessage.textContent = "Storage health could not be read. Your local notes were not changed.";
      elements.requestPersistence?.classList.toggle("is-hidden", typeof navigator.storage.persist !== "function");
    }
  }

  async function requestStoragePersistence() {
    if (typeof navigator.storage?.persist !== "function") return;
    elements.requestPersistence.disabled = true;
    elements.requestPersistence.textContent = "Requesting…";
    try {
      const granted = await navigator.storage.persist();
      showToast(granted
        ? "Persistent storage enabled. Keep making separate backups."
        : "The browser did not grant persistent storage. Backups remain important.",
        granted ? "success" : "error");
    } catch (error) {
      showError(error, "Persistent storage could not be requested.");
    } finally {
      elements.requestPersistence.disabled = false;
      elements.requestPersistence.textContent = "Request persistence";
      await refreshStorageHealth();
    }
  }

  function hasDirtyDraft() {
    const primaryDirty = typeof api.hasUnsavedNoteChanges === "function" && api.hasUnsavedNoteChanges();
    const secondaryDirty = typeof api.hasUnsavedSecondaryChanges === "function"
      ? api.hasUnsavedSecondaryChanges()
      : ui.secondaryNoteDirty;
    return Boolean(primaryDirty || secondaryDirty);
  }

  function showWaitingServiceWorker(worker) {
    if (!worker) return;
    ui.waitingServiceWorker = worker;
    elements.applyOfflineUpdate?.classList.remove("is-hidden");
    if (elements.offlineAppMessage) {
      elements.offlineAppMessage.textContent = hasDirtyDraft()
        ? "An app update is ready. Save or preserve active drafts before applying it."
        : "An app update is ready and can be applied when you choose.";
    }
  }

  function observeInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showWaitingServiceWorker(registration?.waiting || worker);
      }
    });
  }

  async function setupHostedOfflineApp() {
    const hosted = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!hosted || !("serviceWorker" in navigator)) {
      if (elements.offlineAppMessage) {
        elements.offlineAppMessage.textContent = location.protocol === "file:"
          ? "File mode is available offline without a Service Worker. Hosted offline cache requires HTTPS or localhost."
          : "Hosted offline cache is not supported by this browser.";
      }
      return;
    }
    try {
      registration = await navigator.serviceWorker.register("sw.js", { scope: "./" });
      if (elements.offlineAppMessage) {
        elements.offlineAppMessage.textContent = navigator.serviceWorker.controller
          ? "App resources are cached for hosted offline use. Notes remain in this browser."
          : "Offline resources are being prepared for the next visit.";
      }
      if (registration.waiting) showWaitingServiceWorker(registration.waiting);
      observeInstallingWorker(registration.installing);
      registration.addEventListener("updatefound", () => observeInstallingWorker(registration.installing));
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updateRequested) return;
        updateRequested = false;
        if (hasDirtyDraft()) {
          elements.offlineAppMessage.textContent = "Update activated. Reload after active drafts are saved.";
          return;
        }
        location.reload();
      });
    } catch (error) {
      if (elements.offlineAppMessage) {
        elements.offlineAppMessage.textContent = "Offline cache could not be prepared. File mode and local data still work.";
      }
      console.warn("Nook Service Worker registration failed.", error);
    }
  }

  function applyHostedOfflineUpdate() {
    const worker = ui.waitingServiceWorker || registration?.waiting;
    if (!worker) return;
    if (hasDirtyDraft()) {
      showToast("Save or preserve active drafts before applying the update.", "error");
      if (elements.offlineAppMessage) {
        elements.offlineAppMessage.textContent = "Update deferred because an editor has unsaved changes.";
      }
      return;
    }
    updateRequested = true;
    elements.applyOfflineUpdate.disabled = true;
    elements.applyOfflineUpdate.textContent = "Applying…";
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  function setupStorageAndOfflineCapabilities() {
    elements.requestPersistence?.addEventListener("click", requestStoragePersistence);
    elements.applyOfflineUpdate?.addEventListener("click", applyHostedOfflineUpdate);
    void refreshStorageHealth();
    void setupHostedOfflineApp();
  }

  Object.assign(api, {
    formatBytes,
    refreshStorageHealth,
    requestStoragePersistence,
    setupHostedOfflineApp,
    applyHostedOfflineUpdate,
    setupStorageAndOfflineCapabilities,
  });
});
