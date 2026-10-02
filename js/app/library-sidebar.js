(() => {
  "use strict";

  // Sidebar filters and shared metadata badges/card tag fitting.
  globalThis[Symbol.for("nook.app.modules")].register("library-sidebar", (app) => {

    const { api, storage, elements, library, ui } = app;
    let tagFilterLayoutFrame = 0;
    let tagFilterResizeObserver = null;
    let noteCardTagResizeObserver = null;
    const TAG_FILTER_DESKTOP_QUERY = "(min-width: 821px)";
    const TAG_FILTER_HEIGHT_RESERVE = 12;
    const syncMobileFilterToggle = (...args) => api.syncMobileFilterToggle(...args);
    const persistFilters = (...args) => api.persistFilters(...args);
    const createElement = (...args) => api.createElement(...args);
    const typeFor = (...args) => api.typeFor(...args);
    const tagFor = (...args) => api.tagFor(...args);
    const tagLabel = (...args) => api.tagLabel(...args);
    const safeTypeColor = (...args) => api.safeTypeColor(...args);
    const resetToFirstPage = (...args) => api.resetToFirstPage(...args);
    const setTypeFilter = (...args) => api.setTypeFilter(...args);
    const toggleTagFilter = (...args) => api.toggleTagFilter(...args);
    const isDeletedNote = (...args) => api.isDeletedNote(...args);
    const notesInActiveCollection = (...args) => api.notesInActiveCollection(...args);
    const syncClearFiltersState = (...args) => api.syncClearFiltersState(...args);
    const renderLibrary = (...args) => api.renderLibrary(...args);
    const renderSearchResults = (...args) => api.renderSearchResults(...args);


    function makeTypeBadge(type, { isFilter = false } = {}) {
      const resolvedType = type || typeFor(storage.FALLBACK_TYPE_ID) || {
        id: storage.FALLBACK_TYPE_ID,
        name: "General",
        color: "slate",
      };
      const selected = ui.typeId === resolvedType.id;
      const badge = createElement(isFilter ? "button" : "span", {
        className: `type-badge type-badge--${safeTypeColor(resolvedType)}${isFilter ? " type-badge--filter" : ""}`,
        type: isFilter ? "button" : undefined,
        text: resolvedType.name,
        attributes: {
          "aria-label": isFilter ? `Filter by note type ${resolvedType.name}` : resolvedType.name,
          "aria-pressed": isFilter ? String(selected) : undefined,
          title: isFilter ? `Filter by ${resolvedType.name}` : resolvedType.name,
        },
      });
      if (isFilter) badge.addEventListener("click", () => setTypeFilter(resolvedType.id));
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

    function fitNoteCardTagRow(row) {
      const chips = [...row.querySelectorAll(":scope > .tag-chip")];
      const more = row.querySelector(":scope > .more-tags");
      if (!more || !chips.length || !row.clientWidth) return;

      chips.forEach((chip) => chip.classList.remove("is-hidden"));
      more.classList.add("is-hidden");
      const widths = chips.map((chip) => chip.getBoundingClientRect().width);
      const gap = Number.parseFloat(window.getComputedStyle(row).columnGap) || 0;
      const available = row.clientWidth;
      const fullWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (chips.length - 1);
      let visibleCount = chips.length;

      if (fullWidth > available) {
        visibleCount = 0;
        for (let candidate = chips.length - 1; candidate >= 0; candidate -= 1) {
          const hiddenCount = chips.length - candidate;
          const chipWidth = widths.slice(0, candidate).reduce((sum, width) => sum + width, 0);
          const chipGaps = gap * Math.max(0, candidate - 1);
          more.textContent = `+${hiddenCount}`;
          more.classList.remove("is-hidden");
          const moreWidth = more.getBoundingClientRect().width;
          more.classList.add("is-hidden");
          const moreGap = candidate ? gap : 0;
          if (chipWidth + chipGaps + moreGap + moreWidth <= available) {
            visibleCount = candidate;
            break;
          }
        }
      }

      chips.slice(visibleCount).forEach((chip) => chip.classList.add("is-hidden"));
      const hiddenCount = chips.length - visibleCount;
      more.classList.toggle("is-hidden", hiddenCount === 0);
      if (hiddenCount) {
        const hiddenLabels = chips.slice(visibleCount).map((chip) => chip.textContent).join(", ");
        more.textContent = `+${hiddenCount}`;
        more.title = hiddenLabels;
        more.setAttribute("aria-label", `${hiddenCount} more tags: ${hiddenLabels}`);
      }
    }

    function observeNoteCardTagRows() {
      const rows = [...document.querySelectorAll(".note-card__tags:has(> .more-tags)")];
      noteCardTagResizeObserver?.disconnect();
      if (!noteCardTagResizeObserver && typeof ResizeObserver === "function") {
        noteCardTagResizeObserver = new ResizeObserver((entries) => {
          entries.forEach(({ target }) => fitNoteCardTagRow(target));
        });
      }
      rows.forEach((row) => noteCardTagResizeObserver?.observe(row));
      window.requestAnimationFrame(() => rows.forEach(fitNoteCardTagRow));
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
      const mobileFilterFocus = elements.mobileFilterDialog?.open
        ? document.activeElement?.getAttribute("aria-label") : null;
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
      elements.notesPanel.classList.toggle("is-trash-view", ui.trashOnly);
      elements.notesHeading.textContent = ui.trashOnly ? "Trash" : "All notes";
      elements.notesSubtitle.textContent = ui.trashOnly
        ? "Deleted notes stay here until you restore or permanently remove them."
        : "Browse, search, and manage your complete collection of personal notes.";
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
      if (mobileFilterFocus) {
        [...elements.regularFilterControls.querySelectorAll("[aria-label]")]
          .find((control) => control.getAttribute("aria-label") === mobileFilterFocus)?.focus({ preventScroll: true });
      }
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
          }, ["type", `type-${safeTypeColor(type)}`, `type-badge--${safeTypeColor(type)}`], `Filter by ${type.name}`),
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

    Object.assign(api, {
      makeTypeBadge,
      makeTagButton,
      observeNoteCardTagRows,
      scheduleTagFilterLayout,
      toggleTagFilterExpansion,
      observeTagFilterLayout,
      renderSidebar,
      createChipCloseIcon,
      makeFilterPill,
      renderActiveFilters,
    });
  });
})();
