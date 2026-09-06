globalThis[Symbol.for("nook.app.modules")].register("feedback", (app) => {
  "use strict";

  // Viewport feedback and confirmation-dialog focus management.
  const { api, elements, ui } = app;

  function activeModalDialog() {
    return [elements.confirmationDialog, elements.organizeDialog].find((dialog) => dialog.open) || null;
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
    showError,
  });
});
