globalThis[Symbol.for("nook.app.modules")].register("sync", (app) => {
  "use strict";

  // Same-origin tab coordination. Note data remains owned by the storage API.
  const { api, ui } = app;
  const LIBRARY_CHANNEL_NAME = "nook:library";
  let libraryChannel = null;

  const hasUnsavedNoteChanges = (...args) => api.hasUnsavedNoteChanges(...args);
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const showError = (...args) => api.showError(...args);
  const showToast = (...args) => api.showToast(...args);

  function notifyLibraryMutation() {
    libraryChannel?.postMessage({ type: "library-mutated" });
  }

  function refreshFromAnotherTab() {
    if (isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      ui.externalRefreshPending = true;
      showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      return;
    }
    refreshLibrary({ external: true }).catch((error) => showError(error, "We could not refresh the local library."));
  }

  function setupLibrarySync() {
    if (typeof BroadcastChannel !== "function") return;
    libraryChannel = new BroadcastChannel(LIBRARY_CHANNEL_NAME);
    libraryChannel.addEventListener("message", (event) => {
      if (event.data?.type === "library-mutated") refreshFromAnotherTab();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromAnotherTab();
    });
    window.addEventListener("focus", refreshFromAnotherTab);
    window.addEventListener("pagehide", () => libraryChannel?.close(), { once: true });
  }

  Object.assign(api, {
    notifyLibraryMutation,
    refreshFromAnotherTab,
    setupLibrarySync,
  });
});
