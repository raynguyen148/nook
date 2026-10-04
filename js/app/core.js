globalThis[Symbol.for("nook.app.modules")].register("core", (app) => {
  "use strict";

  const { api, theme } = app;
  const storage = globalThis.PersonalNotesStorage;
  const PAGE_SIZE = 30;
  const NOTE_AUTO_SAVE_DELAY = 1500;
  const THEME_STORAGE_KEY = theme.storageKey;
  const THEMES = theme.modes;
  const SIDEBAR_COLLAPSED_STORAGE_KEY = "nook:sidebar-collapsed";
  const VIEW_MODE_STORAGE_KEY = "nook:notes-view-mode";
  const NOTE_PREVIEW_LINES_STORAGE_KEY = "nook:note-preview-lines";
  const NOTE_PREVIEW_LINES_MIN = 2;
  const NOTE_PREVIEW_LINES_MAX = 10;
  const NOTE_PREVIEW_LINES_DEFAULT = 3;
  const NOTE_DETAIL_FONT_SIZE_STORAGE_KEY = "nook:note-detail-font-size";
  const NOTE_DETAIL_FONT_SIZE_MIN = 14;
  const NOTE_DETAIL_FONT_SIZE_MAX = 18;
  const NOTE_DETAIL_FONT_SIZE_DEFAULT = 16;
  const VIEW_MODE_ANIMATION_DURATION = 180;
  const VIEW_MODE_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
  const MOTION = Object.freeze({
    micro: 120,
    short: 180,
    medium: 260,
    long: 360,
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    easeIn: "cubic-bezier(0.7, 0, 0.84, 0)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  });
  const FILTER_STORAGE_KEY = "nook:active-filters";
  const SORT_STORAGE_KEY = "nook:notes-sort";
  const SORT_VALUES = [
    "created-desc",
    "created-asc",
    "updated-desc",
    "updated-asc",
    "title-asc",
    "title-desc",
  ];
  const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const elements = app.elements;
  const storedFilters = getStoredFilters();
  const library = { notes: [], types: [], tags: [], searchIndex: new Map() };
  const ui = {
    theme: getStoredTheme(),
    glass: theme.glass.read(),
    backgroundStyle: theme.backgroundStyle ? theme.backgroundStyle.read() : "ambient",
    sidebarCollapsed: getStoredSidebarCollapsed(),
    query: "",
    typeId: storedFilters.trashOnly ? "all" : storedFilters.typeId,
    tagIds: storedFilters.trashOnly ? new Set() : storedFilters.tagIds,
    todayOnly: storedFilters.trashOnly ? false : storedFilters.todayOnly,
    updatedTodayOnly: storedFilters.trashOnly ? false : storedFilters.updatedTodayOnly,
    trashOnly: storedFilters.trashOnly,
    sort: getStoredSort(),
    viewMode: getStoredViewMode(),
    notePreviewLines: getStoredNotePreviewLines(),
    noteDetailFontSize: getStoredNoteDetailFontSize(),
    page: 1,
    pageSize: PAGE_SIZE,
    paginationColumns: 0,
    editingNoteId: "",
    selectedNoteTagIds: new Set(),
    noteEditorSession: 0,
    pendingTagCreation: null,
    tagInputExpanded: false,
    tagFiltersExpanded: false,
    noteSaveInFlight: false,
    noteAutoSaveInFlight: false,
    noteCloseAfterSaveRequested: false,
    noteAutoSaveTimer: 0,
    noteEditorMode: "edit",
    noteScrollMap: null,
    noteScrollMapFrame: 0,
    noteScrollSyncTarget: null,
    noteScrollSyncTargetTop: 0,
    noteScrollSyncResetFrame: 0,
    noteScrollLeader: null,
    secondaryScrollMap: null,
    secondaryScrollMapFrame: 0,
    secondaryScrollSyncTarget: null,
    secondaryScrollSyncTargetTop: 0,
    secondaryScrollSyncResetFrame: 0,
    secondaryScrollLeader: null,
    noteEditorPreviewFrame: 0,
    noteEditorSnapshot: null,
    notePreviewHeaderCollapsed: false,
    viewingNoteId: "",
    viewInvoker: null,
    detailSourceCard: null,
    detailScrollTop: 0,
    detailClosing: false,
    dualPaneOpen: false,
    secondaryClosing: false,
    activePane: "primary",
    secondaryNoteId: "",
    secondaryNoteTypeId: "",
    secondarySelectedNoteTagIds: new Set(),
    secondaryTagInputExpanded: false,
    secondaryNoteMode: "preview",
    secondaryNotePreviewHeaderCollapsed: false,
    secondaryNoteDirty: false,
    secondaryAutoSaveTimer: 0,
    pendingSecondaryTagCreation: null,
    notePickers: {
      primary: { open: false, query: "", sort: "updated-desc", viewMode: "focus", scrollTop: 0 },
      secondary: { open: false, query: "", sort: "updated-desc", viewMode: readSecondaryViewMode(), scrollTop: 0 },
    },
    copyInFlight: false,
    restoreViewFocus: true,
    afterQuickViewClose: null,
    pendingConfirmation: null,
    pendingConflictResolution: null,
    historyInvoker: null,
    historyNoteId: "",
    historySelectedVersionId: "",
    waitingServiceWorker: null,
    managementTab: "types",
    managementQueries: { types: "", tags: "" },
    managementCreateKind: "",
    managementEditing: null,
    deleteLibraryInvoker: null,
    deleteLibraryInFlight: false,
    deleteLibraryBackupInFlight: false,
    toastTimer: 0,
    toastPopoverTimer: 0,
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
    return theme.readMode();
  }

  function getStoredSidebarCollapsed() {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function getStoredViewMode() {
    try {
      const storedMode = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (storedMode === "focus") return "compact";
      return ["compact", "comfortable", "grid"].includes(storedMode) ? storedMode : "comfortable";
    } catch {
      return "comfortable";
    }
  }

  function normalizeNotePreviewLines(value) {
    if (value == null || String(value).trim() === "") return NOTE_PREVIEW_LINES_DEFAULT;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return NOTE_PREVIEW_LINES_DEFAULT;
    return Math.min(NOTE_PREVIEW_LINES_MAX, Math.max(NOTE_PREVIEW_LINES_MIN, parsed));
  }

  function getStoredNotePreviewLines() {
    try {
      return normalizeNotePreviewLines(window.localStorage.getItem(NOTE_PREVIEW_LINES_STORAGE_KEY));
    } catch {
      return NOTE_PREVIEW_LINES_DEFAULT;
    }
  }

  function normalizeNoteDetailFontSize(value) {
    if (value === null || String(value).trim() === "") return NOTE_DETAIL_FONT_SIZE_DEFAULT;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return NOTE_DETAIL_FONT_SIZE_DEFAULT;
    return Math.min(NOTE_DETAIL_FONT_SIZE_MAX, Math.max(NOTE_DETAIL_FONT_SIZE_MIN, parsed));
  }

  function getStoredNoteDetailFontSize() {
    try {
      return normalizeNoteDetailFontSize(window.localStorage.getItem(NOTE_DETAIL_FONT_SIZE_STORAGE_KEY));
    } catch {
      return NOTE_DETAIL_FONT_SIZE_DEFAULT;
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

  function nowIso() {
    return new Date().toISOString();
  }

  function isValidTimestamp(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
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
    elements.settingsShortcutModifiers.forEach((element) => {
      element.textContent = modifier;
    });
    elements.noteSaveShortcutHelp.textContent = `Press 1 for the Markdown editor, 2 for split preview, and 3 for Preview. Press T to cycle the theme when focus is outside text fields and editable controls. Formatting shortcuts support bold, italic, links, inline code, numbered lists, and bullet lists. Quick save keeps this note open: ${modifierName}, Shift, and S. Save note and close: ${modifierName} and Enter.`;
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

  function readSecondaryViewMode() {
    try {
      return window.localStorage.getItem("nook:secondary-view-mode") === "comfortable" ? "comfortable" : "focus";
    } catch {
      return "focus";
    }
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
    if (note?.deletedAt) {
      return {
        text: `Deleted ${formatRelativeNoteDate(note.deletedAt)}`,
        label: "Deleted",
        datetime: note.deletedAt,
        title: `Deleted ${formatFullDate(note.deletedAt)} · Created ${formatFullDate(note.createdAt)}`,
      };
    }

    if (isEdited) {
      return {
        text: `Updated ${formatRelativeNoteDate(note.updatedAt)}`,
        label: "Updated",
        datetime: note.updatedAt,
        title: `Updated ${formatFullDate(note.updatedAt)} · Created ${formatFullDate(note.createdAt)}`,
      };
    }

    return {
      text: `Created ${formatRelativeNoteDate(note.createdAt)}`,
      label: "Created",
      datetime: note.createdAt,
      title: `Created ${formatFullDate(note.createdAt)}`,
    };
  }

  function formatRelativeNoteDate(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "unknown date";
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "just now";
    for (const [unit, size] of [["y", 31536000], ["mo", 2592000], ["w", 604800], ["d", 86400], ["h", 3600], ["m", 60]]) {
      if (seconds >= size) return `${Math.floor(seconds / size)}${unit} ago`;
    }
    return "just now";
  }

  function formatFullDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown date" : fullDateFormatter.format(date);
  }

  Object.assign(app, {
    storage,
    elements,
    library,
    ui,
    constants: Object.freeze({
      PAGE_SIZE,
      NOTE_AUTO_SAVE_DELAY,
      MOTION,
      FILTER_STORAGE_KEY,
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      NOTE_PREVIEW_LINES_DEFAULT,
      NOTE_PREVIEW_LINES_MAX,
      NOTE_PREVIEW_LINES_MIN,
      NOTE_PREVIEW_LINES_STORAGE_KEY,
      NOTE_DETAIL_FONT_SIZE_DEFAULT,
      NOTE_DETAIL_FONT_SIZE_MAX,
      NOTE_DETAIL_FONT_SIZE_MIN,
      NOTE_DETAIL_FONT_SIZE_STORAGE_KEY,
      SORT_STORAGE_KEY,
      THEME_STORAGE_KEY,
      THEMES,
      VIEW_MODE_ANIMATION_DURATION,
      VIEW_MODE_ANIMATION_EASING,
      VIEW_MODE_STORAGE_KEY,
    }),
  });

  Object.assign(api, {
    getStoredSidebarCollapsed,
    getStoredViewMode,
    normalizeNotePreviewLines,
    getStoredNotePreviewLines,
    normalizeNoteDetailFontSize,
    getStoredNoteDetailFontSize,
    getStoredSort,
    getStoredFilters,
    nowIso,
    isValidTimestamp,
    usesMacKeyboardShortcuts,
    syncSearchShortcutHint,
    syncNoteSaveShortcutHint,
    createElement,
    typeFor,
    tagFor,
    tagLabel,
    cleanTagInput,
    safeTypeColor,
    pluralize,
    formatShortDate,
    getNoteCardDateInfo,
    formatRelativeNoteDate,
    formatFullDate,
  });
});
