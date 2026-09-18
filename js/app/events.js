globalThis[Symbol.for("nook.app.modules")].register("events", (app) => {
  "use strict";

  // Event registration and the final application bootstrap.
  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const { api, storage, elements, library, ui, constants, shared } = app;
  const {
    NOTE_PREVIEW_LINES_DEFAULT,
    NOTE_PREVIEW_LINES_STORAGE_KEY,
    THEME_STORAGE_KEY,
    THEMES,
  } = constants;
  const { openColorPickers } = shared;
  const {
    getNextTheme,
    enhanceThemePicker,
    closeThemePicker,
    toggleThemePicker,
    setThemePickerValue,
    handleThemePickerTriggerKeydown,
    handleThemePickerMenuClick,
    handleThemePickerMenuKeydown,
    handleThemePickerDocumentPointerdown,
    syncThemeUI,
    clearAutoThemeTimer,
    refreshAutoTheme,
    setTheme,
    syncSidebarUI,
    positionSidebarToggleTooltip,
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
    syncNotePreviewLinesUI,
    setNotePreviewLines,
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
    scheduleTagFilterLayout,
    toggleTagFilterExpansion,
    observeTagFilterLayout,
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
    enhanceSortSelect,
    renderSelectedNoteTags,
    renderTagSuggestions,
    normalizeTagEditorInput,
    syncNoteEditorScroll,
    scheduleNoteEditorScrollMap,
    scheduleNoteEditorPreview,
    setNoteEditorMode,
    toggleNotePreviewHeader,
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
    renderSecondarySelectedNoteTags,
    renderSecondaryTagSuggestions,
    normalizeSecondaryTagEditorInput,
    setSecondaryTagInputExpanded,
    selectSecondaryNoteTag,
    addSecondaryTagFromEditor,
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
    syncDeleteLibraryConfirmation,
    openDeleteLibraryDialog,
    closeDeleteLibraryDialog,
    finishDeleteLibraryClose,
    exportBeforeDeleteLibrary,
    deleteLibraryData,
    addNewType,
    addNewTag,
    exportCurrentNote,
    exportLibrary,
    importLibrary,
    toggleDualPane,
    closeDualPane,
    showSecondaryPicker,
    renderSecondaryNotesList,
    copySecondaryNoteContent,
    exportSecondaryNoteMarkdown,
    exportSecondaryNoteText,
    setSecondaryNoteMode,
    onSecondaryNoteInput,
    saveSecondaryNote,
  } = api;

  function bindEvents() {
    const activateManagementTab = (tab) => {
      closeThemePicker();
      setManagementTab(tab);
    };
    const handleManagementTabNavigation = (event) => {
      closeThemePicker();
      handleManagementTabKeydown(event);
    };
    elements.mobileFilterToggle.addEventListener("click", toggleMobileFilters);
    elements.sidebarToggle?.addEventListener("click", () => toggleSidebar());
    elements.sidebarToggle?.addEventListener("pointerenter", positionSidebarToggleTooltip);
    elements.sidebarToggle?.addEventListener("focus", positionSidebarToggleTooltip);
    elements.tagFilterToggle.addEventListener("click", toggleTagFilterExpansion);
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
      const theme = event.newValue === "warm" ? "coffee" : event.newValue === "midnight-blue" ? "midnight" : event.newValue;
      if (event.key === THEME_STORAGE_KEY && THEMES.includes(theme) && theme !== ui.theme) {
        setTheme(theme, { persist: false });
      }
      if (event.key === NOTE_PREVIEW_LINES_STORAGE_KEY) {
        setNotePreviewLines(event.newValue ?? NOTE_PREVIEW_LINES_DEFAULT, { persist: false });
      }
    });
    elements.themeToggle.addEventListener("click", () => setTheme(getNextTheme(ui.theme)));
    elements.themeSelect.addEventListener("change", () => setThemePickerValue(elements.themeSelect.value));
    elements.themePickerTrigger.addEventListener("click", toggleThemePicker);
    elements.themePickerTrigger.addEventListener("keydown", handleThemePickerTriggerKeydown);
    elements.themePickerMenu.addEventListener("click", handleThemePickerMenuClick);
    elements.themePickerMenu.addEventListener("keydown", handleThemePickerMenuKeydown);
    document.addEventListener("pointerdown", handleThemePickerDocumentPointerdown);
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
    elements.secondaryNoteFormattingButtons?.forEach((button) => {
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        applyNoteFormatting(button.dataset.secondaryNoteFormatting, elements.secondaryNoteContentEditor);
      });
    });
    elements.noteContentPreview.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.noteContentPreview, elements.noteContent);
    });
    elements.noteContentPreview.addEventListener("toggle", () => {
      scheduleNoteEditorScrollMap(elements.noteContentPreview);
    }, true);
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
    elements.quickViewHeaderToggle.addEventListener("click", toggleNotePreviewHeader);
    elements.deleteNote.addEventListener("click", () => {
      const note = library.notes.find(({ id }) => id === elements.noteId.value);
      deleteNoteWithConfirmation(note);
    });
    elements.closeQuickView.addEventListener("click", () => closeQuickView());
    elements.copyNoteContent.addEventListener("click", copyQuickViewContent);
    elements.exportNoteMarkdown.addEventListener("click", () => exportCurrentNote("md"));
    elements.exportNoteText.addEventListener("click", () => exportCurrentNote("txt"));
    elements.toggleDualPane?.addEventListener("click", toggleDualPane);
    elements.closeSecondaryPane?.addEventListener("click", closeDualPane);
    elements.secondaryReaderClose?.addEventListener("click", closeDualPane);
    elements.secondaryFooterClose?.addEventListener("click", closeDualPane);
    elements.secondaryFooterDone?.addEventListener("click", closeDualPane);
    elements.secondarySurface?.addEventListener("pointerdown", (event) => {
      ui.activePane = "secondary";
      if (!event.target.closest("input, textarea, select, button, a, [tabindex]")) {
        elements.secondarySurface.focus({ preventScroll: true });
      }
    });
    elements.noteDialog?.addEventListener("pointerdown", () => {
      ui.activePane = "primary";
    });
    elements.secondarySurface?.addEventListener("focusin", () => {
      ui.activePane = "secondary";
    });
    elements.noteDialog?.addEventListener("focusin", () => {
      ui.activePane = "primary";
    });
    elements.secondaryBackToPicker?.addEventListener("click", showSecondaryPicker);
    elements.secondaryCopyContent?.addEventListener("click", copySecondaryNoteContent);
    elements.secondaryExportMd?.addEventListener("click", exportSecondaryNoteMarkdown);
    elements.secondaryExportText?.addEventListener("click", exportSecondaryNoteText);
    elements.secondaryModeButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        setSecondaryNoteMode(button.dataset.secondaryEditorMode);
      });
    });
    elements.secondaryNoteContentEditor?.addEventListener("input", onSecondaryNoteInput);
    elements.secondaryNoteContentEditor?.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.secondaryNoteContentEditor, elements.secondarySplitPreview);
    });
    elements.secondarySplitPreview?.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.secondarySplitPreview, elements.secondaryNoteContentEditor);
    });
    elements.secondarySplitPreview?.addEventListener("toggle", () => {
      scheduleNoteEditorScrollMap(elements.secondarySplitPreview);
    }, true);
    elements.secondaryNoteTitleInput?.addEventListener("input", onSecondaryNoteInput);
    elements.secondaryEditorTypeSelect?.addEventListener("change", () => {
      onSecondaryNoteInput();
    });
    elements.secondaryTagInput?.addEventListener("input", normalizeSecondaryTagEditorInput);
    elements.secondaryTagInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addSecondaryTagFromEditor();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSecondaryTagInputExpanded(false);
        elements.secondaryAddTag?.focus({ preventScroll: true });
        return;
      }
      if (
        event.key === "Backspace" &&
        !event.isComposing &&
        !elements.secondaryTagInput.value &&
        ui.secondarySelectedNoteTagIds?.size
      ) {
        event.preventDefault();
        const tagIds = [...ui.secondarySelectedNoteTagIds];
        ui.secondarySelectedNoteTagIds.delete(tagIds[tagIds.length - 1]);
        renderSecondarySelectedNoteTags();
        renderSecondaryTagSuggestions();
        onSecondaryNoteInput();
      }
    });
    elements.secondaryAddTag?.addEventListener("click", () => {
      if (!ui.secondaryTagInputExpanded) {
        setSecondaryTagInputExpanded(true, { focus: true });
        return;
      }
      if (!cleanTagInput(elements.secondaryTagInput.value)) {
        setSecondaryTagInputExpanded(false);
        return;
      }
      addSecondaryTagFromEditor();
    });
    elements.secondarySaveChanges?.addEventListener("click", () => {
      void saveSecondaryNote({ isAutoSave: false });
    });
    elements.secondaryNoteSearch?.addEventListener("input", (event) => {
      ui.secondarySearchQuery = event.target.value;
      renderSecondaryNotesList();
    });
    elements.secondaryClearSearch?.addEventListener("click", () => {
      ui.secondarySearchQuery = "";
      if (elements.secondaryNoteSearch) elements.secondaryNoteSearch.value = "";
      renderSecondaryNotesList();
      elements.secondaryNoteSearch?.focus();
    });
    elements.secondarySort?.addEventListener("change", (event) => {
      ui.secondarySort = event.target.value;
      renderSecondaryNotesList();
    });
    elements.closeConfirmation.addEventListener("click", () => closeConfirmation());
    elements.cancelConfirmation.addEventListener("click", () => closeConfirmation());
    elements.confirmAction.addEventListener("click", () => closeConfirmation(true));
    elements.confirmationDialog.addEventListener("close", finishConfirmationClose);
    window.addEventListener("resize", () => {
      scheduleQuickViewHeightSync();
      scheduleNoteEditorHeight();
      scheduleNoteEditorScrollMap(
        elements.noteContentPreview.contains(document.activeElement)
          ? elements.noteContentPreview
          : elements.noteContent,
      );
      if (ui.dualPaneOpen && ui.secondaryNoteMode === "split" && elements.secondaryNoteContentEditor) {
        scheduleNoteEditorScrollMap(
          elements.secondarySplitPreview?.contains(document.activeElement)
            ? elements.secondarySplitPreview
            : elements.secondaryNoteContentEditor,
        );
      }
      scheduleTopbarActionsPinning();
      scheduleTagFilterLayout();
      syncSidebarUI();
      positionSidebarToggleTooltip();
      if (window.innerWidth < 1024 && (ui.dualPaneOpen || ui.secondaryClosing)) {
        closeDualPane({ immediate: true });
      }
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
    [elements.confirmationDialog, elements.deleteLibraryDialog, elements.organizeDialog].forEach((dialog) => {
      dialog.addEventListener("close", () => window.queueMicrotask(syncToastHost));
    });
    elements.organizeDialog.addEventListener("close", closeThemePicker);
    elements.typesTab.addEventListener("click", () => activateManagementTab("types"));
    elements.tagsTab.addEventListener("click", () => activateManagementTab("tags"));
    elements.displayTab.addEventListener("click", () => activateManagementTab("display"));
    elements.dataTab.addEventListener("click", () => activateManagementTab("data"));
    elements.shortcutsTab.addEventListener("click", () => activateManagementTab("shortcuts"));
    elements.typesTab.addEventListener("keydown", handleManagementTabNavigation);
    elements.tagsTab.addEventListener("keydown", handleManagementTabNavigation);
    elements.displayTab.addEventListener("keydown", handleManagementTabNavigation);
    elements.dataTab.addEventListener("keydown", handleManagementTabNavigation);
    elements.shortcutsTab.addEventListener("keydown", handleManagementTabNavigation);
    elements.dataExport.addEventListener("click", () => exportLibrary());
    elements.dataImport.addEventListener("click", () => elements.importInput.click());
    elements.deleteLibrary.addEventListener("click", openDeleteLibraryDialog);
    elements.closeDeleteLibraryDialog.addEventListener("click", closeDeleteLibraryDialog);
    elements.cancelDeleteLibrary.addEventListener("click", closeDeleteLibraryDialog);
    elements.deleteLibraryBackup.addEventListener("click", exportBeforeDeleteLibrary);
    elements.deleteLibraryConfirmation.addEventListener("input", syncDeleteLibraryConfirmation);
    elements.deleteLibraryConfirmation.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !elements.confirmDeleteLibrary.disabled) {
        event.preventDefault();
        deleteLibraryData();
      }
    });
    elements.confirmDeleteLibrary.addEventListener("click", deleteLibraryData);
    elements.deleteLibraryDialog.addEventListener("cancel", (event) => {
      if (ui.deleteLibraryInFlight) event.preventDefault();
    });
    elements.deleteLibraryDialog.addEventListener("close", finishDeleteLibraryClose);
    elements.notePreviewLines.addEventListener("input", () => setNotePreviewLines(elements.notePreviewLines.value));
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
      document.documentElement.dataset.inputModality = "pointer";
      openColorPickers.forEach((picker) => {
        if (!picker.select.parentElement.contains(event.target)) closeColorPicker(picker);
      });
      const inPrimaryTypePicker = shared.noteTypePicker && shared.noteTypePicker.root.contains(event.target);
      const inSecondaryTypePicker = shared.secondaryNoteTypePicker && shared.secondaryNoteTypePicker.root.contains(event.target);
      if (!inPrimaryTypePicker && !inSecondaryTypePicker) closeNoteTypePicker();
      if (
        ui.secondaryTagInputExpanded &&
        elements.secondaryTagInput &&
        !cleanTagInput(elements.secondaryTagInput.value) &&
        !elements.secondaryTagInputRow?.contains(event.target) &&
        !elements.secondaryAddTag?.contains(event.target) &&
        !elements.secondaryTagSuggestions?.contains(event.target)
      ) {
        setSecondaryTagInputExpanded(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Tab") document.documentElement.dataset.inputModality = "keyboard";
      if (event.key === "Escape" && !activeModalDialog() && ui.dualPaneOpen && elements.secondarySurface?.contains(document.activeElement)) {
        event.preventDefault();
        closeDualPane();
        elements.toggleDualPane?.focus();
        return;
      }
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
      const noteFormattingShortcut = !event.shiftKey
        ? { b: "bold", e: "inline-code", i: "italic", k: "link" }[formattingKey]
        : { Digit7: "ordered-list", Digit8: "bullet-list" }[event.code];
      const targetTextarea = event.target === elements.noteContent
        ? elements.noteContent
        : (event.target === elements.secondaryNoteContentEditor ? elements.secondaryNoteContentEditor : null);
      const matchesNoteFormattingShortcut = Boolean(
        targetTextarea &&
        noteFormattingShortcut &&
        !event.altKey &&
        hasSaveModifier,
      );

      if (matchesNoteFormattingShortcut) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) applyNoteFormattingShortcut(noteFormattingShortcut, targetTextarea);
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

      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const blocksThemeShortcut =
        editingText ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLFormElement;
      const isModeKey = ["1", "2", "3"].includes(formattingKey);
      const matchesModifierFree =
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !editingText;

      if (isModeKey && matchesModifierFree) {
        const isSecondaryReaderActive =
          ui.dualPaneOpen &&
          elements.secondaryReaderView &&
          !elements.secondaryReaderView.classList.contains("is-hidden");
        const focusInSecondary =
          isSecondaryReaderActive &&
          (elements.secondarySurface?.contains(document.activeElement) ||
            elements.secondarySurface?.contains(target) ||
            (ui.activePane === "secondary" && !elements.noteDialog?.contains(document.activeElement)));

        if (focusInSecondary) {
          event.preventDefault();
          const mode = { 1: "edit", 2: "split", 3: "preview" }[formattingKey];
          setSecondaryNoteMode(mode);
          return;
        }

        if (isNoteEditorOpen() && !ui.noteSaveInFlight) {
          event.preventDefault();
          const mode = { 1: "edit", 2: "split", 3: "preview" }[formattingKey];
          setNoteEditorMode(mode);
          return;
        }
      }

      const selection = window.getSelection();
      const hasTextSelection = Boolean(selection && !selection.isCollapsed);
      const hoveredNotePreviewButton = document.querySelector(".note-card:hover .note-card__title");
      const matchesHoveredNotePreviewShortcut =
        formattingKey === "v" &&
        hoveredNotePreviewButton instanceof HTMLButtonElement &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !editingText &&
        !hasTextSelection &&
        !activeModalDialog() &&
        !isDetailWorkspaceOpen();

      if (matchesHoveredNotePreviewShortcut) {
        event.preventDefault();
        hoveredNotePreviewButton.click();
        return;
      }

      const libraryViewShortcutButton = {
        1: elements.focusView,
        2: elements.comfortableView,
        3: elements.compactView,
      }[event.key];
      const matchesLibraryViewShortcut =
        libraryViewShortcutButton &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !editingText &&
        !hasTextSelection &&
        !activeModalDialog() &&
        !isDetailWorkspaceOpen();

      if (matchesLibraryViewShortcut) {
        event.preventDefault();
        libraryViewShortcutButton.click();
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
        !blocksThemeShortcut &&
        !activeModalDialog()
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
    elements.noteEditorCommandActions.prepend(modes);
    const tools = elements.noteDialog.querySelector(".dialog-footer__tools") || elements.noteDialog.querySelector(".dialog-footer");
    const deleteAction = elements.deleteNote.closest(".note-detail-action-tooltip") || elements.deleteNote;
    tools?.insertBefore(elements.notePreviewActions, deleteAction.nextSibling);
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
      enhanceSortSelect();
      enhanceThemePicker();
      elements.newTypeColor.replaceChildren(createColorOptions(elements.newTypeColor.value));
      enhanceColorSelect(elements.newTypeColor);
      bindEvents();
      observeTagFilterLayout();
      setupLibrarySync();
      syncThemeUI();
      syncSidebarUI();
      syncNotePreviewLinesUI();
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
