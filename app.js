(() => {
  "use strict";

  const storage = globalThis.PersonalNotesStorage;
  const PAGE_SIZE = 30;
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

  const elements = {
    appShell: document.querySelector(".app-shell"),
    allNotesFilter: document.querySelector("#all-notes-filter"),
    allNotesCount: document.querySelector("#all-notes-count"),
    typeFilterList: document.querySelector("#type-filter-list"),
    tagFilterList: document.querySelector("#tag-filter-list"),
    tagFilterCount: document.querySelector("#tag-filter-count"),
    tagFilterEmpty: document.querySelector("#tag-filter-empty"),
    clearFilters: document.querySelector("#clear-filters-btn"),
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
    closeNoteDialog: document.querySelector("#close-note-dialog-btn"),
    cancelNote: document.querySelector("#cancel-note-btn"),
    deleteNote: document.querySelector("#delete-note-btn"),
    noteId: document.querySelector("#note-id"),
    noteTitle: document.querySelector("#note-title"),
    noteType: document.querySelector("#note-type"),
    noteContent: document.querySelector("#note-content"),
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
    query: "",
    typeId: storedFilters.typeId,
    tagIds: storedFilters.tagIds,
    sort: "created-desc",
    viewMode: getStoredViewMode(),
    page: 1,
    editingNoteId: "",
    selectedNoteTagIds: new Set(),
    noteEditorSession: 0,
    pendingTagCreation: null,
    noteSaveInFlight: false,
    viewingNoteId: "",
    viewInvoker: null,
    copyInFlight: false,
    restoreViewFocus: true,
    afterQuickViewClose: null,
    pendingConfirmation: null,
    managementTab: "types",
    toastTimer: 0,
  };

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
      if (!storedFilters) return { typeId: "all", tagIds: new Set() };
      const parsed = JSON.parse(storedFilters);
      const typeId = typeof parsed?.typeId === "string" && parsed.typeId ? parsed.typeId : "all";
      const tagIds = new Set(
        Array.isArray(parsed?.tagIds)
          ? parsed.tagIds.filter((tagId) => typeof tagId === "string" && tagId)
          : [],
      );
      return { typeId, tagIds };
    } catch {
      return { typeId: "all", tagIds: new Set() };
    }
  }

  function persistFilters() {
    try {
      if (ui.typeId === "all" && ui.tagIds.size === 0) {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ typeId: ui.typeId, tagIds: [...ui.tagIds] }),
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
    ui.typeId = typeId;
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

  function clearFilters({ preserveSort = true } = {}) {
    ui.query = "";
    ui.typeId = "all";
    ui.tagIds.clear();
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
    const notes = library.notes.filter((note) => {
      if (ui.typeId !== "all" && note.typeId !== ui.typeId) return false;
      if (selectedTagIds.some((tagId) => !note.tagIds.includes(tagId))) return false;
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

  function makeTypeBadge(type) {
    return createElement("span", {
      className: `type-badge type-badge--${safeTypeColor(type)}`,
      text: type.name,
    });
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

    elements.allNotesCount.textContent = library.notes.length;
    elements.allNotesFilter.classList.toggle("is-active", ui.typeId === "all");
    elements.allNotesFilter.setAttribute("aria-pressed", String(ui.typeId === "all"));
    elements.typeFilterList.replaceChildren();
    const typeFragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const button = createElement("button", {
        className: `sidebar-filter sidebar-filter--type${ui.typeId === type.id ? " is-active" : ""}`,
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
    elements.clearFilters.disabled = !ui.query && ui.typeId === "all" && ui.tagIds.size === 0;
  }

  function makeFilterPill(label, onClear, kind = "") {
    const chip = createElement("span", { className: `active-filter-pill${kind ? ` active-filter-pill--${kind}` : ""}` });
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
        }, "type"),
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
      !ui.query && ui.typeId === "all" && ui.tagIds.size === 0,
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
    elements.quickViewContent.textContent = note.content || "No content yet.";
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

  function createNoteCard(note) {
    const type = typeFor(note.typeId);
    const card = createElement("article", { className: "note-card" });
    const content = createElement("div", { className: "note-card__content" });
    const meta = createElement("div", { className: "note-card__meta" });
    meta.append(makeTypeBadge(type));
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
      text: "View",
      attributes: { "aria-label": `Quick view ${note.title}` },
    });
    view.addEventListener("click", () => openQuickView(note, view));
    const edit = createElement("button", {
      className: "note-card__action",
      type: "button",
      text: "Edit",
      attributes: { "aria-label": `Edit ${note.title}`, title: "Edit note" },
    });
    edit.addEventListener("click", () => openNoteEditor(note));
    actions.append(view, edit);
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

  function noteSubmitButton() {
    return elements.noteForm.querySelector('[type="submit"]');
  }

  function isCurrentNoteEditorSession(session) {
    return ui.noteEditorSession === session && elements.noteDialog.open;
  }

  function syncNoteEditorControls() {
    const isCreatingTag = ui.pendingTagCreation?.session === ui.noteEditorSession;
    const disabled = ui.noteSaveInFlight;
    [
      elements.noteTitle,
      elements.noteType,
      elements.noteContent,
      elements.deleteNote,
      elements.cancelNote,
      elements.closeNoteDialog,
      ...elements.selectedNoteTags.querySelectorAll("button"),
      ...elements.tagSuggestions.querySelectorAll("button"),
    ].forEach((control) => {
      control.disabled = disabled;
    });
    elements.tagInput.disabled = disabled || isCreatingTag;
    elements.addTag.disabled = disabled || isCreatingTag;
    const submitButton = noteSubmitButton();
    submitButton.disabled = disabled || isCreatingTag;
    submitButton.textContent = disabled ? "Saving…" : "Save note";
  }

  function openNoteEditor(note = null) {
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.editingNoteId = note?.id || "";
    ui.selectedNoteTagIds = new Set(note?.tagIds || []);
    elements.noteForm.reset();
    elements.noteId.value = note?.id || "";
    elements.noteTitle.value = note?.title || "";
    elements.noteContent.value = note?.content || "";
    elements.noteDialogTitle.textContent = note ? "Edit note" : "New note";
    elements.deleteNote.classList.toggle("is-hidden", !note);
    renderNoteTypeOptions(note?.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    if (!elements.noteDialog.open) elements.noteDialog.showModal();
    syncToastHost();
    syncNoteEditorControls();
    window.requestAnimationFrame(() => elements.noteTitle.focus());
  }

  function closeNoteEditor() {
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    if (elements.noteDialog.open) elements.noteDialog.close();
    ui.editingNoteId = "";
    ui.selectedNoteTagIds.clear();
  }

  function selectNoteTag(tagId) {
    if (ui.noteSaveInFlight) return;
    if (!tagFor(tagId)) return;
    ui.selectedNoteTagIds.add(tagId);
    elements.tagInput.value = "";
    renderSelectedNoteTags();
    renderTagSuggestions();
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

  async function saveNote(event) {
    event.preventDefault();
    if (ui.noteSaveInFlight) return;
    const session = ui.noteEditorSession;
    const pendingTagCreation = ui.pendingTagCreation;
    if (pendingTagCreation?.session === session) {
      await pendingTagCreation.promise;
      if (!isCurrentNoteEditorSession(session)) return;
    }

    ui.noteSaveInFlight = true;
    syncNoteEditorControls();
    const input = {
      id: elements.noteId.value || undefined,
      title: elements.noteTitle.value,
      typeId: elements.noteType.value,
      tagIds: [...ui.selectedNoteTagIds],
      content: elements.noteContent.value,
    };
    try {
      const isEditing = Boolean(input.id);
      await storage.saveNote(input);
      await refreshLibrary();
      if (isCurrentNoteEditorSession(session)) closeNoteEditor();
      showToast(isEditing ? "Note updated." : "Note saved.");
    } catch (error) {
      if (isCurrentNoteEditorSession(session)) {
        showError(error, "We could not save this note.");
      }
    } finally {
      if (isCurrentNoteEditorSession(session)) {
        ui.noteSaveInFlight = false;
        syncNoteEditorControls();
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

  function createColorOptions(selectedColor) {
    const fragment = document.createDocumentFragment();
    storage.TYPE_COLORS.forEach((color) => {
      const option = createElement("option", { value: color, text: `${color[0].toUpperCase()}${color.slice(1)}` });
      option.selected = color === selectedColor;
      fragment.append(option);
    });
    return fragment;
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
      if (type.id === storage.FALLBACK_TYPE_ID) {
        main.append(createElement("span", { className: "fallback-label", text: "Fallback" }));
      }
      const controls = createElement("div", { className: "management-row__controls" });
      const color = createElement("select", {
        className: "color-select",
        attributes: { "aria-label": `Color for ${type.name}` },
      });
      color.append(createColorOptions(safeTypeColor(type)));
      const usage = createElement("span", { className: "usage-count", text: pluralize(usageCounts.get(type.id) || 0, "note") });
      const save = createElement("button", { className: "button button-secondary button-compact", type: "submit", text: "Save" });
      const remove = createElement("button", {
        className: "button button-danger button-compact",
        type: "button",
        text: "Delete",
        disabled: type.id === storage.FALLBACK_TYPE_ID,
        title: type.id === storage.FALLBACK_TYPE_ID ? "This is the fallback type." : "Delete note type",
      });
      controls.append(color, usage, save, remove);
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
      elements.newTypeColor.value = "indigo";
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
    elements.allNotesFilter.addEventListener("click", () => setTypeFilter("all"));
    elements.clearFilters.addEventListener("click", () => clearFilters());
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
    elements.closeNoteDialog.addEventListener("click", closeNoteEditor);
    elements.cancelNote.addEventListener("click", closeNoteEditor);
    elements.deleteNote.addEventListener("click", () => {
      const note = library.notes.find(({ id }) => id === elements.noteId.value);
      deleteNoteWithConfirmation(note);
    });
    elements.noteDialog.addEventListener("close", () => {
      ui.noteEditorSession += 1;
      ui.pendingTagCreation = null;
      ui.noteSaveInFlight = false;
      ui.editingNoteId = "";
      ui.selectedNoteTagIds.clear();
    });
    elements.noteDialog.addEventListener("cancel", (event) => {
      if (ui.noteSaveInFlight) event.preventDefault();
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
    document.addEventListener("keydown", (event) => {
      const usesCommandKey = usesMacKeyboardShortcuts();
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
      bindEvents();
      syncSearchShortcutHint();
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
