(() => {
  "use strict";

  // Shared application state, preferences, filters, and UI primitives.
  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const app = {
    api: Object.create(null),
    shared: {
      noteTypePicker: null,
      openColorPickers: new Set(),
    },
  };
  globalThis[APP_MODULES_KEY] = app;

  const { api } = app;
  const storage = globalThis.PersonalNotesStorage;
  const PAGE_SIZE = 30;
  const NOTE_AUTO_SAVE_DELAY = 1500;
  const SEARCH_RENDER_DELAY = 150;
  const THEME_STORAGE_KEY = "nook:theme";
  const THEMES = ["light", "warm", "dark"];
  const SIDEBAR_COLLAPSED_STORAGE_KEY = "nook:sidebar-collapsed";
  const VIEW_MODE_STORAGE_KEY = "nook:notes-view-mode";
  const FILTER_STORAGE_KEY = "nook:active-filters";
  const DRAFT_RECOVERY_STORAGE_KEY = "nook:note-editor-draft";
  const BACKUP_HEALTH_STORAGE_KEY = "nook:backup-health";
  const SORT_STORAGE_KEY = "nook:notes-sort";
  const LIBRARY_CHANNEL_NAME = "nook:library";
  const DRAFT_RECOVERY_VERSION = 1;
  const BACKUP_REMINDER_AGE_MS = 10 * 24 * 60 * 60 * 1000;
  const SORT_VALUES = [
    "created-desc",
    "created-asc",
    "updated-desc",
    "updated-asc",
    "title-asc",
    "title-desc",
  ];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  let libraryChannel = null;

  const elements = {
    workspace: document.querySelector(".workspace"),
    appShell: document.querySelector(".app-shell"),
    createdTodayFilter: document.querySelector("#created-today-filter"),
    createdTodayFilterCount: document.querySelector("#created-today-filter-count"),
    updatedTodayFilter: document.querySelector("#updated-today-filter"),
    updatedTodayFilterCount: document.querySelector("#updated-today-filter-count"),
    allNotesSpace: document.querySelector("#all-notes-space"),
    allNotesSpaceCount: document.querySelector("#all-notes-space-count"),
    trashSpace: document.querySelector("#trash-space"),
    trashSpaceCount: document.querySelector("#trash-space-count"),
    emptyTrash: document.querySelector("#empty-trash-btn"),
    regularFilterControls: document.querySelector("#regular-filter-controls"),
    mobileFilterToggle: document.querySelector("#mobile-filter-toggle"),
    mobileFilterCount: document.querySelector("#mobile-filter-count"),
    typeFilterList: document.querySelector("#type-filter-list"),
    tagFilterList: document.querySelector("#tag-filter-list"),
    tagFilterCount: document.querySelector("#tag-filter-count"),
    tagFilterEmpty: document.querySelector("#tag-filter-empty"),
    clearFilters: document.querySelector("#clear-filters-btn"),
    toastMessage: document.querySelector("#toast-message"),
    toastAction: document.querySelector("#toast-action"),
    topbar: document.querySelector(".topbar"),
    topbarActions: document.querySelector(".topbar-actions"),
    notesPanel: document.querySelector(".notes-panel"),
    toolbar: document.querySelector(".toolbar"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeToggleLabel: document.querySelector("#theme-toggle-label"),
    themeToggleTooltipText: document.querySelector("#theme-toggle-tooltip-text"),
    organize: document.querySelector("#organize-btn"),
    export: document.querySelector("#export-btn"),
    import: document.querySelector("#import-btn"),
    importInput: document.querySelector("#import-input"),
    newNote: document.querySelector("#new-note-btn"),
    searchField: document.querySelector(".search-field"),
    search: document.querySelector("#search-input"),
    searchShortcut: document.querySelector("#search-shortcut"),
    searchShortcutModifier: document.querySelector("#search-shortcut-modifier"),
    searchShortcutHelp: document.querySelector("#search-shortcut-help"),
    clearSearch: document.querySelector("#clear-search-btn"),
    sort: document.querySelector("#sort-select"),
    focusView: document.querySelector("#focus-view-btn"),
    comfortableView: document.querySelector("#comfortable-view-btn"),
    compactView: document.querySelector("#compact-view-btn"),
    activeFilters: document.querySelector("#active-filters"),
    notesCount: document.querySelector("#notes-count"),
    notesHeading: document.querySelector("#notes-heading"),
    notesRange: document.querySelector("#notes-range"),
    sortDescription: document.querySelector("#sort-description"),
    notesList: document.querySelector("#notes-list"),
    pagination: document.querySelector("#pagination"),
    noteDetailWorkspace: document.querySelector("#note-detail-workspace"),
    noteDialog: document.querySelector("#note-dialog"),
    noteForm: document.querySelector("#note-form"),
    noteEditorCommandActions: document.querySelector("#note-editor-command-actions"),
    noteDialogTitle: document.querySelector("#note-dialog-title"),
    closeNoteDialog: document.querySelector("#close-note-dialog-btn"),
    cancelNote: document.querySelector("#cancel-note-btn"),
    quickSaveNote: document.querySelector("#quick-save-note-btn"),
    deleteNote: document.querySelector("#delete-note-btn"),
    noteEditorStats: document.querySelector("#note-editor-stats"),
    noteSaveStatus: document.querySelector("#note-save-status"),
    noteSaveStatusLabel: document.querySelector("#note-save-status-label"),
    noteQuickSaveShortcutModifier: document.querySelector("#note-quick-save-shortcut-modifier"),
    noteSaveShortcutModifier: document.querySelector("#note-save-shortcut-modifier"),
    noteFormattingShortcutModifiers: [...document.querySelectorAll(".note-formatting-shortcut-modifier")],
    noteSaveShortcutHelp: document.querySelector("#note-save-shortcut-help"),
    noteId: document.querySelector("#note-id"),
    noteTitle: document.querySelector("#note-title"),
    noteType: document.querySelector("#note-type"),
    noteContentField: document.querySelector("#note-content-field"),
    noteContent: document.querySelector("#note-content"),
    noteContentPreview: document.querySelector("#note-content-preview"),
    noteContentEditor: document.querySelector(".note-content-editor"),
    noteFormattingButtons: [...document.querySelectorAll("[data-note-formatting]")],
    notePreviewPanel: document.querySelector("#note-preview-panel"),
    notePreviewActions: document.querySelector("#note-preview-actions"),
    noteEditorModeButtons: [...document.querySelectorAll("[data-note-editor-mode]")],
    noteMeta: document.querySelector("#note-meta"),
    selectedNoteTags: document.querySelector("#selected-note-tags"),
    tagInput: document.querySelector("#tag-input"),
    tagInputRow: document.querySelector("#tag-input-row"),
    addTag: document.querySelector("#add-tag-btn"),
    tagSuggestions: document.querySelector("#tag-suggestions"),
    quickViewDialog: document.querySelector("#quick-view-dialog"),
    quickViewHeader: document.querySelector(".quick-view-header"),
    quickViewBody: document.querySelector(".quick-view-body"),
    quickViewTitle: document.querySelector("#quick-view-title"),
    quickViewMeta: document.querySelector("#quick-view-meta"),
    quickViewTags: document.querySelector("#quick-view-tags"),
    quickViewContent: document.querySelector("#quick-view-content"),
    quickViewDates: document.querySelector("#quick-view-dates"),
    exportNoteMarkdown: document.querySelector("#export-note-markdown-btn"),
    exportNoteText: document.querySelector("#export-note-text-btn"),
    closeQuickView: document.querySelector("#close-quick-view-btn"),
    copyNoteContent: document.querySelector("#copy-note-content-btn"),
    confirmationDialog: document.querySelector("#confirmation-dialog"),
    confirmationTitle: document.querySelector("#confirmation-dialog-title"),
    confirmationDescription: document.querySelector("#confirmation-dialog-description"),
    closeConfirmation: document.querySelector("#close-confirmation-dialog-btn"),
    cancelConfirmation: document.querySelector("#cancel-confirmation-btn"),
    confirmAction: document.querySelector("#confirm-action-btn"),
    organizeDialog: document.querySelector("#organize-dialog"),
    closeOrganizeDialog: document.querySelector("#close-organize-dialog-btn"),
    typesTab: document.querySelector("#types-tab"),
    tagsTab: document.querySelector("#tags-tab"),
    typesTabCount: document.querySelector("#types-tab-count"),
    tagsTabCount: document.querySelector("#tags-tab-count"),
    typesPanel: document.querySelector("#types-panel"),
    tagsPanel: document.querySelector("#tags-panel"),
    typesManagementSearch: document.querySelector("#types-management-search"),
    tagsManagementSearch: document.querySelector("#tags-management-search"),
    addTypeToggle: document.querySelector("#add-type-toggle"),
    addTagToggle: document.querySelector("#add-tag-toggle"),
    newTypeForm: document.querySelector("#new-type-form"),
    newTypeName: document.querySelector("#new-type-name"),
    newTypeColor: document.querySelector("#new-type-color"),
    typesList: document.querySelector("#types-list"),
    newTagForm: document.querySelector("#new-tag-form"),
    newTagName: document.querySelector("#new-tag-name"),
    tagsList: document.querySelector("#tags-list"),
    toast: document.querySelector("#toast"),
    startupError: document.querySelector("#startup-error"),
    startupErrorMessage: document.querySelector("#startup-error-message"),
    backupHealth: document.querySelector("#backup-health"),
    backupHealthDot: document.querySelector("#backup-health-dot"),
    backupHealthMessage: document.querySelector("#backup-health-message"),
    sidebar: document.querySelector(".sidebar"),
    sidebarToggle: document.querySelector("#sidebar-toggle-btn"),
  };

  const storedFilters = getStoredFilters();
  const library = { notes: [], types: [], tags: [], searchIndex: new Map() };
  const ui = {
    theme: getStoredTheme(),
    sidebarCollapsed: getStoredSidebarCollapsed(),
    query: "",
    typeId: storedFilters.trashOnly ? "all" : storedFilters.typeId,
    tagIds: storedFilters.trashOnly ? new Set() : storedFilters.tagIds,
    todayOnly: storedFilters.trashOnly ? false : storedFilters.todayOnly,
    updatedTodayOnly: storedFilters.trashOnly ? false : storedFilters.updatedTodayOnly,
    trashOnly: storedFilters.trashOnly,
    sort: getStoredSort(),
    viewMode: getStoredViewMode(),
    page: 1,
    editingNoteId: "",
    selectedNoteTagIds: new Set(),
    noteEditorSession: 0,
    pendingTagCreation: null,
    tagInputExpanded: false,
    noteSaveInFlight: false,
    noteAutoSaveInFlight: false,
    noteCloseAfterSaveRequested: false,
    noteAutoSaveTimer: 0,
    noteEditorMode: "edit",
    noteScrollSyncing: false,
    noteEditorPreviewFrame: 0,
    noteEditorSnapshot: null,
    viewingNoteId: "",
    viewInvoker: null,
    detailSourceCard: null,
    detailScrollTop: 0,
    copyInFlight: false,
    restoreViewFocus: true,
    afterQuickViewClose: null,
    pendingConfirmation: null,
    externalRefreshPending: false,
    managementTab: "types",
    managementQueries: { types: "", tags: "" },
    managementCreateKind: "",
    managementEditing: null,
    toastTimer: 0,
    toastAction: null,
    searchRenderTimer: 0,
    topbarActionsPinned: false,
    toolbarPinned: false,
    topbarActionsPinStart: 0,
    topbarActionsPinEnd: 0,
    toolbarPinStart: 0,
    toolbarPinEnd: 0,
    topbarActionsPinFrame: 0,
    topbarActionsUnpinTimer: 0,
  };

  // Cross-module calls stay late-bound so each classic script can remain an
  // isolated strict-mode IIFE while preserving direct file:// usage.
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const getNoteEditorDraftData = (...args) => api.getNoteEditorDraftData(...args);
  const hasUnsavedNoteChanges = (...args) => api.hasUnsavedNoteChanges(...args);
  const renderLibrary = (...args) => api.renderLibrary(...args);
  const renderSearchResults = (...args) => api.renderSearchResults(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);

  function getStoredTheme() {
    try {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return THEMES.includes(theme) ? theme : "light";
    } catch {
      return "light";
    }
  }

  function getNextTheme(currentTheme) {
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    return THEMES[nextIndex];
  }

  function syncThemeUI() {
    const theme = ui.theme;
    document.documentElement.dataset.theme = theme;
    elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));

    const themeLabels = {
      light: "Light",
      warm: "Warm",
      dark: "Dark",
    };
    const nextThemeNames = {
      light: "Warm",
      warm: "Dark",
      dark: "Light",
    };

    const nextTheme = getNextTheme(theme);
    const label = themeLabels[theme] || "Light";
    const nextLabel = nextThemeNames[theme] || "Warm";
    elements.themeToggle.setAttribute(
      "aria-label",
      `Current theme: ${label}. Switch to ${nextLabel} theme`,
    );
    elements.themeToggle.removeAttribute("title");
    elements.themeToggleLabel.textContent = label;
    if (elements.themeToggleTooltipText) {
      elements.themeToggleTooltipText.textContent = `Theme: ${label} (switch to ${nextLabel})`;
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.content = theme === "dark" ? "#0b0f19" : (theme === "warm" ? "#a35616" : "#9e6b02");
    }
  }

  function setTheme(theme) {
    if (!THEMES.includes(theme) || theme === ui.theme) return;
    ui.theme = theme;
    syncThemeUI();
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still works for this session when browser privacy settings block localStorage.
    }
  }

  function getStoredSidebarCollapsed() {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function syncSidebarUI() {
    const isCollapsed = ui.sidebarCollapsed;
    document.documentElement.dataset.sidebarCollapsed = String(isCollapsed);
    elements.appShell.classList.toggle("is-sidebar-collapsed", isCollapsed);
    if (elements.sidebarToggle) {
      const shortcutModifier = usesMacKeyboardShortcuts() ? "⌘\\" : "Ctrl+\\";
      const actionLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
      elements.sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
      elements.sidebarToggle.setAttribute("aria-label", actionLabel);
      elements.sidebarToggle.title = `${actionLabel} (${shortcutModifier})`;
    }
  }

  function toggleSidebar(collapsed = !ui.sidebarCollapsed) {
    if (ui.sidebarCollapsed === collapsed) return;
    ui.sidebarCollapsed = collapsed;
    syncSidebarUI();
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // The sidebar state still works for this session when browser privacy settings block localStorage.
    }
  }

  function measureTopbarActionsPinBounds() {
    if (ui.topbarActionsPinned) return;
    const actionBounds = elements.topbarActions.getBoundingClientRect();
    const toolbarBounds = elements.toolbar.getBoundingClientRect();
    const isMobileLayout = window.matchMedia("(max-width: 620px)").matches;
    ui.topbarActionsPinStart = window.scrollY + actionBounds.top;
    ui.topbarActionsPinEnd = window.scrollY + (isMobileLayout ? toolbarBounds.bottom : actionBounds.bottom);
    ui.toolbarPinStart = window.scrollY + toolbarBounds.top;
    ui.toolbarPinEnd = window.scrollY + toolbarBounds.bottom;
  }

  function finishTopbarActionsUnpin() {
    ui.topbarActionsUnpinTimer = 0;
    ui.topbarActionsPinned = false;
    elements.topbar.classList.remove("is-actions-pinned");
    elements.topbarActions.classList.remove("is-pinned", "is-unpinning");
    elements.appShell.style.removeProperty("--pinned-actions-height");
    elements.appShell.style.removeProperty("--pinned-actions-width");
    elements.appShell.style.removeProperty("--pinned-toolbar-left");
    elements.appShell.style.removeProperty("--pinned-controls-right");
  }

  function setToolbarPinned(pinned) {
    if (pinned === ui.toolbarPinned) return;
    ui.toolbarPinned = pinned;
    elements.notesPanel.classList.toggle("is-toolbar-pinned", pinned);
    elements.toolbar.classList.toggle("is-pinned", pinned);
    elements.toolbar.classList.remove("is-unpinning");

    if (pinned) {
      const toolbarBounds = elements.toolbar.getBoundingClientRect();
      elements.notesPanel.style.setProperty("--pinned-toolbar-height", `${toolbarBounds.height}px`);
      syncPinnedTopbarControlMetrics();
      return;
    }

    elements.notesPanel.style.removeProperty("--pinned-toolbar-height");
  }

  function setTopbarActionsPinned(pinned) {
    if (pinned && ui.topbarActionsUnpinTimer) {
      window.clearTimeout(ui.topbarActionsUnpinTimer);
      ui.topbarActionsUnpinTimer = 0;
      elements.topbarActions.classList.remove("is-unpinning");
      elements.toolbar.classList.remove("is-unpinning");
      return;
    }
    if (!pinned && ui.topbarActionsUnpinTimer) return;
    if (pinned === ui.topbarActionsPinned) return;

    if (pinned) {
      const actionBounds = elements.topbarActions.getBoundingClientRect();
      elements.appShell.style.setProperty("--pinned-actions-height", `${actionBounds.height}px`);
      ui.topbarActionsPinned = true;
      elements.topbar.classList.add("is-actions-pinned");
      elements.topbarActions.classList.add("is-pinned");
      syncPinnedTopbarControlMetrics();
      if (window.matchMedia("(max-width: 620px)").matches) setToolbarPinned(true);
      return;
    }

    setToolbarPinned(false);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishTopbarActionsUnpin();
      return;
    }

    elements.topbarActions.classList.add("is-unpinning");
    elements.toolbar.classList.add("is-unpinning");
    ui.topbarActionsUnpinTimer = window.setTimeout(finishTopbarActionsUnpin, 160);
  }

  function syncPinnedTopbarControlMetrics() {
    if (!ui.topbarActionsPinned) return;
    const actionBounds = elements.topbarActions.getBoundingClientRect();
    const topbarBounds = elements.topbar.getBoundingClientRect();
    elements.appShell.style.setProperty("--pinned-actions-height", `${actionBounds.height}px`);
    elements.appShell.style.setProperty("--pinned-actions-width", `${actionBounds.width}px`);
    elements.appShell.style.setProperty("--pinned-toolbar-left", `${topbarBounds.left}px`);
    elements.appShell.style.setProperty("--pinned-controls-right", `${document.documentElement.clientWidth - topbarBounds.right}px`);
  }

  function updateTopbarActionsPinning() {
    const scrollTop = window.scrollY;

    if (!ui.topbarActionsPinned) {
      measureTopbarActionsPinBounds();
      if (scrollTop <= ui.topbarActionsPinEnd) return;
      setTopbarActionsPinned(true);
    }

    if (!ui.toolbarPinned && scrollTop > ui.toolbarPinEnd) setToolbarPinned(true);
    if (ui.toolbarPinned && scrollTop <= ui.toolbarPinStart) setToolbarPinned(false);
    if (scrollTop <= ui.topbarActionsPinStart) setTopbarActionsPinned(false);
  }

  function scheduleTopbarActionsPinning() {
    if (ui.topbarActionsPinFrame) return;
    ui.topbarActionsPinFrame = window.requestAnimationFrame(() => {
      ui.topbarActionsPinFrame = 0;
      updateTopbarActionsPinning();
    });
  }



  function activeRegularFilterCount() {
    return Number(ui.typeId !== "all") + ui.tagIds.size + Number(ui.todayOnly) + Number(ui.updatedTodayOnly);
  }

  function syncMobileFilterToggle() {
    const activeCount = activeRegularFilterCount();
    elements.mobileFilterCount.textContent = String(activeCount);
    elements.mobileFilterCount.classList.toggle("is-empty", activeCount === 0);
    elements.mobileFilterToggle.classList.toggle("has-active-filters", activeCount > 0);
    elements.mobileFilterToggle.setAttribute(
      "aria-label",
      activeCount ? `Filters, ${pluralize(activeCount, "active filter")}` : "Filters",
    );
  }

  function toggleMobileFilters() {
    const willExpand = elements.regularFilterControls.classList.contains("is-mobile-collapsed");
    elements.regularFilterControls.classList.toggle("is-mobile-collapsed", !willExpand);
    elements.mobileFilterToggle.setAttribute("aria-expanded", String(willExpand));
  }

  function getStoredViewMode() {
    try {
      const storedMode = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return ["focus", "comfortable", "compact"].includes(storedMode) ? storedMode : "comfortable";
    } catch {
      return "comfortable";
    }
  }

  function getStoredSort() {
    try {
      const storedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
      return SORT_VALUES.includes(storedSort) ? storedSort : "created-desc";
    } catch {
      return "created-desc";
    }
  }

  function persistSort() {
    try {
      if (ui.sort === "created-desc") {
        window.localStorage.removeItem(SORT_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(SORT_STORAGE_KEY, ui.sort);
    } catch {
      // Sorting still works for this session when browser privacy settings block localStorage.
    }
  }

  function getStoredFilters() {
    try {
      const storedFilters = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!storedFilters) {
        return {
          typeId: "all",
          tagIds: new Set(),
          todayOnly: false,
          updatedTodayOnly: false,
          trashOnly: false,
        };
      }
      const parsed = JSON.parse(storedFilters);
      const typeId = typeof parsed?.typeId === "string" && parsed.typeId ? parsed.typeId : "all";
      const tagIds = new Set(
        Array.isArray(parsed?.tagIds)
          ? parsed.tagIds.filter((tagId) => typeof tagId === "string" && tagId)
          : [],
      );
      return {
        typeId,
        tagIds,
        todayOnly: parsed?.todayOnly === true,
        updatedTodayOnly: parsed?.updatedTodayOnly === true,
        trashOnly: parsed?.trashOnly === true,
      };
    } catch {
      return {
        typeId: "all",
        tagIds: new Set(),
        todayOnly: false,
        updatedTodayOnly: false,
        trashOnly: false,
      };
    }
  }

  function persistFilters() {
    try {
      if (
        ui.typeId === "all" &&
        ui.tagIds.size === 0 &&
        !ui.todayOnly &&
        !ui.updatedTodayOnly &&
        !ui.trashOnly
      ) {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          typeId: ui.typeId,
          tagIds: [...ui.tagIds],
          todayOnly: ui.todayOnly,
          updatedTodayOnly: ui.updatedTodayOnly,
          trashOnly: ui.trashOnly,
        }),
      );
    } catch {
      // Filtering still works when browser privacy settings block localStorage.
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isValidTimestamp(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function clearStoredNoteDraft() {
    try {
      window.localStorage.removeItem(DRAFT_RECOVERY_STORAGE_KEY);
    } catch {
      // Saving and closing notes still works when localStorage is unavailable.
    }
  }

  function getStoredNoteDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      const draft = value?.draft;
      if (
        value?.version !== DRAFT_RECOVERY_VERSION ||
        !isValidTimestamp(value.savedAt) ||
        !draft ||
        typeof draft.id !== "string" ||
        typeof draft.title !== "string" ||
        typeof draft.typeId !== "string" ||
        !Array.isArray(draft.tagIds) ||
        draft.tagIds.some((tagId) => typeof tagId !== "string") ||
        typeof draft.content !== "string"
      ) {
        clearStoredNoteDraft();
        return null;
      }
      return {
        savedAt: value.savedAt,
        draft: {
          id: draft.id,
          title: draft.title,
          typeId: draft.typeId,
          tagIds: [...new Set(draft.tagIds)].sort(),
          content: draft.content,
        },
      };
    } catch {
      return null;
    }
  }

  function syncStoredNoteDraft() {
    if (!isNoteEditorOpen() || !hasUnsavedNoteChanges()) {
      clearStoredNoteDraft();
      return;
    }
    try {
      window.localStorage.setItem(
        DRAFT_RECOVERY_STORAGE_KEY,
        JSON.stringify({
          version: DRAFT_RECOVERY_VERSION,
          savedAt: nowIso(),
          draft: getNoteEditorDraftData(),
        }),
      );
    } catch {
      // The existing editor and IndexedDB autosave remain available.
    }
  }

  function createDefaultBackupHealth() {
    return {
      trackingStartedAt: nowIso(),
      lastExportedAt: "",
    };
  }

  function getStoredBackupHealth() {
    const fallback = createDefaultBackupHealth();
    try {
      const raw = window.localStorage.getItem(BACKUP_HEALTH_STORAGE_KEY);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      if (!isValidTimestamp(value?.trackingStartedAt)) return fallback;
      return {
        trackingStartedAt: value.trackingStartedAt,
        lastExportedAt: isValidTimestamp(value.lastExportedAt) ? value.lastExportedAt : "",
      };
    } catch {
      return fallback;
    }
  }

  function storeBackupHealth(value) {
    try {
      window.localStorage.setItem(BACKUP_HEALTH_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // A missing reminder must not block local note work.
    }
  }

  function backupHealthReferenceDate(health) {
    return new Date(health.lastExportedAt || health.trackingStartedAt);
  }

  function backupAgeInDays(health) {
    const referenceDate = backupHealthReferenceDate(health);
    return Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / 86400000));
  }

  function formatBackupStatus(message) {
    return `Stored locally · ${message}`;
  }

  function backupHealthMessage(health, daysSinceReference) {
    const hasRecordedExport = Boolean(health.lastExportedAt);
    if (!hasRecordedExport) return formatBackupStatus("no backup yet");
    if (daysSinceReference === 0) return formatBackupStatus("backed up today");
    if (daysSinceReference >= BACKUP_REMINDER_AGE_MS / 86400000) {
      return formatBackupStatus(`no backup for ${daysSinceReference} ${daysSinceReference === 1 ? "day" : "days"}`);
    }
    return formatBackupStatus(`backed up ${daysSinceReference} ${daysSinceReference === 1 ? "day" : "days"} ago`);
  }

  function syncBackupHealth() {
    const health = getStoredBackupHealth();
    const daysSinceReference = backupAgeInDays(health);
    const dueToAge = daysSinceReference >= BACKUP_REMINDER_AGE_MS / 86400000;
    const hasRecordedExport = Boolean(health.lastExportedAt);
    const statusClass = !hasRecordedExport
      ? "status-dot--backup-never"
      : dueToAge
        ? "status-dot--backup-warning"
        : "status-dot--backup-good";
    elements.backupHealthDot.className = `status-dot ${statusClass}`;
    elements.backupHealthMessage.textContent = backupHealthMessage(health, daysSinceReference);
  }

  function recordBackupExport() {
    const timestamp = nowIso();
    storeBackupHealth({
      trackingStartedAt: timestamp,
      lastExportedAt: timestamp,
    });
    syncBackupHealth();
  }

  function usesMacKeyboardShortcuts() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /mac|iphone|ipad|ipod/i.test(platform);
  }

  function syncSearchShortcutHint() {
    const usesCommandKey = usesMacKeyboardShortcuts();
    elements.searchShortcutModifier.textContent = usesCommandKey ? "⌘" : "Ctrl";
    elements.searchShortcutHelp.textContent = `Press ${usesCommandKey ? "Command" : "Control"} and F to focus search.`;
  }

  function syncNoteSaveShortcutHint() {
    const usesCommandKey = usesMacKeyboardShortcuts();
    const modifier = usesCommandKey ? "⌘" : "Ctrl";
    const modifierName = usesCommandKey ? "Command" : "Control";
    elements.noteQuickSaveShortcutModifier.textContent = modifier;
    elements.noteSaveShortcutModifier.textContent = modifier;
    elements.noteFormattingShortcutModifiers.forEach((element) => {
      element.textContent = modifier;
    });
    elements.noteSaveShortcutHelp.textContent = `Press 1 for the Markdown editor, 2 for split preview, and 3 for Preview. Bold, italic, and link shortcuts format selected note content. Quick save keeps this note open: ${modifierName}, Shift, and S. Save note and close: ${modifierName} and Enter.`;
  }

  function syncViewModeUI() {
    const viewButtons = [
      ["focus", elements.focusView],
      ["comfortable", elements.comfortableView],
      ["compact", elements.compactView],
    ];
    elements.notesList.classList.remove("notes-list--focus", "notes-list--comfortable", "notes-list--compact");
    elements.notesList.classList.add(`notes-list--${ui.viewMode}`);
    viewButtons.forEach(([mode, button]) => {
      const isActive = mode === ui.viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setViewMode(mode) {
    if (!["focus", "comfortable", "compact"].includes(mode)) return;
    if (mode === ui.viewMode) return;

    const cards = [...elements.notesList.querySelectorAll(".note-card")];
    const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
    ui.viewMode = mode;
    syncViewModeUI();

    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // The layout still works when browser privacy settings block localStorage.
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.requestAnimationFrame(() => {
      cards.forEach((card) => {
        const previous = before.get(card);
        const next = card.getBoundingClientRect();
        if (!previous || (!next.width && !next.height)) return;
        const deltaX = previous.left - next.left;
        const deltaY = previous.top - next.top;
        const scaleX = previous.width / next.width;
        const scaleY = previous.height / next.height;
        if (!deltaX && !deltaY && scaleX === 1 && scaleY === 1) return;
        card.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, opacity: 0.86 },
            { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
          ],
          { duration: 260, easing: "cubic-bezier(0.2, 0.72, 0.2, 1)" },
        );
      });
    });
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text != null) element.textContent = options.text;
    if (options.type) element.type = options.type;
    if (options.value != null) element.value = options.value;
    if (options.disabled != null) element.disabled = options.disabled;
    if (options.title) element.title = options.title;
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([name, value]) => {
        element.setAttribute(name, String(value));
      });
    }
    if (options.dataset) {
      Object.entries(options.dataset).forEach(([name, value]) => {
        element.dataset[name] = String(value);
      });
    }
    return element;
  }

  function normalizedSearchQuery() {
    return ui.query.trim().toLocaleLowerCase();
  }

  function appendHighlightedText(element, value) {
    const text = String(value ?? "");
    const query = ui.query.trim();
    const normalizedQuery = normalizedSearchQuery();

    if (!normalizedQuery) {
      element.textContent = text;
      return;
    }

    const normalizedText = text.toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let matchIndex = normalizedText.indexOf(normalizedQuery, cursor);

    while (matchIndex !== -1) {
      fragment.append(document.createTextNode(text.slice(cursor, matchIndex)));
      fragment.append(
        createElement("mark", {
          className: "search-highlight",
          text: text.slice(matchIndex, matchIndex + query.length),
        }),
      );
      cursor = matchIndex + query.length;
      matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    }

    fragment.append(document.createTextNode(text.slice(cursor)));
    element.replaceChildren(fragment);
  }

  function previewForSearch(noteContent) {
    const plainText = globalThis.NookMarkdown?.toPlainText
      ? globalThis.NookMarkdown.toPlainText(noteContent)
      : String(noteContent || "").replace(/\s+/g, " ").trim();
    const preview = plainText.replace(/\s+/g, " ").trim();
    const normalizedQuery = normalizedSearchQuery();
    if (!preview || !normalizedQuery) return preview || "No content yet.";

    const matchIndex = preview.toLocaleLowerCase().indexOf(normalizedQuery);
    if (matchIndex === -1) return preview;

    const contextBefore = 58;
    const contextAfter = 110;
    const start = Math.max(0, matchIndex - contextBefore);
    const end = Math.min(preview.length, matchIndex + normalizedQuery.length + contextAfter);
    const leadingEllipsis = start > 0 ? "…" : "";
    const trailingEllipsis = end < preview.length ? "…" : "";
    return `${leadingEllipsis}${preview.slice(start, end).trim()}${trailingEllipsis}`;
  }

  function typeFor(id) {
    return (
      library.types.find((type) => type.id === id) ||
      library.types.find((type) => type.id === storage.FALLBACK_TYPE_ID) ||
      { id: storage.FALLBACK_TYPE_ID, name: "General", color: "slate" }
    );
  }

  function tagFor(id) {
    return library.tags.find((tag) => tag.id === id);
  }

  function tagLabel(tagOrName) {
    const rawName = typeof tagOrName === "string" ? tagOrName : tagOrName?.name || "";
    const label = rawName.replace(/^\s*#+\s*/, "").trim();
    return label || rawName;
  }

  function cleanTagInput(value) {
    return value.replace(/^\s*#+\s*/, "").trim();
  }

  function safeTypeColor(type) {
    return storage.TYPE_COLORS.includes(type?.color) ? type.color : "slate";
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown date";
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDifference = Math.round((todayStart - dateStart) / 86400000);
    if (dayDifference === 0) return "today";
    if (dayDifference === 1) return "yesterday";
    return shortDateFormatter.format(date);
  }

  function getNoteCardDateInfo(note) {
    const isEdited = Boolean(
      note?.updatedAt &&
      note?.createdAt &&
      new Date(note.updatedAt).getTime() > new Date(note.createdAt).getTime()
    );
    const prefersUpdated = typeof ui.sort === "string" && ui.sort.startsWith("updated");

    if (prefersUpdated && isEdited) {
      return {
        text: `Updated ${formatShortDate(note.updatedAt)}`,
        datetime: note.updatedAt,
        title: `Updated ${formatFullDate(note.updatedAt)} · Created ${formatFullDate(note.createdAt)}`,
      };
    }

    return {
      text: `Created ${formatShortDate(note.createdAt)}`,
      datetime: note.createdAt,
      title: isEdited
        ? `Created ${formatFullDate(note.createdAt)} · Updated ${formatFullDate(note.updatedAt)}`
        : `Created ${formatFullDate(note.createdAt)}`,
    };
  }

  function formatFullDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown date" : fullDateFormatter.format(date);
  }

  function activeModalDialog() {
    return [elements.confirmationDialog, elements.organizeDialog].find((dialog) => dialog.open) || null;
  }

  function notifyLibraryMutation() {
    libraryChannel?.postMessage({ type: "library-mutated" });
  }

  function refreshFromAnotherTab() {
    if (isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      ui.externalRefreshPending = true;
      showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      return;
    }
    refreshLibrary({ external: true }).catch((error) => showError(error, "We could not refresh the local library."));
  }

  function setupLibrarySync() {
    if (typeof BroadcastChannel !== "function") return;
    libraryChannel = new BroadcastChannel(LIBRARY_CHANNEL_NAME);
    libraryChannel.addEventListener("message", (event) => {
      if (event.data?.type === "library-mutated") refreshFromAnotherTab();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromAnotherTab();
    });
    window.addEventListener("focus", refreshFromAnotherTab);
    window.addEventListener("pagehide", () => libraryChannel?.close(), { once: true });
  }

  function syncToastHost() {
    // A modal <dialog> and its backdrop live in the browser's top layer, above
    // regular page content. Keep the status message inside the active dialog so
    // it remains visible above the backdrop instead of being dimmed behind it.
    const host = activeModalDialog() || document.body;
    if (elements.toast.parentElement !== host) host.append(elements.toast);
  }

  function showToast(message, tone = "success", action = null) {
    window.clearTimeout(ui.toastTimer);
    syncToastHost();
    ui.toastAction = action;
    elements.toastMessage.textContent = message;
    elements.toast.dataset.tone = tone;
    elements.toastAction.textContent = action?.label || "";
    elements.toastAction.classList.toggle("is-hidden", !action);
    elements.toast.classList.add("is-visible");
    ui.toastTimer = window.setTimeout(() => {
      dismissToast();
    }, 3600);
  }

  function dismissToast() {
    window.clearTimeout(ui.toastTimer);
    ui.toastAction = null;
    elements.toastAction.classList.add("is-hidden");
    elements.toast.classList.remove("is-visible");
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

  function resetToFirstPage() {
    ui.page = 1;
  }

  function clearSearchRenderTimer() {
    if (!ui.searchRenderTimer) return;
    window.clearTimeout(ui.searchRenderTimer);
    ui.searchRenderTimer = 0;
  }

  function scheduleSearchRender() {
    clearSearchRenderTimer();
    ui.searchRenderTimer = window.setTimeout(() => {
      ui.searchRenderTimer = 0;
      renderSearchResults();
    }, SEARCH_RENDER_DELAY);
  }

  function setTypeFilter(typeId) {
    ui.typeId = ui.typeId === typeId ? "all" : typeId;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function toggleTagFilter(tagId) {
    if (ui.tagIds.has(tagId)) ui.tagIds.delete(tagId);
    else ui.tagIds.add(tagId);
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function toggleTodayFilter() {
    ui.todayOnly = !ui.todayOnly;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function toggleUpdatedTodayFilter() {
    ui.updatedTodayOnly = !ui.updatedTodayOnly;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function isDeletedNote(note) {
    return Boolean(note?.deletedAt);
  }

  function notesInActiveCollection() {
    return library.notes.filter((note) => ui.trashOnly === isDeletedNote(note));
  }

  function resetRegularFilters() {
    clearSearchRenderTimer();
    ui.query = "";
    ui.typeId = "all";
    ui.tagIds.clear();
    ui.todayOnly = false;
    ui.updatedTodayOnly = false;
    elements.search.value = "";
  }

  function showAllNotesSpace() {
    resetRegularFilters();
    ui.trashOnly = false;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function showTrashSpace() {
    resetRegularFilters();
    ui.trashOnly = true;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function clearFilters({ preserveSort = true } = {}) {
    resetRegularFilters();
    persistFilters();
    if (!preserveSort) {
      ui.sort = "created-desc";
      persistSort();
    }
    elements.search.value = "";
    elements.sort.value = ui.sort;
    resetToFirstPage();
    renderLibrary();
  }

  function ensureUiReferencesAreValid() {
    const availableTypeIds = new Set(library.types.map(({ id }) => id));
    const availableTagIds = new Set(library.tags.map(({ id }) => id));
    const previousTypeId = ui.typeId;
    const previousTagIds = [...ui.tagIds];
    if (ui.typeId !== "all" && !availableTypeIds.has(ui.typeId)) ui.typeId = "all";
    ui.tagIds = new Set(previousTagIds.filter((tagId) => availableTagIds.has(tagId)));
    ui.selectedNoteTagIds = new Set(
      [...ui.selectedNoteTagIds].filter((tagId) => availableTagIds.has(tagId)),
    );
    if (ui.typeId !== previousTypeId || ui.tagIds.size !== previousTagIds.length) persistFilters();
  }

  function hasActiveFilters() {
    return Boolean(ui.query) || ui.typeId !== "all" || ui.tagIds.size > 0 || ui.todayOnly || ui.updatedTodayOnly;
  }

  function syncClearFiltersState() {
    elements.clearFilters.disabled = !hasActiveFilters();
  }

  function getVisibleNotes() {
    const normalizedQuery = normalizedSearchQuery();
    const selectedTagIds = [...ui.tagIds];
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
    const notes = library.notes.filter((note) => {
      if (ui.trashOnly !== isDeletedNote(note)) return false;
      if (ui.typeId !== "all" && note.typeId !== ui.typeId) return false;
      if (selectedTagIds.some((tagId) => !note.tagIds.includes(tagId))) return false;
      const createdAt = Date.parse(note.createdAt);
      if (ui.todayOnly && (Number.isNaN(createdAt) || createdAt < todayStart || createdAt >= tomorrowStart)) return false;
      const updatedAt = Date.parse(note.updatedAt);
      if (ui.updatedTodayOnly && (Number.isNaN(updatedAt) || updatedAt < todayStart || updatedAt >= tomorrowStart)) return false;
      if (!normalizedQuery) return true;
      const searchableText =
        library.searchIndex.get(note.id) || `${note.title}\n${note.content}`.toLocaleLowerCase();
      return searchableText.includes(normalizedQuery);
    });

    return notes.sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      if (ui.sort === "title-asc" || ui.sort === "title-desc") {
        const direction = ui.sort === "title-asc" ? 1 : -1;
        const titleComparison = collator.compare(left.title, right.title);
        if (titleComparison) return titleComparison * direction;
      } else if (ui.sort === "updated-asc" || ui.sort === "updated-desc") {
        const direction = ui.sort === "updated-asc" ? 1 : -1;
        const updatedComparison = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
        if (!Number.isNaN(updatedComparison) && updatedComparison) return updatedComparison * direction;
      } else {
        const direction = ui.sort === "created-asc" ? 1 : -1;
        const dateComparison = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (!Number.isNaN(dateComparison) && dateComparison) return dateComparison * direction;
      }

      const timestampComparison = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (!Number.isNaN(timestampComparison) && timestampComparison) return timestampComparison;
      return collator.compare(left.id, right.id);
    });
  }

  Object.assign(app, {
    storage,
    elements,
    library,
    ui,
    constants: Object.freeze({
      PAGE_SIZE,
      NOTE_AUTO_SAVE_DELAY,
      THEME_STORAGE_KEY,
      THEMES,
    }),
  });

  Object.assign(api, {
    getStoredTheme,
    getNextTheme,
    syncThemeUI,
    setTheme,
    getStoredSidebarCollapsed,
    syncSidebarUI,
    toggleSidebar,
    measureTopbarActionsPinBounds,
    finishTopbarActionsUnpin,
    setToolbarPinned,
    setTopbarActionsPinned,
    syncPinnedTopbarControlMetrics,
    updateTopbarActionsPinning,
    scheduleTopbarActionsPinning,
    activeRegularFilterCount,
    syncMobileFilterToggle,
    toggleMobileFilters,
    getStoredViewMode,
    getStoredSort,
    persistSort,
    getStoredFilters,
    persistFilters,
    nowIso,
    isValidTimestamp,
    clearStoredNoteDraft,
    getStoredNoteDraft,
    syncStoredNoteDraft,
    createDefaultBackupHealth,
    getStoredBackupHealth,
    storeBackupHealth,
    backupHealthReferenceDate,
    backupAgeInDays,
    formatBackupStatus,
    backupHealthMessage,
    syncBackupHealth,
    recordBackupExport,
    usesMacKeyboardShortcuts,
    syncSearchShortcutHint,
    syncNoteSaveShortcutHint,
    syncViewModeUI,
    setViewMode,
    createElement,
    normalizedSearchQuery,
    appendHighlightedText,
    previewForSearch,
    typeFor,
    tagFor,
    tagLabel,
    cleanTagInput,
    safeTypeColor,
    pluralize,
    formatShortDate,
    getNoteCardDateInfo,
    formatFullDate,
    activeModalDialog,
    notifyLibraryMutation,
    refreshFromAnotherTab,
    setupLibrarySync,
    syncToastHost,
    showToast,
    dismissToast,
    requestConfirmation,
    closeConfirmation,
    finishConfirmationClose,
    showError,
    resetToFirstPage,
    clearSearchRenderTimer,
    scheduleSearchRender,
    setTypeFilter,
    toggleTagFilter,
    toggleTodayFilter,
    toggleUpdatedTodayFilter,
    isDeletedNote,
    notesInActiveCollection,
    resetRegularFilters,
    showAllNotesSpace,
    showTrashSpace,
    clearFilters,
    ensureUiReferencesAreValid,
    hasActiveFilters,
    syncClearFiltersState,
    getVisibleNotes,
  });
})();
