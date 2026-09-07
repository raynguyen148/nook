globalThis[Symbol.for("nook.app.modules")].register("events", (app) => {
  "use strict";

  // Event registration and the final application bootstrap.
  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const { api, storage, elements, library, ui, constants, shared } = app;
  const { THEME_STORAGE_KEY, THEMES } = constants;
  const { openColorPickers } = shared;
  const {
    getNextTheme,
    syncThemeUI,
    clearAutoThemeTimer,
    refreshAutoTheme,
    setTheme,
    syncSidebarUI,
    toggleSidebar,
    syncPinnedTopbarControlMetrics,
    scheduleTopbarActionsPinning,
    toggleMobileFilters,
    persistSort,
    syncStoredNoteDraft,
    getStoredBackupHealth,
    storeBackupHealth,
    syncBackupHealth,
    usesMacKeyboardShortcuts,
    syncSearchShortcutHint,
    syncNoteSaveShortcutHint,
    setViewMode,
    cleanTagInput,
    activeModalDialog,
    setupLibrarySync,
    syncToastHost,
    showToast,
    dismissToast,
    closeConfirmation,
    finishConfirmationClose,
    showError,
    resetToFirstPage,
    clearSearchRenderTimer,
    scheduleSearchRender,
    toggleTodayFilter,
    toggleUpdatedTodayFilter,
    showAllNotesSpace,
    showTrashSpace,
    clearFilters,
    renderQuickView,
    syncNotePreviewActions,
    isDetailWorkspaceOpen,
    isQuickViewOpen,
    isNoteEditorOpen,
    scheduleQuickViewHeightSync,
    closeQuickView,
    copyQuickViewContent,
    emptyTrashWithConfirmation,
    renderNotes,
    closeNoteTypePicker,
    enhanceNoteTypeSelect,
    renderSelectedNoteTags,
    renderTagSuggestions,
    normalizeTagEditorInput,
    syncNoteEditorScroll,
    scheduleNoteEditorPreview,
    setNoteEditorMode,
    scheduleNoteEditorHeight,
    scheduleNoteAutoSave,
    revalidateNoteEditorField,
    applyNoteFormattingShortcut,
    applyNoteFormatting,
    openNoteEditor,
    offerStoredNoteDraftRecovery,
    requestNoteEditorClose,
    setTagInputExpanded,
    addTagFromEditor,
    saveNote,
    deleteNoteWithConfirmation,
    setManagementTab,
    setManagementCreateMode,
    handleManagementTabKeydown,
    createColorOptions,
    closeColorPicker,
    enhanceColorSelect,
    renderTypeManagement,
    renderTagManagement,
    renderSearchResults,
    refreshLibrary,
    openOrganize,
    closeOrganize,
    addNewType,
    addNewTag,
    exportCurrentNote,
    exportLibrary,
    importLibrary,
  } = api;

  function bindEvents() {
    elements.mobileFilterToggle.addEventListener("click", toggleMobileFilters);
    elements.sidebarToggle?.addEventListener("click", () => toggleSidebar());
    elements.createdTodayFilter.addEventListener("click", toggleTodayFilter);
    elements.updatedTodayFilter.addEventListener("click", toggleUpdatedTodayFilter);
    elements.allNotesSpace.addEventListener("click", showAllNotesSpace);
    elements.trashSpace.addEventListener("click", showTrashSpace);
    elements.emptyTrash.addEventListener("click", emptyTrashWithConfirmation);
    elements.clearFilters.addEventListener("click", () => clearFilters());
    elements.toastAction.addEventListener("click", async () => {
      const action = ui.toastAction;
      dismissToast();
      if (!action?.onClick) return;
      try {
        await action.onClick();
      } catch (error) {
        showError(error);
      }
    });
    window.addEventListener("nook:toast", (event) => {
      const message = event?.detail?.message;
      const tone = event?.detail?.tone || "success";
      if (message) showToast(message, tone);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === THEME_STORAGE_KEY && THEMES.includes(event.newValue) && event.newValue !== ui.theme) {
        setTheme(event.newValue, { persist: false });
      }
    });
    elements.themeToggle.addEventListener("click", () => setTheme(getNextTheme(ui.theme)));
    document.addEventListener("visibilitychange", refreshAutoTheme);
    window.addEventListener("focus", refreshAutoTheme);
    window.addEventListener("pageshow", refreshAutoTheme);
    window.addEventListener("pagehide", clearAutoThemeTimer);
    elements.organize.addEventListener("click", () => openOrganize());
    elements.export.addEventListener("click", () => exportLibrary());
    elements.import.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", importLibrary);
    elements.newNote.addEventListener("click", () => openNoteEditor());
    elements.search.addEventListener("input", () => {
      ui.query = elements.search.value;
      resetToFirstPage();
      elements.notesList.setAttribute("aria-busy", "true");
      scheduleSearchRender();
    });
    elements.clearSearch.addEventListener("click", () => {
      clearSearchRenderTimer();
      ui.query = "";
      elements.search.value = "";
      resetToFirstPage();
      renderSearchResults();
      elements.search.focus();
    });
    elements.sort.addEventListener("change", () => {
      ui.sort = elements.sort.value;
      persistSort();
      resetToFirstPage();
      renderNotes({ motion: "sort" });
    });
    elements.focusView.addEventListener("click", () => setViewMode("focus"));
    elements.comfortableView.addEventListener("click", () => setViewMode("comfortable"));
    elements.compactView.addEventListener("click", () => setViewMode("compact"));
    elements.noteForm.addEventListener("submit", saveNote);
    elements.noteTitle.addEventListener("input", () => {
      revalidateNoteEditorField("title");
      if (ui.noteEditorMode === "preview") renderQuickView();
      scheduleNoteAutoSave();
    });
    elements.noteContent.addEventListener("input", () => {
      if (ui.noteEditorMode === "preview") renderQuickView();
      syncNotePreviewActions();
      scheduleNoteEditorPreview();
      scheduleNoteEditorHeight();
      scheduleNoteAutoSave();
    });
    elements.noteContent.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.noteContent, elements.noteContentPreview);
    });
    elements.noteFormattingButtons.forEach((button) => {
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!ui.noteSaveInFlight) applyNoteFormatting(button.dataset.noteFormatting);
      });
    });
    elements.noteContentPreview.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.noteContentPreview, elements.noteContent);
    });
    elements.noteType.addEventListener("change", () => {
      revalidateNoteEditorField("type");
      scheduleNoteAutoSave();
    });
    elements.noteEditorModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!ui.noteSaveInFlight) setNoteEditorMode(button.dataset.noteEditorMode);
      });
    });
    elements.closeNoteDialog.addEventListener("click", requestNoteEditorClose);
    elements.cancelNote.addEventListener("click", requestNoteEditorClose);
    elements.quickSaveNote.addEventListener("click", () => saveNote({ preventDefault() {} }, { closeAfterSave: false }));
    elements.deleteNote.addEventListener("click", () => {
      const note = library.notes.find(({ id }) => id === elements.noteId.value);
      deleteNoteWithConfirmation(note);
    });
    elements.closeQuickView.addEventListener("click", () => closeQuickView());
    elements.copyNoteContent.addEventListener("click", copyQuickViewContent);
    elements.exportNoteMarkdown.addEventListener("click", () => exportCurrentNote("md"));
    elements.exportNoteText.addEventListener("click", () => exportCurrentNote("txt"));
    elements.closeConfirmation.addEventListener("click", () => closeConfirmation());
    elements.cancelConfirmation.addEventListener("click", () => closeConfirmation());
    elements.confirmAction.addEventListener("click", () => closeConfirmation(true));
    elements.confirmationDialog.addEventListener("close", finishConfirmationClose);
    window.addEventListener("resize", () => {
      scheduleQuickViewHeightSync();
      scheduleNoteEditorHeight();
      scheduleTopbarActionsPinning();
      window.requestAnimationFrame(syncPinnedTopbarControlMetrics);
    });
    window.addEventListener("scroll", scheduleTopbarActionsPinning, { passive: true });
    window.addEventListener("pagehide", syncStoredNoteDraft);
    elements.tagInput.addEventListener("input", normalizeTagEditorInput);
    elements.tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTagFromEditor();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setTagInputExpanded(false);
        elements.addTag.focus({ preventScroll: true });
        return;
      }
      if (
        event.key === "Backspace" &&
        !event.isComposing &&
        !elements.tagInput.value &&
        ui.selectedNoteTagIds.size
      ) {
        event.preventDefault();
        const tagIds = [...ui.selectedNoteTagIds];
        ui.selectedNoteTagIds.delete(tagIds[tagIds.length - 1]);
        renderSelectedNoteTags();
        renderTagSuggestions();
        scheduleNoteAutoSave();
      }
    });
    elements.addTag.addEventListener("click", () => {
      if (!ui.tagInputExpanded) {
        setTagInputExpanded(true, { focus: true });
        return;
      }
      if (!cleanTagInput(elements.tagInput.value)) {
        setTagInputExpanded(false);
        return;
      }
      addTagFromEditor();
    });
    elements.closeOrganizeDialog.addEventListener("click", closeOrganize);
    [elements.confirmationDialog, elements.organizeDialog].forEach((dialog) => {
      dialog.addEventListener("close", () => window.queueMicrotask(syncToastHost));
    });
    elements.typesTab.addEventListener("click", () => setManagementTab("types"));
    elements.tagsTab.addEventListener("click", () => setManagementTab("tags"));
    elements.typesTab.addEventListener("keydown", handleManagementTabKeydown);
    elements.tagsTab.addEventListener("keydown", handleManagementTabKeydown);
    elements.addTypeToggle.addEventListener("click", () => {
      setManagementCreateMode(ui.managementCreateKind === "types" ? "" : "types");
    });
    elements.addTagToggle.addEventListener("click", () => {
      setManagementCreateMode(ui.managementCreateKind === "tags" ? "" : "tags");
    });
    elements.typesManagementSearch.addEventListener("input", () => {
      ui.managementQueries.types = elements.typesManagementSearch.value;
      if (ui.managementEditing?.kind === "types") ui.managementEditing = null;
      renderTypeManagement({ animate: true });
    });
    elements.tagsManagementSearch.addEventListener("input", () => {
      ui.managementQueries.tags = elements.tagsManagementSearch.value;
      if (ui.managementEditing?.kind === "tags") ui.managementEditing = null;
      renderTagManagement({ animate: true });
    });
    elements.newTypeForm.addEventListener("submit", addNewType);
    elements.newTagForm.addEventListener("submit", addNewTag);
    document.addEventListener("pointerdown", (event) => {
      openColorPickers.forEach((picker) => {
        if (!picker.select.parentElement.contains(event.target)) closeColorPicker(picker);
      });
      if (shared.noteTypePicker && !shared.noteTypePicker.root.contains(event.target)) closeNoteTypePicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !activeModalDialog() && isNoteEditorOpen()) {
        event.preventDefault();
        requestNoteEditorClose();
        return;
      }
      if (event.key === "Escape" && !activeModalDialog() && isQuickViewOpen()) {
        event.preventDefault();
        closeQuickView();
        return;
      }
      const usesCommandKey = usesMacKeyboardShortcuts();
      const hasSaveModifier = usesCommandKey ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const formattingKey = event.key.toLowerCase();
      const matchesNoteFormattingShortcut =
        event.target === elements.noteContent &&
        ["b", "i", "k"].includes(formattingKey) &&
        !event.altKey &&
        !event.shiftKey &&
        hasSaveModifier;

      if (matchesNoteFormattingShortcut && isNoteEditorOpen()) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) applyNoteFormattingShortcut(formattingKey);
        return;
      }

      const matchesQuickSaveNoteShortcut =
        event.key.toLowerCase() === "s" &&
        !event.altKey &&
        event.shiftKey &&
        hasSaveModifier;

      if (matchesQuickSaveNoteShortcut && isNoteEditorOpen()) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing && !ui.noteSaveInFlight) {
          saveNote({ preventDefault() {} }, { closeAfterSave: false });
        }
        return;
      }

      const matchesSaveNoteShortcut =
        event.key === "Enter" &&
        !event.altKey &&
        !event.shiftKey &&
        hasSaveModifier;

      if (matchesSaveNoteShortcut && isNoteEditorOpen()) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) elements.noteForm.requestSubmit();
        return;
      }

      const matchesSearchShortcut =
        event.key.toLowerCase() === "f" &&
        !event.altKey &&
        !event.shiftKey &&
        (usesCommandKey ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

      if (matchesSearchShortcut && !activeModalDialog() && !isDetailWorkspaceOpen()) {
        event.preventDefault();
        elements.search.focus({ preventScroll: true });
        return;
      }

      const matchesSidebarShortcut =
        event.key === "\\" &&
        !event.altKey &&
        !event.shiftKey &&
        hasSaveModifier &&
        !activeModalDialog();

      if (matchesSidebarShortcut) {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      const matchesQuickViewEditShortcut =
        isQuickViewOpen() &&
        formattingKey === "e" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented;

      if (matchesQuickViewEditShortcut && !ui.noteSaveInFlight) {
        event.preventDefault();
        setNoteEditorMode("edit");
        return;
      }

      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const matchesNoteEditorModeShortcut =
        isNoteEditorOpen() &&
        ["1", "2", "3"].includes(formattingKey) &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !editingText;

      if (matchesNoteEditorModeShortcut && !ui.noteSaveInFlight) {
        event.preventDefault();
        setNoteEditorMode({ 1: "edit", 2: "split", 3: "preview" }[formattingKey]);
        return;
      }

      const matchesQuickCaptureShortcut =
        event.key.toLowerCase() === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing;

      if (matchesQuickCaptureShortcut && !editingText && !activeModalDialog() && !isDetailWorkspaceOpen()) {
        event.preventDefault();
        openNoteEditor();
        return;
      }

      if (
        event.key === "/" &&
        !editingText &&
        !activeModalDialog() &&
        !isDetailWorkspaceOpen()
      ) {
        event.preventDefault();
        elements.search.focus();
        return;
      }

      const matchesThemeShortcut =
        event.key.toLowerCase() === "t" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing;

      if (
        matchesThemeShortcut &&
        !editingText &&
        !activeModalDialog() &&
        (!isDetailWorkspaceOpen() || isQuickViewOpen())
      ) {
        event.preventDefault();
        setTheme(getNextTheme(ui.theme));
        return;
      }

      const matchesSettingsShortcut =
        event.key.toLowerCase() === "s" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing;

      if (matchesSettingsShortcut && !editingText) {
        if (elements.organizeDialog.open) {
          event.preventDefault();
          closeOrganize();
          return;
        }
        if (!activeModalDialog() && !isDetailWorkspaceOpen()) {
          event.preventDefault();
          openOrganize();
          return;
        }
      }
    });
  }

  function showStartupError(error) {
    document.querySelector(".app-shell")?.classList.add("is-hidden");
    elements.startupError.classList.remove("is-hidden");
    const message = error instanceof Error && error.message ? error.message : "Your browser could not open the local note database.";
    elements.startupErrorMessage.textContent = `${message} Your existing browser data was not changed.`;
  }

  function arrangeNoteEditorWorkspace() {
    const modes = elements.noteContentField.querySelector(".note-editor-modes");
    if (!modes) return;

    // Preview and editor now share one document surface. Move the former
    // Quick View actions/content into it without dropping any existing action.
    elements.noteEditorCommandActions.append(modes);
    const tools = elements.noteDialog.querySelector(".dialog-footer__tools") || elements.noteDialog.querySelector(".dialog-footer");
    tools?.insertBefore(elements.notePreviewActions, elements.deleteNote.nextSibling);
    elements.notePreviewPanel.append(elements.quickViewBody);
    elements.noteDialog.querySelector(".dialog-header")?.append(elements.closeQuickView);
    elements.quickViewDialog.remove();
  }

  async function bootstrap() {
    arrangeNoteEditorWorkspace();
    if (!storage) {
      showStartupError(new Error("The local storage module could not be loaded."));
      return;
    }
    try {
      const result = await storage.initialize();
      await refreshLibrary();
      enhanceNoteTypeSelect();
      elements.newTypeColor.replaceChildren(createColorOptions(elements.newTypeColor.value));
      enhanceColorSelect(elements.newTypeColor);
      bindEvents();
      setupLibrarySync();
      syncThemeUI();
      syncSidebarUI();
      syncSearchShortcutHint();
      syncNoteSaveShortcutHint();
      storeBackupHealth(getStoredBackupHealth());
      syncBackupHealth();
      elements.appShell.inert = false;
      elements.appShell.removeAttribute("inert");
      elements.appShell.setAttribute("aria-busy", "false");
      scheduleTopbarActionsPinning();
      if (result.notice) showToast(result.notice, "error");
      await offerStoredNoteDraftRecovery();
    } catch (error) {
      showStartupError(error);
    }
  }

  Object.freeze(api);
  delete globalThis[APP_MODULES_KEY];
  bootstrap();
});
