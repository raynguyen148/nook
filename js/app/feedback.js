globalThis[Symbol.for("nook.app.modules")].register("feedback", (app) => {
  "use strict";

  // Viewport feedback and confirmation-dialog focus management.
  const { api, elements, ui } = app;

  function activeModalDialog() {
    return [
      elements.conflictDialog,
      elements.historyDialog,
      elements.deleteLibraryDialog,
      elements.confirmationDialog,
      elements.organizeDialog,
      elements.mobileFilterDialog,
      elements.mobileNoteActionsDialog,
      elements.mobileSpaceDialog,
      elements.mobileCardDialog,
    ]
      .find((dialog) => dialog?.open) || null;
  }

  function syncToastHost() {
    // Toast feedback is anchored to the viewport. Opening or closing a dialog
    // must not move an already-visible message into that dialog's layout.
    if (elements.toast.parentElement !== document.body) document.body.append(elements.toast);
    if (!elements.toast.classList.contains("is-visible") || !("showPopover" in elements.toast)) return;

    // A modal dialog is also in the browser top layer. Re-opening this manual
    // popover raises the toast above that dialog without changing its DOM host.
    if (elements.toast.matches(":popover-open")) elements.toast.hidePopover();
    elements.toast.showPopover();
  }

  function showToast(message, tone = "success", action = null) {
    window.clearTimeout(ui.toastTimer);
    window.clearTimeout(ui.toastPopoverTimer);
    ui.toastAction = action;
    elements.toastMessage.textContent = message;
    elements.toast.dataset.tone = tone;
    elements.toastAction.textContent = action?.label || "";
    elements.toastAction.classList.toggle("is-hidden", !action);
    elements.toast.classList.add("is-visible");
    syncToastHost();
    ui.toastTimer = window.setTimeout(() => {
      dismissToast();
    }, 3600);
  }

  function dismissToast() {
    window.clearTimeout(ui.toastTimer);
    window.clearTimeout(ui.toastPopoverTimer);
    ui.toastAction = null;
    elements.toastAction.classList.add("is-hidden");
    elements.toast.classList.remove("is-visible");
    if (!("hidePopover" in elements.toast)) return;
    ui.toastPopoverTimer = window.setTimeout(() => {
      if (!elements.toast.classList.contains("is-visible") && elements.toast.matches(":popover-open")) {
        elements.toast.hidePopover();
      }
    }, 200);
  }

  function requestConfirmation({ title, description, confirmLabel, cancelLabel, tone = "danger", initialFocus = "cancel" }) {
    if (elements.confirmationDialog.open || ui.pendingConfirmation) return Promise.resolve(false);

    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    elements.confirmationTitle.textContent = title;
    elements.confirmationDescription.textContent = description;
    elements.confirmAction.textContent = confirmLabel;
    elements.cancelConfirmation.textContent = cancelLabel;
    elements.confirmAction.classList.toggle("button-danger", tone === "danger");
    elements.confirmAction.classList.toggle("button-primary", tone === "primary");
    elements.confirmationDialog.returnValue = "";

    return new Promise((resolve) => {
      ui.pendingConfirmation = { resolve, invoker };
      elements.confirmationDialog.showModal();
      syncToastHost();
      window.requestAnimationFrame(() => (initialFocus === "confirm" ? elements.confirmAction : elements.cancelConfirmation).focus());
    });
  }

  function closeConfirmation(confirmed = false) {
    if (elements.confirmationDialog.open) elements.confirmationDialog.close(confirmed ? "confirmed" : "cancelled");
  }

  function finishConfirmationClose() {
    const pending = ui.pendingConfirmation;
    const confirmed = elements.confirmationDialog.returnValue === "confirmed";
    ui.pendingConfirmation = null;
    if (!pending) return;
    pending.resolve(confirmed);
    if (!confirmed && pending.invoker instanceof HTMLElement && pending.invoker.isConnected && !pending.invoker.disabled) {
      window.requestAnimationFrame(() => pending.invoker.focus());
    }
  }

  function conflictSummary(value, fallback) {
    const title = typeof value?.title === "string" && value.title.trim()
      ? `“${value.title.trim()}”`
      : fallback;
    const timestamp = value?.updatedAt || value?.savedAt;
    if (!timestamp || Number.isNaN(Date.parse(timestamp))) return title;
    return `${title} · ${new Date(timestamp).toLocaleString()}`;
  }

  function requestConflictResolution({ localDraft, latestNote, deleted = false, invoker = null } = {}) {
    if (elements.conflictDialog.open || ui.pendingConflictResolution) {
      return Promise.resolve("keep-editing");
    }
    const focusReturn = invoker || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    elements.conflictDialog.querySelector(".eyebrow").textContent = deleted ? "SAVED NOTE DELETED" : "NEWER VERSION FOUND";
    elements.conflictDialog.querySelector("h2").textContent = deleted
      ? "This note was deleted elsewhere"
      : "This note changed elsewhere";
    elements.conflictDialog.querySelector("#conflict-dialog-description").textContent = deleted
      ? "Your draft is safe. Keep editing it or save it as a new note."
      : "Your draft is safe. Choose which version to inspect or save.";
    elements.conflictLocalSummary.textContent = conflictSummary(localDraft, "Unsaved local changes");
    elements.conflictLatestSummary.textContent = deleted
      ? "The previously saved note no longer exists"
      : conflictSummary(latestNote, "A newer saved version");
    elements.conflictViewLatest.classList.toggle("is-hidden", deleted);
    elements.conflictKeepMine.textContent = deleted ? "Save as new" : "Keep mine";
    elements.conflictDialog.returnValue = "";
    return new Promise((resolve) => {
      ui.pendingConflictResolution = { resolve, invoker: focusReturn };
      elements.conflictDialog.showModal();
      syncToastHost();
      window.requestAnimationFrame(() => elements.conflictKeepEditing.focus());
    });
  }

  function closeConflictResolution(choice = "keep-editing") {
    if (elements.conflictDialog.open) elements.conflictDialog.close(choice);
  }

  function finishConflictResolution() {
    const pending = ui.pendingConflictResolution;
    const choice = ["keep-mine", "view-latest"].includes(elements.conflictDialog.returnValue)
      ? elements.conflictDialog.returnValue
      : "keep-editing";
    ui.pendingConflictResolution = null;
    if (!pending) return;
    pending.resolve(choice);
    if (
      choice === "keep-editing" &&
      pending.invoker instanceof HTMLElement &&
      pending.invoker.isConnected &&
      !pending.invoker.disabled
    ) {
      window.requestAnimationFrame(() => pending.invoker.focus({ preventScroll: true }));
    }
  }

  function showError(error, fallback = "Something went wrong. Please try again.") {
    const message = error instanceof Error && error.message ? error.message : fallback;
    showToast(message, "error");
  }

  Object.assign(api, {
    activeModalDialog,
    syncToastHost,
    showToast,
    dismissToast,
    requestConfirmation,
    closeConfirmation,
    finishConfirmationClose,
    requestConflictResolution,
    closeConflictResolution,
    finishConflictResolution,
    showError,
  });
});
