(() => {
  "use strict";

  // Side note navigation and DOM adapter for the shared pane controller.
  globalThis[Symbol.for("nook.app.modules")].register("side-note", (app) => {

    const { api, storage, elements, library, ui, constants, shared } = app;
    const { MOTION } = constants;
    let secondarySurfaceAnimation = null;
    let secondarySurfaceTransitionSequence = 0;
    let dualPaneOperationSequence = 0;
    let secondaryEditorSession = null;
    let secondarySaveOperation = null;
    const secondaryController = api.createPaneController({
      pane: "secondary", readDraft: getSecondaryEditorDraft, isActive: () => ui.dualPaneOpen,
      setStatus: setSecondarySaveStatus, invoker: () => elements.secondarySaveChanges,
      onSession(session) { secondaryEditorSession = session; shared.secondaryEditorSession = session; },
    });
    const createElement = (...args) => api.createElement(...args);
    const typeFor = (...args) => api.typeFor(...args);
    const tagFor = (...args) => api.tagFor(...args);
    const tagLabel = (...args) => api.tagLabel(...args);
    const formatFullDate = (...args) => api.formatFullDate(...args);
    const showToast = (...args) => api.showToast(...args);
    const showError = (...args) => api.showError(...args);
    const isDeletedNote = (...args) => api.isDeletedNote(...args);
    const renderSecondaryNoteTypeOptions = (...args) => api.renderSecondaryNoteTypeOptions(...args);
    const renderSecondarySelectedNoteTags = (...args) => api.renderSecondarySelectedNoteTags(...args);
    const setSecondaryTagInputExpanded = (...args) => api.setSecondaryTagInputExpanded(...args);
    const refreshLibrary = (...args) => api.refreshLibrary(...args);
    const downloadNoteFile = (...args) => api.downloadNoteFile(...args);
    const scheduleNoteEditorScrollMap = (...args) => api.scheduleNoteEditorScrollMap(...args);
    const lockNoteEditorScrollLeader = (...args) => api.lockNoteEditorScrollLeader(...args);
    let secondarySplitPreviewFrame = 0;
    const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
    const isDetailWorkspaceOpen = (...args) => api.isDetailWorkspaceOpen(...args);
    const writeClipboardText = (...args) => api.writeClipboardText(...args);
    const markButtonCopied = (...args) => api.markButtonCopied(...args);
    const resetCopyButtonFeedback = (...args) => api.resetCopyButtonFeedback(...args);

    function cancelSecondarySurfaceAnimation() {
      secondarySurfaceTransitionSequence += 1;
      secondarySurfaceAnimation?.cancel();
      secondarySurfaceAnimation = null;
      ui.secondaryClosing = false;
      if (elements.secondarySurface) {
        elements.secondarySurface.inert = false;
        elements.secondarySurface.style.willChange = "auto";
      }
    }

    function animateSecondarySurfaceIn() {
      cancelSecondarySurfaceAnimation();
      if (!elements.secondarySurface) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.secondarySurface.style.willChange = "opacity, transform";
      const animation = elements.secondarySurface.animate(
        reducedMotion
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateX(16px)" },
              { opacity: 1, transform: "translateX(0)" },
            ],
        {
          duration: reducedMotion ? MOTION.micro : MOTION.medium,
          easing: MOTION.easeOut,
        },
      );
      secondarySurfaceAnimation = animation;
      animation.finished
        .catch(() => {})
        .finally(() => {
          if (elements.secondarySurface) {
            elements.secondarySurface.style.willChange = "auto";
          }
          if (secondarySurfaceAnimation === animation) {
            secondarySurfaceAnimation = null;
          }
        });
    }

    function animateSecondaryViewSwitch(view) {
      if (!view || secondarySurfaceAnimation) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      view.animate(
        reducedMotion
          ? [{ opacity: 0.85 }, { opacity: 1 }]
          : [
              { opacity: 0.72, transform: "translateY(4px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
        {
          duration: reducedMotion ? MOTION.micro : MOTION.short,
          easing: MOTION.easeOut,
        },
      );
    }

    function getSecondaryEditorDraft(note = null) {
      return {
        id: ui.secondaryNoteId || note?.id || "",
        title: elements.secondaryNoteTitleInput?.value || note?.title || "Untitled note",
        typeId: elements.secondaryEditorTypeSelect?.value || ui.secondaryNoteTypeId || note?.typeId || storage.FALLBACK_TYPE_ID,
        tagIds: Array.from(ui.secondarySelectedNoteTagIds || note?.tagIds || []),
        content: elements.secondaryNoteContentEditor?.value ?? note?.content ?? "",
      };
    }

    function createSecondaryEditorSession(note, draft = getSecondaryEditorDraft(note), baseRevision = note?.revision || 0) {
      const session = secondaryController.open(note, draft, { baseRevision });
      ui.secondaryNoteDirty = session.hasUnsavedChanges();
      return session;
    }

    function syncSecondaryEditorDraft() {
      if (!ui.secondaryNoteId) return null;
      const state = secondaryController.sync();
      ui.secondaryNoteDirty = state?.dirty || false;
      return state;
    }

    function hasUnsavedSecondaryChanges() {
      if (!secondaryEditorSession) return false;
      syncSecondaryEditorDraft();
      return secondaryEditorSession.hasUnsavedChanges();
    }

    function disposeSecondaryEditorSession({ discardDraft = false } = {}) {
      secondarySaveOperation = null;
      secondaryController.dispose({ discard: discardDraft });
      ui.secondaryNoteDirty = false;
    }

    async function closeDualPane(options = {}) {
      dualPaneOperationSequence += 1;
      api.resetPaneNotePicker?.("secondary");
      const immediate = Boolean(options && typeof options === "object" && options.immediate);
      const restoreToggleFocus = !immediate && Boolean(elements.secondarySurface?.contains(document.activeElement));

      if (!immediate && secondaryEditorSession?.hasUnsavedChanges()) {
        const saved = await saveSecondaryNote();
        if (!saved) return false;
      }
      clearTimeout(ui.secondaryAutoSaveTimer);
      ui.secondaryAutoSaveTimer = 0;

      if (!ui.dualPaneOpen && !ui.secondaryClosing) return true;

      if (immediate && secondaryEditorSession?.hasUnsavedChanges()) {
        syncSecondaryEditorDraft();
        showToast("Side note draft kept for recovery.");
      }

      ui.dualPaneOpen = false;
      api.cancelNoteDetailResize();
      api.syncSidePaneSidebar();
      ui.activePane = "primary";
      elements.toggleDualPane?.setAttribute("aria-pressed", "false");
      elements.toggleDualPane?.classList.remove("is-active");
      resetCopyButtonFeedback(elements.secondaryCopyContent);

      const finishClose = () => {
        cancelSecondarySurfaceAnimation();
        window.cancelAnimationFrame(secondarySplitPreviewFrame);
        secondarySplitPreviewFrame = 0;
        ui.secondaryScrollMap = null;
        window.cancelAnimationFrame(ui.secondaryScrollMapFrame);
        ui.secondaryScrollMapFrame = 0;
        window.cancelAnimationFrame(ui.secondaryScrollSyncResetFrame);
        ui.secondaryScrollSyncTarget = null;
        ui.secondaryScrollSyncTargetTop = 0;
        ui.secondaryScrollSyncResetFrame = 0;
        ui.secondaryNotePreviewHeaderCollapsed = false;
        syncSecondaryNotePreviewHeader();
        elements.secondarySurface?.classList.add("is-hidden");
        elements.noteDetailWorkspace?.classList.remove("is-side-by-side");
        elements.workspace?.classList.remove("is-side-by-side-open");
        api.syncNoteDetailSize();
        disposeSecondaryEditorSession({ discardDraft: !ui.secondaryNoteDirty });
        if (restoreToggleFocus && elements.toggleDualPane?.isConnected) {
          window.requestAnimationFrame(() => elements.toggleDualPane.focus({ preventScroll: true }));
        }
      };

      if (
        immediate ||
        !elements.secondarySurface ||
        elements.secondarySurface.classList.contains("is-hidden") ||
        !isDetailWorkspaceOpen() ||
        ui.detailClosing
      ) {
        finishClose();
        return true;
      }

      const transitionSequence = ++secondarySurfaceTransitionSequence;
      secondarySurfaceAnimation?.cancel();
      ui.secondaryClosing = true;
      elements.secondarySurface.inert = true;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.secondarySurface.style.willChange = "opacity, transform";
      const closeAnimation = elements.secondarySurface.animate(
        reducedMotion
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: "translateX(0)" },
              { opacity: 0, transform: "translateX(12px)" },
            ],
        {
          duration: reducedMotion ? MOTION.micro : MOTION.short,
          easing: MOTION.easeIn,
          fill: "forwards",
        },
      );
      secondarySurfaceAnimation = closeAnimation;
      closeAnimation.finished
        .catch(() => {})
        .finally(() => {
          if (transitionSequence !== secondarySurfaceTransitionSequence) return;
          finishClose();
        });
      return true;
    }

    async function openDualPane({ startWithPicker = false } = {}) {
      if (!isDetailWorkspaceOpen()) return;
      const operationSequence = ++dualPaneOperationSequence;
      const isCurrent = () => operationSequence === dualPaneOperationSequence && ui.dualPaneOpen && !ui.secondaryClosing;
      ui.dualPaneOpen = true;
      api.syncSidePaneSidebar();
      ui.secondaryClosing = false;
      ui.activePane = "secondary";
      elements.noteDetailWorkspace?.classList.add("is-side-by-side");
      elements.workspace?.classList.add("is-side-by-side-open");
      elements.secondarySurface?.classList.remove("is-hidden");
      api.syncNoteDetailSize();
      elements.toggleDualPane?.setAttribute("aria-pressed", "true");
      elements.toggleDualPane?.classList.add("is-active");

      if (!isCurrent()) return;

      if (!startWithPicker && ui.secondaryNoteId) {
        const note = library.notes.find((n) => n.id === ui.secondaryNoteId && !isDeletedNote(n));
        if (note && note.id !== ui.editingNoteId) {
          showSecondaryReader(note);
          animateSecondarySurfaceIn();
          return;
        }
      }
      const shown = await showSecondaryPicker({ isCurrent, resetSearch: startWithPicker });
      if (!shown) return;
      if (!isCurrent()) return;
      animateSecondarySurfaceIn();
    }

    function toggleDualPane() {
      if (ui.dualPaneOpen) {
        closeDualPane();
      } else {
        openDualPane();
      }
    }

    function showSecondaryPicker(options = {}) {
      return api.showPaneNotePicker("secondary", options);
    }

    function clearSecondaryNoteAutoSave() {
      clearTimeout(ui.secondaryAutoSaveTimer);
      ui.secondaryAutoSaveTimer = 0;
    }

    function scheduleSecondaryNoteAutoSave() {
      clearSecondaryNoteAutoSave();
      if (!secondaryEditorSession?.hasUnsavedChanges() || secondaryEditorSession.conflict ||
          !ui.dualPaneOpen) return;
      if (api.isPaneNotePickerOpen("secondary")) {
        api.deferPaneNoteAutoSave("secondary");
        return;
      }
      ui.secondaryAutoSaveTimer = setTimeout(() => {
        ui.secondaryAutoSaveTimer = 0;
        void saveSecondaryNote();
      }, 1200);
    }

    async function prepareSecondaryNoteSwitch() {
      const session = secondaryEditorSession;
      if (!session) return ui.dualPaneOpen;
      if (ui.pendingSecondaryTagCreation?.session === session) await ui.pendingSecondaryTagCreation.promise;
      if (session !== secondaryEditorSession || !ui.dualPaneOpen) return false;
      if (secondarySaveOperation) await secondarySaveOperation;
      if (session !== secondaryEditorSession || !ui.dualPaneOpen) return false;
      syncSecondaryEditorDraft();
      if (session.saving || session.hasUnsavedChanges()) {
        if (!await saveSecondaryNote()) return false;
      }
      return session === secondaryEditorSession && !hasUnsavedSecondaryChanges();
    }

    function setSecondarySaveStatus(status, customLabel = "") {
      if (!elements.secondarySaveStatus) return;
      elements.secondarySaveStatus.classList.remove("is-saved", "is-dirty", "is-saving", "is-error");
      if (status === "saved") {
        elements.secondarySaveStatus.classList.add("is-saved");
        if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Saved";
        elements.secondarySaveStatus.title = "All changes are saved locally";
      } else if (status === "dirty") {
        elements.secondarySaveStatus.classList.add("is-dirty");
        if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Unsaved changes";
        elements.secondarySaveStatus.title = "Changes will save automatically";
      } else if (status === "saving") {
        elements.secondarySaveStatus.classList.add("is-saving");
        if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Saving…";
        elements.secondarySaveStatus.title = "Saving changes locally";
      } else if (status === "error") {
        elements.secondarySaveStatus.classList.add("is-error");
        if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Save failed";
        elements.secondarySaveStatus.title = "Save failed. Keep this note open and try saving again.";
      }
      if (customLabel && elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = customLabel;
    }

    function syncSecondaryFooterActions() {
      const hasContent = Boolean(
        (elements.secondaryNoteContentEditor?.value || "").trim() ||
        (elements.secondaryNoteContent?.textContent || "").trim()
      );
      if (elements.secondaryCopyContent) {
        elements.secondaryCopyContent.disabled = !hasContent || ui.copyInFlight;
      }
      if (elements.secondarySaveChanges) {
        const showSave = ui.secondaryNoteDirty && ui.secondaryNoteMode !== "preview";
        elements.secondarySaveChanges.classList.toggle("is-hidden", !showSave);
      }
    }

    function renderSecondarySplitPreview() {
      if (ui.secondaryNoteMode !== "split" || !elements.secondarySplitPreview || !elements.secondaryNoteContentEditor) return;
      lockNoteEditorScrollLeader(elements.secondaryNoteContentEditor);
      globalThis.NookMarkdown.renderInto(
        elements.secondarySplitPreview,
        elements.secondaryNoteContentEditor.value || "",
        "No content yet.",
        { sourceMap: true },
      );
      ui.secondaryScrollMap = null;
      scheduleNoteEditorScrollMap(elements.secondaryNoteContentEditor);
    }

    function scheduleSecondarySplitPreview() {
      if (ui.secondaryNoteMode !== "split") return;
      lockNoteEditorScrollLeader(elements.secondaryNoteContentEditor);
      ui.secondaryScrollMap = null;
      window.cancelAnimationFrame(secondarySplitPreviewFrame);
      secondarySplitPreviewFrame = window.requestAnimationFrame(() => {
        secondarySplitPreviewFrame = 0;
        renderSecondarySplitPreview();
      });
    }

    function syncSecondaryNotePreviewHeader() {
      const collapsed = Boolean(ui.secondaryNotePreviewHeaderCollapsed);
      elements.secondaryQuickViewDocumentHeader?.classList.toggle("is-collapsed", collapsed);
      elements.secondaryQuickViewDocumentDetails?.setAttribute("aria-hidden", String(collapsed));
      if (!elements.secondaryQuickViewHeaderToggle) return;
      const label = collapsed ? "Expand note details" : "Collapse note details";
      elements.secondaryQuickViewHeaderToggle.setAttribute("aria-expanded", String(!collapsed));
      elements.secondaryQuickViewHeaderToggle.setAttribute("aria-label", label);
      elements.secondaryQuickViewHeaderToggle.title = label;
    }

    function toggleSecondaryNotePreviewHeader() {
      if (ui.secondaryNoteMode !== "preview") return;
      ui.secondaryNotePreviewHeaderCollapsed = !ui.secondaryNotePreviewHeaderCollapsed;
      syncSecondaryNotePreviewHeader();
    }

    function setSecondaryNoteMode(mode) {
      if (!["edit", "split", "preview"].includes(mode)) return;
      if (!elements.secondaryReaderView) return;
      if (ui.secondaryNoteMode === mode) return;
      const previousMode = ui.secondaryNoteMode;
      ui.secondaryScrollMap = null;
      window.cancelAnimationFrame(ui.secondaryScrollMapFrame);
      ui.secondaryScrollMapFrame = 0;
      window.cancelAnimationFrame(ui.secondaryScrollSyncResetFrame);
      ui.secondaryScrollSyncTarget = null;
      ui.secondaryScrollSyncTargetTop = 0;
      ui.secondaryScrollSyncResetFrame = 0;
      ui.secondaryScrollLeader = null;
      ui.secondaryNoteMode = mode;
      api.scheduleNoteDetailSize();
      ui.activePane = "secondary";

      elements.secondaryModeButtons?.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.secondaryEditorMode === mode));
      });

      elements.secondaryReaderBody?.classList.toggle("is-preview", mode === "preview");
      elements.secondaryReaderBody?.classList.toggle("is-split", mode === "split");
      elements.secondaryReaderBody?.classList.toggle("is-edit", mode === "edit");
      elements.secondaryContentField?.classList.toggle("is-split", mode === "split");
      elements.secondaryContentField?.classList.toggle("is-preview", mode === "preview");

      if (elements.secondaryEditorContainer) {
        elements.secondaryEditorContainer.classList.toggle("is-hidden", mode === "preview");
      }
      if (elements.secondaryPreviewPanel) {
        elements.secondaryPreviewPanel.classList.toggle("is-hidden", mode !== "preview");
      }
      if (elements.secondarySplitPreview) {
        elements.secondarySplitPreview.hidden = mode === "edit";
      }

      if (elements.secondaryCommandbarTitle) {
        elements.secondaryCommandbarTitle.textContent = mode === "preview" ? "Side note" : "Edit side note";
      }

      if (mode === "split") {
        if (elements.secondarySplitPreview && elements.secondaryNoteContentEditor) {
          globalThis.NookMarkdown.renderInto(
            elements.secondarySplitPreview,
            elements.secondaryNoteContentEditor.value || "",
            "No content yet.",
            { sourceMap: true },
          );
          ui.secondaryScrollMap = null;
          scheduleNoteEditorScrollMap(elements.secondaryNoteContentEditor);
        }
      } else if (mode === "preview") {
        if (elements.secondaryNoteContentEditor && elements.secondaryNoteContent) {
          globalThis.NookMarkdown.renderInto(elements.secondaryNoteContent, elements.secondaryNoteContentEditor.value || "");
        }
        if (elements.secondaryNoteTitleInput && elements.secondaryNoteTitle) {
          elements.secondaryNoteTitle.textContent = elements.secondaryNoteTitleInput.value.trim() || "Untitled note";
        }
        const typeId = elements.secondaryEditorTypeSelect?.value || ui.secondaryNoteTypeId;
        if (elements.secondaryNoteType && typeId) {
          elements.secondaryNoteType.replaceChildren(makeTypeBadge(typeFor(typeId)));
        }
        if (ui.secondarySelectedNoteTagIds) {
          renderSecondaryPreviewTags(Array.from(ui.secondarySelectedNoteTagIds));
        }
      }

      syncSecondaryNotePreviewHeader();
      syncSecondaryFooterActions();

      if (previousMode !== mode && !secondarySurfaceAnimation) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        elements.secondaryReaderBody?.animate(
          [{ opacity: reducedMotion ? 0.82 : 0.64 }, { opacity: 1 }],
          { duration: reducedMotion ? MOTION.micro : MOTION.short, easing: MOTION.easeOut },
        );
      }

      if (elements.secondarySurface?.contains(document.activeElement)) {
        if (!document.activeElement.isConnected || document.activeElement.offsetParent === null) {
          elements.secondarySurface.focus({ preventScroll: true });
        }
      }
    }

    function onSecondaryNoteInput() {
      syncSecondaryEditorDraft();
      ui.secondaryNoteDirty = secondaryEditorSession?.hasUnsavedChanges() || false;
      setSecondarySaveStatus("dirty");

      if (ui.secondaryNoteMode === "split") {
        scheduleSecondarySplitPreview();
      }
      if (elements.secondaryNoteTitle && elements.secondaryNoteTitleInput) {
        elements.secondaryNoteTitle.textContent = elements.secondaryNoteTitleInput.value.trim() || "Untitled note";
      }

      syncSecondaryFooterActions();

      scheduleSecondaryNoteAutoSave();
    }

    function saveSecondaryNote() {
      if (secondarySaveOperation) return secondarySaveOperation;
      const operation = performSecondaryNoteSave();
      secondarySaveOperation = operation;
      void operation.finally(() => {
        if (secondarySaveOperation === operation) secondarySaveOperation = null;
      });
      return operation;
    }

    async function performSecondaryNoteSave() {
      clearSecondaryNoteAutoSave();
      if (!ui.secondaryNoteId || !secondaryEditorSession) return true;
      const session = secondaryEditorSession;
      syncSecondaryEditorDraft();

      setSecondarySaveStatus("saving");
      try {
        const result = await secondaryController.save();
        if (secondaryEditorSession !== session) return false;
        if (result.status === "conflict-kept") {
          ui.secondaryNoteDirty = true;
          syncSecondaryFooterActions();
          return false;
        }

        if (result.status === "error") throw result.error;
        if (result.status === "stale") return false;
        if (result.status === "noop") {
          ui.secondaryNoteDirty = false;
          setSecondarySaveStatus("saved");
          syncSecondaryFooterActions();
          return true;
        }
        if (result.status !== "saved") return false;

        const saved = result.savedNote;
        ui.secondaryNoteId = saved.id;
        await refreshLibrary({ broadcast: true });
        if (secondaryEditorSession !== session) return false;
        ui.secondaryNoteDirty = session.hasUnsavedChanges();
        setSecondarySaveStatus(ui.secondaryNoteDirty ? "dirty" : "saved");
        syncSecondaryFooterActions();

        if (result.currentMatchesCapture) {
          if (elements.secondaryNoteTitleInput && elements.secondaryNoteTitleInput.value !== saved.title) {
            elements.secondaryNoteTitleInput.value = saved.title;
          }
          if (elements.secondaryNoteContentEditor && elements.secondaryNoteContentEditor.value !== saved.content) {
            elements.secondaryNoteContentEditor.value = saved.content;
          }
          ui.secondaryNoteTypeId = saved.typeId;
          ui.secondarySelectedNoteTagIds = new Set(saved.tagIds || []);
          renderSecondaryNoteTypeOptions(saved.typeId);
          renderSecondarySelectedNoteTags();
          if (elements.secondaryNoteTitle) elements.secondaryNoteTitle.textContent = saved.title || "Untitled note";
          if (elements.secondaryNoteType) elements.secondaryNoteType.replaceChildren(makeTypeBadge(typeFor(saved.typeId)));
          renderSecondaryPreviewTags(saved.tagIds);
        }
        renderSecondaryTimestamps(saved.createdAt, saved.updatedAt);

        if (ui.secondaryNoteDirty) {
          scheduleSecondaryNoteAutoSave();
        }
        return !ui.secondaryNoteDirty;
      } catch (error) {
        if (secondaryEditorSession !== session) return false;
        ui.secondaryNoteDirty = true;
        setSecondarySaveStatus("error");
        showError(error, "Could not save side note.");
        return false;
      }
    }

    function reconcileSecondaryEditorAfterLibraryRefresh({ external = false } = {}) {
      if (!secondaryEditorSession || !ui.secondaryNoteId) {
        return;
      }
      const session = secondaryEditorSession;
      const latest = library.notes.find((note) => note.id === session.noteId && !isDeletedNote(note));
      if (!latest) {
        if (session.hasUnsavedChanges()) {
          ui.secondaryNoteDirty = true;
          setSecondarySaveStatus("error");
          showToast("This side note changed or was removed elsewhere. Its draft is still kept locally.", "error");
          return;
        }
        disposeSecondaryEditorSession({ discardDraft: true });
        ui.secondaryNoteId = "";
        if (ui.dualPaneOpen) void showSecondaryPicker();
        return;
      }
      const result = session.applyExternalSnapshot(latest);
      if (result.conflict) {
        ui.secondaryNoteDirty = true;
        setSecondarySaveStatus("error");
        if (external) showToast("A newer side-note version was saved in another tab. Your draft was kept.", "error");
        return;
      }
      if (result.applied && secondaryEditorSession === session) {
        renderSecondaryReader(latest);
      }
    }

    function renderSecondaryPreviewTags(tagIds = []) {
      if (!elements.secondaryNoteTags) return;
      const tags = (tagIds || []).map(tagFor).filter(Boolean);
      elements.secondaryNoteTags.replaceChildren();
      if (tags.length) {
        const fragment = document.createDocumentFragment();
        tags.forEach((tag) => {
          fragment.append(createElement("span", {
            className: "quick-view-tag",
            text: tagLabel(tag),
            attributes: { title: tagLabel(tag) },
          }));
        });
        elements.secondaryNoteTags.append(fragment);
      } else {
        elements.secondaryNoteTags.append(createElement("span", {
          className: "quick-view-no-tags",
          text: "No tags",
        }));
      }
    }

    function renderSecondaryTimestamps(createdAt, updatedAt) {
      const makeSpans = () => {
        const frag = document.createDocumentFragment();
        if (createdAt && updatedAt) {
          frag.append(
            createElement("span", { text: `Created ${formatFullDate(createdAt)}` }),
            createElement("span", { text: `Last updated ${formatFullDate(updatedAt)}` }),
          );
        } else {
          frag.append(createElement("span", { text: "Not saved yet" }));
        }
        return frag;
      };
      elements.secondaryNoteDates?.replaceChildren(makeSpans());
      elements.secondaryEditorDates?.replaceChildren(makeSpans());
    }

    function selectSecondaryNote(noteId, mode = "preview") {
      return api.selectPaneNote("secondary", noteId, mode);
    }

    function openSecondaryNote(note, mode = "preview") {
      secondarySaveOperation = null;
      ui.secondaryNoteId = note.id;
      ui.secondaryNotePreviewHeaderCollapsed = false;
      showSecondaryReader(note);
      setSecondaryNoteMode(mode);
    }

    function showSecondaryReader(note) {
      api.resetPaneNotePicker("secondary");
      elements.secondaryReaderView?.classList.remove("is-hidden");
      renderSecondaryReader(note);
      animateSecondaryViewSwitch(elements.secondaryReaderView);
      window.requestAnimationFrame(() => elements.secondarySurface?.focus({ preventScroll: true }));
    }

    function renderSecondaryReader(note) {
      if (!elements.secondaryReaderView) return;
      if (
        secondaryEditorSession &&
        secondaryEditorSession.noteId === note.id &&
        secondaryEditorSession.hasUnsavedChanges()
      ) {
        return;
      }
      const type = typeFor(note.typeId);

      ui.secondaryNoteDirty = false;
      clearTimeout(ui.secondaryAutoSaveTimer);
      ui.secondaryAutoSaveTimer = 0;

      ui.secondaryNoteTypeId = note.typeId || storage.FALLBACK_TYPE_ID;
      ui.secondarySelectedNoteTagIds = new Set(note.tagIds || []);
      ui.secondaryTagInputExpanded = false;

      // Set Preview elements
      elements.secondaryNoteTitle.textContent = note.title || "Untitled note";
      elements.secondaryNoteType.replaceChildren(makeTypeBadge(type));
      renderSecondaryPreviewTags(note.tagIds);

      globalThis.NookMarkdown.renderInto(elements.secondaryNoteContent, note.content || "");
      renderSecondaryTimestamps(note.createdAt, note.updatedAt);

      // Set Editor elements
      if (elements.secondaryNoteTitleInput) {
        elements.secondaryNoteTitleInput.value = note.title || "";
      }
      renderSecondaryNoteTypeOptions(ui.secondaryNoteTypeId);
      renderSecondarySelectedNoteTags();
      setSecondaryTagInputExpanded(false);

      if (elements.secondaryNoteContentEditor) {
        elements.secondaryNoteContentEditor.value = note.content || "";
      }
      if (elements.secondarySplitPreview) {
        globalThis.NookMarkdown.renderInto(
          elements.secondarySplitPreview,
          note.content || "",
          "No content yet.",
          { sourceMap: true },
        );
      }

      setSecondarySaveStatus("saved");
      setSecondaryNoteMode(ui.secondaryNoteMode || "preview");
      syncSecondaryNotePreviewHeader();
      if (ui.secondaryNoteMode === "split" && elements.secondaryNoteContentEditor) {
        ui.secondaryScrollMap = null;
        scheduleNoteEditorScrollMap(elements.secondaryNoteContentEditor);
      }

      createSecondaryEditorSession(note, getSecondaryEditorDraft(note), note.revision || 0);
      elements.secondaryNoteHistory?.classList.remove("is-hidden");

      const scrollContainer = elements.secondaryReaderView.querySelector(".quick-view-content-card");
      if (scrollContainer) scrollContainer.scrollTop = 0;
    }

    async function copySecondaryNoteContent() {
      if (!ui.secondaryNoteId) return;
      const note = library.notes.find((n) => n.id === ui.secondaryNoteId);
      const content = elements.secondaryNoteContentEditor ? elements.secondaryNoteContentEditor.value : (note?.content || "");
      if (!content.trim()) {
        showToast("This note has no content to copy.", "error");
        return;
      }
      elements.secondaryCopyContent.setAttribute("aria-busy", "true");
      try {
        await writeClipboardText(content);
        showToast("Content copied.");
        markButtonCopied(elements.secondaryCopyContent, {
          copiedLabel: "Content copied",
          originalLabel: "Copy note content",
          copiedTitle: "Copied!",
          originalTitle: "Copy content",
        });
      } catch (error) {
        showError(error, "We could not copy this note.");
      } finally {
        elements.secondaryCopyContent.removeAttribute("aria-busy");
      }
    }

    function exportSecondaryNoteMarkdown() {
      if (!ui.secondaryNoteId) return;
      const note = library.notes.find((n) => n.id === ui.secondaryNoteId);
      if (!note) return;
      const title = elements.secondaryNoteTitleInput ? elements.secondaryNoteTitleInput.value.trim() : note.title;
      const content = elements.secondaryNoteContentEditor ? elements.secondaryNoteContentEditor.value : note.content;
      const exportNote = { ...note, title: title || "Untitled note", content };
      try {
        downloadNoteFile(exportNote);
        showToast(`Exported “${exportNote.title}” as .md.`);
      } catch (error) {
        showError(error, "We could not export this note.");
      }
    }

    Object.assign(api, {
      cancelSecondarySurfaceAnimation,
      syncSecondaryEditorDraft,
      hasUnsavedSecondaryChanges,
      closeDualPane,
      openDualPane,
      toggleDualPane,
      showSecondaryPicker,
      clearSecondaryNoteAutoSave,
      scheduleSecondaryNoteAutoSave,
      prepareSecondaryNoteSwitch,
      openSecondaryNote,
      syncSecondaryFooterActions,
      syncSecondaryNotePreviewHeader,
      toggleSecondaryNotePreviewHeader,
      setSecondaryNoteMode,
      onSecondaryNoteInput,
      saveSecondaryNote,
      reconcileSecondaryEditorAfterLibraryRefresh,
      selectSecondaryNote,
      showSecondaryReader,
      renderSecondaryReader,
      copySecondaryNoteContent,
      exportSecondaryNoteMarkdown,
    });
  });
})();
