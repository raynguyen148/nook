(() => {
  "use strict";

  // Raw-Markdown clipboard operations and temporary copy feedback.
  globalThis[Symbol.for("nook.app.modules")].register("clipboard", (app) => {

    const { api, elements, ui } = app;
    const showToast = (...args) => api.showToast(...args);
    const showError = (...args) => api.showError(...args);
    const copyFeedbackTimers = new WeakMap();
    const previewNoteFromEditor = (...args) => api.previewNoteFromEditor(...args);
    const renderQuickView = (...args) => api.renderQuickView(...args);
    const syncNotePreviewActions = (...args) => api.syncNotePreviewActions(...args);
    const isQuickViewOpen = (...args) => api.isQuickViewOpen(...args);

    async function writeClipboardText(text) {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Copy is not available in this browser.");
    }

    function setCopyTooltip(button, text) {
      if (!button || !text) return;
      const customTooltip = button.closest(".note-detail-action-tooltip")?.querySelector('[role="tooltip"]');
      if (customTooltip) {
        customTooltip.textContent = text;
        return;
      }
      button.setAttribute("title", text);
    }

    function markButtonCopied(button, {
      copiedLabel,
      originalLabel,
      copiedTitle = "Copied!",
      originalTitle = "Copy content",
      duration = 2000,
    } = {}) {
      if (!button) return;
      const existingTimer = copyFeedbackTimers.get(button);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      button.classList.add("is-copied");
      setCopyTooltip(button, copiedTitle);
      if (copiedLabel) button.setAttribute("aria-label", copiedLabel);

      const timer = setTimeout(() => {
        copyFeedbackTimers.delete(button);
        if (!button.isConnected) return;
        button.classList.remove("is-copied");
        setCopyTooltip(button, originalTitle);
        if (originalLabel) button.setAttribute("aria-label", originalLabel);
      }, duration);

      copyFeedbackTimers.set(button, timer);
    }

    function resetCopyButtonFeedback(button, {
      originalLabel = "Copy note content",
      originalTitle = "Copy content",
    } = {}) {
      if (!button) return;
      const existingTimer = copyFeedbackTimers.get(button);
      if (existingTimer) {
        clearTimeout(existingTimer);
        copyFeedbackTimers.delete(button);
      }
      button.classList.remove("is-copied");
      setCopyTooltip(button, originalTitle);
      if (originalLabel) button.setAttribute("aria-label", originalLabel);
    }

    async function copyQuickViewContent() {
      const note = previewNoteFromEditor();
      if (!note.content.trim()) {
        showToast("This note has no content to copy.", "error");
        return;
      }
      ui.copyInFlight = true;
      elements.copyNoteContent.setAttribute("aria-busy", "true");
      syncNotePreviewActions();
      try {
        await writeClipboardText(note.content);
        showToast("Content copied.");
        markButtonCopied(elements.copyNoteContent, {
          copiedLabel: "Content copied",
          originalLabel: "Copy note content",
          copiedTitle: "Copied!",
          originalTitle: "Copy content",
        });
      } catch (error) {
        showError(error, "We could not copy this note.");
      } finally {
        ui.copyInFlight = false;
        elements.copyNoteContent.removeAttribute("aria-busy");
        syncNotePreviewActions();
        if (isQuickViewOpen()) renderQuickView();
      }
    }

    async function copyNoteCardContent(note, button) {
      if (!note.content.trim()) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try {
        await writeClipboardText(note.content);
        showToast("Content copied.");
        markButtonCopied(button, {
          copiedLabel: `Copied ${note.title}`,
          originalLabel: `Copy ${note.title}`,
          copiedTitle: "Copied!",
          originalTitle: "Copy content",
        });
      } catch (error) {
        showError(error, "We could not copy this note.");
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      }
    }

    Object.assign(api, {
      writeClipboardText,
      markButtonCopied,
      resetCopyButtonFeedback,
      copyQuickViewContent,
      copyNoteCardContent,
    });
  });
})();
