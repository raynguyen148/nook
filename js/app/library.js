globalThis[Symbol.for("nook.app.modules")].register("library", (app) => {
  "use strict";

  // Library navigation, cards, pagination, Quick View, and Trash actions.
  const { api, storage, elements, library, ui, constants } = app;
  const { PAGE_SIZE, MOTION } = constants;
  let noteDetailAnimation = null;
  let noteDetailTransitionSequence = 0;
  let secondarySurfaceAnimation = null;
  let secondarySurfaceTransitionSequence = 0;
  let notesContentAnimation = null;
  let sortPicker = null;
  let tagFilterLayoutFrame = 0;
  let tagFilterResizeObserver = null;
  const TAG_FILTER_DESKTOP_QUERY = "(min-width: 821px)";
  const TAG_FILTER_HEIGHT_RESERVE = 12;
  const SORT_LABELS = Object.freeze({
    "created-desc": "Newest created",
    "created-asc": "Oldest created",
    "updated-desc": "Newest updated",
    "updated-asc": "Oldest updated",
    "title-asc": "Title A–Z",
    "title-desc": "Title Z–A",
  });

  const syncMobileFilterToggle = (...args) => api.syncMobileFilterToggle(...args);
  const persistFilters = (...args) => api.persistFilters(...args);
  const syncViewModeUI = (...args) => api.syncViewModeUI(...args);
  const createElement = (...args) => api.createElement(...args);
  const appendHighlightedText = (...args) => api.appendHighlightedText(...args);
  const previewForSearch = (...args) => api.previewForSearch(...args);
  const typeFor = (...args) => api.typeFor(...args);
  const tagFor = (...args) => api.tagFor(...args);
  const tagLabel = (...args) => api.tagLabel(...args);
  const safeTypeColor = (...args) => api.safeTypeColor(...args);
  const pluralize = (...args) => api.pluralize(...args);
  const getNoteCardDateInfo = (...args) => api.getNoteCardDateInfo(...args);
  const formatFullDate = (...args) => api.formatFullDate(...args);
  const showToast = (...args) => api.showToast(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const showError = (...args) => api.showError(...args);
  const resetToFirstPage = (...args) => api.resetToFirstPage(...args);
  const setTypeFilter = (...args) => api.setTypeFilter(...args);
  const toggleTagFilter = (...args) => api.toggleTagFilter(...args);
  const isDeletedNote = (...args) => api.isDeletedNote(...args);
  const renderSecondaryNoteTypeOptions = (...args) => api.renderSecondaryNoteTypeOptions(...args);
  const renderSecondarySelectedNoteTags = (...args) => api.renderSecondarySelectedNoteTags(...args);
  const setSecondaryTagInputExpanded = (...args) => api.setSecondaryTagInputExpanded(...args);
  const notesInActiveCollection = (...args) => api.notesInActiveCollection(...args);
  const showAllNotesSpace = (...args) => api.showAllNotesSpace(...args);
  const clearFilters = (...args) => api.clearFilters(...args);
  const syncClearFiltersState = (...args) => api.syncClearFiltersState(...args);
  const getVisibleNotes = (...args) => api.getVisibleNotes(...args);
  const openNoteEditor = (...args) => api.openNoteEditor(...args);
  const requestNoteEditorClose = (...args) => api.requestNoteEditorClose(...args);
  const deleteNoteWithConfirmation = (...args) => api.deleteNoteWithConfirmation(...args);
  const renderLibrary = (...args) => api.renderLibrary(...args);
  const renderSearchResults = (...args) => api.renderSearchResults(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const downloadNoteFile = (...args) => api.downloadNoteFile(...args);
  const scheduleNoteEditorScrollMap = (...args) => api.scheduleNoteEditorScrollMap(...args);
  const syncNoteEditorScroll = (...args) => api.syncNoteEditorScroll(...args);

  let secondarySortPicker = null;

  function createCustomSortPicker(selectElement, { idPrefix = "sort", fallbackValue = "created-desc" } = {}) {
    if (!selectElement) return null;
    const field = selectElement.closest(".sort-field");
    if (!field) return null;

    const trigger = createElement("button", {
      className: "sort-field__trigger",
      type: "button",
      attributes: {
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-controls": `${idPrefix}-options-menu`,
        "aria-labelledby": `${idPrefix}-select-label ${idPrefix}-picker-label`,
      },
    });
    const label = createElement("span", {
      className: "sort-field__label",
      attributes: { id: `${idPrefix}-picker-label` },
    });
    trigger.append(label);

    const menu = createElement("div", {
      className: "sort-field__menu",
      attributes: {
        id: `${idPrefix}-options-menu`,
        role: "listbox",
        "aria-label": "Sort notes by",
      },
    });
    menu.hidden = true;

    const options = [...selectElement.options].map((nativeOption) => createElement("button", {
      className: "sort-field__option",
      type: "button",
      text: nativeOption.textContent,
      dataset: { sortValue: nativeOption.value },
      attributes: { role: "option", "aria-selected": "false" },
    }));
    menu.append(...options);

    selectElement.classList.add("sort-field__native");
    selectElement.tabIndex = -1;
    selectElement.setAttribute("aria-hidden", "true");
    field.append(trigger, menu);

    const picker = { field, trigger, label, menu, options, selectElement, fallbackValue };

    function close({ focusTrigger = false } = {}) {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (focusTrigger) trigger.focus({ preventScroll: true });
    }

    function open() {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      options.find((option) => option.dataset.sortValue === selectElement.value)?.focus({ preventScroll: true });
    }

    function sync() {
      const selectedValue = SORT_LABELS[selectElement.value] ? selectElement.value : fallbackValue;
      const selectedLabel = SORT_LABELS[selectedValue] || "Sort notes";
      label.textContent = selectedLabel;
      options.forEach((option) => {
        const selected = option.dataset.sortValue === selectedValue;
        option.setAttribute("aria-selected", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
    }

    function setValue(value) {
      if (!SORT_LABELS[value]) return;
      selectElement.value = value;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      close({ focusTrigger: true });
    }

    trigger.addEventListener("click", () => {
      if (menu.hidden) open();
      else close();
    });
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      if (menu.hidden) open();
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".sort-field__option");
      if (option) setValue(option.dataset.sortValue);
    });
    menu.addEventListener("keydown", (event) => {
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close({ focusTrigger: true });
        return;
      }
      if (event.key === "Tab") {
        close();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        document.activeElement?.click();
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
    selectElement.addEventListener("change", sync);
    document.addEventListener("pointerdown", (event) => {
      if (!field.contains(event.target)) close();
    });

    picker.sync = sync;
    picker.open = open;
    picker.close = close;
    picker.setValue = setValue;

    sync();
    return picker;
  }

  function closeSortPicker(opts) { sortPicker?.close(opts); }
  function openSortPicker() { sortPicker?.open(); }
  function syncSortPicker() { sortPicker?.sync(); }
  function setSortPickerValue(val) { sortPicker?.setValue(val); }

  function enhanceSortSelect() {
    if (!sortPicker) {
      sortPicker = createCustomSortPicker(elements.sort, { idPrefix: "sort", fallbackValue: "created-desc" });
    }
    if (!secondarySortPicker && elements.secondarySort) {
      secondarySortPicker = createCustomSortPicker(elements.secondarySort, { idPrefix: "secondary-sort", fallbackValue: "updated-desc" });
    }
    return sortPicker;
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

  function tagFilterOptions() {
    return [...elements.tagFilterList.querySelectorAll(".tag-filter-option")];
  }

  function setTagFilterToggle({ hiddenCount = 0, expanded = false } = {}) {
    const visible = hiddenCount > 0 || expanded;
    elements.tagFilterToggle.classList.toggle("is-hidden", !visible);
    elements.tagFilterToggle.setAttribute("aria-expanded", String(expanded));
    elements.tagFilterToggle.setAttribute(
      "aria-label",
      expanded ? "Show fewer tags" : `Show ${hiddenCount} more tags`,
    );
    elements.tagFilterToggleLabel.textContent = expanded
      ? "Show less"
      : `Show ${hiddenCount} more`;
  }

  function sidebarNeedsTagHeightReduction() {
    const sidebarBounds = elements.sidebar.getBoundingClientRect();
    const controlsBounds = elements.regularFilterControls.getBoundingClientRect();
    const sidebarStyles = window.getComputedStyle(elements.sidebar);
    const borderBottom = Number.parseFloat(sidebarStyles.borderBottomWidth) || 0;
    const paddingBottom = Number.parseFloat(sidebarStyles.paddingBottom) || 0;
    const availableBottom = sidebarBounds.bottom - borderBottom - paddingBottom - TAG_FILTER_HEIGHT_RESERVE;
    const contentBottom = controlsBounds.bottom + elements.sidebar.scrollTop;
    return contentBottom > availableBottom;
  }

  function applyTagFilterLayout() {
    tagFilterLayoutFrame = 0;
    const options = tagFilterOptions();
    options.forEach((option) => option.classList.remove("is-tag-filter-hidden"));
    elements.sidebar.classList.remove("is-tag-filter-constrained");
    setTagFilterToggle();

    const isDesktop = window.matchMedia(TAG_FILTER_DESKTOP_QUERY).matches;
    const filtersUnavailable =
      ui.trashOnly ||
      ui.sidebarCollapsed ||
      elements.regularFilterControls.classList.contains("is-hidden");
    if (!options.length || !isDesktop || filtersUnavailable) {
      if (!isDesktop) ui.tagFiltersExpanded = false;
      return;
    }

    // Measure without a scrollbar taking width from the wrapping tag rows.
    elements.sidebar.classList.add("is-measuring-tag-filter");
    if (!sidebarNeedsTagHeightReduction()) {
      ui.tagFiltersExpanded = false;
      elements.sidebar.classList.remove("is-measuring-tag-filter");
      return;
    }

    if (ui.tagFiltersExpanded) {
      setTagFilterToggle({ expanded: true });
      elements.sidebar.classList.remove("is-measuring-tag-filter");
      return;
    }

    // The toggle consumes part of the available height, so include it before
    // removing complete tag rows until the sidebar fits the actual viewport.
    setTagFilterToggle({ hiddenCount: 1 });
    const hideRowsUntilSidebarFits = () => {
      let visibleCount = options.length;
      while (visibleCount > 0 && sidebarNeedsTagHeightReduction()) {
        const lastRowTop = options[visibleCount - 1].offsetTop;
        do {
          visibleCount -= 1;
          options[visibleCount].classList.add("is-tag-filter-hidden");
        } while (visibleCount > 0 && options[visibleCount - 1].offsetTop === lastRowTop);
      }
      return visibleCount;
    };

    let visibleCount = hideRowsUntilSidebarFits();
    if (visibleCount === 0) {
      // At short desktop heights the fixed navigation can consume the entire
      // sidebar before Tags. Compact secondary chrome only when tags alone
      // cannot remove the scrollbar, then measure the rows again.
      elements.sidebar.classList.add("is-tag-filter-constrained");
      options.forEach((option) => option.classList.remove("is-tag-filter-hidden"));
      visibleCount = hideRowsUntilSidebarFits();
    }

    setTagFilterToggle({ hiddenCount: options.length - visibleCount });
    elements.sidebar.classList.remove("is-measuring-tag-filter");
  }

  function scheduleTagFilterLayout() {
    if (tagFilterLayoutFrame) return;
    tagFilterLayoutFrame = window.requestAnimationFrame(applyTagFilterLayout);
  }

  function toggleTagFilterExpansion() {
    ui.tagFiltersExpanded = !ui.tagFiltersExpanded;
    const collapsed = !ui.tagFiltersExpanded;
    scheduleTagFilterLayout();
    if (collapsed) {
      window.requestAnimationFrame(() => {
        elements.sidebar.scrollTop = 0;
      });
    }
  }

  function observeTagFilterLayout() {
    if (tagFilterResizeObserver || typeof ResizeObserver !== "function") return;
    tagFilterResizeObserver = new ResizeObserver(scheduleTagFilterLayout);
    tagFilterResizeObserver.observe(elements.sidebar);
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
    scheduleTagFilterLayout();
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
          renderLibrary({ motion: "filter" });
        }, ["type", `type-${safeTypeColor(type)}`], `Filter by ${type.name}`),
      );
    }
    if (ui.todayOnly) {
      fragment.append(
        makeFilterPill("Created Today", () => {
          ui.todayOnly = false;
          persistFilters();
          resetToFirstPage();
          renderLibrary({ motion: "filter" });
        }, [], "Filter by Created Today"),
      );
    }
    if (ui.updatedTodayOnly) {
      fragment.append(
        makeFilterPill("Updated Today", () => {
          ui.updatedTodayOnly = false;
          persistFilters();
          resetToFirstPage();
          renderLibrary({ motion: "filter" });
        }, [], "Filter by Updated Today"),
      );
    }
    [...ui.tagIds].map(tagFor).filter(Boolean).forEach((tag) => {
      fragment.append(
        makeFilterPill(tagLabel(tag), () => {
          ui.tagIds.delete(tag.id);
          persistFilters();
          resetToFirstPage();
          renderLibrary({ motion: "filter" });
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
    return !ui.detailClosing && !elements.noteDetailWorkspace.classList.contains("is-hidden");
  }

  function isQuickViewOpen() {
    return isNoteEditorOpen() && ui.noteEditorMode === "preview";
  }

  function isNoteEditorOpen() {
    return isDetailWorkspaceOpen() && !elements.noteDialog.classList.contains("is-hidden");
  }

  function cancelNoteDetailAnimation() {
    noteDetailTransitionSequence += 1;
    noteDetailAnimation?.cancel();
    noteDetailAnimation = null;
    ui.detailClosing = false;
    elements.noteDetailWorkspace.inert = false;
    cancelSecondarySurfaceAnimation();
  }

  function animateNoteDetailIn() {
    cancelNoteDetailAnimation();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elements.noteDetailWorkspace.style.willChange = "opacity, transform";
    const animation = elements.noteDetailWorkspace.animate(
      reducedMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      {
        duration: reducedMotion ? MOTION.micro : MOTION.medium,
        easing: MOTION.easeOut,
      },
    );
    noteDetailAnimation = animation;
    animation.finished.catch(() => {}).finally(() => {
      elements.noteDetailWorkspace.style.willChange = "auto";
      if (noteDetailAnimation === animation) noteDetailAnimation = null;
    });
  }

  function openNoteDetail(surface, invoker = null) {
    const opensWorkspace = !isDetailWorkspaceOpen();
    if (opensWorkspace) {
      ui.detailScrollTop = window.scrollY;
      ui.viewInvoker = invoker instanceof HTMLElement ? invoker : null;
      ui.detailSourceCard?.classList.remove("is-detail-source");
      ui.detailSourceCard = ui.viewInvoker?.closest(".note-card") || null;
      ui.detailSourceCard?.classList.add("is-detail-source");
      elements.workspace.classList.add("is-note-detail-open");
      elements.noteDetailWorkspace.classList.remove("is-hidden");
      window.scrollTo(0, 0);
    }
    surface.classList.remove("is-hidden");
    if (opensWorkspace) animateNoteDetailIn();
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
    const transitionSequence = ++noteDetailTransitionSequence;
    noteDetailAnimation?.cancel();
    ui.detailClosing = true;
    elements.noteDetailWorkspace.inert = true;

    const finishClose = () => {
      if (transitionSequence !== noteDetailTransitionSequence) return;
      elements.noteDetailWorkspace.style.willChange = "auto";
      closeAnimation.cancel();
      if (noteDetailAnimation === closeAnimation) noteDetailAnimation = null;
      ui.detailClosing = false;
      elements.noteDetailWorkspace.inert = false;
      elements.noteDialog.classList.add("is-hidden");
      elements.quickViewDialog.classList.add("is-hidden");
      elements.noteDetailWorkspace.classList.add("is-hidden");
      elements.workspace.classList.remove("is-note-detail-open");
      closeDualPane({ immediate: true });
      ui.detailSourceCard?.classList.remove("is-detail-source");
      ui.detailSourceCard = null;
      window.requestAnimationFrame(() => {
        window.scrollTo(0, ui.detailScrollTop);
        if (restoreFocus) focusQuickViewFallback(invoker);
      });
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elements.noteDetailWorkspace.style.willChange = "opacity, transform";
    const closeAnimation = elements.noteDetailWorkspace.animate(
      reducedMotion
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(4px)" },
          ],
      {
        duration: reducedMotion ? MOTION.micro : MOTION.short,
        easing: MOTION.easeIn,
        fill: "forwards",
      },
    );
    noteDetailAnimation = closeAnimation;
    closeAnimation.finished.catch(() => {}).finally(finishClose);
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

  function setCopyTooltip(button, text) {
    if (!button || !text) return;
    const customTooltip = button.closest(".note-detail-action-tooltip")?.querySelector('[role="tooltip"]');
    if (customTooltip) {
      customTooltip.textContent = text;
      return;
    }
    button.setAttribute("title", text);
  }

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
    setCopyTooltip(button, copiedTitle);
    if (copiedLabel) button.setAttribute("aria-label", copiedLabel);

    const timer = setTimeout(() => {
      copyFeedbackTimers.delete(button);
      if (!button.isConnected) return;
      button.classList.remove("is-copied");
      setCopyTooltip(button, originalTitle);
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
    setCopyTooltip(button, originalTitle);
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

  function closeDualPane(options = {}) {
    const immediate = Boolean(options && typeof options === "object" && options.immediate);

    if (ui.secondaryNoteDirty) {
      void saveSecondaryNote({ isAutoSave: true });
    }
    clearTimeout(ui.secondaryAutoSaveTimer);
    ui.secondaryAutoSaveTimer = 0;

    if (!ui.dualPaneOpen && !ui.secondaryClosing) return;

    ui.dualPaneOpen = false;
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
    };

    if (
      immediate ||
      !elements.secondarySurface ||
      elements.secondarySurface.classList.contains("is-hidden") ||
      !isDetailWorkspaceOpen() ||
      ui.detailClosing
    ) {
      finishClose();
      return;
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
  }

  function openDualPane() {
    if (!isDetailWorkspaceOpen()) return;
    ui.dualPaneOpen = true;
    ui.secondaryClosing = false;
    ui.activePane = "secondary";
    elements.noteDetailWorkspace?.classList.add("is-side-by-side");
    elements.workspace?.classList.add("is-side-by-side-open");
    elements.secondarySurface?.classList.remove("is-hidden");
    elements.toggleDualPane?.setAttribute("aria-pressed", "true");
    elements.toggleDualPane?.classList.add("is-active");

    if (ui.secondaryNoteId) {
      const note = library.notes.find((n) => n.id === ui.secondaryNoteId && !isDeletedNote(n));
      if (note && note.id !== ui.editingNoteId) {
        showSecondaryReader(note);
        animateSecondarySurfaceIn();
        return;
      }
    }
    showSecondaryPicker();
    animateSecondarySurfaceIn();
  }

  function toggleDualPane() {
    if (ui.dualPaneOpen) {
      closeDualPane();
    } else {
      openDualPane();
    }
  }

  function showSecondaryPicker() {
    if (ui.secondaryNoteDirty) {
      void saveSecondaryNote({ isAutoSave: true });
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
      elements.secondaryNoteSearch?.focus();
    });
  }

  const noteCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function renderSecondaryNotesList() {
    if (!elements.secondaryNotesList) return;
    const query = (ui.secondarySearchQuery || "").trim().toLowerCase();
    const currentNoteId = ui.editingNoteId;

    if (elements.secondaryNoteSearch && elements.secondaryNoteSearch.value !== (ui.secondarySearchQuery || "")) {
      elements.secondaryNoteSearch.value = ui.secondarySearchQuery || "";
    }
    elements.secondaryClearSearch?.classList.toggle("is-hidden", !query);
    if (elements.secondarySort) {
      elements.secondarySort.value = ui.secondarySort || "updated-desc";
      secondarySortPicker?.sync();
    }

    const availableNotes = library.notes.filter((note) => {
      if (isDeletedNote(note)) return false;
      if (note.id === currentNoteId) return false;
      if (!query) return true;
      const titleMatch = (note.title || "").toLowerCase().includes(query);
      const contentMatch = (note.content || "").toLowerCase().includes(query);
      return titleMatch || contentMatch;
    });

    const sortMode = ui.secondarySort || "updated-desc";
    availableNotes.sort((left, right) => {
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

    if (!availableNotes.length) {
      const empty = createElement("div", {
        className: "secondary-notes-empty",
        text: query ? `No notes matching “${query}”.` : "No other notes available to open as side note.",
      });
      elements.secondaryNotesList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    availableNotes.forEach((note) => {
      const type = typeFor(note.typeId);
      const card = createElement("article", {
        className: "note-card secondary-note-card",
      });
      const content = createElement("div", { className: "note-card__content" });
      const meta = createElement("div", { className: "note-card__meta" });
      meta.append(makeTypeBadge(type, { isFilter: false }));
      const dateInfo = getNoteCardDateInfo(note);
      meta.append(createElement("time", {
        className: "note-card__date",
        text: dateInfo.text,
        attributes: { datetime: dateInfo.datetime, title: dateInfo.title },
      }));

      const titleButton = createElement("button", {
        className: "note-card__title",
        type: "button",
        attributes: { "aria-label": `Open side note: ${note.title || "Untitled note"}` },
      });
      appendHighlightedText(titleButton, note.title || "Untitled note");
      titleButton.addEventListener("click", () => selectSecondaryNote(note.id));

      const preview = createElement("p", { className: "note-card__preview" });
      appendHighlightedText(preview, previewForSearch(note.content));
      content.append(meta, titleButton, preview);

      const footer = createElement("div", { className: "note-card__footer" });
      const tags = createElement("div", { className: "note-card__tags" });
      const resolvedTags = (note.tagIds || []).map(tagFor).filter(Boolean);
      resolvedTags.slice(0, 3).forEach((tag) => {
        tags.append(createElement("span", { className: "tag-chip", text: tagLabel(tag) }));
      });
      if (resolvedTags.length > 3) {
        tags.append(createElement("span", { className: "more-tags", text: `+${resolvedTags.length - 3}` }));
      }
      if (!resolvedTags.length) tags.append(createElement("span", { className: "untagged", text: "No tags" }));
      footer.append(tags);

      card.append(content, footer);
      card.addEventListener("click", (event) => {
        if (!event.target.closest("button")) {
          selectSecondaryNote(note.id);
        }
      });

      fragment.append(card);
    });

    elements.secondaryNotesList.append(fragment);
  }

  function setSecondarySaveStatus(status) {
    if (!elements.secondarySaveStatus) return;
    elements.secondarySaveStatus.classList.remove("is-saved", "is-dirty", "is-saving", "is-error");
    if (status === "saved") {
      elements.secondarySaveStatus.classList.add("is-saved");
      if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Saved";
      elements.secondarySaveStatus.title = "This note is saved";
    } else if (status === "dirty") {
      elements.secondarySaveStatus.classList.add("is-dirty");
      if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Unsaved changes";
      elements.secondarySaveStatus.title = "You have unsaved changes in this side note";
    } else if (status === "saving") {
      elements.secondarySaveStatus.classList.add("is-saving");
      if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Saving…";
      elements.secondarySaveStatus.title = "Saving changes…";
    } else if (status === "error") {
      elements.secondarySaveStatus.classList.add("is-error");
      if (elements.secondarySaveStatusLabel) elements.secondarySaveStatusLabel.textContent = "Save failed";
      elements.secondarySaveStatus.title = "Could not save side note";
    }
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

  let secondarySplitPreviewFrame = 0;

  function renderSecondarySplitPreview() {
    if (ui.secondaryNoteMode !== "split" || !elements.secondarySplitPreview || !elements.secondaryNoteContentEditor) return;
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
    ui.secondaryNoteDirty = true;
    setSecondarySaveStatus("dirty");

    if (ui.secondaryNoteMode === "split") {
      scheduleSecondarySplitPreview();
    }
    if (elements.secondaryNoteContent && elements.secondaryNoteContentEditor) {
      globalThis.NookMarkdown.renderInto(elements.secondaryNoteContent, elements.secondaryNoteContentEditor.value);
    }
    if (elements.secondaryNoteTitle && elements.secondaryNoteTitleInput) {
      elements.secondaryNoteTitle.textContent = elements.secondaryNoteTitleInput.value.trim() || "Untitled note";
    }

    syncSecondaryFooterActions();

    clearTimeout(ui.secondaryAutoSaveTimer);
    ui.secondaryAutoSaveTimer = setTimeout(() => {
      void saveSecondaryNote({ isAutoSave: true });
    }, 1200);
  }

  async function saveSecondaryNote({ isAutoSave = false } = {}) {
    if (!ui.secondaryNoteId) return;
    const note = library.notes.find((n) => n.id === ui.secondaryNoteId);
    if (!note) return;

    const newTitle = elements.secondaryNoteTitleInput
      ? elements.secondaryNoteTitleInput.value.trim() || "Untitled note"
      : note.title;
    const newContent = elements.secondaryNoteContentEditor
      ? elements.secondaryNoteContentEditor.value
      : note.content;
    const newTypeId = elements.secondaryEditorTypeSelect?.value || ui.secondaryNoteTypeId || note.typeId || storage.FALLBACK_TYPE_ID;
    const newTagIds = Array.from(ui.secondarySelectedNoteTagIds || note.tagIds || []);

    setSecondarySaveStatus("saving");
    try {
      const saved = await storage.saveNote({
        id: note.id,
        title: newTitle,
        typeId: newTypeId,
        tagIds: newTagIds,
        content: newContent,
      });

      const index = library.notes.findIndex((n) => n.id === saved.id);
      if (index >= 0) library.notes[index] = saved;
      else library.notes.push(saved);

      ui.secondaryNoteDirty = false;
      setSecondarySaveStatus("saved");
      syncSecondaryFooterActions();

      if (elements.secondaryNoteTitle) elements.secondaryNoteTitle.textContent = saved.title || "Untitled note";
      if (elements.secondaryNoteType) {
        elements.secondaryNoteType.replaceChildren(makeTypeBadge(typeFor(saved.typeId)));
      }
      renderSecondaryPreviewTags(saved.tagIds);
      renderSecondaryTimestamps(saved.createdAt, saved.updatedAt);

      await refreshLibrary({ broadcast: true });

      if (!isAutoSave) {
        showToast("Side note saved.");
      }
    } catch (error) {
      setSecondarySaveStatus("error");
      showError(error, "Could not save side note.");
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

  function selectSecondaryNote(noteId) {
    ui.secondaryNoteId = noteId;
    ui.secondaryNotePreviewHeaderCollapsed = false;
    const note = library.notes.find((n) => n.id === noteId);
    if (!note) return;
    showSecondaryReader(note);
  }

  function showSecondaryReader(note) {
    elements.secondaryPickerView?.classList.add("is-hidden");
    elements.secondaryReaderView?.classList.remove("is-hidden");
    renderSecondaryReader(note);
    animateSecondaryViewSwitch(elements.secondaryReaderView);
  }

  function renderSecondaryReader(note) {
    if (!elements.secondaryReaderView) return;
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
      downloadNoteFile(exportNote, "md");
      showToast(`Exported “${exportNote.title}” as .md.`);
    } catch (error) {
      showError(error, "We could not export this note.");
    }
  }

  function exportSecondaryNoteText() {
    if (!ui.secondaryNoteId) return;
    const note = library.notes.find((n) => n.id === ui.secondaryNoteId);
    if (!note) return;
    const title = elements.secondaryNoteTitleInput ? elements.secondaryNoteTitleInput.value.trim() : note.title;
    const content = elements.secondaryNoteContentEditor ? elements.secondaryNoteContentEditor.value : note.content;
    const exportNote = { ...note, title: title || "Untitled note", content };
    try {
      downloadNoteFile(exportNote, "txt");
      showToast(`Exported “${exportNote.title}” as .txt.`);
    } catch (error) {
      showError(error, "We could not export this note.");
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
        ["path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" }],
        ["circle", { cx: "12", cy: "12", r: "3" }],
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

  function animateNotesContent(motion) {
    if (!motion || motion === "none") return;
    notesContentAnimation?.cancel();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isPagination = motion.startsWith("page-");
    const offset = motion === "page-next" ? 8 : motion === "page-previous" ? -8 : 0;

    const animation = elements.notesList.animate(
      reducedMotion || !isPagination
        ? [{ opacity: 0.6 }, { opacity: 1 }]
        : [
            { opacity: 0.72, transform: `translateX(${offset}px)` },
            { opacity: 1, transform: "translateX(0)" },
          ],
      {
        duration: reducedMotion ? MOTION.micro : MOTION.short,
        easing: MOTION.easeOut,
      },
    );
    notesContentAnimation = animation;
    animation.finished.catch(() => {}).finally(() => {
      if (notesContentAnimation === animation) notesContentAnimation = null;
    });
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
      renderNotes({ motion: "page-previous" });
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
        const previousPage = ui.page;
        ui.page = page;
        renderNotes({ motion: page > previousPage ? "page-next" : "page-previous" });
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
      renderNotes({ motion: "page-next" });
    });
    elements.pagination.append(next);
  }

  function renderNotes({ motion = "none" } = {}) {
    syncViewModeUI();
    elements.sort.value = ui.sort;
    syncSortPicker();
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
    elements.sortDescription.textContent = `Sorted: ${SORT_LABELS[ui.sort]}`;
    const hasSearchQuery = Boolean(ui.query);
    elements.clearSearch.classList.toggle("is-hidden", !hasSearchQuery);
    elements.searchShortcut.classList.toggle("is-hidden", hasSearchQuery);
    elements.searchField.classList.toggle("has-search-query", hasSearchQuery);
    elements.notesList.setAttribute("aria-busy", "false");

    if (!pageNotes.length) {
      renderEmptyState(notesInActiveCollection().length > 0);
      renderPagination(0);
      animateNotesContent(motion);
      return;
    }

    const fragment = document.createDocumentFragment();
    pageNotes.forEach((note) => fragment.append(createNoteCard(note)));
    elements.notesList.replaceChildren(fragment);
    renderPagination(totalPages);
    if (ui.dualPaneOpen) {
      if (ui.secondaryNoteId) {
        const secondaryNote = library.notes.find((n) => n.id === ui.secondaryNoteId && !isDeletedNote(n));
        if (secondaryNote && secondaryNote.id !== ui.editingNoteId) {
          renderSecondaryReader(secondaryNote);
        } else {
          showSecondaryPicker();
        }
      } else {
        renderSecondaryNotesList();
      }
    }
    animateNotesContent(motion);
  }

  Object.assign(api, {
    makeTypeBadge,
    makeTagButton,
    scheduleTagFilterLayout,
    toggleTagFilterExpansion,
    observeTagFilterLayout,
    renderSidebar,
    createChipCloseIcon,
    makeFilterPill,
    renderActiveFilters,
    noteForQuickView,
    previewNoteFromEditor,
    renderQuickView,
    syncNotePreviewActions,
    isDetailWorkspaceOpen,
    isQuickViewOpen,
    isNoteEditorOpen,
    openNoteDetail,
    closeNoteDetail,
    syncQuickViewHeight,
    scheduleQuickViewHeightSync,
    focusQuickViewFallback,
    closeQuickView,
    openQuickView,
    writeClipboardText,
    markButtonCopied,
    resetCopyButtonFeedback,
    copyQuickViewContent,
    copyNoteCardContent,
    createPinIcon,
    createRestoreIcon,
    toggleNotePinned,
    restoreNoteWithFeedback,
    permanentlyDeleteNoteWithConfirmation,
    emptyTrashWithConfirmation,
    createNoteCardActionIcon,
    createNoteCard,
    renderEmptyState,
    animateNotesContent,
    enhanceSortSelect,
    syncSortPicker,
    paginationItems,
    renderPagination,
    renderNotes,
    closeDualPane,
    openDualPane,
    toggleDualPane,
    showSecondaryPicker,
    renderSecondaryNotesList,
    selectSecondaryNote,
    showSecondaryReader,
    renderSecondaryReader,
    copySecondaryNoteContent,
    exportSecondaryNoteMarkdown,
    exportSecondaryNoteText,
    setSecondaryNoteMode,
    syncSecondaryNotePreviewHeader,
    toggleSecondaryNotePreviewHeader,
    onSecondaryNoteInput,
    saveSecondaryNote,
    syncSecondaryFooterActions,
  });
});
