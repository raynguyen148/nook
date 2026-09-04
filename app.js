(() => {
  "use strict";

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
  const colorPickerInstances = new WeakMap();
  const openColorPickers = new Set();
  let noteTypePicker = null;
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

  function makeTypeBadge(type, { isFilter = false } = {}) {
    const selected = ui.typeId === type.id;
    const badge = createElement(isFilter ? "button" : "span", {
      className: `type-badge type-badge--${safeTypeColor(type)}${isFilter ? " type-badge--filter" : ""}`,
      type: isFilter ? "button" : undefined,
      text: type.name,
      attributes: {
        "aria-label": isFilter ? `Filter by note type ${type.name}` : type.name,
        "aria-pressed": isFilter ? String(selected) : undefined,
        title: isFilter ? `Filter by ${type.name}` : type.name,
      },
    });
    if (isFilter) badge.addEventListener("click", () => setTypeFilter(type.id));
    return badge;
  }

  function makeTagButton(tag, selected = false) {
    const name = tagLabel(tag);
    const button = createElement("button", {
      className: `tag-chip${selected ? " is-selected" : ""}`,
      type: "button",
      text: name,
      attributes: {
        "aria-label": `Filter by tag ${name}`,
        "aria-pressed": String(selected),
        title: `Filter by ${name}`,
      },
    });
    button.addEventListener("click", () => toggleTagFilter(tag.id));
    return button;
  }

  function renderSidebar() {
    const noteCountsByType = new Map();
    const noteCountsByTag = new Map();
    const collectionNotes = notesInActiveCollection();
    collectionNotes.forEach((note) => {
      noteCountsByType.set(note.typeId, (noteCountsByType.get(note.typeId) || 0) + 1);
      note.tagIds.forEach((tagId) => noteCountsByTag.set(tagId, (noteCountsByTag.get(tagId) || 0) + 1));
    });

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
    const todayCount = collectionNotes.filter((note) => {
      const createdAt = Date.parse(note.createdAt);
      return !Number.isNaN(createdAt) && createdAt >= todayStart && createdAt < tomorrowStart;
    }).length;
    const updatedTodayCount = collectionNotes.filter((note) => {
      const updatedAt = Date.parse(note.updatedAt);
      return !Number.isNaN(updatedAt) && updatedAt >= todayStart && updatedAt < tomorrowStart;
    }).length;
    const trashCount = library.notes.filter(isDeletedNote).length;

    const allNotesCount = library.notes.filter((note) => !isDeletedNote(note)).length;
    elements.notesHeading.textContent = ui.trashOnly ? "Trash" : "All notes";
    elements.allNotesSpaceCount.textContent = allNotesCount;
    elements.allNotesSpace.title = `All notes (${allNotesCount})`;
    elements.trashSpaceCount.textContent = trashCount;
    elements.trashSpace.title = `Trash (${trashCount})`;
    elements.allNotesSpace.classList.toggle("is-active", !ui.trashOnly);
    elements.allNotesSpace.setAttribute("aria-pressed", String(!ui.trashOnly));
    elements.trashSpace.classList.toggle("is-active", ui.trashOnly);
    elements.trashSpace.setAttribute("aria-pressed", String(ui.trashOnly));
    elements.createdTodayFilter.classList.toggle("is-active", ui.todayOnly);
    elements.createdTodayFilter.setAttribute("aria-pressed", String(ui.todayOnly));
    elements.createdTodayFilterCount.textContent = todayCount;
    elements.createdTodayFilter.title = `Created Today (${todayCount})`;
    elements.updatedTodayFilter.classList.toggle("is-active", ui.updatedTodayOnly);
    elements.updatedTodayFilter.setAttribute("aria-pressed", String(ui.updatedTodayOnly));
    elements.updatedTodayFilterCount.textContent = updatedTodayCount;
    elements.updatedTodayFilter.title = `Updated Today (${updatedTodayCount})`;
    elements.emptyTrash.classList.toggle("is-hidden", !ui.trashOnly || trashCount === 0);
    elements.newNote.classList.toggle("is-hidden", ui.trashOnly);
    elements.sidebar?.classList.toggle("is-trash-view", ui.trashOnly);
    elements.mobileFilterToggle.classList.toggle("is-hidden", ui.trashOnly);
    elements.regularFilterControls.classList.toggle("is-hidden", ui.trashOnly);
    elements.typeFilterList.replaceChildren();
    const typeFragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const typeCount = noteCountsByType.get(type.id) || 0;
      const button = createElement("button", {
        className: `sidebar-filter sidebar-filter--type sidebar-filter--${safeTypeColor(type)}${ui.typeId === type.id ? " is-active" : ""}`,
        type: "button",
        attributes: {
          "aria-pressed": String(ui.typeId === type.id),
          "aria-label": `Filter by type ${type.name} (${typeCount})`,
        },
      });
      button.title = `Filter by ${type.name} (${typeCount})`;
      const label = createElement("span", { className: "sidebar-filter__label" });
      label.append(createElement("span", { className: `type-dot type-dot--${safeTypeColor(type)}` }));
      label.append(document.createTextNode(type.name));
      button.append(label, createElement("span", { className: "filter-count", text: typeCount }));
      button.addEventListener("click", () => setTypeFilter(type.id));
      typeFragment.append(button);
    });
    elements.typeFilterList.append(typeFragment);

    elements.tagFilterList.replaceChildren();
    const tagFragment = document.createDocumentFragment();
    library.tags.forEach((tag) => {
      const tagCount = noteCountsByTag.get(tag.id) || 0;
      const isSelected = ui.tagIds.has(tag.id);
      const label = createElement("label", {
        className: `tag-filter-option${isSelected ? " is-active" : ""}`,
        attributes: { title: `Filter by ${tagLabel(tag)} (${tagCount})` },
      });
      const input = createElement("input", {
        type: "checkbox",
        value: tag.id,
        attributes: { "aria-label": `Filter by tag ${tagLabel(tag)} (${tagCount})` },
      });
      input.checked = isSelected;
      input.addEventListener("change", () => toggleTagFilter(tag.id));
      label.append(input);
      label.append(createElement("span", { className: "tag-filter-option__box", attributes: { "aria-hidden": "true" } }));
      label.append(createElement("span", { className: "tag-filter-option__name", text: tagLabel(tag) }));
      label.append(createElement("span", { className: "filter-count", text: tagCount }));
      tagFragment.append(label);
    });
    elements.tagFilterList.append(tagFragment);
    elements.tagFilterEmpty.classList.toggle("is-hidden", library.tags.length > 0);
    elements.tagFilterCount.textContent = ui.tagIds.size ? `${ui.tagIds.size} selected` : "";
    syncMobileFilterToggle();
    syncClearFiltersState();
  }

  function createChipCloseIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m4.5 4.5 7 7M11.5 4.5l-7 7");
    svg.append(path);
    return svg;
  }

  function makeFilterPill(label, onClear, kinds = [], hoverTitle = "") {
    const normalizedKinds = (Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean);
    const chip = createElement("span", {
      className: ["active-filter-pill", ...normalizedKinds.map((kind) => `active-filter-pill--${kind}`)].join(" "),
      attributes: { title: hoverTitle || label },
    });
    chip.append(createElement("span", { text: label }));
    const clear = createElement("button", {
      className: "active-filter-pill__clear",
      type: "button",
      attributes: { "aria-label": `Remove ${label} filter`, title: `Remove ${label} filter` },
    });
    clear.append(createChipCloseIcon());
    clear.addEventListener("click", onClear);
    chip.append(clear);
    return chip;
  }

  function renderActiveFilters() {
    const fragment = document.createDocumentFragment();
    if (ui.query) {
      fragment.append(
        makeFilterPill(`Search: ${ui.query}`, () => {
          ui.query = "";
          elements.search.value = "";
          resetToFirstPage();
          renderSearchResults();
        }),
      );
    }
    if (ui.typeId !== "all") {
      const type = typeFor(ui.typeId);
      fragment.append(
        makeFilterPill(type.name, () => {
          ui.typeId = "all";
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }, ["type", `type-${safeTypeColor(type)}`], `Filter by ${type.name}`),
      );
    }
    if (ui.todayOnly) {
      fragment.append(
        makeFilterPill("Created Today", () => {
          ui.todayOnly = false;
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }, [], "Filter by Created Today"),
      );
    }
    if (ui.updatedTodayOnly) {
      fragment.append(
        makeFilterPill("Updated Today", () => {
          ui.updatedTodayOnly = false;
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }, [], "Filter by Updated Today"),
      );
    }
    [...ui.tagIds].map(tagFor).filter(Boolean).forEach((tag) => {
      fragment.append(
        makeFilterPill(tagLabel(tag), () => {
          ui.tagIds.delete(tag.id);
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }, "tag", `Filter by ${tagLabel(tag)}`),
      );
    });
    elements.activeFilters.replaceChildren(fragment);
    elements.activeFilters.classList.toggle(
      "is-empty",
      !ui.query &&
        ui.typeId === "all" &&
        ui.tagIds.size === 0 &&
        !ui.todayOnly &&
        !ui.updatedTodayOnly,
    );
  }

  function noteForQuickView() {
    const noteId = ui.editingNoteId || ui.viewingNoteId;
    return library.notes.find(({ id }) => id === noteId) || null;
  }

  function previewNoteFromEditor() {
    const persistedNote = noteForQuickView();
    return {
      id: elements.noteId.value,
      title: elements.noteTitle.value.trim() || "Untitled note",
      typeId: elements.noteType.value,
      tagIds: [...ui.selectedNoteTagIds],
      content: elements.noteContent.value,
      createdAt: persistedNote?.createdAt || "",
      updatedAt: persistedNote?.updatedAt || "",
    };
  }

  function renderQuickView(note = previewNoteFromEditor()) {
    const type = typeFor(note.typeId);
    const tags = note.tagIds.map(tagFor).filter(Boolean);
    elements.quickViewTitle.textContent = note.title;
    elements.quickViewMeta.replaceChildren(makeTypeBadge(type));
    elements.quickViewTags.replaceChildren();
    if (tags.length) {
      const fragment = document.createDocumentFragment();
      tags.forEach((tag) => {
        fragment.append(createElement("span", {
          className: "quick-view-tag",
          text: tagLabel(tag),
          attributes: { title: tagLabel(tag) },
        }));
      });
      elements.quickViewTags.append(fragment);
    } else {
      elements.quickViewTags.append(createElement("span", { className: "quick-view-no-tags", text: "No tags" }));
    }
    globalThis.NookMarkdown.renderInto(elements.quickViewContent, note.content);
    elements.quickViewDates.replaceChildren();
    if (note.createdAt && note.updatedAt) {
      elements.quickViewDates.append(
        createElement("span", { text: `Created ${formatFullDate(note.createdAt)}` }),
        createElement("span", { text: `Last updated ${formatFullDate(note.updatedAt)}` }),
      );
    } else {
      elements.quickViewDates.append(createElement("span", { text: "Not saved yet" }));
    }
    syncNotePreviewActions();
  }

  function syncNotePreviewActions() {
    const hasContent = Boolean(elements.noteContent.value.trim());
    elements.copyNoteContent.disabled = !hasContent || ui.copyInFlight;
    if (!hasContent) {
      resetCopyButtonFeedback(elements.copyNoteContent);
    }
  }

  function isDetailWorkspaceOpen() {
    return !elements.noteDetailWorkspace.classList.contains("is-hidden");
  }

  function isQuickViewOpen() {
    return isNoteEditorOpen() && ui.noteEditorMode === "preview";
  }

  function isNoteEditorOpen() {
    return isDetailWorkspaceOpen() && !elements.noteDialog.classList.contains("is-hidden");
  }

  function animateCardIntoDetail(invoker, surface) {
    const sourceCard = invoker instanceof HTMLElement ? invoker.closest(".note-card") : null;
    if (!sourceCard || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const origin = sourceCard.getBoundingClientRect();
    if (!origin.width || !origin.height) return;
    const clone = sourceCard.cloneNode(true);
    clone.classList.add("note-detail-transition-card");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      top: `${origin.top}px`,
      left: `${origin.left}px`,
      width: `${origin.width}px`,
      height: `${origin.height}px`,
    });
    document.body.append(clone);

    window.requestAnimationFrame(() => {
      const destination = surface.getBoundingClientRect();
      if (!destination.width || !destination.height) {
        clone.remove();
        return;
      }
      const animation = clone.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${destination.left - origin.left}px, ${destination.top - origin.top}px) scale(${destination.width / origin.width}, ${Math.min(destination.height / origin.height, 4)})`,
            opacity: 0.16,
          },
        ],
        { duration: 280, easing: "cubic-bezier(0.2, 0.72, 0.2, 1)", fill: "forwards" },
      );
      animation.finished.catch(() => {}).finally(() => clone.remove());
    });
  }

  function openNoteDetail(surface, invoker = null) {
    if (!isDetailWorkspaceOpen()) {
      ui.detailScrollTop = window.scrollY;
      ui.viewInvoker = invoker instanceof HTMLElement ? invoker : null;
      ui.detailSourceCard?.classList.remove("is-detail-source");
      ui.detailSourceCard = ui.viewInvoker?.closest(".note-card") || null;
      ui.detailSourceCard?.classList.add("is-detail-source");
      animateCardIntoDetail(invoker, surface);
      elements.workspace.classList.add("is-note-detail-open");
      elements.noteDetailWorkspace.classList.remove("is-hidden");
      window.scrollTo(0, 0);
    }
    surface.classList.remove("is-hidden");
    window.requestAnimationFrame(() => {
      const scrollSurface = ui.noteEditorMode === "preview"
        ? surface.querySelector(".quick-view-content-card")
        : surface.querySelector(".dialog-body");
      if (scrollSurface) scrollSurface.scrollTop = 0;
      if (surface === elements.noteDialog) {
        elements.noteContent.scrollTop = 0;
        elements.noteContentPreview.scrollTop = 0;
      }
    });
  }

  function closeNoteDetail({ restoreFocus = true, invoker = ui.viewInvoker } = {}) {
    resetCopyButtonFeedback(elements.copyNoteContent);
    elements.noteDialog.classList.add("is-hidden");
    elements.quickViewDialog.classList.add("is-hidden");
    elements.noteDetailWorkspace.classList.add("is-hidden");
    elements.workspace.classList.remove("is-note-detail-open");
    ui.detailSourceCard?.classList.remove("is-detail-source");
    ui.detailSourceCard = null;
    window.requestAnimationFrame(() => {
      window.scrollTo(0, ui.detailScrollTop);
      if (restoreFocus) focusQuickViewFallback(invoker);
    });
  }

  function syncQuickViewHeight() {
    if (!isQuickViewOpen()) return;
    elements.noteDialog.style.removeProperty("height");
  }

  function scheduleQuickViewHeightSync() {
    window.requestAnimationFrame(syncQuickViewHeight);
  }

  function focusQuickViewFallback(invoker) {
    if (invoker instanceof HTMLElement && invoker.isConnected && !invoker.disabled) {
      invoker.focus();
      return;
    }
    elements.notesList.focus({ preventScroll: true });
  }

  function closeQuickView() {
    if (isQuickViewOpen()) requestNoteEditorClose();
  }

  function openQuickView(note, invoker = null) {
    openNoteEditor(note, { invoker, initialMode: "preview", focusTitle: false });
  }

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

  const copyFeedbackTimers = new WeakMap();

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
    if (copiedTitle) button.setAttribute("title", copiedTitle);
    if (copiedLabel) button.setAttribute("aria-label", copiedLabel);

    const timer = setTimeout(() => {
      copyFeedbackTimers.delete(button);
      if (!button.isConnected) return;
      button.classList.remove("is-copied");
      if (originalTitle) button.setAttribute("title", originalTitle);
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
    if (originalTitle) button.setAttribute("title", originalTitle);
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

  function createPinIcon() {
    return createNoteCardActionIcon([
      ["path", { d: "M8.2 4.25h7.6l-1.15 5.1 3.1 3.1v1.1H6.25v-1.1l3.1-3.1-1.15-5.1Z" }],
      ["path", { d: "M12 13.55v6.2" }],
    ]);
  }

  function createRestoreIcon() {
    return createNoteCardActionIcon([
      ["path", { d: "M5.25 8.5a7.5 7.5 0 1 1-.1 7.15" }],
      ["path", { d: "M5.25 4.75v3.75H9" }],
    ]);
  }

  async function toggleNotePinned(note) {
    try {
      await storage.setNotePinned(note.id, !note.isPinned);
      await refreshLibrary({ broadcast: true });
      showToast(note.isPinned ? "Note unpinned." : "Note pinned.");
    } catch (error) {
      showError(error, "We could not update this note's pin state.");
    }
  }

  async function restoreNoteWithFeedback(note) {
    try {
      await storage.restoreNote(note.id);
      await refreshLibrary({ broadcast: true });
      showToast("Note restored.");
    } catch (error) {
      showError(error, "We could not restore this note.");
    }
  }

  async function permanentlyDeleteNoteWithConfirmation(note) {
    if (!note || ui.noteSaveInFlight) return;
    const confirmed = await requestConfirmation({
      title: "Delete note permanently?",
      description: `“${note.title}” will be deleted permanently from this browser. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      cancelLabel: "Keep note",
    });
    if (!confirmed) return;
    try {
      await storage.permanentlyDeleteNote(note.id);
      await refreshLibrary({ broadcast: true });
      showToast("Note permanently deleted.");
    } catch (error) {
      showError(error, "We could not permanently delete this note.");
    }
  }

  async function emptyTrashWithConfirmation() {
    const trashedCount = library.notes.filter(isDeletedNote).length;
    if (!trashedCount) return;
    const confirmed = await requestConfirmation({
      title: "Empty Trash?",
      description: `This will permanently delete ${pluralize(trashedCount, "note")} from this browser. This cannot be undone.`,
      confirmLabel: "Empty Trash",
      cancelLabel: "Keep Trash",
    });
    if (!confirmed) return;
    try {
      const deletedCount = await storage.emptyTrash();
      await refreshLibrary({ broadcast: true });
      showToast(`Trash emptied. ${pluralize(deletedCount, "note")} permanently deleted.`);
    } catch (error) {
      showError(error, "We could not empty Trash.");
    }
  }

  function createNoteCardActionIcon(shapes, strokeWidth = "1.7") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", String(strokeWidth));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    shapes.forEach(([name, attributes]) => {
      const shape = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.entries(attributes).forEach(([attribute, value]) => shape.setAttribute(attribute, value));
      svg.append(shape);
    });
    return svg;
  }

  function createNoteCard(note) {
    const type = typeFor(note.typeId);
    const isDeleted = isDeletedNote(note);
    const card = createElement("article", {
      className: `note-card${note.isPinned ? " note-card--pinned" : ""}`,
    });
    const content = createElement("div", { className: "note-card__content" });
    const meta = createElement("div", { className: "note-card__meta" });
    meta.append(makeTypeBadge(type, { isFilter: !ui.trashOnly }));
    const dateInfo = getNoteCardDateInfo(note);
    const dateElement = createElement("time", {
      className: "note-card__date",
      text: dateInfo.text,
      attributes: { datetime: dateInfo.datetime, title: dateInfo.title },
    });
    meta.append(dateElement);

    const titleButton = createElement("button", {
      className: "note-card__title",
      type: "button",
      attributes: { "aria-label": `Preview note: ${note.title}` },
    });
    appendHighlightedText(titleButton, note.title);
    titleButton.addEventListener("click", () => openQuickView(note, titleButton));
    const preview = createElement("p", { className: "note-card__preview" });
    appendHighlightedText(preview, previewForSearch(note.content));
    content.append(meta, titleButton, preview);

    const footer = createElement("div", { className: "note-card__footer" });
    const tags = createElement("div", { className: "note-card__tags" });
    const resolvedTags = note.tagIds.map(tagFor).filter(Boolean);
    resolvedTags.slice(0, 3).forEach((tag) => {
      tags.append(
        ui.trashOnly
          ? createElement("span", { className: "tag-chip", text: tagLabel(tag) })
          : makeTagButton(tag, ui.tagIds.has(tag.id)),
      );
    });
    if (resolvedTags.length > 3) {
      tags.append(
        createElement("span", {
          className: "more-tags",
          text: `+${resolvedTags.length - 3}`,
          attributes: { title: `${resolvedTags.length - 3} more tags in Preview` },
        }),
      );
    }
    if (!resolvedTags.length) tags.append(createElement("span", { className: "untagged", text: "No tags" }));

    const actions = createElement("div", { className: "note-card__actions" });
    const view = createElement("button", {
      className: "note-card__action",
      type: "button",
      attributes: { "aria-label": `Preview ${note.title}`, title: "Preview" },
    });
    view.append(
      createNoteCardActionIcon([
        ["path", { d: "M2.4 12s3.4-5.2 9.6-5.2 9.6 5.2 9.6 5.2-3.4 5.2-9.6 5.2S2.4 12 2.4 12Z" }],
        ["circle", { cx: "12", cy: "12", r: "2.35" }],
      ]),
    );
    view.addEventListener("click", () => openQuickView(note, view));
    const copy = createElement("button", {
      className: "note-card__action",
      type: "button",
      disabled: !note.content.trim(),
      attributes: { "aria-label": `Copy ${note.title}`, title: "Copy content" },
    });
    const copyIcon = createNoteCardActionIcon([
      ["rect", { x: "8.25", y: "8.25", width: "11.5", height: "11.5", rx: "2" }],
      ["path", { d: "M15.75 8.25V6.5a2.25 2.25 0 0 0-2.25-2.25H6.5A2.25 2.25 0 0 0 4.25 6.5v7A2.25 2.25 0 0 0 6.5 15.75h1.75" }],
    ]);
    copyIcon.classList.add("copy-icon");
    const checkIcon = createNoteCardActionIcon([
      ["polyline", { points: "20 6 9 17 4 12" }],
    ], 2);
    checkIcon.classList.add("check-icon");
    copy.append(copyIcon, checkIcon);
    copy.addEventListener("click", () => copyNoteCardContent(note, copy));
    const edit = createElement("button", {
      className: "note-card__action",
      type: "button",
      disabled: isDeleted,
      attributes: {
        "aria-label": isDeleted ? `Restore ${note.title} before editing` : `Edit ${note.title}`,
        title: isDeleted ? "Restore before editing" : "Edit",
      },
    });
    edit.append(
      createNoteCardActionIcon([
        ["path", { d: "m14.6 5.4 4 4" }],
        ["path", { d: "M4.5 19.5 6 14l9.6-9.6a1.65 1.65 0 0 1 2.35 0l1.65 1.65a1.65 1.65 0 0 1 0 2.35L10 18l-5.5 1.5Z" }],
      ]),
    );
    edit.addEventListener("click", () => openNoteEditor(note, { invoker: edit }));
    const remove = createElement("button", {
      className: `note-card__action ${isDeleted ? "note-card__action--restore" : "note-card__action--danger"}`,
      type: "button",
      attributes: {
        "aria-label": isDeleted ? `Restore ${note.title}` : `Move ${note.title} to Trash`,
        title: isDeleted ? "Restore" : "Move to Trash",
      },
    });
    remove.append(
      isDeleted
        ? createRestoreIcon()
        : createNoteCardActionIcon([
            ["path", { d: "M4.5 7.5h15" }],
            ["path", { d: "M9.5 4.5h5" }],
            ["path", { d: "m6.5 7.5.8 12h9.4l.8-12" }],
            ["path", { d: "M10 11v5" }],
            ["path", { d: "M14 11v5" }],
          ]),
    );
    remove.addEventListener("click", () => (isDeleted ? restoreNoteWithFeedback(note) : deleteNoteWithConfirmation(note)));
    actions.append(copy, view);
    if (!isDeleted) actions.append(edit);
    actions.append(remove);
    if (isDeleted) {
      const permanentRemove = createElement("button", {
        className: "note-card__action note-card__action--danger note-card__action--permanent",
        type: "button",
        attributes: {
          "aria-label": `Delete ${note.title} permanently`,
          title: "Delete permanently",
        },
      });
      permanentRemove.append(
        createNoteCardActionIcon([
          ["path", { d: "M4.5 7.5h15" }],
          ["path", { d: "M9.5 4.5h5" }],
          ["path", { d: "m6.5 7.5.8 12h9.4l.8-12" }],
          ["path", { d: "M10 11v5" }],
          ["path", { d: "M14 11v5" }],
        ]),
      );
      permanentRemove.addEventListener("click", () => permanentlyDeleteNoteWithConfirmation(note));
      actions.append(permanentRemove);
    }
    footer.append(tags, actions);
    if (!isDeleted) {
      const pin = createElement("button", {
        className: "note-card__pin-toggle",
        type: "button",
        attributes: {
          "aria-label": `${note.isPinned ? "Unpin" : "Pin"} ${note.title}`,
          title: note.isPinned ? "Unpin" : "Pin",
          "aria-pressed": String(note.isPinned),
        },
      });
      pin.append(createPinIcon());
      pin.addEventListener("click", () => toggleNotePinned(note));
      card.append(pin);
    }
    card.append(content, footer);
    return card;
  }

  function renderEmptyState(hasAnyNotes) {
    const empty = createElement("section", { className: "empty-state" });
    const icon = createElement("span", { className: "empty-state__icon", attributes: { "aria-hidden": "true" } });
    if (hasAnyNotes) {
      icon.append(
        createNoteCardActionIcon([
          ["circle", { cx: "11", cy: "11", r: "6.5" }],
          ["path", { d: "m16 16 4.5 4.5" }],
          ["path", { d: "M8.5 11h5" }],
        ]),
      );
    } else if (ui.trashOnly) {
      icon.append(
        createNoteCardActionIcon([
          ["path", { d: "M4.5 7.5h15" }],
          ["path", { d: "M9.5 4.5h5" }],
          ["path", { d: "m6.5 7.5.8 12h9.4l.8-12" }],
          ["path", { d: "M10 11v5" }],
          ["path", { d: "M14 11v5" }],
        ]),
      );
    } else {
      icon.append(
        createNoteCardActionIcon([
          ["path", { d: "M14.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5L14.5 3.5z" }],
          ["path", { d: "M14 3.5v6h6" }],
          ["path", { d: "M12 12.5v4.5" }],
          ["path", { d: "M9.75 14.75h4.5" }],
        ]),
      );
    }
    empty.append(icon);
    empty.append(
      createElement("h3", {
        text: hasAnyNotes
          ? "No notes match these filters"
          : ui.trashOnly
            ? "Trash is empty"
            : "Your note library is ready",
      }),
    );
    empty.append(
      createElement("p", {
        text: hasAnyNotes
          ? "Try a different search or filter."
          : ui.trashOnly
            ? "Notes you move to Trash will appear here."
            : "Capture an idea, meeting, learning, or anything you want to keep.",
      }),
    );
    const action = createElement("button", {
      className: "button button-primary",
      type: "button",
      text: hasAnyNotes ? "Clear filters" : ui.trashOnly ? "Back to notes" : "Create your first note",
    });
    action.addEventListener("click", () => {
      if (hasAnyNotes) clearFilters();
      else if (ui.trashOnly) showAllNotesSpace();
      else openNoteEditor();
    });
    empty.append(action);
    elements.notesList.replaceChildren(empty);
  }

  function paginationItems(totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = new Set([1, totalPages, ui.page, ui.page - 1, ui.page + 1]);
    const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const items = [];
    ordered.forEach((page, index) => {
      if (index && page - ordered[index - 1] > 1) items.push("ellipsis");
      items.push(page);
    });
    return items;
  }

  function renderPagination(totalPages) {
    elements.pagination.replaceChildren();
    elements.pagination.classList.toggle("is-hidden", totalPages <= 1);
    if (totalPages <= 1) return;

    const previous = createElement("button", {
      className: "pagination-button pagination-button--direction",
      type: "button",
      text: "Previous",
      disabled: ui.page === 1,
    });
    previous.addEventListener("click", () => {
      ui.page -= 1;
      renderNotes();
    });
    elements.pagination.append(previous);

    paginationItems(totalPages).forEach((item, index) => {
      if (item === "ellipsis") {
        elements.pagination.append(createElement("span", { className: "pagination-ellipsis", text: "…", attributes: { "aria-hidden": "true" } }));
        return;
      }
      const page = item;
      const button = createElement("button", {
        className: `pagination-button${page === ui.page ? " is-active" : ""}`,
        type: "button",
        text: page,
        attributes: page === ui.page ? { "aria-current": "page" } : {},
      });
      button.addEventListener("click", () => {
        ui.page = page;
        renderNotes();
      });
      elements.pagination.append(button);
    });

    const next = createElement("button", {
      className: "pagination-button pagination-button--direction",
      type: "button",
      text: "Next",
      disabled: ui.page === totalPages,
    });
    next.addEventListener("click", () => {
      ui.page += 1;
      renderNotes();
    });
    elements.pagination.append(next);
  }

  function renderNotes() {
    syncViewModeUI();
    elements.sort.value = ui.sort;
    const matchingNotes = getVisibleNotes();
    const totalPages = Math.max(1, Math.ceil(matchingNotes.length / PAGE_SIZE));
    ui.page = Math.min(ui.page, totalPages);
    const start = (ui.page - 1) * PAGE_SIZE;
    const pageNotes = matchingNotes.slice(start, start + PAGE_SIZE);
    const end = start + pageNotes.length;

    elements.notesCount.textContent = pluralize(matchingNotes.length, "note");
    elements.notesRange.textContent = matchingNotes.length
      ? `Showing ${start + 1}–${end} of ${matchingNotes.length}`
      : "No matching notes";
    const sortLabels = {
      "created-desc": "Newest created",
      "created-asc": "Oldest created",
      "updated-desc": "Newest updated",
      "updated-asc": "Oldest updated",
      "title-asc": "Title A–Z",
      "title-desc": "Title Z–A",
    };
    elements.sortDescription.textContent = `Sorted: ${sortLabels[ui.sort]}`;
    const hasSearchQuery = Boolean(ui.query);
    elements.clearSearch.classList.toggle("is-hidden", !hasSearchQuery);
    elements.searchShortcut.classList.toggle("is-hidden", hasSearchQuery);
    elements.searchField.classList.toggle("has-search-query", hasSearchQuery);
    elements.notesList.setAttribute("aria-busy", "false");

    if (!pageNotes.length) {
      renderEmptyState(notesInActiveCollection().length > 0);
      renderPagination(0);
      return;
    }

    const fragment = document.createDocumentFragment();
    pageNotes.forEach((note) => fragment.append(createNoteCard(note)));
    elements.notesList.replaceChildren(fragment);
    renderPagination(totalPages);
  }

  function renderNoteTypeOptions(preferredTypeId = elements.noteType.value) {
    const currentValue = preferredTypeId || storage.FALLBACK_TYPE_ID;
    const fragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const option = createElement("option", { value: type.id, text: type.name });
      option.selected = type.id === currentValue;
      fragment.append(option);
    });
    elements.noteType.replaceChildren(fragment);
    if (![...elements.noteType.options].some((option) => option.value === currentValue)) {
      elements.noteType.value = storage.FALLBACK_TYPE_ID;
    }
    renderNoteTypePickerOptions();
  }

  function closeNoteTypePicker() {
    if (!noteTypePicker) return;
    noteTypePicker.menu.hidden = true;
    noteTypePicker.trigger.setAttribute("aria-expanded", "false");
  }

  function setNoteTypePickerValue(typeId, { focusTrigger = false } = {}) {
    if (!noteTypePicker) return;
    const type = typeFor(typeId) || typeFor(storage.FALLBACK_TYPE_ID);
    if (!type) return;

    elements.noteType.value = type.id;
    if (noteTypePicker.colorClass) {
      noteTypePicker.trigger.classList.remove(noteTypePicker.colorClass);
    }
    noteTypePicker.colorClass = `type-badge--${safeTypeColor(type)}`;
    noteTypePicker.trigger.classList.add(noteTypePicker.colorClass);
    noteTypePicker.dot.className = `type-dot type-dot--${safeTypeColor(type)}`;
    noteTypePicker.label.textContent = type.name;
    noteTypePicker.options.forEach((option) => {
      const selected = option.dataset.typeId === type.id;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    if (focusTrigger) noteTypePicker.trigger.focus();
  }

  function renderNoteTypePickerOptions() {
    if (!noteTypePicker) return;
    const currentTypeId = elements.noteType.value || storage.FALLBACK_TYPE_ID;
    const fragment = document.createDocumentFragment();
    noteTypePicker.options = library.types.map((type) => {
      const option = createElement("button", {
        className: "note-type-picker__option",
        type: "button",
        text: type.name,
        dataset: { typeId: type.id },
        attributes: { role: "option", "aria-selected": "false" },
      });
      option.prepend(createElement("span", { className: `type-dot type-dot--${safeTypeColor(type)}`, attributes: { "aria-hidden": "true" } }));
      return option;
    });
    fragment.append(...noteTypePicker.options);
    noteTypePicker.menu.replaceChildren(fragment);
    setNoteTypePickerValue(currentTypeId);
  }

  function enhanceNoteTypeSelect() {
    if (noteTypePicker) return noteTypePicker;

    const picker = createElement("div", { className: "note-type-picker" });
    const trigger = createElement("button", {
      className: "note-type-picker__trigger type-badge",
      type: "button",
      attributes: {
        "aria-label": "Note type",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const dot = createElement("span", { attributes: { "aria-hidden": "true" } });
    const label = createElement("span", { className: "note-type-picker__label" });
    trigger.append(dot, label);
    const menu = createElement("div", { className: "note-type-picker__menu", attributes: { role: "listbox", "aria-label": "Note type options" } });
    menu.hidden = true;

    elements.noteType.classList.add("note-type-picker__native");
    elements.noteType.tabIndex = -1;
    elements.noteType.setAttribute("aria-hidden", "true");
    elements.noteType.hidden = true;
    elements.noteType.parentElement?.insertBefore(picker, elements.noteType);
    picker.append(elements.noteType, trigger, menu);

    noteTypePicker = { root: picker, trigger, dot, label, menu, options: [] };
    trigger.addEventListener("click", () => {
      if (menu.hidden) {
        openColorPickers.forEach((openPicker) => closeColorPicker(openPicker));
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        noteTypePicker.options.find((option) => option.dataset.typeId === elements.noteType.value)?.focus();
      } else {
        closeNoteTypePicker();
      }
    });
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        if (menu.hidden) trigger.click();
      }
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".note-type-picker__option");
      if (!option) return;
      setNoteTypePickerValue(option.dataset.typeId, { focusTrigger: true });
      elements.noteType.dispatchEvent(new Event("change", { bubbles: true }));
      closeNoteTypePicker();
    });
    menu.addEventListener("keydown", (event) => {
      const currentIndex = noteTypePicker.options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeNoteTypePicker();
        trigger.focus();
        return;
      }
      if (event.key === "Tab") {
        closeNoteTypePicker();
        return;
      }
      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % noteTypePicker.options.length;
      else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + noteTypePicker.options.length) % noteTypePicker.options.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = noteTypePicker.options.length - 1;
      else return;
      event.preventDefault();
      noteTypePicker.options[nextIndex].focus();
    });
    elements.noteType.addEventListener("change", () => setNoteTypePickerValue(elements.noteType.value));
    renderNoteTypePickerOptions();
    return noteTypePicker;
  }

  function renderSelectedNoteTags() {
    elements.selectedNoteTags.replaceChildren();
    const selectedTags = [...ui.selectedNoteTagIds].map(tagFor).filter(Boolean);
    selectedTags.forEach((tag) => {
      const chip = createElement("span", {
        className: "selected-tag",
        attributes: { title: tagLabel(tag) },
      });
      chip.append(createElement("span", { text: tagLabel(tag) }));
      const remove = createElement("button", {
        type: "button",
        disabled: ui.noteSaveInFlight,
        attributes: { "aria-label": `Remove tag ${tagLabel(tag)}` },
      });
      remove.append(createChipCloseIcon());
      remove.addEventListener("click", () => {
        if (ui.noteSaveInFlight) return;
        ui.selectedNoteTagIds.delete(tag.id);
        renderSelectedNoteTags();
        renderTagSuggestions();
        scheduleNoteAutoSave();
      });
      chip.append(remove);
      elements.selectedNoteTags.append(chip);
    });
  }

  function renderTagSuggestions() {
    if (!ui.tagInputExpanded) {
      elements.tagSuggestions.replaceChildren();
      return;
    }
    const queryText = cleanTagInput(elements.tagInput.value);
    const query = queryText.toLocaleLowerCase();
    const available = library.tags
      .filter((tag) => !ui.selectedNoteTagIds.has(tag.id))
      .filter((tag) => !query || tagLabel(tag).toLocaleLowerCase().includes(query))
      .slice(0, 5);
    const hasExactMatch = library.tags.some((tag) => tagLabel(tag).toLocaleLowerCase() === query);
    elements.tagSuggestions.replaceChildren();
    if (!query) return;
    if (available.length) {
      elements.tagSuggestions.append(createElement("span", { className: "tag-suggestions__label", text: "Suggested" }));
    }
    available.forEach((tag) => {
      const button = createElement("button", {
        className: "tag-suggestion",
        type: "button",
        text: tagLabel(tag),
        disabled: ui.noteSaveInFlight,
        attributes: { "aria-label": `Add tag ${tagLabel(tag)}` },
      });
      button.addEventListener("click", () => selectNoteTag(tag.id));
      elements.tagSuggestions.append(button);
    });
    if (!hasExactMatch) {
      const create = createElement("button", {
        className: "tag-suggestion tag-suggestion--create",
        type: "button",
        text: `Create “${queryText}”`,
        disabled: ui.noteSaveInFlight,
      });
      create.addEventListener("click", addTagFromEditor);
      elements.tagSuggestions.append(create);
    }
  }

  function normalizeTagEditorInput() {
    const withoutPrefix = elements.tagInput.value.replace(/^\s*#+\s*/, "");
    if (withoutPrefix !== elements.tagInput.value) elements.tagInput.value = withoutPrefix;
    renderTagSuggestions();
  }

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

  function getNoteEditorScrollProgress(element) {
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= 0) return 0;
    return Math.min(1, Math.max(0, element.scrollTop / maxScrollTop));
  }

  function setNoteEditorScrollProgress(element, progress) {
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= 0) {
      element.scrollTop = 0;
      return;
    }
    element.scrollTop = progress * maxScrollTop;
  }

  function syncNoteEditorScroll(source, target) {
    if (ui.noteEditorMode !== "split" || ui.noteScrollSyncing) return;
    ui.noteScrollSyncing = true;
    setNoteEditorScrollProgress(target, getNoteEditorScrollProgress(source));
    window.requestAnimationFrame(() => {
      ui.noteScrollSyncing = false;
    });
  }

  function renderNoteEditorPreview() {
    if (ui.noteEditorMode !== "split") return;
    globalThis.NookMarkdown.renderInto(elements.noteContentPreview, elements.noteContent.value);
    syncNoteEditorScroll(elements.noteContent, elements.noteContentPreview);
  }

  function scheduleNoteEditorPreview() {
    if (ui.noteEditorMode !== "split") return;
    window.cancelAnimationFrame(ui.noteEditorPreviewFrame);
    ui.noteEditorPreviewFrame = window.requestAnimationFrame(() => {
      renderNoteEditorPreview();
    });
  }

  function setNoteEditorMode(mode) {
    if (!["edit", "split", "preview"].includes(mode)) return;
    resetCopyButtonFeedback(elements.copyNoteContent);
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
    elements.noteEditorModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.noteEditorMode === mode));
    });
    syncNotePreviewActions();
    if (mode === "preview") renderQuickView();
    else renderNoteEditorPreview();
    scheduleNoteEditorHeight();
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

  function hasUnsavedNoteChanges() {
    return ui.noteEditorSnapshot !== null && getNoteEditorDraft() !== ui.noteEditorSnapshot;
  }

  function clearNoteAutoSave() {
    if (!ui.noteAutoSaveTimer) return;
    window.clearTimeout(ui.noteAutoSaveTimer);
    ui.noteAutoSaveTimer = 0;
  }

  function setNoteSaveStatus(state, customLabel = "") {
    if (!elements.noteSaveStatus || !elements.noteSaveStatusLabel) return;
    elements.noteSaveStatus.classList.remove("is-new", "is-saved", "is-saving", "is-dirty", "is-error");
    elements.noteSaveStatus.classList.add(`is-${state}`);
    const statusTitles = {
      new: "This note has not been saved yet",
      saved: "All changes are saved locally",
      saving: "Saving changes locally",
      dirty: "Changes will save automatically",
      error: "Save failed. Keep this note open and try saving again.",
    };
    elements.noteSaveStatus.title = statusTitles[state] || "";
    const icon = elements.noteSaveStatus.querySelector(".note-save-status__icon");
    if (state === "new") {
      elements.noteSaveStatusLabel.textContent = customLabel || "Not saved yet";
      if (icon) {
        icon.setAttribute("viewBox", "0 0 16 16");
        const path = icon.querySelector("path") || document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6");
        path.setAttribute("fill", "currentColor");
        if (!path.parentElement) icon.append(path);
      }
    } else if (state === "saved") {
      elements.noteSaveStatusLabel.textContent = customLabel || "Saved";
      if (icon) {
        icon.setAttribute("viewBox", "0 0 16 16");
        const path = icon.querySelector("path") || document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "m3.5 8.5 3 3 6-6");
        path.removeAttribute("fill");
        if (!path.parentElement) icon.append(path);
      }
    } else if (state === "saving") {
      elements.noteSaveStatusLabel.textContent = customLabel || "Saving…";
      if (icon) {
        icon.setAttribute("viewBox", "0 0 16 16");
        const path = icon.querySelector("path") || document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M8 2a6 6 0 1 0 6 6");
        path.removeAttribute("fill");
        if (!path.parentElement) icon.append(path);
      }
    } else if (state === "dirty") {
      elements.noteSaveStatusLabel.textContent = customLabel || "Unsaved changes";
      if (icon) {
        icon.setAttribute("viewBox", "0 0 16 16");
        const path = icon.querySelector("path") || document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M8 4a4 4 0 1 0 0.01 0");
        path.setAttribute("fill", "currentColor");
        if (!path.parentElement) icon.append(path);
      }
    } else if (state === "error") {
      elements.noteSaveStatusLabel.textContent = customLabel || "Save failed";
      if (icon) {
        icon.setAttribute("viewBox", "0 0 16 16");
        const path = icon.querySelector("path") || document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M8 3.5v5M8 12h.01");
        path.removeAttribute("fill");
        if (!path.parentElement) icon.append(path);
      }
    }
  }

  function scheduleNoteAutoSave() {
    syncStoredNoteDraft();
    clearNoteAutoSave();
    if (!isNoteEditorOpen() || ui.noteSaveInFlight) return;

    if (!hasUnsavedNoteChanges()) {
      setNoteSaveStatus("saved");
      return;
    }

    setNoteSaveStatus("dirty");

    const rawTitle = elements.noteTitle.value.trim();
    if (!rawTitle) {
      return;
    }

    const session = ui.noteEditorSession;
    ui.noteAutoSaveTimer = window.setTimeout(() => {
      ui.noteAutoSaveTimer = 0;
      if (!isCurrentNoteEditorSession(session) || !hasUnsavedNoteChanges()) return;
      saveNote({ preventDefault() {} }, { closeAfterSave: false, isAutoSave: true });
    }, NOTE_AUTO_SAVE_DELAY);
  }

  function replaceNoteContentSelection(replacement, selectionStart, selectionEnd, nextSelectionStart, nextSelectionEnd) {
    const textarea = elements.noteContent;
    textarea.focus();
    textarea.setRangeText(replacement, selectionStart, selectionEnd, "preserve");
    textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function toggleNoteContentWrapper(marker) {
    const textarea = elements.noteContent;
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText = value.slice(selectionStart, selectionEnd);
    const hasWrapper =
      selectionStart >= marker.length &&
      value.slice(selectionStart - marker.length, selectionStart) === marker &&
      value.slice(selectionEnd, selectionEnd + marker.length) === marker;

    if (hasWrapper) {
      replaceNoteContentSelection(
        selectedText,
        selectionStart - marker.length,
        selectionEnd + marker.length,
        selectionStart - marker.length,
        selectionEnd - marker.length,
      );
      return;
    }

    replaceNoteContentSelection(
      `${marker}${selectedText}${marker}`,
      selectionStart,
      selectionEnd,
      selectionStart + marker.length,
      selectionEnd + marker.length,
    );
  }

  function insertNoteLink() {
    const textarea = elements.noteContent;
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText = value.slice(selectionStart, selectionEnd) || "link text";
    const urlPlaceholder = "https://";
    const urlStart = selectionStart + selectedText.length + 3;
    replaceNoteContentSelection(
      `[${selectedText}](${urlPlaceholder})`,
      selectionStart,
      selectionEnd,
      urlStart,
      urlStart + urlPlaceholder.length,
    );
  }

  function applyNoteFormattingShortcut(key) {
    if (key === "b") {
      toggleNoteContentWrapper("**");
      return;
    }
    if (key === "i") {
      toggleNoteContentWrapper("*");
      return;
    }
    if (key === "k") insertNoteLink();
  }

  function selectedNoteContentLineRange() {
    const value = elements.noteContent.value;
    const selectionStart = elements.noteContent.selectionStart;
    const selectionEnd = elements.noteContent.selectionEnd;
    const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextLineBreak = value.indexOf("\n", selectionEnd);
    const end = nextLineBreak === -1 ? value.length : nextLineBreak;
    return { start, end, text: value.slice(start, end) };
  }

  function toggleNoteContentLinePrefix(prefix, expression) {
    const { start, end, text } = selectedNoteContentLineRange();
    const lines = text.split("\n");
    const removePrefix = lines.every((line) => expression.test(line));
    const replacement = lines
      .map((line) => removePrefix ? line.replace(expression, "") : `${prefix}${line}`)
      .join("\n");
    replaceNoteContentSelection(replacement, start, end, start, start + replacement.length);
  }

  function toggleNoteContentOrderedList() {
    const { start, end, text } = selectedNoteContentLineRange();
    const lines = text.split("\n");
    const expression = /^\d+\.\s+/;
    const removePrefix = lines.every((line) => expression.test(line));
    const replacement = lines
      .map((line, index) => removePrefix ? line.replace(expression, "") : `${index + 1}. ${line}`)
      .join("\n");
    replaceNoteContentSelection(replacement, start, end, start, start + replacement.length);
  }

  function insertNoteContentTemplate(template, selectionOffset, selectionLength = () => 0) {
    const textarea = elements.noteContent;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText = textarea.value.slice(selectionStart, selectionEnd);
    const replacement = template(selectedText);
    const nextSelectionStart = selectionStart + selectionOffset(selectedText, replacement);
    replaceNoteContentSelection(
      replacement,
      selectionStart,
      selectionEnd,
      nextSelectionStart,
      nextSelectionStart + selectionLength(selectedText, replacement),
    );
  }

  function nextFootnoteNumber() {
    const references = [...elements.noteContent.value.matchAll(/\[\^(\d+)\]/g)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter(Number.isFinite);
    return references.length ? Math.max(...references) + 1 : 1;
  }

  function applyNoteFormatting(formatting) {
    if (formatting === "bold") return toggleNoteContentWrapper("**");
    if (formatting === "italic") return toggleNoteContentWrapper("*");
    if (formatting === "strikethrough") return toggleNoteContentWrapper("~~");
    if (formatting === "inline-code") return toggleNoteContentWrapper("`");
    if (formatting === "heading") return toggleNoteContentLinePrefix("## ", /^#{1,6}\s+/);
    if (formatting === "bullet-list") return toggleNoteContentLinePrefix("- ", /^[-*+]\s+/);
    if (formatting === "task-list") return toggleNoteContentLinePrefix("- [ ] ", /^-\s\[[ xX]\]\s+/);
    if (formatting === "ordered-list") return toggleNoteContentOrderedList();
    if (formatting === "code-block") {
      return insertNoteContentTemplate(
        (selectedText) => `\`\`\`\n${selectedText}\n\`\`\``,
        () => 4,
        (selectedText) => selectedText.length,
      );
    }
    if (formatting === "table") {
      return insertNoteContentTemplate(
        () => "| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |",
        () => 2,
        () => "Column 1".length,
      );
    }
    if (formatting === "alert") {
      return insertNoteContentTemplate(
        (selectedText) => `> [!NOTE]\n> ${selectedText || "Add a note"}`,
        () => 12,
        (selectedText) => (selectedText || "Add a note").length,
      );
    }
    if (formatting === "footnote") {
      const number = nextFootnoteNumber();
      return insertNoteContentTemplate(
        (selectedText) => `${selectedText}[^${number}]\n\n[^${number}]: `,
        (selectedText, replacement) => replacement.length,
      );
    }
  }

  function isCurrentNoteEditorSession(session) {
    return ui.noteEditorSession === session && isNoteEditorOpen();
  }

  function syncNoteEditorControls() {
    const isCreatingTag = ui.pendingTagCreation?.session === ui.noteEditorSession;
    const disabled = ui.noteSaveInFlight;
    const keepTextInputsEnabled = ui.noteAutoSaveInFlight;
    const noteTypeControls = noteTypePicker ? [noteTypePicker.trigger, ...noteTypePicker.options] : [];
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
      control.disabled = disabled && !(keepTextInputsEnabled && isTextInput);
    });
    elements.tagInput.disabled = disabled || isCreatingTag;
    elements.addTag.disabled = disabled || isCreatingTag;
    const submitButton = noteSubmitButton();
    if (submitButton) {
      submitButton.disabled = disabled || isCreatingTag;
      submitButton.textContent = disabled ? "Saving…" : "Done";
    }
  }

  function openNoteEditor(note = null, {
    preserveDetail = false,
    invoker = null,
    initialMode = "edit",
    focusTitle = true,
  } = {}) {
    resetCopyButtonFeedback(elements.copyNoteContent);
    clearNoteAutoSave();
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.noteCloseAfterSaveRequested = false;
    ui.editingNoteId = note?.id || "";
    ui.selectedNoteTagIds = new Set(note?.tagIds || []);
    elements.noteForm.reset();
    setTagInputExpanded(false);
    elements.noteId.value = note?.id || "";
    elements.noteTitle.value = note?.title || "";
    elements.noteContent.value = note?.content || "";
    elements.noteContentEditor.style.removeProperty("height");
    elements.noteDialogTitle.textContent = note ? "Edit note" : "New note";
    elements.deleteNote.classList.toggle("is-hidden", !note);
    renderNoteTypeOptions(note?.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    setNoteEditorMode(initialMode);
    elements.quickViewDialog.classList.add("is-hidden");
    openNoteDetail(elements.noteDialog, preserveDetail ? null : invoker || elements.newNote);
    ui.noteEditorSnapshot = getNoteEditorDraft();
    syncToastHost();
    syncNoteEditorControls();
    setNoteSaveStatus(note ? "saved" : "new");
    scheduleNoteEditorHeight({ allowShrink: true });
    if (!preserveDetail && focusTitle && initialMode === "edit") {
      window.requestAnimationFrame(() => elements.noteTitle.focus());
    }
  }

  function restoreStoredNoteDraft(recovery) {
    const note = recovery.draft.id ? library.notes.find(({ id }) => id === recovery.draft.id) : null;
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
    syncStoredNoteDraft();
    scheduleNoteAutoSave();
    showToast("Unfinished draft restored. Save when you are ready.");
  }

  async function offerStoredNoteDraftRecovery() {
    const recovery = getStoredNoteDraft();
    if (!recovery) return;
    const recovered = await requestConfirmation({
      title: "Recover unfinished note?",
      description: "Nook found a local draft that was not saved yet. Recover it or discard it permanently.",
      confirmLabel: "Recover draft",
      cancelLabel: "Discard draft",
      tone: "primary",
      initialFocus: "confirm",
    });
    if (!recovered) {
      clearStoredNoteDraft();
      showToast("Unfinished draft discarded.");
      return;
    }
    restoreStoredNoteDraft(recovery);
  }

  function closeNoteEditor({ discardStoredDraft = false } = {}) {
    clearNoteAutoSave();
    if (discardStoredDraft) clearStoredNoteDraft();
    setNoteEditorMode("edit");
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.noteCloseAfterSaveRequested = false;
    setTagInputExpanded(false);
    elements.noteDialog.classList.add("is-hidden");
    elements.noteContentEditor.style.removeProperty("height");
    ui.editingNoteId = "";
    ui.selectedNoteTagIds.clear();
    ui.noteEditorSnapshot = null;
    closeNoteDetail();
    ui.viewInvoker = null;
    if (ui.externalRefreshPending) {
      ui.externalRefreshPending = false;
      refreshLibrary().catch((error) => showError(error, "We could not refresh the local library."));
    }
  }

  async function requestNoteEditorClose({ afterClose = null } = {}) {
    if (ui.noteSaveInFlight) {
      ui.noteCloseAfterSaveRequested = true;
      return;
    }
    if (!hasUnsavedNoteChanges()) {
      closeNoteEditor();
      afterClose?.();
      return;
    }
    if (elements.noteTitle.value.trim()) {
      await saveNote({ preventDefault() {} }, { closeAfterSave: true });
      afterClose?.();
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
    ui.tagInputExpanded = Boolean(expanded);
    elements.tagInputRow.hidden = !ui.tagInputExpanded;
    elements.addTag.setAttribute("aria-expanded", String(ui.tagInputExpanded));

    if (!ui.tagInputExpanded) {
      elements.tagInput.value = "";
      elements.tagSuggestions.replaceChildren();
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
    const pending = { session, promise: null };
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
        scheduleNoteAutoSave();
        showToast(`Tag “${tagLabel(tag)}” created.`);
      } catch (error) {
        if (isCurrentNoteEditorSession(session)) showError(error);
      } finally {
        if (ui.pendingTagCreation === pending) ui.pendingTagCreation = null;
        if (isCurrentNoteEditorSession(session)) syncNoteEditorControls();
      }
    })();
    pending.promise = operation;
    return operation;
  }

  async function saveNote(event, { closeAfterSave = true, isAutoSave = false } = {}) {
    event?.preventDefault?.();
    clearNoteAutoSave();
    if (ui.noteSaveInFlight) {
      if (closeAfterSave) ui.noteCloseAfterSaveRequested = true;
      return;
    }
    if (isAutoSave && !elements.noteTitle.value.trim()) return;
    const session = ui.noteEditorSession;
    const pendingTagCreation = ui.pendingTagCreation;
    if (pendingTagCreation?.session === session) {
      await pendingTagCreation.promise;
      if (!isCurrentNoteEditorSession(session)) return;
    }

    ui.noteSaveInFlight = true;
    ui.noteAutoSaveInFlight = isAutoSave;
    setNoteSaveStatus("saving");
    syncNoteEditorControls();
    const input = {
      id: elements.noteId.value || undefined,
      title: elements.noteTitle.value,
      typeId: elements.noteType.value,
      tagIds: [...ui.selectedNoteTagIds],
      content: elements.noteContent.value,
    };
    let didSave = false;
    try {
      const isEditing = Boolean(input.id);
      const savedNote = await storage.saveNote(input);
      await refreshLibrary({ broadcast: true });
      didSave = true;
      if (isCurrentNoteEditorSession(session)) {
        elements.noteId.value = savedNote.id;
        ui.editingNoteId = savedNote.id;
        elements.noteDialogTitle.textContent = "Edit note";
        elements.deleteNote.classList.remove("is-hidden");
        renderNoteMetadata(savedNote);
        ui.noteEditorSnapshot = createNoteEditorDraft({ ...input, id: savedNote.id });
        syncStoredNoteDraft();
        setNoteSaveStatus("saved");
        if (closeAfterSave) closeNoteEditor();
      }
      if (!isAutoSave) {
        showToast(closeAfterSave ? (isEditing ? "Note updated." : "Note saved.") : "Changes saved. Keep editing.");
      }
    } catch (error) {
      if (isCurrentNoteEditorSession(session)) {
        ui.noteCloseAfterSaveRequested = false;
        setNoteSaveStatus("error");
        showError(error, "We could not save this note.");
      }
    } finally {
      if (isCurrentNoteEditorSession(session)) {
        ui.noteSaveInFlight = false;
        ui.noteAutoSaveInFlight = false;
        syncNoteEditorControls();
        if (isAutoSave && didSave && hasUnsavedNoteChanges()) scheduleNoteAutoSave();
        if (ui.noteCloseAfterSaveRequested) {
          ui.noteCloseAfterSaveRequested = false;
          if (didSave && hasUnsavedNoteChanges()) {
            void saveNote({ preventDefault() {} }, { closeAfterSave: true });
          } else if (didSave) {
            closeNoteEditor();
            showToast("Note saved.");
          }
        }
      }
    }
  }

  async function deleteNoteWithConfirmation(note) {
    if (!note || ui.noteSaveInFlight) return;
    const confirmed = await requestConfirmation({
      title: "Move note to Trash?",
      description: `“${note.title}” will be moved to Trash. You can restore it later or use Undo now.`,
      confirmLabel: "Move to Trash",
      cancelLabel: "Keep note",
    });
    if (!confirmed) return;
    try {
      await storage.deleteNote(note.id);
      await refreshLibrary({ broadcast: true });
      if (ui.editingNoteId === note.id) closeNoteEditor({ discardStoredDraft: true });
      showToast("Note moved to Trash.", "success", {
        label: "Undo",
        onClick: async () => {
          try {
            await storage.restoreNote(note.id);
            await refreshLibrary({ broadcast: true });
            showToast("Note restored.");
          } catch (error) {
            showError(error, "We could not undo moving this note to Trash.");
          }
        },
      });
    } catch (error) {
      showError(error, "We could not delete this note.");
    }
  }

  function setManagementTab(tab) {
    ui.managementTab = tab;
    const typesActive = tab === "types";
    elements.typesTab.classList.toggle("is-active", typesActive);
    elements.tagsTab.classList.toggle("is-active", !typesActive);
    elements.typesTab.setAttribute("aria-selected", String(typesActive));
    elements.tagsTab.setAttribute("aria-selected", String(!typesActive));
    elements.typesTab.tabIndex = typesActive ? 0 : -1;
    elements.tagsTab.tabIndex = typesActive ? -1 : 0;
    elements.typesPanel.classList.toggle("is-hidden", !typesActive);
    elements.tagsPanel.classList.toggle("is-hidden", typesActive);
  }

  function syncManagementControls() {
    const typeCount = library.types.length;
    const tagCount = library.tags.length;
    const showingTypes = ui.managementCreateKind === "types";
    const showingTags = ui.managementCreateKind === "tags";

    elements.typesTabCount.textContent = String(typeCount);
    elements.tagsTabCount.textContent = String(tagCount);
    elements.typesTab.setAttribute("aria-label", `Note types, ${pluralize(typeCount, "type")}`);
    elements.tagsTab.setAttribute("aria-label", `Tags, ${pluralize(tagCount, "tag")}`);
    elements.newTypeForm.classList.toggle("is-hidden", !showingTypes);
    elements.newTagForm.classList.toggle("is-hidden", !showingTags);
    elements.addTypeToggle.setAttribute("aria-expanded", String(showingTypes));
    elements.addTagToggle.setAttribute("aria-expanded", String(showingTags));
    elements.addTypeToggle.textContent = showingTypes ? "Cancel" : "+ New type";
    elements.addTagToggle.textContent = showingTags ? "Cancel" : "+ New tag";
    elements.addTypeToggle.classList.toggle("button-primary", !showingTypes);
    elements.addTypeToggle.classList.toggle("button-secondary", showingTypes);
    elements.addTagToggle.classList.toggle("button-primary", !showingTags);
    elements.addTagToggle.classList.toggle("button-secondary", showingTags);
  }

  function setManagementCreateMode(kind = "") {
    const wasEditing = Boolean(ui.managementEditing);
    ui.managementCreateKind = kind;
    if (kind) ui.managementEditing = null;
    syncManagementControls();
    if (kind && wasEditing) renderManagement();
    if (!kind) return;
    window.requestAnimationFrame(() => {
      (kind === "types" ? elements.newTypeName : elements.newTagName).focus({ preventScroll: true });
    });
  }

  function managementQuery(kind) {
    return ui.managementQueries[kind].trim().toLocaleLowerCase();
  }

  function managementMatchesQuery(kind, value) {
    const query = managementQuery(kind);
    return !query || value.toLocaleLowerCase().includes(query);
  }

  function startManagementEdit(kind, id) {
    ui.managementQueries[kind] = "";
    const search = kind === "types" ? elements.typesManagementSearch : elements.tagsManagementSearch;
    search.value = "";
    ui.managementEditing = { kind, id };
    setManagementCreateMode("");
    renderManagement();
    window.requestAnimationFrame(() => {
      const list = kind === "types" ? elements.typesList : elements.tagsList;
      list.querySelector(`[data-management-edit-id="${id}"] input`)?.focus({ preventScroll: true });
    });
  }

  function cancelManagementEdit() {
    ui.managementEditing = null;
    renderManagement();
  }

  function handleManagementTabKeydown(event) {
    const tabs = [elements.typesTab, elements.tagsTab];
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;

    let nextIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setManagementTab(nextTab === elements.typesTab ? "types" : "tags");
    nextTab.focus();
  }

  function colorLabel(color) {
    return `${color[0].toUpperCase()}${color.slice(1)}`;
  }

  function createColorOptions(selectedColor) {
    const fragment = document.createDocumentFragment();
    storage.TYPE_COLORS.forEach((color) => {
      const option = createElement("option", { value: color, text: colorLabel(color) });
      option.selected = color === selectedColor;
      fragment.append(option);
    });
    return fragment;
  }

  function closeColorPicker(picker) {
    picker.menu.hidden = true;
    picker.trigger.setAttribute("aria-expanded", "false");
    openColorPickers.delete(picker);
  }

  function setColorPickerValue(select, color, { focusTrigger = false } = {}) {
    const picker = colorPickerInstances.get(select);
    const nextColor = storage.TYPE_COLORS.includes(color) ? color : storage.TYPE_COLORS[0];
    select.value = nextColor;
    if (!picker) return;

    picker.dot.className = `type-dot type-dot--${nextColor}`;
    picker.label.textContent = colorLabel(nextColor);
    picker.options.forEach((option) => {
      const selected = option.dataset.color === nextColor;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    if (focusTrigger) picker.trigger.focus();
  }

  function enhanceColorSelect(select) {
    if (colorPickerInstances.has(select)) return colorPickerInstances.get(select);

    const picker = createElement("div", { className: "color-picker" });
    const trigger = createElement("button", {
      className: "color-picker__trigger",
      type: "button",
      attributes: {
        "aria-label": select.getAttribute("aria-label") || "Choose a color",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const dot = createElement("span", { attributes: { "aria-hidden": "true" } });
    const label = createElement("span", { className: "color-picker__label" });
    trigger.append(dot, label);
    const menu = createElement("div", { className: "color-picker__menu", attributes: { role: "listbox" } });
    menu.hidden = true;
    const options = storage.TYPE_COLORS.map((color) => {
      const option = createElement("button", {
        className: "color-picker__option",
        type: "button",
        text: colorLabel(color),
        dataset: { color },
        attributes: { role: "option", "aria-selected": "false" },
      });
      option.prepend(createElement("span", { className: `type-dot type-dot--${color}`, attributes: { "aria-hidden": "true" } }));
      option.addEventListener("click", () => {
        setColorPickerValue(select, color, { focusTrigger: true });
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeColorPicker(pickerState);
      });
      return option;
    });
    menu.append(...options);

    select.classList.add("color-picker__native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.hidden = true;
    select.parentElement?.insertBefore(picker, select);
    picker.append(select, trigger, menu);

    const pickerState = { root: picker, select, trigger, dot, label, menu, options };
    colorPickerInstances.set(select, pickerState);
    setColorPickerValue(select, select.value);

    trigger.addEventListener("click", () => {
      if (menu.hidden) {
        openColorPickers.forEach((openPicker) => closeColorPicker(openPicker));
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        openColorPickers.add(pickerState);
        options.find((option) => option.dataset.color === select.value)?.focus();
      } else {
        closeColorPicker(pickerState);
      }
    });
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        if (menu.hidden) trigger.click();
      }
    });
    menu.addEventListener("keydown", (event) => {
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeColorPicker(pickerState);
        trigger.focus();
        return;
      }
      if (event.key === "Tab") {
        closeColorPicker(pickerState);
        return;
      }
      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
      else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = options.length - 1;
      else return;
      event.preventDefault();
      options[nextIndex].focus();
    });
    select.addEventListener("change", () => setColorPickerValue(select, select.value));
    return pickerState;
  }

  function renderTypeManagement() {
    const usageCounts = new Map();
    library.notes.forEach((note) => usageCounts.set(note.typeId, (usageCounts.get(note.typeId) || 0) + 1));
    elements.typesList.replaceChildren();
    const visibleTypes = library.types.filter((type) => managementMatchesQuery("types", type.name));
    if (!visibleTypes.length) {
      const query = ui.managementQueries.types.trim();
      elements.typesList.append(
        createElement("p", { className: "management-empty", text: query ? `No note types match “${query}”.` : "No note types yet." }),
      );
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleTypes.forEach((type) => {
      const usage = usageCounts.get(type.id) || 0;
      const isEditing = ui.managementEditing?.kind === "types" && ui.managementEditing.id === type.id;
      const row = isEditing
        ? createElement("form", { className: "management-row management-row--type", dataset: { managementEditId: type.id } })
        : createElement("div", { className: "management-row management-row--summary management-row--type" });
      const main = createElement("div", { className: "management-row__main" });
      main.append(createElement("span", { className: `type-dot type-dot--${safeTypeColor(type)}`, attributes: { "aria-hidden": "true" } }));

      if (isEditing) {
        const nameInput = createElement("input", {
          type: "text",
          value: type.name,
          attributes: { "aria-label": `Name for ${type.name}`, maxlength: "48", required: "" },
        });
        const color = createElement("select", {
          className: "color-select",
          attributes: { "aria-label": `Color for ${type.name}` },
        });
        color.append(createColorOptions(safeTypeColor(type)));
        const colorPicker = enhanceColorSelect(color);
        const controls = createElement("div", { className: "management-row__controls management-row__controls--editing" });
        const cancel = createElement("button", { className: "button button-secondary button-compact", type: "button", text: "Cancel" });
        const save = createElement("button", { className: "button button-primary button-compact", type: "submit", text: "Save" });
        main.append(nameInput);
        controls.append(colorPicker.root, createElement("span", { className: "usage-count", text: pluralize(usage, "note") }), cancel, save);
        row.append(main, controls);
        cancel.addEventListener("click", cancelManagementEdit);
        row.addEventListener("submit", async (event) => {
          event.preventDefault();
          try {
            await storage.updateType(type.id, { name: nameInput.value, color: color.value });
            ui.managementEditing = null;
            await refreshLibrary({ broadcast: true });
            showToast("Note type updated.");
          } catch (error) {
            showError(error);
          }
        });
      } else {
        const actions = createElement("div", { className: "management-row__actions" });
        const edit = createElement("button", {
          className: "button button-secondary button-compact",
          type: "button",
          text: "Edit",
          attributes: { "aria-label": `Edit ${type.name}` },
        });
        main.append(createElement("span", { className: "management-row__name", text: type.name }));
        if (type.id === storage.FALLBACK_TYPE_ID) main.append(createElement("span", { className: "management-row__default", text: "Default" }));
        main.append(createElement("span", { className: "usage-count", text: pluralize(usage, "note") }));
        actions.append(edit);
        edit.addEventListener("click", () => startManagementEdit("types", type.id));

        if (type.id !== storage.FALLBACK_TYPE_ID) {
          const remove = createElement("button", {
            className: "button button-danger button-compact",
            type: "button",
            text: "Delete",
            attributes: { "aria-label": `Delete ${type.name}` },
          });
          actions.append(remove);
          remove.addEventListener("click", async () => {
            const affected = usageCounts.get(type.id) || 0;
            const fallbackType = typeFor(storage.FALLBACK_TYPE_ID);
            const description = affected
              ? `“${type.name}” will be deleted. ${pluralize(affected, "note")} will move to ${fallbackType.name}.`
              : `“${type.name}” will be deleted.`;
            const confirmed = await requestConfirmation({
              title: "Delete note type?",
              description,
              confirmLabel: "Delete type",
              cancelLabel: "Keep type",
            });
            if (!confirmed) return;
            try {
              await storage.deleteType(type.id);
              await refreshLibrary({ broadcast: true });
              showToast(affected ? `Type deleted; ${pluralize(affected, "note")} moved to ${fallbackType.name}.` : "Note type deleted.");
            } catch (error) {
              showError(error);
            }
          });
        }
        row.append(main, actions);
      }
      fragment.append(row);
    });
    elements.typesList.append(fragment);
  }

  function renderTagManagement() {
    const usageCounts = new Map();
    library.notes.forEach((note) =>
      note.tagIds.forEach((tagId) => usageCounts.set(tagId, (usageCounts.get(tagId) || 0) + 1)),
    );
    elements.tagsList.replaceChildren();
    const visibleTags = library.tags.filter((tag) => managementMatchesQuery("tags", tagLabel(tag)));
    if (!visibleTags.length) {
      const query = ui.managementQueries.tags.trim();
      elements.tagsList.append(
        createElement("p", {
          className: "management-empty",
          text: query ? `No tags match “${query}”.` : "No tags yet. Add one here or while editing a note.",
        }),
      );
      return;
    }
    const fragment = document.createDocumentFragment();
    visibleTags.forEach((tag) => {
      const usage = usageCounts.get(tag.id) || 0;
      const label = tagLabel(tag);
      const isEditing = ui.managementEditing?.kind === "tags" && ui.managementEditing.id === tag.id;
      const row = isEditing
        ? createElement("form", { className: "management-row", dataset: { managementEditId: tag.id } })
        : createElement("div", { className: "management-row management-row--summary" });
      const main = createElement("div", { className: "management-row__main" });
      main.append(createElement("span", { className: "tag-marker", attributes: { "aria-hidden": "true" } }));

      if (isEditing) {
        const nameInput = createElement("input", {
          type: "text",
          value: label,
          attributes: { "aria-label": `Name for ${label}`, maxlength: "48", required: "" },
        });
        const controls = createElement("div", { className: "management-row__controls management-row__controls--editing" });
        const cancel = createElement("button", { className: "button button-secondary button-compact", type: "button", text: "Cancel" });
        const save = createElement("button", { className: "button button-primary button-compact", type: "submit", text: "Save" });
        main.append(nameInput);
        controls.append(createElement("span", { className: "usage-count", text: pluralize(usage, "note") }), cancel, save);
        row.append(main, controls);
        cancel.addEventListener("click", cancelManagementEdit);
        row.addEventListener("submit", async (event) => {
          event.preventDefault();
          try {
            await storage.updateTag(tag.id, { name: nameInput.value });
            ui.managementEditing = null;
            await refreshLibrary({ broadcast: true });
            showToast("Tag updated.");
          } catch (error) {
            showError(error);
          }
        });
      } else {
        const actions = createElement("div", { className: "management-row__actions" });
        const edit = createElement("button", {
          className: "button button-secondary button-compact",
          type: "button",
          text: "Edit",
          attributes: { "aria-label": `Edit ${label}` },
        });
        const remove = createElement("button", {
          className: "button button-danger button-compact",
          type: "button",
          text: "Delete",
          attributes: { "aria-label": `Delete ${label}` },
        });
        main.append(createElement("span", { className: "management-row__name", text: label }));
        main.append(createElement("span", { className: "usage-count", text: pluralize(usage, "note") }));
        actions.append(edit, remove);
        edit.addEventListener("click", () => startManagementEdit("tags", tag.id));
        remove.addEventListener("click", async () => {
          const affected = usageCounts.get(tag.id) || 0;
          const description = affected
            ? `“${label}” will be deleted and removed from ${pluralize(affected, "note")}.`
            : `“${label}” will be deleted.`;
          const confirmed = await requestConfirmation({
            title: "Delete tag?",
            description,
            confirmLabel: "Delete tag",
            cancelLabel: "Keep tag",
          });
          if (!confirmed) return;
          try {
            await storage.deleteTag(tag.id);
            await refreshLibrary({ broadcast: true });
            showToast(affected ? `Tag removed from ${pluralize(affected, "note")}.` : "Tag deleted.");
          } catch (error) {
            showError(error);
          }
        });
        row.append(main, actions);
      }
      fragment.append(row);
    });
    elements.tagsList.append(fragment);
  }

  function renderManagement() {
    renderTypeManagement();
    renderTagManagement();
    syncManagementControls();
    setManagementTab(ui.managementTab);
  }

  function renderLibrary() {
    clearSearchRenderTimer();
    ensureUiReferencesAreValid();
    renderSidebar();
    renderActiveFilters();
    renderNotes();
    renderManagement();
    if (isNoteEditorOpen()) {
      renderNoteTypeOptions(elements.noteType.value);
      renderSelectedNoteTags();
      renderTagSuggestions();
      syncNoteEditorControls();
    }
    if (isQuickViewOpen()) {
      const note = noteForQuickView();
      if (note || !elements.noteId.value) renderQuickView();
      else closeQuickView({ restoreFocus: false });
    }
  }

  function renderSearchResults() {
    renderActiveFilters();
    renderNotes();
    syncClearFiltersState();
  }

  async function refreshLibrary({ broadcast = false, external = false } = {}) {
    if (external && isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      ui.externalRefreshPending = true;
      showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      return;
    }
    const snapshot = await storage.getSnapshot();
    library.notes = snapshot.notes;
    library.types = snapshot.types;
    library.tags = snapshot.tags;
    library.searchIndex = new Map(
      snapshot.notes.map((note) => [note.id, `${note.title}\n${note.content}`.toLocaleLowerCase()]),
    );
    renderLibrary();
    if (broadcast) notifyLibraryMutation();
  }

  function openOrganize(tab = "types") {
    setManagementTab(tab);
    renderManagement();
    if (!elements.organizeDialog.open) elements.organizeDialog.showModal();
    syncToastHost();
  }

  function closeOrganize() {
    if (elements.organizeDialog.open) elements.organizeDialog.close();
  }

  async function addNewType(event) {
    event.preventDefault();
    try {
      const type = await storage.addType({
        name: elements.newTypeName.value,
        color: elements.newTypeColor.value,
      });
      elements.newTypeForm.reset();
      setColorPickerValue(elements.newTypeColor, "indigo");
      setManagementCreateMode("");
      await refreshLibrary({ broadcast: true });
      showToast(`Note type “${type.name}” added.`);
    } catch (error) {
      showError(error);
    }
  }

  async function addNewTag(event) {
    event.preventDefault();
    try {
      const tag = await storage.addTag({ name: elements.newTagName.value });
      elements.newTagForm.reset();
      setManagementCreateMode("");
      await refreshLibrary({ broadcast: true });
      showToast(`Tag “${tagLabel(tag)}” added.`);
    } catch (error) {
      showError(error);
    }
  }

  function downloadExport(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `personal-notes-backup-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeNoteFileName(title) {
    return (
      String(title || "note")
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 96) || "note"
    );
  }

  function plainTextFromMarkdown(source) {
    const container = document.createElement("div");
    container.className = "quick-view-content";
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    document.body.append(container);
    globalThis.NookMarkdown.renderInto(container, source);
    const text = (container.innerText || container.textContent || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    container.remove();
    return text;
  }

  function downloadNoteFile(note, format) {
    const isMarkdown = format === "md";
    const content = isMarkdown ? note.content : plainTextFromMarkdown(note.content);
    const blob = new Blob([`${content}${content ? "\n" : ""}`], {
      type: isMarkdown ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeNoteFileName(note.title)}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCurrentNote(format) {
    const note = previewNoteFromEditor();
    try {
      downloadNoteFile(note, format);
      showToast(`Exported “${note.title}” as .${format}.`);
    } catch (error) {
      showError(error, "We could not export this note.");
    }
  }

  async function exportLibrary() {
    try {
      const backup = await storage.buildExport();
      downloadExport(backup);
      recordBackupExport();
      showToast(`Backup exported with ${pluralize(backup.data.notes.length, "note")}.`);
    } catch (error) {
      showError(error, "We could not export this backup.");
    }
  }

  async function importLibrary() {
    const file = elements.importInput.files?.[0];
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const preview = storage.inspectBackup(value);
      const { notes, types, tags } = preview.counts;
      const confirmed = await requestConfirmation({
        title: "Replace library?",
        description: `Import ${pluralize(notes, "note")}, ${pluralize(types, "type")}, and ${pluralize(tags, "tag")}? This will replace the current library.`,
        confirmLabel: "Import backup",
        cancelLabel: "Keep library",
      });
      if (!confirmed) return;
      await storage.importBackup(value);
      resetToFirstPage();
      ui.typeId = "all";
      ui.tagIds.clear();
      ui.todayOnly = false;
      ui.updatedTodayOnly = false;
      ui.trashOnly = false;
      persistFilters();
      ui.query = "";
      elements.search.value = "";
      await refreshLibrary({ broadcast: true });
      showToast(preview.format === "legacy" ? "Legacy library imported and upgraded." : "Backup imported successfully.");
    } catch (error) {
      showError(error, "The selected file could not be imported.");
    } finally {
      elements.importInput.value = "";
    }
  }

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
        ui.theme = event.newValue;
        syncThemeUI();
      }
    });
    elements.themeToggle.addEventListener("click", () => setTheme(getNextTheme(ui.theme)));
    elements.organize.addEventListener("click", () => openOrganize());
    elements.export.addEventListener("click", () => exportLibrary());
    elements.import.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", importLibrary);
    elements.newNote.addEventListener("click", () => openNoteEditor());
    elements.search.addEventListener("input", () => {
      ui.query = elements.search.value;
      resetToFirstPage();
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
      renderNotes();
    });
    elements.focusView.addEventListener("click", () => setViewMode("focus"));
    elements.comfortableView.addEventListener("click", () => setViewMode("comfortable"));
    elements.compactView.addEventListener("click", () => setViewMode("compact"));
    elements.noteForm.addEventListener("submit", saveNote);
    elements.noteTitle.addEventListener("input", () => {
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
    elements.noteType.addEventListener("change", scheduleNoteAutoSave);
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
      renderTypeManagement();
    });
    elements.tagsManagementSearch.addEventListener("input", () => {
      ui.managementQueries.tags = elements.tagsManagementSearch.value;
      if (ui.managementEditing?.kind === "tags") ui.managementEditing = null;
      renderTagManagement();
    });
    elements.newTypeForm.addEventListener("submit", addNewType);
    elements.newTagForm.addEventListener("submit", addNewTag);
    document.addEventListener("pointerdown", (event) => {
      openColorPickers.forEach((picker) => {
        if (!picker.select.parentElement.contains(event.target)) closeColorPicker(picker);
      });
      if (noteTypePicker && !noteTypePicker.root.contains(event.target)) closeNoteTypePicker();
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

  bootstrap();
})();
