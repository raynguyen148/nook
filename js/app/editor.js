globalThis[Symbol.for("nook.app.modules")].register("editor", (app) => {
  "use strict";

  const { api, storage, elements, library, ui, constants, shared } = app;
  const { NOTE_AUTO_SAVE_DELAY, MOTION } = constants;
  let noteEditorModeAnimation = null;
  let primaryEditorSession = null;
  let primarySaveOperation = null;
  const primaryController = api.createPaneController({
    pane: "primary", readDraft: getNoteEditorDraftData, isActive: () => isNoteEditorOpen(),
    setStatus: setNoteSaveStatus, invoker: noteSubmitButton,
    onSession(session) { primaryEditorSession = session; shared.primaryEditorSession = session; },
  });
  const createElement = (...args) => api.createElement(...args);
  const tagFor = (...args) => api.tagFor(...args);
  const tagLabel = (...args) => api.tagLabel(...args);
  const cleanTagInput = (...args) => api.cleanTagInput(...args);
  const formatFullDate = (...args) => api.formatFullDate(...args);
  const syncToastHost = (...args) => api.syncToastHost(...args);
  const showToast = (...args) => api.showToast(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const showError = (...args) => api.showError(...args);
  const renderQuickView = (...args) => api.renderQuickView(...args);
  const syncNotePreviewActions = (...args) => api.syncNotePreviewActions(...args);
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const openNoteDetail = (...args) => api.openNoteDetail(...args);
  const closeNoteDetail = (...args) => api.closeNoteDetail(...args);
  const resetCopyButtonFeedback = (...args) => api.resetCopyButtonFeedback(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const renderNoteTypeOptions = (...args) => api.renderNoteTypeOptions(...args);
  const renderSelectedNoteTags = (...args) => api.renderSelectedNoteTags(...args);
  const renderTagSuggestions = (...args) => api.renderTagSuggestions(...args);
  const resetNoteEditorScrollSyncTarget = (...args) => api.resetNoteEditorScrollSyncTarget(...args);
  const scheduleNoteEditorScrollMap = (...args) => api.scheduleNoteEditorScrollMap(...args);
  const renderNoteEditorPreview = (...args) => api.renderNoteEditorPreview(...args);

  function renderNoteMetadata(note) {
    elements.noteMeta.replaceChildren();
    if (!note) {
      elements.noteMeta.classList.add("is-hidden");
      return;
    }
    elements.noteMeta.classList.remove("is-hidden");
    elements.noteMeta.append(
      createElement("span", { text: `Created ${formatFullDate(note.createdAt)}` }),
      createElement("span", { text: `Last updated ${formatFullDate(note.updatedAt)}` }),
    );
  }

  function syncNotePreviewHeader() {
    const collapsed = Boolean(ui.notePreviewHeaderCollapsed);
    elements.quickViewDocumentHeader?.classList.toggle("is-collapsed", collapsed);
    elements.quickViewDocumentDetails?.setAttribute("aria-hidden", String(collapsed));
    if (!elements.quickViewHeaderToggle) return;
    const label = collapsed ? "Expand note details" : "Collapse note details";
    elements.quickViewHeaderToggle.setAttribute("aria-expanded", String(!collapsed));
    elements.quickViewHeaderToggle.setAttribute("aria-label", label);
    elements.quickViewHeaderToggle.title = label;
  }

  function toggleNotePreviewHeader() {
    if (ui.noteEditorMode !== "preview") return;
    ui.notePreviewHeaderCollapsed = !ui.notePreviewHeaderCollapsed;
    syncNotePreviewHeader();
  }

  function setNoteEditorMode(mode) {
    if (!["edit", "split", "preview"].includes(mode)) return;
    if (window.matchMedia("(max-width: 820px)").matches) {
      if (mode === "split") mode = "edit";
      if (library.notes.find((note) => note.id === elements.noteId.value)?.deletedAt) mode = "preview";
    }
    const previousMode = ui.noteEditorMode;
    resetCopyButtonFeedback(elements.copyNoteContent);
    if (mode !== "split") {
      ui.noteScrollMap = null;
      ui.noteScrollLeader = null;
      window.cancelAnimationFrame(ui.noteScrollMapFrame);
      ui.noteScrollMapFrame = 0;
      window.cancelAnimationFrame(ui.noteScrollSyncResetFrame);
      resetNoteEditorScrollSyncTarget();
    }
    ui.noteEditorMode = mode;
    elements.noteDialogTitle.textContent = mode === "preview"
      ? "Preview note"
      : elements.noteId.value ? "Edit note" : "New note";
    elements.noteDialog.classList.toggle("is-split", mode === "split");
    elements.noteDialog.classList.toggle("is-preview", mode === "preview");
    elements.noteContentField.classList.toggle("is-split", mode === "split");
    elements.noteContentField.classList.toggle("is-preview", mode === "preview");
    elements.noteContentPreview.hidden = mode === "edit";
    elements.notePreviewPanel.classList.toggle("is-hidden", mode !== "preview");
    syncNotePreviewHeader();
    elements.noteEditorModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.noteEditorMode === mode));
    });
    syncNotePreviewActions();
    if (mode === "preview") renderQuickView();
    else renderNoteEditorPreview();
    scheduleNoteEditorHeight();
    if (previousMode !== mode && isNoteEditorOpen()) {
      api.syncNoteDetailSize();
      noteEditorModeAnimation?.cancel();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animation = elements.noteDialog.querySelector(".dialog-body")?.animate(
        [{ opacity: reducedMotion ? 0.82 : 0.64 }, { opacity: 1 }],
        { duration: reducedMotion ? MOTION.micro : MOTION.short, easing: MOTION.easeOut },
      );
      if (animation) {
        noteEditorModeAnimation = animation;
        animation.finished.catch(() => {}).finally(() => {
          if (noteEditorModeAnimation === animation) noteEditorModeAnimation = null;
        });
      }
    }
  }

  function syncNoteEditorHeight() {
    if (!isNoteEditorOpen()) return;
    // The detail workspace owns the editor height. Keeping it fixed prevents
    // content changes from moving metadata or changing the document layout.
    elements.noteContentEditor.style.removeProperty("height");
  }

  function scheduleNoteEditorHeight(options) {
    window.requestAnimationFrame(() => syncNoteEditorHeight(options));
  }

  function noteSubmitButton() {
    return elements.noteForm.querySelector('[type="submit"]');
  }

  function noteEditorValidationTarget(fieldName) {
    if (fieldName === "title") {
      return {
        control: elements.noteTitle,
        error: elements.noteTitleError,
      };
    }
    if (fieldName === "type") {
      return {
        control: shared.noteTypePicker?.trigger || elements.noteType,
        error: elements.noteTypeError,
      };
    }
    return null;
  }

  function setNoteEditorFieldError(fieldName, message = "") {
    const target = noteEditorValidationTarget(fieldName);
    if (!target) return;
    const hasError = Boolean(message);
    target.error.textContent = message;
    target.error.classList.toggle("is-visible", hasError);
    if (hasError) target.control.setAttribute("aria-invalid", "true");
    else target.control.removeAttribute("aria-invalid");
  }

  function noteEditorFieldError(fieldName) {
    if (fieldName === "title") {
      return elements.noteTitle.value.trim() ? "" : "Enter a title.";
    }
    if (fieldName === "type") {
      const typeExists = library.types.some(({ id }) => id === elements.noteType.value);
      return typeExists ? "" : "Choose a note type.";
    }
    return "";
  }

  function revalidateNoteEditorField(fieldName) {
    const target = noteEditorValidationTarget(fieldName);
    if (!target?.error.classList.contains("is-visible")) return;
    setNoteEditorFieldError(fieldName, noteEditorFieldError(fieldName));
  }

  function clearNoteEditorValidation() {
    setNoteEditorFieldError("title");
    setNoteEditorFieldError("type");
  }

  function validateNoteEditor({ focusFirst = true } = {}) {
    const fields = ["title", "type"];
    let firstInvalidTarget = null;
    fields.forEach((fieldName) => {
      const message = noteEditorFieldError(fieldName);
      setNoteEditorFieldError(fieldName, message);
      if (!firstInvalidTarget && message) {
        firstInvalidTarget = noteEditorValidationTarget(fieldName)?.control || null;
      }
    });
    if (!firstInvalidTarget) return true;
    if (focusFirst) {
      if (ui.noteEditorMode === "preview") setNoteEditorMode("edit");
      firstInvalidTarget.focus();
    }
    return false;
  }

  function handleNoteSaveFieldError(error, { focus = true } = {}) {
    const message = error instanceof Error ? error.message : "";
    let fieldName = "";
    if (message.startsWith("Note title ")) fieldName = "title";
    if (message === "Choose a valid note type." || message.startsWith("Note type ")) fieldName = "type";
    if (!fieldName) return false;
    const inlineMessage = fieldName === "title" ? "Shorten the title." : "Choose a note type.";
    setNoteEditorFieldError(fieldName, noteEditorFieldError(fieldName) || inlineMessage);
    if (focus) {
      if (ui.noteEditorMode === "preview") setNoteEditorMode("edit");
      noteEditorValidationTarget(fieldName)?.control.focus();
    }
    return true;
  }

  function getNoteEditorDraftData() {
    return {
      id: elements.noteId.value,
      title: elements.noteTitle.value,
      typeId: elements.noteType.value,
      tagIds: [...ui.selectedNoteTagIds],
      content: elements.noteContent.value,
    };
  }

  function getNoteEditorDraft() {
    return createNoteEditorDraft(getNoteEditorDraftData());
  }

  function createNoteEditorDraft({ id = "", title, typeId, tagIds, content }) {
    return JSON.stringify({
      id,
      title,
      typeId,
      tagIds: [...tagIds].sort(),
      content,
    });
  }

  function createPrimaryEditorSession(note = null, draft = getNoteEditorDraftData(), baseRevision = note?.revision || 0, recovery = null) {
    return primaryController.open(note, draft, { baseRevision, recovery });
  }

  function syncPrimaryEditorSessionDraft() { return primaryController.sync(); }

  function hasUnsavedNoteChanges() {
    if (primaryEditorSession) {
      syncPrimaryEditorSessionDraft();
      return primaryEditorSession.hasUnsavedChanges();
    }
    return ui.noteEditorSnapshot !== null && getNoteEditorDraft() !== ui.noteEditorSnapshot;
  }

  function clearNoteAutoSave() {
    if (!ui.noteAutoSaveTimer) return;
    window.clearTimeout(ui.noteAutoSaveTimer);
    ui.noteAutoSaveTimer = 0;
  }

  function setNoteSaveStatus(state, customLabel = "") {
    api.renderNoteSaveStatus(elements.noteSaveStatus, elements.noteSaveStatusLabel, state, customLabel);
  }

  function scheduleNoteAutoSave() {
    syncPrimaryEditorSessionDraft();
    clearNoteAutoSave();
    if (!isNoteEditorOpen() || ui.noteSaveInFlight) return;

    if (!hasUnsavedNoteChanges()) {
      setNoteSaveStatus("saved");
      return;
    }

    setNoteSaveStatus("dirty");
    if (primaryEditorSession?.conflict) {
      setNoteSaveStatus("error", "Conflict · draft kept");
      return;
    }

    const rawTitle = elements.noteTitle.value.trim();
    if (!rawTitle) {
      return;
    }
    if (api.isPaneNotePickerOpen?.("primary")) {
      api.deferPaneNoteAutoSave("primary");
      return;
    }

    const session = ui.noteEditorSession;
    ui.noteAutoSaveTimer = window.setTimeout(() => {
      ui.noteAutoSaveTimer = 0;
      if (!isCurrentNoteEditorSession(session) || !hasUnsavedNoteChanges()) return;
      saveNote({ preventDefault() {} }, { closeAfterSave: false, isAutoSave: true });
    }, NOTE_AUTO_SAVE_DELAY);
  }

  function isCurrentNoteEditorSession(session) {
    return ui.noteEditorSession === session && isNoteEditorOpen();
  }

  function syncNoteEditorControls() {
    const isCreatingTag = ui.pendingTagCreation?.session === ui.noteEditorSession;
    const disabled = ui.noteSaveInFlight;
    const keepTextInputsEnabled = ui.noteAutoSaveInFlight;
    const noteTypeControls = shared.noteTypePicker ? [shared.noteTypePicker.trigger, ...shared.noteTypePicker.options] : [];
    [
      elements.noteTitle,
      elements.noteType,
      ...noteTypeControls,
      elements.noteContent,
      ...elements.noteFormattingButtons,
      ...elements.noteEditorModeButtons,
      elements.deleteNote,
      elements.cancelNote,
      elements.closeNoteDialog,
      elements.quickSaveNote,
      ...elements.selectedNoteTags.querySelectorAll("button"),
      ...elements.tagSuggestions.querySelectorAll("button"),
    ].forEach((control) => {
      const isTextInput = control === elements.noteTitle || control === elements.noteContent;
      const isTypeInput = control === elements.noteType || noteTypeControls.includes(control);
      control.disabled = disabled && !(keepTextInputsEnabled && (isTextInput || isTypeInput));
    });
    elements.tagInput.disabled = disabled || isCreatingTag;
    elements.addTag.disabled = disabled || isCreatingTag;
    const submitButton = noteSubmitButton();
    if (submitButton) {
      submitButton.disabled = disabled || isCreatingTag;
      submitButton.textContent = disabled ? "Saving…" : "Save & return";
    }
    if (elements.mobileNoteDone) {
      elements.mobileNoteDone.disabled = disabled || isCreatingTag;
      elements.mobileNoteActions.disabled = disabled;
      if (window.matchMedia("(max-width: 820px)").matches && library.notes.find((note) => note.id === elements.noteId.value)?.deletedAt) {
        elements.noteEditorModeButtons.forEach((button) => {
          if (button.dataset.noteEditorMode !== "preview") button.disabled = true;
        });
        elements.deleteNote.disabled = true;
      }
    }
  }

  function openNoteEditor(note = null, {
    preserveDetail = false,
    invoker = null,
    initialMode = "edit",
    focusTitle = true,
  } = {}) {
    api.resetPaneNotePicker?.("primary");
    primarySaveOperation = null;
    resetCopyButtonFeedback(elements.copyNoteContent);
    clearNoteAutoSave();
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.noteCloseAfterSaveRequested = false;
    ui.editingNoteId = note?.id || "";
    ui.notePreviewHeaderCollapsed = false;
    ui.selectedNoteTagIds = new Set(note?.tagIds || []);
    elements.noteForm.reset();
    clearNoteEditorValidation();
    setTagInputExpanded(false);
    elements.noteId.value = note?.id || "";
    elements.noteTitle.value = note?.title || "";
    elements.noteContent.value = note?.content || "";
    elements.noteContentEditor.style.removeProperty("height");
    elements.noteDialogTitle.textContent = note ? "Edit note" : "New note";
    elements.deleteNote.classList.toggle("is-hidden", !note);
    elements.primarySwitchNote.classList.toggle("is-hidden", !note || Boolean(note.deletedAt));
    renderNoteTypeOptions(note?.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    setNoteEditorMode(initialMode);
    openNoteDetail(elements.noteDialog, preserveDetail ? null : invoker || elements.newNote);
    ui.noteEditorSnapshot = getNoteEditorDraft();
    createPrimaryEditorSession(note, getNoteEditorDraftData(), note?.revision || 0);
    elements.noteHistory?.classList.toggle("is-hidden", !note);
    syncToastHost();
    syncNoteEditorControls();
    setNoteSaveStatus(note ? "saved" : "new");
    scheduleNoteEditorHeight({ allowShrink: true });
    if (initialMode === "split") scheduleNoteEditorScrollMap(elements.noteContent);
    if (!preserveDetail && focusTitle && initialMode === "edit") {
      window.requestAnimationFrame(() => elements.noteTitle.focus());
    }
  }

  function restoreStoredNoteDraft(recovery, { asNew = false } = {}) {
    const note = !asNew && recovery.draft.id ? library.notes.find((item) => item.id === recovery.draft.id && !item.deletedAt) : null;
    openNoteEditor(note || null);
    const typeId = library.types.some(({ id }) => id === recovery.draft.typeId)
      ? recovery.draft.typeId
      : storage.FALLBACK_TYPE_ID;
    elements.noteTitle.value = recovery.draft.title;
    elements.noteContent.value = recovery.draft.content;
    ui.selectedNoteTagIds = new Set(recovery.draft.tagIds.filter((tagId) => tagFor(tagId)));
    renderNoteTypeOptions(typeId);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteEditorPreview();
    scheduleNoteEditorHeight({ allowShrink: true });
    primaryEditorSession?.dispose();
    createPrimaryEditorSession(note, getNoteEditorDraftData(), note?.revision || 0, recovery);
    setNoteSaveStatus(primaryEditorSession.conflict ? "error" : "dirty", primaryEditorSession.conflict ? "Conflict · draft kept" : "Recovered · save when ready");
    showToast("Unfinished draft restored. Save when you are ready.");
  }

  function syncEditorDraftRecovery() {
    if (primaryEditorSession && isNoteEditorOpen()) syncPrimaryEditorSessionDraft();
    api.syncSecondaryEditorDraft?.();
  }

  function hydratePrimaryEditorFromCommittedNote(note) {
    elements.noteId.value = note.id;
    elements.noteTitle.value = note.title;
    elements.noteContent.value = note.content;
    ui.editingNoteId = note.id;
    ui.selectedNoteTagIds = new Set(note.tagIds || []);
    renderNoteTypeOptions(note.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    ui.noteEditorSnapshot = getNoteEditorDraft();
    setNoteSaveStatus("saved");
    if (ui.noteEditorMode !== "edit") renderNoteEditorPreview();
    scheduleNoteEditorHeight({ allowShrink: true });
  }

  function reconcileEditorSessionsAfterLibraryRefresh({ external = false } = {}) {
    if (primaryEditorSession && isNoteEditorOpen() && primaryEditorSession.noteId) {
      const session = primaryEditorSession;
      const latest = library.notes.find((note) => note.id === session.noteId && !note.deletedAt);
      if (!latest) {
        if (session.hasUnsavedChanges()) {
          setNoteSaveStatus("error", "Saved note changed elsewhere");
          showToast("This note changed or was removed elsewhere. Your draft was kept locally.", "error");
        } else {
          closeNoteEditor({ discardStoredDraft: true });
        }
      } else {
        const result = session.applyExternalSnapshot(latest);
        if (result.conflict) {
          setNoteSaveStatus("error", "Newer version found");
          if (external) showToast("A newer version was saved in another tab. Your draft was kept.", "error");
        } else if (result.applied && primaryEditorSession === session) {
          hydratePrimaryEditorFromCommittedNote(latest);
        }
      }
    }
    api.reconcileSecondaryEditorAfterLibraryRefresh?.({ external });
    for (const pane of ["primary", "secondary"]) {
      if (api.isPaneNotePickerOpen?.(pane)) api.renderPaneNotePicker(pane);
    }
  }

  function closeNoteEditor({ discardStoredDraft = false } = {}) {
    api.resetPaneNotePicker?.("primary");
    primarySaveOperation = null;
    clearNoteAutoSave();
    window.cancelAnimationFrame(ui.noteEditorPreviewFrame);
    window.cancelAnimationFrame(ui.noteScrollMapFrame);
    window.cancelAnimationFrame(ui.noteScrollSyncResetFrame);
    ui.noteEditorPreviewFrame = 0;
    ui.noteScrollMapFrame = 0;
    ui.noteScrollMap = null;
    ui.noteScrollLeader = null;
    resetNoteEditorScrollSyncTarget();
    primaryController.dispose({ discard: discardStoredDraft });
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.noteCloseAfterSaveRequested = false;
    setTagInputExpanded(false);
    elements.noteContentEditor.style.removeProperty("height");
    ui.editingNoteId = "";
    ui.selectedNoteTagIds.clear();
    ui.noteEditorSnapshot = null;
    ui.notePreviewHeaderCollapsed = false;
    closeNoteDetail();
    // Keep the currently visible surface intact for the exit animation. The
    // next editor open re-syncs the DOM classes before it becomes visible.
    ui.noteEditorMode = "edit";
    ui.viewInvoker = null;
  }

  async function closeEditorAfterProtectedSaves({ discardStoredDraft = false } = {}) {
    if (ui.dualPaneOpen) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen) return false;
    }
    if (!isNoteEditorOpen()) return false;
    closeNoteEditor({ discardStoredDraft });
    return true;
  }

  async function requestNoteEditorClose({ afterClose = null } = {}) {
    api.resetPaneNotePicker?.("primary");
    if (ui.noteSaveInFlight) {
      ui.noteCloseAfterSaveRequested = true;
      return;
    }
    if (ui.dualPaneOpen) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen || !isNoteEditorOpen()) return;
    }
    if (!hasUnsavedNoteChanges()) {
      closeNoteEditor();
      afterClose?.();
      return;
    }
    if (elements.noteTitle.value.trim()) {
      await saveNote({ preventDefault() {} }, { closeAfterSave: true });
      if (!isNoteEditorOpen()) afterClose?.();
      return;
    }
    const confirmed = await requestConfirmation({
      title: "Discard unsaved changes?",
      description: "This note has changes that have not been saved yet.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
    if (confirmed && isNoteEditorOpen()) {
      closeNoteEditor({ discardStoredDraft: true });
      afterClose?.();
    }
  }

  function setTagInputExpanded(expanded, { focus = false } = {}) {
    const returnFocus = elements.tagInputRow.contains(document.activeElement)
      || elements.tagSuggestions.contains(document.activeElement);
    ui.tagInputExpanded = Boolean(expanded);
    elements.tagInputRow.hidden = !ui.tagInputExpanded;
    elements.addTag.setAttribute("aria-expanded", String(ui.tagInputExpanded));

    if (!ui.tagInputExpanded) {
      elements.tagInput.value = "";
      elements.tagSuggestions.replaceChildren();
      if (returnFocus && isNoteEditorOpen() && !elements.addTag.disabled) elements.addTag.focus({ preventScroll: true });
      return;
    }

    if (focus) {
      window.requestAnimationFrame(() => {
        if (isNoteEditorOpen() && ui.tagInputExpanded) elements.tagInput.focus();
      });
    }
  }

  function selectNoteTag(tagId) {
    if (ui.noteSaveInFlight) return;
    if (!tagFor(tagId)) return;
    ui.selectedNoteTagIds.add(tagId);
    elements.tagInput.value = "";
    renderSelectedNoteTags();
    setTagInputExpanded(false);
    scheduleNoteAutoSave();
  }

  function addTagFromEditor() {
    const session = ui.noteEditorSession;
    if (ui.noteSaveInFlight) return Promise.resolve();
    if (ui.pendingTagCreation?.session === session) return ui.pendingTagCreation.promise;
    const rawName = cleanTagInput(elements.tagInput.value);
    if (!rawName) return Promise.resolve();
    const existing = library.tags.find(
      (tag) => tagLabel(tag).toLocaleLowerCase() === rawName.toLocaleLowerCase(),
    );
    if (existing) {
      selectNoteTag(existing.id);
      return Promise.resolve();
    }
    const returnFocus = elements.tagInputRow.contains(document.activeElement)
      || elements.tagSuggestions.contains(document.activeElement)
      || document.activeElement === elements.addTag;
    const pending = { session, promise: null };
    let tagCreated = false;
    ui.pendingTagCreation = pending;
    syncNoteEditorControls();
    const operation = (async () => {
      try {
        const tag = await storage.addTag({ name: rawName });
        await refreshLibrary({ broadcast: true });
        if (!isCurrentNoteEditorSession(session)) return;
        ui.selectedNoteTagIds.add(tag.id);
        elements.tagInput.value = "";
        renderSelectedNoteTags();
        setTagInputExpanded(false);
        tagCreated = true;
        scheduleNoteAutoSave();
        showToast(`Tag “${tagLabel(tag)}” created.`);
      } catch (error) {
        if (isCurrentNoteEditorSession(session)) showError(error);
      } finally {
        if (ui.pendingTagCreation === pending) ui.pendingTagCreation = null;
        if (isCurrentNoteEditorSession(session)) {
          syncNoteEditorControls();
          if (tagCreated && returnFocus && document.activeElement === document.body) elements.addTag.focus({ preventScroll: true });
        }
      }
    })();
    pending.promise = operation;
    return operation;
  }

  function saveNote(event, options = {}) {
    event?.preventDefault?.();
    if (primarySaveOperation) {
      if (options.closeAfterSave !== false) ui.noteCloseAfterSaveRequested = true;
      return primarySaveOperation;
    }
    const operation = performNoteSave(event, options);
    primarySaveOperation = operation;
    void operation.finally(() => {
      if (primarySaveOperation === operation) primarySaveOperation = null;
    });
    return operation;
  }

  async function preparePrimaryNoteSwitch() {
    const session = primaryEditorSession;
    const editorSequence = ui.noteEditorSession;
    const isCurrent = () => session === primaryEditorSession && isCurrentNoteEditorSession(editorSequence);
    if (ui.pendingTagCreation?.session === editorSequence) await ui.pendingTagCreation.promise;
    if (!isCurrent()) return false;
    if (primarySaveOperation) await primarySaveOperation;
    if (!isCurrent()) return false;
    if (hasUnsavedNoteChanges()) await saveNote(null, { closeAfterSave: false });
    return isCurrent() && !ui.noteSaveInFlight && !hasUnsavedNoteChanges();
  }

  async function performNoteSave(event, { closeAfterSave = true, isAutoSave = false } = {}) {
    event?.preventDefault?.();
    clearNoteAutoSave();
    if (ui.noteSaveInFlight) {
      if (closeAfterSave) ui.noteCloseAfterSaveRequested = true;
      return;
    }
    if (isAutoSave && !elements.noteTitle.value.trim()) return;
    if (!validateNoteEditor({ focusFirst: !isAutoSave })) {
      return;
    }
    const session = ui.noteEditorSession;
    const pendingTagCreation = ui.pendingTagCreation;
    if (pendingTagCreation?.session === session) {
      await pendingTagCreation.promise;
      if (!isCurrentNoteEditorSession(session)) return;
    }

    const editorSession = primaryEditorSession;
    if (!editorSession) return;
    syncPrimaryEditorSessionDraft();

    const focusedControl = document.activeElement;
    const tagFocus = isAutoSave && (elements.selectedNoteTags.contains(focusedControl) || focusedControl === elements.addTag)
      ? { tagId: focusedControl.dataset.tagId || "" }
      : null;

    ui.noteSaveInFlight = true;
    ui.noteAutoSaveInFlight = isAutoSave;
    setNoteSaveStatus("saving");
    syncNoteEditorControls();
    let didSave = false;
    try {
      const result = await primaryController.save();
      if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;
      if (result.status === "conflict-kept") {
        return;
      }

      if (result.status === "error") throw result.error;
      if (result.status === "stale") return;
      if (result.status === "noop") {
        setNoteSaveStatus("saved");
        if (closeAfterSave) await closeEditorAfterProtectedSaves({ discardStoredDraft: true });
        return;
      }
      if (result.status !== "saved") return;

      didSave = true;
      const savedNote = result.savedNote;
      elements.noteId.value = savedNote.id;
      if (result.currentMatchesCapture) {
        if (elements.noteTitle.value !== savedNote.title) elements.noteTitle.value = savedNote.title;
        if (elements.noteContent.value !== savedNote.content) elements.noteContent.value = savedNote.content;
        ui.selectedNoteTagIds = new Set(savedNote.tagIds || []);
        renderNoteTypeOptions(savedNote.typeId);
        renderSelectedNoteTags();
      }
      ui.editingNoteId = savedNote.id;
      elements.primarySwitchNote.classList.remove("is-hidden");
      elements.noteDialogTitle.textContent = "Edit note";
      elements.deleteNote.classList.remove("is-hidden");
      elements.noteHistory?.classList.remove("is-hidden");
      renderNoteMetadata(savedNote);
      ui.noteEditorSnapshot = createNoteEditorDraft(savedNote);
      await refreshLibrary({ broadcast: true });
      if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;

      if (result.currentMatchesCapture && !editorSession.hasUnsavedChanges()) {
        setNoteSaveStatus("saved");
        if (closeAfterSave) await closeEditorAfterProtectedSaves({ discardStoredDraft: true });
      } else {
        setNoteSaveStatus("dirty");
        scheduleNoteAutoSave();
      }
    } catch (error) {
      if (isCurrentNoteEditorSession(session) && primaryEditorSession === editorSession) {
        ui.noteCloseAfterSaveRequested = false;
        setNoteSaveStatus("error");
        if (!handleNoteSaveFieldError(error, { focus: !isAutoSave })) {
          showError(error, "We could not save this note.");
        }
      }
    } finally {
      if (isCurrentNoteEditorSession(session) && primaryEditorSession === editorSession) {
        ui.noteSaveInFlight = false;
        ui.noteAutoSaveInFlight = false;
        syncNoteEditorControls();
        if (tagFocus && document.activeElement === document.body) {
          const target = [...elements.selectedNoteTags.querySelectorAll("button")]
            .find(control => control.dataset.tagId === tagFocus.tagId) || elements.addTag;
          if (!target.disabled) target.focus({ preventScroll: true });
        }
        if (didSave && hasUnsavedNoteChanges()) scheduleNoteAutoSave();
        if (ui.noteCloseAfterSaveRequested) {
          ui.noteCloseAfterSaveRequested = false;
          primarySaveOperation = null;
          void requestNoteEditorClose();
        }
      }
    }
  }

  Object.assign(api, {
    renderNoteMetadata,
    toggleNotePreviewHeader,
    setNoteEditorMode,
    syncNoteEditorHeight,
    scheduleNoteEditorHeight,
    noteSubmitButton,
    revalidateNoteEditorField,
    clearNoteEditorValidation,
    validateNoteEditor,
    getNoteEditorDraftData,
    getNoteEditorDraft,
    createNoteEditorDraft,
    hasUnsavedNoteChanges,
    clearNoteAutoSave,
    setNoteSaveStatus,
    scheduleNoteAutoSave,
    isCurrentNoteEditorSession,
    syncNoteEditorControls,
    openNoteEditor,
    restoreStoredNoteDraft,
    syncEditorDraftRecovery,
    reconcileEditorSessionsAfterLibraryRefresh,
    closeNoteEditor,
    requestNoteEditorClose,
    setTagInputExpanded,
    selectNoteTag,
    addTagFromEditor,
    saveNote,
    preparePrimaryNoteSwitch,
  });
});
