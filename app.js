(() => {
  "use strict";

  const storage = globalThis.PersonalNotesStorage;
  const PAGE_SIZE = 30;
  const NOTE_AUTO_SAVE_DELAY = 5000;
  const THEME_STORAGE_KEY = "nook:theme";
  const VIEW_MODE_STORAGE_KEY = "nook:notes-view-mode";
  const FILTER_STORAGE_KEY = "nook:active-filters";
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

  const elements = {
    appShell: document.querySelector(".app-shell"),
    allNotesFilter: document.querySelector("#all-notes-filter"),
    allNotesCount: document.querySelector("#all-notes-count"),
    todayFilter: document.querySelector("#today-filter"),
    todayFilterCount: document.querySelector("#today-filter-count"),
    typeFilterList: document.querySelector("#type-filter-list"),
    tagFilterList: document.querySelector("#tag-filter-list"),
    tagFilterCount: document.querySelector("#tag-filter-count"),
    tagFilterEmpty: document.querySelector("#tag-filter-empty"),
    clearFilters: document.querySelector("#clear-filters-btn"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeToggleLabel: document.querySelector("#theme-toggle-label"),
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
    notesRange: document.querySelector("#notes-range"),
    sortDescription: document.querySelector("#sort-description"),
    notesList: document.querySelector("#notes-list"),
    pagination: document.querySelector("#pagination"),
    noteDialog: document.querySelector("#note-dialog"),
    noteForm: document.querySelector("#note-form"),
    noteDialogTitle: document.querySelector("#note-dialog-title"),
    viewNoteFromEditor: document.querySelector("#view-note-from-editor-btn"),
    closeNoteDialog: document.querySelector("#close-note-dialog-btn"),
    cancelNote: document.querySelector("#cancel-note-btn"),
    quickSaveNote: document.querySelector("#quick-save-note-btn"),
    deleteNote: document.querySelector("#delete-note-btn"),
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
    noteSplitViewToggle: document.querySelector("#note-split-view-toggle"),
    noteMeta: document.querySelector("#note-meta"),
    selectedNoteTags: document.querySelector("#selected-note-tags"),
    tagInput: document.querySelector("#tag-input"),
    addTag: document.querySelector("#add-tag-btn"),
    tagSuggestions: document.querySelector("#tag-suggestions"),
    quickViewDialog: document.querySelector("#quick-view-dialog"),
    quickViewHeader: document.querySelector(".quick-view-header"),
    quickViewBody: document.querySelector(".quick-view-body"),
    quickViewFooter: document.querySelector(".quick-view-footer"),
    quickViewTitle: document.querySelector("#quick-view-title"),
    quickViewMeta: document.querySelector("#quick-view-meta"),
    quickViewTags: document.querySelector("#quick-view-tags"),
    quickViewContent: document.querySelector("#quick-view-content"),
    quickViewDates: document.querySelector("#quick-view-dates"),
    closeQuickView: document.querySelector("#close-quick-view-btn"),
    closeQuickViewFooter: document.querySelector("#close-quick-view-footer-btn"),
    copyNoteContent: document.querySelector("#copy-note-content-btn"),
    editFromQuickView: document.querySelector("#edit-from-quick-view-btn"),
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
    typesPanel: document.querySelector("#types-panel"),
    tagsPanel: document.querySelector("#tags-panel"),
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
  };

  const storedFilters = getStoredFilters();
  const library = { notes: [], types: [], tags: [] };
  const ui = {
    theme: getStoredTheme(),
    query: "",
    typeId: storedFilters.typeId,
    tagIds: storedFilters.tagIds,
    todayOnly: storedFilters.todayOnly,
    sort: "created-desc",
    viewMode: getStoredViewMode(),
    page: 1,
    editingNoteId: "",
    selectedNoteTagIds: new Set(),
    noteEditorSession: 0,
    pendingTagCreation: null,
    noteSaveInFlight: false,
    noteAutoSaveInFlight: false,
    noteAutoSaveTimer: 0,
    noteSplitView: false,
    noteScrollSyncing: false,
    noteEditorSnapshot: null,
    viewingNoteId: "",
    viewInvoker: null,
    copyInFlight: false,
    restoreViewFocus: true,
    afterQuickViewClose: null,
    pendingConfirmation: null,
    managementTab: "types",
    toastTimer: 0,
  };

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  function syncThemeUI() {
    const isDark = ui.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    elements.themeToggle.setAttribute("aria-pressed", String(isDark));
    elements.themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
    elements.themeToggle.title = `Switch to ${isDark ? "light" : "dark"} theme`;
    elements.themeToggleLabel.textContent = isDark ? "Light" : "Dark";
  }

  function setTheme(theme) {
    if (!["light", "dark"].includes(theme) || theme === ui.theme) return;
    ui.theme = theme;
    syncThemeUI();
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still works for this session when browser privacy settings block localStorage.
    }
  }

  function getStoredViewMode() {
    try {
      const storedMode = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return ["focus", "comfortable", "compact"].includes(storedMode) ? storedMode : "comfortable";
    } catch {
      return "comfortable";
    }
  }

  function getStoredFilters() {
    try {
      const storedFilters = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!storedFilters) return { typeId: "all", tagIds: new Set(), todayOnly: false };
      const parsed = JSON.parse(storedFilters);
      const typeId = typeof parsed?.typeId === "string" && parsed.typeId ? parsed.typeId : "all";
      const tagIds = new Set(
        Array.isArray(parsed?.tagIds)
          ? parsed.tagIds.filter((tagId) => typeof tagId === "string" && tagId)
          : [],
      );
      return { typeId, tagIds, todayOnly: parsed?.todayOnly === true };
    } catch {
      return { typeId: "all", tagIds: new Set(), todayOnly: false };
    }
  }

  function persistFilters() {
    try {
      if (ui.typeId === "all" && ui.tagIds.size === 0 && !ui.todayOnly) {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ typeId: ui.typeId, tagIds: [...ui.tagIds], todayOnly: ui.todayOnly }),
      );
    } catch {
      // Filtering still works when browser privacy settings block localStorage.
    }
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
    elements.noteSaveShortcutHelp.textContent = `Bold, italic, and link shortcuts format selected note content. Quick save keeps this note open: ${modifierName}, Shift, and S. Save note and close: ${modifierName} and Enter.`;
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
    const preview = noteContent.replace(/\s+/g, " ").trim();
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
    if (Number.isNaN(date.getTime())) return "Unknown date";
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDifference = Math.round((todayStart - dateStart) / 86400000);
    if (dayDifference === 0) return "Today";
    if (dayDifference === 1) return "Yesterday";
    return shortDateFormatter.format(date);
  }

  function formatFullDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : fullDateFormatter.format(date);
  }

  function activeModalDialog() {
    return [elements.confirmationDialog, elements.noteDialog, elements.quickViewDialog, elements.organizeDialog].find((dialog) => dialog.open) || null;
  }

  function syncToastHost() {
    // A modal <dialog> and its backdrop live in the browser's top layer, above
    // regular page content. Keep the status message inside the active dialog so
    // it remains visible above the backdrop instead of being dimmed behind it.
    const host = activeModalDialog() || document.body;
    if (elements.toast.parentElement !== host) host.append(elements.toast);
  }

  function showToast(message, tone = "success") {
    window.clearTimeout(ui.toastTimer);
    syncToastHost();
    elements.toast.textContent = message;
    elements.toast.dataset.tone = tone;
    elements.toast.classList.add("is-visible");
    ui.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 3600);
  }

  function requestConfirmation({ title, description, confirmLabel, cancelLabel, tone = "danger" }) {
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
      window.requestAnimationFrame(() => elements.cancelConfirmation.focus());
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

  function setTypeFilter(typeId) {
    ui.typeId = ui.typeId === typeId ? "all" : typeId;
    persistFilters();
    resetToFirstPage();
    renderLibrary();
  }

  function showAllNotes() {
    ui.todayOnly = false;
    setTypeFilter("all");
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

  function clearFilters({ preserveSort = true } = {}) {
    ui.query = "";
    ui.typeId = "all";
    ui.tagIds.clear();
    ui.todayOnly = false;
    persistFilters();
    if (!preserveSort) ui.sort = "created-desc";
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

  function getVisibleNotes() {
    const normalizedQuery = normalizedSearchQuery();
    const selectedTagIds = [...ui.tagIds];
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
    const notes = library.notes.filter((note) => {
      if (ui.typeId !== "all" && note.typeId !== ui.typeId) return false;
      if (selectedTagIds.some((tagId) => !note.tagIds.includes(tagId))) return false;
      const createdAt = Date.parse(note.createdAt);
      if (ui.todayOnly && (Number.isNaN(createdAt) || createdAt < todayStart || createdAt >= tomorrowStart)) return false;
      if (!normalizedQuery) return true;
      return [note.title, note.content].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });

    return notes.sort((left, right) => {
      if (ui.sort === "title-asc" || ui.sort === "title-desc") {
        const direction = ui.sort === "title-asc" ? 1 : -1;
        const titleComparison = collator.compare(left.title, right.title);
        if (titleComparison) return titleComparison * direction;
      } else {
        const direction = ui.sort === "created-asc" ? 1 : -1;
        const dateComparison = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (dateComparison) return dateComparison * direction;
      }

      const timestampComparison = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (timestampComparison) return timestampComparison;
      return collator.compare(left.id, right.id);
    });
  }

  function makeTypeBadge(type, { isFilter = false } = {}) {
    const selected = ui.typeId === type.id;
    const badge = createElement(isFilter ? "button" : "span", {
      className: `type-badge type-badge--${safeTypeColor(type)}${isFilter ? " type-badge--filter" : ""}`,
      type: isFilter ? "button" : undefined,
      text: type.name,
      attributes: isFilter
        ? {
            "aria-label": `Filter by note type ${type.name}`,
            "aria-pressed": String(selected),
            title: `Filter by ${type.name}`,
          }
        : undefined,
    });
    if (isFilter) badge.addEventListener("click", () => setTypeFilter(type.id));
    return badge;
  }

  function makeTagButton(tag, selected = false) {
    const button = createElement("button", {
      className: `tag-chip${selected ? " is-selected" : ""}`,
      type: "button",
      text: tagLabel(tag),
      attributes: {
        "aria-label": `Filter by tag ${tagLabel(tag)}`,
        "aria-pressed": String(selected),
      },
    });
    button.addEventListener("click", () => toggleTagFilter(tag.id));
    return button;
  }

  function renderSidebar() {
    const noteCountsByType = new Map();
    const noteCountsByTag = new Map();
    library.notes.forEach((note) => {
      noteCountsByType.set(note.typeId, (noteCountsByType.get(note.typeId) || 0) + 1);
      note.tagIds.forEach((tagId) => noteCountsByTag.set(tagId, (noteCountsByTag.get(tagId) || 0) + 1));
    });

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
    const todayCount = library.notes.filter((note) => {
      const createdAt = Date.parse(note.createdAt);
      return !Number.isNaN(createdAt) && createdAt >= todayStart && createdAt < tomorrowStart;
    }).length;

    const isAllNotesFilterActive = ui.typeId === "all" && !ui.todayOnly;
    elements.allNotesCount.textContent = library.notes.length;
    elements.allNotesFilter.classList.toggle("is-active", isAllNotesFilterActive);
    elements.allNotesFilter.setAttribute("aria-pressed", String(isAllNotesFilterActive));
    elements.todayFilter.classList.toggle("is-active", ui.todayOnly);
    elements.todayFilter.setAttribute("aria-pressed", String(ui.todayOnly));
    elements.todayFilterCount.textContent = todayCount;
    elements.typeFilterList.replaceChildren();
    const typeFragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const button = createElement("button", {
        className: `sidebar-filter sidebar-filter--type sidebar-filter--${safeTypeColor(type)}${ui.typeId === type.id ? " is-active" : ""}`,
        type: "button",
        attributes: { "aria-pressed": String(ui.typeId === type.id) },
      });
      const label = createElement("span", { className: "sidebar-filter__label" });
      label.append(createElement("span", { className: `type-dot type-dot--${safeTypeColor(type)}` }));
      label.append(document.createTextNode(type.name));
      button.append(label, createElement("span", { className: "filter-count", text: noteCountsByType.get(type.id) || 0 }));
      button.addEventListener("click", () => setTypeFilter(type.id));
      typeFragment.append(button);
    });
    elements.typeFilterList.append(typeFragment);

    elements.tagFilterList.replaceChildren();
    const tagFragment = document.createDocumentFragment();
    library.tags.forEach((tag) => {
      const label = createElement("label", { className: "tag-filter-option" });
      const input = createElement("input", {
        type: "checkbox",
        value: tag.id,
        attributes: { "aria-label": `Filter by tag ${tagLabel(tag)}` },
      });
      input.checked = ui.tagIds.has(tag.id);
      input.addEventListener("change", () => toggleTagFilter(tag.id));
      label.append(input);
      label.append(createElement("span", { className: "tag-filter-option__box", attributes: { "aria-hidden": "true" } }));
      label.append(createElement("span", { className: "tag-filter-option__name", text: tagLabel(tag) }));
      label.append(createElement("span", { className: "filter-count", text: noteCountsByTag.get(tag.id) || 0 }));
      tagFragment.append(label);
    });
    elements.tagFilterList.append(tagFragment);
    elements.tagFilterEmpty.classList.toggle("is-hidden", library.tags.length > 0);
    elements.tagFilterCount.textContent = ui.tagIds.size ? `${ui.tagIds.size} selected` : "";
    elements.clearFilters.disabled = !ui.query && ui.typeId === "all" && ui.tagIds.size === 0 && !ui.todayOnly;
  }

  function makeFilterPill(label, onClear, kinds = []) {
    const normalizedKinds = (Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean);
    const chip = createElement("span", { className: ["active-filter-pill", ...normalizedKinds.map((kind) => `active-filter-pill--${kind}`)].join(" ") });
    chip.append(createElement("span", { text: label }));
    const clear = createElement("button", {
      className: "active-filter-pill__clear",
      type: "button",
      text: "×",
      attributes: { "aria-label": `Remove ${label} filter` },
    });
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
          renderLibrary();
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
        }, ["type", `type-${safeTypeColor(type)}`]),
      );
    }
    if (ui.todayOnly) {
      fragment.append(
        makeFilterPill("Today", () => {
          ui.todayOnly = false;
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }),
      );
    }
    [...ui.tagIds].map(tagFor).filter(Boolean).forEach((tag) => {
      fragment.append(
        makeFilterPill(tagLabel(tag), () => {
          ui.tagIds.delete(tag.id);
          persistFilters();
          resetToFirstPage();
          renderLibrary();
        }, "tag"),
      );
    });
    elements.activeFilters.replaceChildren(fragment);
    elements.activeFilters.classList.toggle(
      "is-empty",
      !ui.query && ui.typeId === "all" && ui.tagIds.size === 0 && !ui.todayOnly,
    );
  }

  function noteForQuickView() {
    return library.notes.find(({ id }) => id === ui.viewingNoteId) || null;
  }

  function renderQuickView(note) {
    if (!note) return;
    const type = typeFor(note.typeId);
    const tags = note.tagIds.map(tagFor).filter(Boolean);
    elements.quickViewTitle.textContent = note.title;
    elements.quickViewMeta.replaceChildren(makeTypeBadge(type));
    elements.quickViewTags.replaceChildren();
    if (tags.length) {
      const fragment = document.createDocumentFragment();
      tags.forEach((tag) => {
        fragment.append(createElement("span", { className: "quick-view-tag", text: tagLabel(tag) }));
      });
      elements.quickViewTags.append(fragment);
    } else {
      elements.quickViewTags.append(createElement("span", { className: "quick-view-no-tags", text: "No tags" }));
    }
    globalThis.NookMarkdown.renderInto(elements.quickViewContent, note.content);
    elements.quickViewDates.replaceChildren(
      createElement("span", { text: `Created ${formatFullDate(note.createdAt)}` }),
      createElement("span", { text: `Last updated ${formatFullDate(note.updatedAt)}` }),
    );
    elements.copyNoteContent.disabled = !note.content.trim() || ui.copyInFlight;
    if (elements.quickViewDialog.open) scheduleQuickViewHeightSync();
  }

  function syncQuickViewHeight() {
    if (!elements.quickViewDialog.open) return;

    // The dialog stays compact for short notes and grows only as far as its
    // CSS viewport cap. Once it reaches that cap, the body becomes the one
    // scrollable reading surface.
    elements.quickViewDialog.style.removeProperty("height");
    const naturalHeight =
      elements.quickViewHeader.offsetHeight +
      elements.quickViewBody.scrollHeight +
      elements.quickViewFooter.offsetHeight +
      2;
    const maxHeight = Number.parseFloat(window.getComputedStyle(elements.quickViewDialog).maxHeight);
    if (Number.isFinite(maxHeight)) {
      elements.quickViewDialog.style.height = `${Math.min(Math.ceil(naturalHeight), maxHeight)}px`;
    }
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

  function closeQuickView({ restoreFocus = true, afterClose = null } = {}) {
    ui.restoreViewFocus = restoreFocus;
    ui.afterQuickViewClose = afterClose;
    if (elements.quickViewDialog.open) elements.quickViewDialog.close();
    else finishQuickViewClose();
  }

  function finishQuickViewClose() {
    const shouldRestoreFocus = ui.restoreViewFocus;
    const afterClose = ui.afterQuickViewClose;
    const invoker = ui.viewInvoker;
    ui.viewingNoteId = "";
    ui.viewInvoker = null;
    ui.copyInFlight = false;
    elements.quickViewDialog.style.removeProperty("height");
    ui.restoreViewFocus = true;
    ui.afterQuickViewClose = null;
    if (afterClose) {
      afterClose();
      return;
    }
    if (shouldRestoreFocus) window.requestAnimationFrame(() => focusQuickViewFallback(invoker));
  }

  function openQuickView(note, invoker = null) {
    ui.viewingNoteId = note.id;
    ui.viewInvoker = invoker instanceof HTMLElement ? invoker : null;
    ui.copyInFlight = false;
    ui.restoreViewFocus = true;
    ui.afterQuickViewClose = null;
    renderQuickView(note);
    if (!elements.quickViewDialog.open) elements.quickViewDialog.showModal();
    syncToastHost();
    window.requestAnimationFrame(() => {
      syncQuickViewHeight();
      elements.quickViewTitle.tabIndex = -1;
      elements.quickViewTitle.focus();
    });
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

  async function copyQuickViewContent() {
    const note = noteForQuickView();
    if (!note?.content.trim()) {
      showToast("This note has no content to copy.", "error");
      return;
    }
    ui.copyInFlight = true;
    renderQuickView(note);
    try {
      await writeClipboardText(note.content);
      showToast("Content copied.");
    } catch (error) {
      showError(error, "We could not copy this note.");
    } finally {
      ui.copyInFlight = false;
      if (elements.quickViewDialog.open && noteForQuickView()?.id === note.id) renderQuickView(note);
    }
  }

  function editFromQuickView() {
    const note = noteForQuickView();
    if (!note) return;
    closeQuickView({ restoreFocus: false, afterClose: () => openNoteEditor(note) });
  }

  function createNoteCardActionIcon(shapes) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
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
    const card = createElement("article", { className: "note-card" });
    const content = createElement("div", { className: "note-card__content" });
    const meta = createElement("div", { className: "note-card__meta" });
    meta.append(makeTypeBadge(type, { isFilter: true }));
    const created = createElement("time", {
      className: "note-card__date",
      text: `Created ${formatShortDate(note.createdAt)}`,
      attributes: { datetime: note.createdAt, title: formatFullDate(note.createdAt) },
    });
    meta.append(created);

    const titleButton = createElement("button", {
      className: "note-card__title",
      type: "button",
      attributes: { "aria-label": `Quick view note: ${note.title}` },
    });
    appendHighlightedText(titleButton, note.title);
    titleButton.addEventListener("click", () => openQuickView(note, titleButton));
    const preview = createElement("p", { className: "note-card__preview" });
    appendHighlightedText(preview, previewForSearch(note.content));
    content.append(meta, titleButton, preview);

    const footer = createElement("div", { className: "note-card__footer" });
    const tags = createElement("div", { className: "note-card__tags" });
    const resolvedTags = note.tagIds.map(tagFor).filter(Boolean);
    resolvedTags.slice(0, 3).forEach((tag) => tags.append(makeTagButton(tag, ui.tagIds.has(tag.id))));
    if (resolvedTags.length > 3) {
      tags.append(
        createElement("span", {
          className: "more-tags",
          text: `+${resolvedTags.length - 3}`,
          attributes: { title: `${resolvedTags.length - 3} more tags in Quick view` },
        }),
      );
    }
    if (!resolvedTags.length) tags.append(createElement("span", { className: "untagged", text: "No tags" }));

    const actions = createElement("div", { className: "note-card__actions" });
    const view = createElement("button", {
      className: "note-card__action",
      type: "button",
      attributes: { "aria-label": `Quick view ${note.title}`, title: "View" },
    });
    view.append(
      createNoteCardActionIcon([
        ["path", { d: "M2.4 12s3.4-5.2 9.6-5.2 9.6 5.2 9.6 5.2-3.4 5.2-9.6 5.2S2.4 12 2.4 12Z" }],
        ["circle", { cx: "12", cy: "12", r: "2.35" }],
      ]),
    );
    view.addEventListener("click", () => openQuickView(note, view));
    const edit = createElement("button", {
      className: "note-card__action",
      type: "button",
      attributes: { "aria-label": `Edit ${note.title}`, title: "Edit" },
    });
    edit.append(
      createNoteCardActionIcon([
        ["path", { d: "m14.6 5.4 4 4" }],
        ["path", { d: "M4.5 19.5 6 14l9.6-9.6a1.65 1.65 0 0 1 2.35 0l1.65 1.65a1.65 1.65 0 0 1 0 2.35L10 18l-5.5 1.5Z" }],
      ]),
    );
    edit.addEventListener("click", () => openNoteEditor(note));
    const remove = createElement("button", {
      className: "note-card__action note-card__action--danger",
      type: "button",
      attributes: { "aria-label": `Delete ${note.title}`, title: "Delete" },
    });
    remove.append(
      createNoteCardActionIcon([
        ["path", { d: "M4.5 7.5h15" }],
        ["path", { d: "M9.5 4.5h5" }],
        ["path", { d: "m6.5 7.5.8 12h9.4l.8-12" }],
        ["path", { d: "M10 11v5" }],
        ["path", { d: "M14 11v5" }],
      ]),
    );
    remove.addEventListener("click", () => deleteNoteWithConfirmation(note));
    actions.append(view, edit, remove);
    footer.append(tags, actions);
    card.append(content, footer);
    return card;
  }

  function renderEmptyState(hasAnyNotes) {
    const empty = createElement("section", { className: "empty-state" });
    empty.append(createElement("span", { className: "empty-state__icon", text: hasAnyNotes ? "⌕" : "✦", attributes: { "aria-hidden": "true" } }));
    empty.append(
      createElement("h3", {
        text: hasAnyNotes ? "No notes match these filters" : "Your note library is ready",
      }),
    );
    empty.append(
      createElement("p", {
        text: hasAnyNotes
          ? "Try a different search, type, or tag."
          : "Capture an idea, meeting, learning, or anything you want to keep.",
      }),
    );
    const action = createElement("button", {
      className: "button button-primary",
      type: "button",
      text: hasAnyNotes ? "Clear filters" : "Create your first note",
    });
    action.addEventListener("click", () => {
      if (hasAnyNotes) clearFilters();
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
      renderEmptyState(library.notes.length > 0);
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
      className: "note-type-picker__trigger",
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
      const chip = createElement("span", { className: "selected-tag" });
      chip.append(createElement("span", { text: tagLabel(tag) }));
      const remove = createElement("button", {
        type: "button",
        text: "×",
        disabled: ui.noteSaveInFlight,
        attributes: { "aria-label": `Remove tag ${tagLabel(tag)}` },
      });
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
    if (!ui.noteSplitView || ui.noteScrollSyncing) return;
    ui.noteScrollSyncing = true;
    setNoteEditorScrollProgress(target, getNoteEditorScrollProgress(source));
    window.requestAnimationFrame(() => {
      ui.noteScrollSyncing = false;
    });
  }

  function renderNoteEditorPreview() {
    if (!ui.noteSplitView) return;
    globalThis.NookMarkdown.renderInto(elements.noteContentPreview, elements.noteContent.value);
    syncNoteEditorScroll(elements.noteContent, elements.noteContentPreview);
  }

  function setNoteSplitView(enabled) {
    ui.noteSplitView = Boolean(enabled);
    elements.noteContentField.classList.toggle("is-split", ui.noteSplitView);
    elements.noteContentPreview.hidden = !ui.noteSplitView;
    elements.noteSplitViewToggle.setAttribute("aria-pressed", String(ui.noteSplitView));
    elements.noteSplitViewToggle.setAttribute(
      "aria-label",
      ui.noteSplitView ? "Hide split edit and preview" : "Show split edit and preview",
    );
    elements.noteSplitViewToggle.title = ui.noteSplitView
      ? "Hide split edit and preview"
      : "Show split edit and preview";
    renderNoteEditorPreview();
  }

  function noteSubmitButton() {
    return elements.noteForm.querySelector('[type="submit"]');
  }

  function getNoteEditorDraft() {
    return createNoteEditorDraft({
      id: elements.noteId.value,
      title: elements.noteTitle.value,
      typeId: elements.noteType.value,
      tagIds: [...ui.selectedNoteTagIds],
      content: elements.noteContent.value,
    });
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

  function scheduleNoteAutoSave() {
    clearNoteAutoSave();
    if (!elements.noteDialog.open || ui.noteSaveInFlight || !hasUnsavedNoteChanges()) return;

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

  function isCurrentNoteEditorSession(session) {
    return ui.noteEditorSession === session && elements.noteDialog.open;
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
      elements.noteSplitViewToggle,
      elements.deleteNote,
      elements.viewNoteFromEditor,
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
    submitButton.disabled = disabled || isCreatingTag;
    submitButton.textContent = disabled ? "Saving…" : "Save & close";
  }

  function openNoteEditor(note = null) {
    clearNoteAutoSave();
    setNoteSplitView(false);
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.editingNoteId = note?.id || "";
    ui.selectedNoteTagIds = new Set(note?.tagIds || []);
    elements.noteForm.reset();
    elements.noteId.value = note?.id || "";
    elements.noteTitle.value = note?.title || "";
    elements.noteContent.value = note?.content || "";
    elements.noteDialogTitle.textContent = note ? "Edit note" : "New note";
    elements.deleteNote.classList.toggle("is-hidden", !note);
    elements.viewNoteFromEditor.classList.toggle("is-hidden", !note);
    renderNoteTypeOptions(note?.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    if (!elements.noteDialog.open) elements.noteDialog.showModal();
    ui.noteEditorSnapshot = getNoteEditorDraft();
    syncToastHost();
    syncNoteEditorControls();
    window.requestAnimationFrame(() => elements.noteTitle.focus());
  }

  function closeNoteEditor() {
    clearNoteAutoSave();
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    if (elements.noteDialog.open) elements.noteDialog.close();
    ui.editingNoteId = "";
    ui.selectedNoteTagIds.clear();
    ui.noteEditorSnapshot = null;
  }

  async function requestNoteEditorClose({ afterClose = null } = {}) {
    if (ui.noteSaveInFlight) return;
    if (!hasUnsavedNoteChanges()) {
      closeNoteEditor();
      afterClose?.();
      return;
    }
    const confirmed = await requestConfirmation({
      title: "Discard unsaved changes?",
      description: "This note has changes that have not been saved yet.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
    if (confirmed && elements.noteDialog.open) {
      closeNoteEditor();
      afterClose?.();
    }
  }

  async function viewNoteFromEditor() {
    const note = library.notes.find(({ id }) => id === elements.noteId.value);
    if (!note || ui.noteSaveInFlight) return;
    await requestNoteEditorClose({ afterClose: () => openQuickView(note) });
  }

  function selectNoteTag(tagId) {
    if (ui.noteSaveInFlight) return;
    if (!tagFor(tagId)) return;
    ui.selectedNoteTagIds.add(tagId);
    elements.tagInput.value = "";
    renderSelectedNoteTags();
    renderTagSuggestions();
    scheduleNoteAutoSave();
    elements.tagInput.focus();
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
        await refreshLibrary();
        if (!isCurrentNoteEditorSession(session)) return;
        ui.selectedNoteTagIds.add(tag.id);
        elements.tagInput.value = "";
        renderSelectedNoteTags();
        renderTagSuggestions();
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
    event.preventDefault();
    clearNoteAutoSave();
    if (ui.noteSaveInFlight) return;
    const session = ui.noteEditorSession;
    const pendingTagCreation = ui.pendingTagCreation;
    if (pendingTagCreation?.session === session) {
      await pendingTagCreation.promise;
      if (!isCurrentNoteEditorSession(session)) return;
    }

    ui.noteSaveInFlight = true;
    ui.noteAutoSaveInFlight = isAutoSave;
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
      await refreshLibrary();
      didSave = true;
      if (isCurrentNoteEditorSession(session)) {
        elements.noteId.value = savedNote.id;
        ui.editingNoteId = savedNote.id;
        elements.noteDialogTitle.textContent = "Edit note";
        elements.deleteNote.classList.remove("is-hidden");
        elements.viewNoteFromEditor.classList.remove("is-hidden");
        renderNoteMetadata(savedNote);
        ui.noteEditorSnapshot = createNoteEditorDraft({ ...input, id: savedNote.id });
        if (closeAfterSave) closeNoteEditor();
      }
      if (isAutoSave) showToast("Note autosaved.");
      else showToast(closeAfterSave ? (isEditing ? "Note updated." : "Note saved.") : "Changes saved. Keep editing.");
    } catch (error) {
      if (isCurrentNoteEditorSession(session)) {
        showError(error, "We could not save this note.");
      }
    } finally {
      if (isCurrentNoteEditorSession(session)) {
        ui.noteSaveInFlight = false;
        ui.noteAutoSaveInFlight = false;
        syncNoteEditorControls();
        if (isAutoSave && didSave && hasUnsavedNoteChanges()) scheduleNoteAutoSave();
      }
    }
  }

  async function deleteNoteWithConfirmation(note) {
    if (!note || ui.noteSaveInFlight) return;
    const confirmed = await requestConfirmation({
      title: "Delete note?",
      description: `“${note.title}” will be permanently deleted. You can restore it only from an exported backup.`,
      confirmLabel: "Delete note",
      cancelLabel: "Keep note",
    });
    if (!confirmed) return;
    try {
      await storage.deleteNote(note.id);
      await refreshLibrary();
      if (ui.editingNoteId === note.id) closeNoteEditor();
      showToast("Note deleted.");
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
    const fragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const form = createElement("form", { className: "management-row management-row--type", dataset: { typeId: type.id } });
      const main = createElement("div", { className: "management-row__main" });
      main.append(createElement("span", { className: `type-dot type-dot--${safeTypeColor(type)}`, attributes: { "aria-hidden": "true" } }));
      const nameInput = createElement("input", {
        type: "text",
        value: type.name,
        attributes: { "aria-label": `Name for ${type.name}`, maxlength: "48", required: "" },
      });
      main.append(nameInput);
      const controls = createElement("div", { className: "management-row__controls" });
      const color = createElement("select", {
        className: "color-select",
        attributes: { "aria-label": `Color for ${type.name}` },
      });
      color.append(createColorOptions(safeTypeColor(type)));
      const colorPicker = enhanceColorSelect(color);
      const usage = createElement("span", { className: "usage-count", text: pluralize(usageCounts.get(type.id) || 0, "note") });
      const save = createElement("button", { className: "button button-secondary button-compact", type: "submit", text: "Save" });
      const remove = createElement("button", {
        className: "button button-danger button-compact",
        type: "button",
        text: "Delete",
        disabled: type.id === storage.FALLBACK_TYPE_ID,
        title: type.id === storage.FALLBACK_TYPE_ID ? "General cannot be deleted." : "Delete note type",
      });
      controls.append(colorPicker.root, usage, save, remove);
      form.append(main, controls);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await storage.updateType(type.id, { name: nameInput.value, color: color.value });
          await refreshLibrary();
          showToast("Note type updated.");
        } catch (error) {
          showError(error);
        }
      });
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
          await refreshLibrary();
          showToast(affected ? `Type deleted; ${pluralize(affected, "note")} moved to ${fallbackType.name}.` : "Note type deleted.");
        } catch (error) {
          showError(error);
        }
      });
      fragment.append(form);
    });
    elements.typesList.append(fragment);
  }

  function renderTagManagement() {
    const usageCounts = new Map();
    library.notes.forEach((note) =>
      note.tagIds.forEach((tagId) => usageCounts.set(tagId, (usageCounts.get(tagId) || 0) + 1)),
    );
    elements.tagsList.replaceChildren();
    if (!library.tags.length) {
      elements.tagsList.append(createElement("p", { className: "management-empty", text: "No tags yet. Add one above or create it while editing a note." }));
      return;
    }
    const fragment = document.createDocumentFragment();
    library.tags.forEach((tag) => {
      const form = createElement("form", { className: "management-row", dataset: { tagId: tag.id } });
      const main = createElement("div", { className: "management-row__main" });
      main.append(createElement("span", { className: "tag-marker", attributes: { "aria-hidden": "true" } }));
      const nameInput = createElement("input", {
        type: "text",
        value: tagLabel(tag),
        attributes: { "aria-label": `Name for ${tagLabel(tag)}`, maxlength: "48", required: "" },
      });
      main.append(nameInput);
      const controls = createElement("div", { className: "management-row__controls" });
      const usage = createElement("span", { className: "usage-count", text: pluralize(usageCounts.get(tag.id) || 0, "note") });
      const save = createElement("button", { className: "button button-secondary button-compact", type: "submit", text: "Save" });
      const remove = createElement("button", { className: "button button-danger button-compact", type: "button", text: "Delete" });
      controls.append(usage, save, remove);
      form.append(main, controls);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await storage.updateTag(tag.id, { name: nameInput.value });
          await refreshLibrary();
          showToast("Tag updated.");
        } catch (error) {
          showError(error);
        }
      });
      remove.addEventListener("click", async () => {
        const affected = usageCounts.get(tag.id) || 0;
        const description = affected
          ? `“${tagLabel(tag)}” will be deleted and removed from ${pluralize(affected, "note")}.`
          : `“${tagLabel(tag)}” will be deleted.`;
        const confirmed = await requestConfirmation({
          title: "Delete tag?",
          description,
          confirmLabel: "Delete tag",
          cancelLabel: "Keep tag",
        });
        if (!confirmed) return;
        try {
          await storage.deleteTag(tag.id);
          await refreshLibrary();
          showToast(affected ? `Tag removed from ${pluralize(affected, "note")}.` : "Tag deleted.");
        } catch (error) {
          showError(error);
        }
      });
      fragment.append(form);
    });
    elements.tagsList.append(fragment);
  }

  function renderManagement() {
    renderTypeManagement();
    renderTagManagement();
    setManagementTab(ui.managementTab);
  }

  function renderLibrary() {
    ensureUiReferencesAreValid();
    renderSidebar();
    renderActiveFilters();
    renderNotes();
    renderManagement();
    if (elements.noteDialog.open) {
      renderNoteTypeOptions(elements.noteType.value);
      renderSelectedNoteTags();
      renderTagSuggestions();
      syncNoteEditorControls();
    }
    if (elements.quickViewDialog.open) {
      const note = noteForQuickView();
      if (note) renderQuickView(note);
      else closeQuickView({ restoreFocus: false });
    }
  }

  async function refreshLibrary() {
    const snapshot = await storage.getSnapshot();
    library.notes = snapshot.notes;
    library.types = snapshot.types;
    library.tags = snapshot.tags;
    renderLibrary();
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
      await refreshLibrary();
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
      await refreshLibrary();
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

  async function exportLibrary() {
    try {
      const backup = await storage.buildExport();
      downloadExport(backup);
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
      persistFilters();
      ui.query = "";
      elements.search.value = "";
      await refreshLibrary();
      showToast(preview.format === "legacy" ? "Legacy library imported and upgraded." : "Backup imported successfully.");
    } catch (error) {
      showError(error, "The selected file could not be imported.");
    } finally {
      elements.importInput.value = "";
    }
  }

  function bindEvents() {
    elements.allNotesFilter.addEventListener("click", showAllNotes);
    elements.todayFilter.addEventListener("click", toggleTodayFilter);
    elements.clearFilters.addEventListener("click", () => clearFilters());
    elements.themeToggle.addEventListener("click", () => setTheme(ui.theme === "dark" ? "light" : "dark"));
    elements.organize.addEventListener("click", () => openOrganize());
    elements.export.addEventListener("click", exportLibrary);
    elements.import.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", importLibrary);
    elements.newNote.addEventListener("click", () => openNoteEditor());
    elements.search.addEventListener("input", () => {
      ui.query = elements.search.value;
      resetToFirstPage();
      renderLibrary();
    });
    elements.clearSearch.addEventListener("click", () => {
      ui.query = "";
      elements.search.value = "";
      resetToFirstPage();
      renderLibrary();
      elements.search.focus();
    });
    elements.sort.addEventListener("change", () => {
      ui.sort = elements.sort.value;
      resetToFirstPage();
      renderNotes();
    });
    elements.focusView.addEventListener("click", () => setViewMode("focus"));
    elements.comfortableView.addEventListener("click", () => setViewMode("comfortable"));
    elements.compactView.addEventListener("click", () => setViewMode("compact"));
    elements.noteForm.addEventListener("submit", saveNote);
    elements.noteTitle.addEventListener("input", scheduleNoteAutoSave);
    elements.noteContent.addEventListener("input", () => {
      renderNoteEditorPreview();
      scheduleNoteAutoSave();
    });
    elements.noteContent.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.noteContent, elements.noteContentPreview);
    });
    elements.noteContentPreview.addEventListener("scroll", () => {
      syncNoteEditorScroll(elements.noteContentPreview, elements.noteContent);
    });
    elements.noteType.addEventListener("change", scheduleNoteAutoSave);
    elements.noteSplitViewToggle.addEventListener("click", () => {
      if (!ui.noteSaveInFlight) setNoteSplitView(!ui.noteSplitView);
    });
    elements.viewNoteFromEditor.addEventListener("click", viewNoteFromEditor);
    elements.closeNoteDialog.addEventListener("click", requestNoteEditorClose);
    elements.cancelNote.addEventListener("click", requestNoteEditorClose);
    elements.quickSaveNote.addEventListener("click", () => saveNote({ preventDefault() {} }, { closeAfterSave: false }));
    elements.deleteNote.addEventListener("click", () => {
      const note = library.notes.find(({ id }) => id === elements.noteId.value);
      deleteNoteWithConfirmation(note);
    });
    elements.noteDialog.addEventListener("close", () => {
      clearNoteAutoSave();
      setNoteSplitView(false);
      ui.noteEditorSession += 1;
      ui.pendingTagCreation = null;
      ui.noteSaveInFlight = false;
      ui.noteAutoSaveInFlight = false;
      ui.editingNoteId = "";
      ui.selectedNoteTagIds.clear();
      ui.noteEditorSnapshot = null;
    });
    elements.noteDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      requestNoteEditorClose();
    });
    elements.closeQuickView.addEventListener("click", () => closeQuickView());
    elements.closeQuickViewFooter.addEventListener("click", () => closeQuickView());
    elements.copyNoteContent.addEventListener("click", copyQuickViewContent);
    elements.editFromQuickView.addEventListener("click", editFromQuickView);
    elements.quickViewDialog.addEventListener("close", finishQuickViewClose);
    elements.closeConfirmation.addEventListener("click", () => closeConfirmation());
    elements.cancelConfirmation.addEventListener("click", () => closeConfirmation());
    elements.confirmAction.addEventListener("click", () => closeConfirmation(true));
    elements.confirmationDialog.addEventListener("close", finishConfirmationClose);
    window.addEventListener("resize", scheduleQuickViewHeightSync);
    elements.tagInput.addEventListener("input", normalizeTagEditorInput);
    elements.tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTagFromEditor();
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
    elements.addTag.addEventListener("click", addTagFromEditor);
    elements.closeOrganizeDialog.addEventListener("click", closeOrganize);
    [elements.noteDialog, elements.quickViewDialog, elements.confirmationDialog, elements.organizeDialog].forEach((dialog) => {
      dialog.addEventListener("close", () => window.queueMicrotask(syncToastHost));
    });
    elements.typesTab.addEventListener("click", () => setManagementTab("types"));
    elements.tagsTab.addEventListener("click", () => setManagementTab("tags"));
    elements.typesTab.addEventListener("keydown", handleManagementTabKeydown);
    elements.tagsTab.addEventListener("keydown", handleManagementTabKeydown);
    elements.newTypeForm.addEventListener("submit", addNewType);
    elements.newTagForm.addEventListener("submit", addNewTag);
    document.addEventListener("pointerdown", (event) => {
      openColorPickers.forEach((picker) => {
        if (!picker.select.parentElement.contains(event.target)) closeColorPicker(picker);
      });
      if (noteTypePicker && !noteTypePicker.root.contains(event.target)) closeNoteTypePicker();
    });
    document.addEventListener("keydown", (event) => {
      const usesCommandKey = usesMacKeyboardShortcuts();
      const hasSaveModifier = usesCommandKey ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const formattingKey = event.key.toLowerCase();
      const matchesNoteFormattingShortcut =
        event.target === elements.noteContent &&
        ["b", "i", "k"].includes(formattingKey) &&
        !event.altKey &&
        !event.shiftKey &&
        hasSaveModifier;

      if (matchesNoteFormattingShortcut && elements.noteDialog.open) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) applyNoteFormattingShortcut(formattingKey);
        return;
      }

      const matchesQuickSaveNoteShortcut =
        event.key.toLowerCase() === "s" &&
        !event.altKey &&
        event.shiftKey &&
        hasSaveModifier;

      if (matchesQuickSaveNoteShortcut && elements.noteDialog.open) {
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

      if (matchesSaveNoteShortcut && elements.noteDialog.open) {
        event.preventDefault();
        if (!event.repeat && !event.isComposing && !ui.noteSaveInFlight) elements.noteForm.requestSubmit();
        return;
      }

      const matchesSearchShortcut =
        event.key.toLowerCase() === "f" &&
        !event.altKey &&
        !event.shiftKey &&
        (usesCommandKey ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

      if (matchesSearchShortcut) {
        event.preventDefault();
        elements.search.focus({ preventScroll: true });
        return;
      }

      const target = event.target;
      const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (
        event.key === "/" &&
        !editingText &&
        !elements.noteDialog.open &&
        !elements.quickViewDialog.open &&
        !elements.organizeDialog.open
      ) {
        event.preventDefault();
        elements.search.focus();
      }
    });
  }

  function showStartupError(error) {
    document.querySelector(".app-shell")?.classList.add("is-hidden");
    elements.startupError.classList.remove("is-hidden");
    const message = error instanceof Error && error.message ? error.message : "Your browser could not open the local note database.";
    elements.startupErrorMessage.textContent = `${message} Your existing browser data was not changed.`;
  }

  async function bootstrap() {
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
      syncThemeUI();
      syncSearchShortcutHint();
      syncNoteSaveShortcutHint();
      elements.appShell.inert = false;
      elements.appShell.removeAttribute("inert");
      elements.appShell.setAttribute("aria-busy", "false");
      if (result.notice) showToast(result.notice, "error");
    } catch (error) {
      showStartupError(error);
    }
  }

  bootstrap();
})();
