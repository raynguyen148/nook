globalThis[Symbol.for("nook.app.modules")].register("note-actions", (app) => {
  "use strict";

  // Note mutations shared by library cards, the editor, and Trash controls.
  const { api, storage, elements, library, ui } = app;

  const pluralize = (...args) => api.pluralize(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const showError = (...args) => api.showError(...args);
  const showToast = (...args) => api.showToast(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const isDeletedNote = (...args) => api.isDeletedNote(...args);

  async function moveNoteToTrash(note, { preserveSidePicker = false } = {}) {
    if (!note || ui.noteSaveInFlight) return false;

    const discardsUnsavedEdits = ui.editingNoteId === note.id && api.hasUnsavedNoteChanges?.();
    if (discardsUnsavedEdits) {
      const confirmed = await requestConfirmation({
        title: "Move note and discard unsaved edits?",
        description: `“${note.title}” can be restored from Trash, but its unsaved edits cannot be recovered.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Keep editing",
      });
      if (!confirmed) return false;
    }

    const keepPicker = preserveSidePicker && note.id !== ui.editingNoteId &&
      (api.isPaneNotePickerOpen?.("primary") ||
        (elements.secondaryPickerView && !elements.secondaryPickerView.classList.contains("is-hidden")));
    if (ui.dualPaneOpen && !keepPicker) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen) return false;
    }

    try {
      await storage.deleteNote(note.id);
      await refreshLibrary({ broadcast: true });
      if (ui.editingNoteId === note.id) api.closeNoteEditor?.({ discardStoredDraft: true });
      showToast("Note moved to Trash.", "success", {
        label: "Undo",
        onClick: async () => {
          try {
            await storage.restoreNote(note.id);
            await refreshLibrary({ broadcast: true });
          } catch (error) {
            showError(error, "We could not undo moving this note to Trash.");
          }
        },
      });
      return true;
    } catch (error) {
      showError(error, "We could not move this note to Trash.");
      return false;
    }
  }

  async function toggleNotePinned(note) {
    try {
      await storage.setNotePinned(note.id, !note.isPinned);
      await refreshLibrary({ broadcast: true });
      return true;
    } catch (error) {
      showError(error, "We could not update this note's pin state.");
      return false;
    }
  }

  async function restoreNoteWithFeedback(note) {
    try {
      await storage.restoreNote(note.id);
      await refreshLibrary({ broadcast: true });
      return true;
    } catch (error) {
      showError(error, "We could not restore this note.");
      return false;
    }
  }

  async function permanentlyDeleteNoteWithConfirmation(note) {
    if (!note || ui.noteSaveInFlight) return false;
    const confirmed = await requestConfirmation({
      title: "Delete note permanently?",
      description: `“${note.title}” will be deleted permanently from this browser. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      cancelLabel: "Keep note",
    });
    if (!confirmed) return false;
    try {
      await storage.permanentlyDeleteNote(note.id);
      await refreshLibrary({ broadcast: true });
      return true;
    } catch (error) {
      showError(error, "We could not permanently delete this note.");
      return false;
    }
  }

  async function emptyTrashWithConfirmation() {
    const trashedCount = library.notes.filter(isDeletedNote).length;
    if (!trashedCount) return false;
    const confirmed = await requestConfirmation({
      title: "Empty Trash?",
      description: `This will permanently delete ${pluralize(trashedCount, "note")} from this browser. This cannot be undone.`,
      confirmLabel: "Empty Trash",
      cancelLabel: "Keep Trash",
    });
    if (!confirmed) return false;
    try {
      await storage.emptyTrash();
      await refreshLibrary({ broadcast: true });
      return true;
    } catch (error) {
      showError(error, "We could not empty Trash.");
      return false;
    }
  }

  Object.assign(api, {
    moveNoteToTrash,
    toggleNotePinned,
    restoreNoteWithFeedback,
    permanentlyDeleteNoteWithConfirmation,
    emptyTrashWithConfirmation,
  });
});
