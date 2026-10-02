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
    const secondaryController = api.createPaneController({
      pane: "secondary", readDraft: getSecondaryEditorDraft, isActive: () => ui.dualPaneOpen,
      setStatus: setSecondarySaveStatus, invoker: () => elements.secondarySaveChanges,
      onSession(session) { secondaryEditorSession = session; shared.secondaryEditorSession = session; },
    });
    const SECONDARY_RESULT_LIMIT = 50;
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
    const noteCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    let secondarySplitPreviewFrame = 0;
    const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
    const observeNoteCardTagRows = (...args) => api.observeNoteCardTagRows(...args);
    const isDetailWorkspaceOpen = (...args) => api.isDetailWorkspaceOpen(...args);
    const writeClipboardText = (...args) => api.writeClipboardText(...args);
    const markButtonCopied = (...args) => api.markButtonCopied(...args);
    const resetCopyButtonFeedback = (...args) => api.resetCopyButtonFeedback(...args);
    const createNoteCard = (...args) => api.createNoteCard(...args);

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
      secondaryController.dispose({ discard: discardDraft });
      ui.secondaryNoteDirty = false;
    }

    async function closeDualPane(options = {}) {
      dualPaneOperationSequence += 1;
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

    async function showSecondaryPicker({ isCurrent = () => true, resetSearch = false } = {}) {
      if (secondaryEditorSession?.hasUnsavedChanges()) {
        const saved = await saveSecondaryNote();
        if (!saved) return false;
      }
      if (!isCurrent()) return false;
      if (resetSearch) {
        ui.secondarySearchQuery = "";
        ui.secondaryListScrollTop = 0;
      }
      clearTimeout(ui.secondaryAutoSaveTimer);
      ui.secondaryAutoSaveTimer = 0;
      ui.secondaryNotePreviewHeaderCollapsed = false;
      syncSecondaryNotePreviewHeader();
      elements.secondaryReaderView?.classList.add("is-hidden");
      elements.secondaryPickerView?.classList.remove("is-hidden");
      renderSecondaryNotesList();
      animateSecondaryViewSwitch(elements.secondaryPickerView);
      window.requestAnimationFrame(() => {
        if (isCurrent() && ui.dualPaneOpen && !ui.secondaryClosing && !elements.secondaryPickerView?.classList.contains("is-hidden")) {
          elements.secondaryNoteSearch?.focus();
        }
      });
      return true;
    }

    function setSecondaryViewMode(mode) {
      if (!["focus", "comfortable"].includes(mode)) return;
      ui.secondaryViewMode = mode;
      syncSecondaryViewMode();
      try {
        window.localStorage.setItem("nook:secondary-view-mode", mode);
      } catch {
        // Layout remains usable when preference storage is unavailable.
      }
    }

    function syncSecondaryViewMode() {
      elements.secondaryNotesList?.classList.toggle("secondary-notes-list--comfortable", ui.secondaryViewMode === "comfortable");
      [["focus", elements.secondaryFocusView], ["comfortable", elements.secondaryComfortableView]].forEach(([mode, button]) => {
        button?.classList.toggle("is-active", mode === ui.secondaryViewMode);
        button?.setAttribute("aria-pressed", String(mode === ui.secondaryViewMode));
      });
    }

    function renderSecondaryNotesList() {
      if (!elements.secondaryNotesList) return;
      syncSecondaryViewMode();
      const scrollTop = ui.secondaryListScrollTop;
      const query = (ui.secondarySearchQuery || "").trim().toLowerCase();
      const currentNoteId = ui.editingNoteId;

      if (elements.secondaryNoteSearch && elements.secondaryNoteSearch.value !== (ui.secondarySearchQuery || "")) {
        elements.secondaryNoteSearch.value = ui.secondarySearchQuery || "";
      }
      elements.secondaryClearSearch?.classList.toggle("is-hidden", !query);
      if (elements.secondarySort) {
        elements.secondarySort.value = ui.secondarySort || "updated-desc";
        api.syncSecondarySortPicker();
      }

      const allAvailableNotes = library.notes.filter((note) => {
        if (isDeletedNote(note)) return false;
        if (note.id === currentNoteId) return false;
        if (!query) return true;
        return (library.searchIndex.get(note.id) || `${note.title}\n${note.content}`.toLocaleLowerCase()).includes(query);
      });

      const sortMode = ui.secondarySort || "updated-desc";
      allAvailableNotes.sort((left, right) => {
        if (sortMode === "title-asc" || sortMode === "title-desc") {
          const direction = sortMode === "title-asc" ? 1 : -1;
          const titleComparison = noteCollator.compare(left.title || "", right.title || "");
          if (titleComparison) return titleComparison * direction;
        } else if (sortMode === "created-desc" || sortMode === "created-asc") {
          const direction = sortMode === "created-asc" ? 1 : -1;
          const leftCreated = new Date(left.createdAt || 0).getTime();
          const rightCreated = new Date(right.createdAt || 0).getTime();
          const dateComparison = leftCreated - rightCreated;
          if (!Number.isNaN(dateComparison) && dateComparison) return dateComparison * direction;
        } else {
          const direction = sortMode === "updated-asc" ? 1 : -1;
          const leftUpdated = new Date(left.updatedAt || left.createdAt || 0).getTime();
          const rightUpdated = new Date(right.updatedAt || right.createdAt || 0).getTime();
          const updatedComparison = leftUpdated - rightUpdated;
          if (!Number.isNaN(updatedComparison) && updatedComparison) return updatedComparison * direction;
        }
        return noteCollator.compare(left.id, right.id);
      });

      elements.secondaryNotesList.replaceChildren();

      if (!allAvailableNotes.length) {
        const empty = createElement("div", {
          className: "secondary-notes-empty",
          text: query ? `No notes matching “${query}”.` : "No other notes available to open as side note.",
        });
        elements.secondaryNotesList.append(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      const availableNotes = allAvailableNotes.slice(0, SECONDARY_RESULT_LIMIT);
      availableNotes.forEach((note) => fragment.append(createNoteCard(note, { secondary: true })));

      elements.secondaryNotesList.append(fragment);
      observeNoteCardTagRows();
      elements.secondaryNotesList.scrollTop = scrollTop;
      if (allAvailableNotes.length > availableNotes.length) {
        elements.secondaryNotesList.append(createElement("p", {
          className: "secondary-notes-limit dialog-description",
          text: `Showing the first ${SECONDARY_RESULT_LIMIT} of ${allAvailableNotes.length} notes. Refine your search to narrow the list.`,
        }));
      }
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

      clearTimeout(ui.secondaryAutoSaveTimer);
      if (secondaryEditorSession?.conflict) return;
      ui.secondaryAutoSaveTimer = setTimeout(() => {
        void saveSecondaryNote();
      }, 1200);
    }

    async function saveSecondaryNote() {
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
          clearTimeout(ui.secondaryAutoSaveTimer);
          ui.secondaryAutoSaveTimer = setTimeout(() => void saveSecondaryNote(), 1200);
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
        if (ui.dualPaneOpen && !elements.secondaryPickerView?.classList.contains("is-hidden")) {
          renderSecondaryNotesList();
        }
        return;
      }
      if (ui.dualPaneOpen && !elements.secondaryPickerView?.classList.contains("is-hidden")) renderSecondaryNotesList();
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

    async function selectSecondaryNote(noteId, mode = "preview") {
      if (secondaryEditorSession && ui.secondaryNoteId !== noteId && secondaryEditorSession.hasUnsavedChanges()) {
        const saved = await saveSecondaryNote();
        if (!saved) return false;
      }
      const note = library.notes.find((n) => n.id === noteId);
      if (!note) return false;
      ui.secondaryListScrollTop = elements.secondaryNotesList.scrollTop;
      ui.secondaryNoteId = noteId;
      ui.secondaryNotePreviewHeaderCollapsed = false;
      showSecondaryReader(note);
      setSecondaryNoteMode(mode);
      return true;
    }

    function showSecondaryReader(note) {
      elements.secondaryPickerView?.classList.add("is-hidden");
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
      setSecondaryViewMode,
      renderSecondaryNotesList,
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
