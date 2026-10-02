globalThis[Symbol.for("nook.app.modules")].register("bulk-actions", (app) => {
  "use strict";

  const { api, storage, elements, library, ui } = app;
  const selected = new Map();
  let selecting = false;
  let collection = ui.trashOnly;
  let busy = false;
  const mobileQuery = window.matchMedia("(max-width: 820px)");

  function isBulkSelectionAvailable() {
    return !mobileQuery.matches;
  }

  function captureSelection(note) {
    return { id: note.id, expectedRevision: note.revision,
      expectedSnapshot: { title: note.title, content: note.content, typeId: note.typeId, tagIds: [...note.tagIds] } };
  }

  function areAllResultsSelected(notes) {
    return notes.length > 0 && notes.every((note) => selected.has(note.id));
  }

  function syncBulkSelection() {
    const availableOnScreen = isBulkSelectionAvailable();
    const active = selecting && availableOnScreen;
    if (collection !== ui.trashOnly) {
      collection = ui.trashOnly;
      selected.clear();
    }
    const available = new Set(library.notes.filter((note) => Boolean(note.deletedAt) === ui.trashOnly).map((note) => note.id));
    for (const id of selected.keys()) if (!available.has(id)) selected.delete(id);
    elements.selectNotes.setAttribute("aria-pressed", String(active));
    const label = active ? "Selection active" : "Select notes";
    elements.selectNotesLabel.textContent = "Select";
    elements.selectNotes.setAttribute("aria-label", label);
    elements.selectNotes.title = active ? "Finish selecting notes" : label;
    elements.selectNotes.classList.toggle("is-hidden", !availableOnScreen || active);
    elements.bulkActionsBar.classList.toggle("is-hidden", !active);
    elements.bulkActionsBar.setAttribute("aria-busy", String(busy));
    elements.bulkSelectionCount.textContent = busy ? "Updating…" : `${selected.size} selected`;
    const selectionDescription = `${selected.size} selected${selected.size ? " across pages and filters" : ""}`;
    elements.bulkSelectionCount.title = selectionDescription;
    elements.bulkSelectionCount.setAttribute("aria-label", busy ? `Updating ${selected.size} selected notes` : selectionDescription);
    elements.bulkExport.disabled = busy || !selected.size;
    elements.bulkTrash.disabled = busy || !selected.size;
    elements.bulkTrashLabel.textContent = ui.trashOnly ? "Restore" : "Trash";
    const trashLabel = ui.trashOnly ? "Restore selected notes" : "Move selected notes to Trash";
    elements.bulkTrash.title = trashLabel;
    elements.bulkTrash.setAttribute("aria-label", trashLabel);
    elements.bulkTrashIcon.classList.toggle("is-hidden", ui.trashOnly);
    elements.bulkRestoreIcon.classList.toggle("is-hidden", !ui.trashOnly);
    elements.bulkTrash.classList.toggle("button-danger", !ui.trashOnly);
    elements.bulkTrash.classList.toggle("button-secondary", ui.trashOnly);
    const results = api.getVisibleNotes();
    const allResultsSelected = areAllResultsSelected(results);
    elements.bulkSelectResultsLabel.textContent = allResultsSelected ? "Deselect all" : `Select all (${results.length})`;
    elements.bulkSelectResults.title = `${allResultsSelected ? "Deselect" : "Select"} all notes matching the current filters, across pages`;
    elements.bulkSelectResults.setAttribute("aria-pressed", String(allResultsSelected));
    elements.bulkSelectResults.classList.toggle("bulk-actions__select-all--deselect", allResultsSelected);
    elements.bulkSelectResults.disabled = busy || !results.length;
    elements.bulkClear.disabled = busy;
    elements.selectNotes.disabled = busy;
  }

  function startBulkSelection() {
    if (!isBulkSelectionAvailable() || busy) return;
    selecting = true;
    api.renderNotes();
    elements.bulkSelectResults.focus({ preventScroll: true });
  }

  function finishBulkSelection() {
    if (busy) return;
    selecting = false;
    selected.clear();
    api.renderNotes();
    elements.selectNotes.focus({ preventScroll: true });
  }

  function decorateSelectableNoteCard(card, note) {
    if (!selecting || !isBulkSelectionAvailable()) return;
    card.classList.add("note-card--selectable");
    card.classList.toggle("note-card--selected", selected.has(note.id));
    const label = api.createElement("label", { className: "note-selection" });
    const checkbox = api.createElement("input", { type: "checkbox", disabled: busy,
      attributes: { "aria-label": `Select ${note.title}` } });
    checkbox.checked = selected.has(note.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.set(note.id, captureSelection(note));
      else selected.delete(note.id);
      card.classList.toggle("note-card--selected", checkbox.checked);
      syncBulkSelection();
    });
    label.append(checkbox);
    let actions = card.querySelector(".note-card__top-actions");
    if (!actions) {
      actions = api.createElement("div", { className: "note-card__top-actions" });
      card.append(actions);
    }
    actions.prepend(label);
  }

  async function mutateSelected(changes) {
    if (busy || !selected.size || !isBulkSelectionAvailable()) return;
    busy = true;
    syncBulkSelection();
    try {
      if (api.hasUnsavedNoteChanges() || api.hasUnsavedSecondaryChanges?.()) throw new Error("Save or close editor drafts before changing selected notes.");
      const result = await storage.updateNotesBatch([...selected.values()], changes);
      selected.clear();
      await api.refreshLibrary({ broadcast: true });
      api.showToast(`Updated ${result.changed} ${result.changed === 1 ? "note" : "notes"}.`);
    } finally {
      busy = false;
      syncBulkSelection();
      api.renderNotes();
    }
  }

  async function trashOrRestoreSelected() {
    if (busy || !selected.size || !isBulkSelectionAvailable()) return;
    const action = ui.trashOnly ? "restore" : "trash";
    const confirmed = await api.requestConfirmation({
      title: action === "restore" ? "Restore selected notes?" : "Move selected notes to Trash?",
      description: `${selected.size} selected notes will be ${action === "restore" ? "returned to the library" : "moved to Trash and can be restored later"}.`,
      confirmLabel: action === "restore" ? "Restore notes" : "Move to Trash", cancelLabel: "Keep selection",
      tone: action === "restore" ? "primary" : "danger",
    });
    if (confirmed) await mutateSelected({ action });
  }

  async function exportSelected() {
    if (!selected.size || busy || !isBulkSelectionAvailable()) return;
    const backup = await storage.buildExport({ noteIds: [...selected.keys()] });
    api.downloadExport(backup, { selection: true });
    api.showToast(`Download requested for ${backup.data.notes.length} selected notes, including history.`);
  }

  function bindBulkEvents() {
    // Suspend the desktop selection UI on mobile without discarding its snapshots.
    mobileQuery.addEventListener("change", () => api.renderNotes());
    elements.selectNotes.addEventListener("click", () => selecting ? finishBulkSelection() : startBulkSelection());
    elements.bulkClear.addEventListener("click", finishBulkSelection);
    elements.bulkSelectResults.addEventListener("click", () => {
      if (!isBulkSelectionAvailable() || busy) return;
      const results = api.getVisibleNotes();
      if (areAllResultsSelected(results)) {
        results.forEach((note) => selected.delete(note.id));
      } else {
        results.forEach((note) => {
          if (!selected.has(note.id)) selected.set(note.id, captureSelection(note));
        });
      }
      api.renderNotes();
    });
    elements.bulkTrash.addEventListener("click", () => void api.runWorkflow(trashOrRestoreSelected));
    elements.bulkExport.addEventListener("click", () => void api.runWorkflow(exportSelected));
  }

  Object.assign(api, { syncBulkSelection, startBulkSelection, isBulkSelectionAvailable, decorateSelectableNoteCard, bindBulkEvents });
});
