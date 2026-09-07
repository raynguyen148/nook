globalThis[Symbol.for("nook.app.modules")].register("sync", (app) => {
  "use strict";

  // Same-origin tab coordination. Note data remains owned by the storage API.
  const { api, ui } = app;
  const LIBRARY_CHANNEL_NAME = "nook:library";
  let libraryChannel = null;
  let refreshTimer = 0;
  let refreshInFlight = false;
  let refreshRequested = false;

  const hasUnsavedNoteChanges = (...args) => api.hasUnsavedNoteChanges(...args);
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const showError = (...args) => api.showError(...args);
  const showToast = (...args) => api.showToast(...args);

  function notifyLibraryMutation() {
    libraryChannel?.postMessage({ type: "library-mutated" });
  }

  function refreshFromAnotherTab() {
    refreshRequested = true;
    if (document.hidden || refreshInFlight || refreshTimer) return;
    refreshTimer = window.setTimeout(flushExternalRefresh, 50);
  }

  async function flushExternalRefresh() {
    refreshTimer = 0;
    if (document.hidden) return;
    refreshRequested = false;
    if (isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      if (!ui.externalRefreshPending) {
        showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      }
      ui.externalRefreshPending = true;
      return;
    }
    refreshInFlight = true;
    try {
      await refreshLibrary({ external: true });
    } catch (error) {
      showError(error, "We could not refresh the local library.");
    } finally {
      refreshInFlight = false;
      if (refreshRequested) refreshFromAnotherTab();
    }
  }

  function openLibraryChannel() {
    if (libraryChannel || typeof BroadcastChannel !== "function") return;
    libraryChannel = new BroadcastChannel(LIBRARY_CHANNEL_NAME);
    libraryChannel.addEventListener("message", (event) => {
      if (event.data?.type === "library-mutated") refreshFromAnotherTab();
    });
  }

  function setupLibrarySync() {
    openLibraryChannel();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromAnotherTab();
    });
    window.addEventListener("focus", refreshFromAnotherTab);
    window.addEventListener("pagehide", () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = 0;
      libraryChannel?.close();
      libraryChannel = null;
    });
    window.addEventListener("pageshow", (event) => {
      openLibraryChannel();
      if (event.persisted) refreshFromAnotherTab();
    });
  }

  Object.assign(api, {
    notifyLibraryMutation,
    refreshFromAnotherTab,
    setupLibrarySync,
  });
});
