(() => {
  "use strict";

  // Search indexing, highlighting, filtering, sorting, and query scheduling.
  globalThis[Symbol.for("nook.app.modules")].register("search", (app) => {

    const { api, storage, elements, library, ui } = app;
    const SEARCH_RENDER_DELAY = 150;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const persistFilters = (...args) => api.persistFilters(...args);
    const persistSort = (...args) => api.persistSort(...args);
    const renderLibrary = (...args) => api.renderLibrary(...args);
    const renderSearchResults = (...args) => api.renderSearchResults(...args);
    const createElement = (...args) => api.createElement(...args);

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
      renderLibrary({ motion: "filter" });
    }

    function toggleTagFilter(tagId) {
      if (ui.tagIds.has(tagId)) ui.tagIds.delete(tagId);
      else ui.tagIds.add(tagId);
      persistFilters();
      resetToFirstPage();
      renderLibrary({ motion: "filter" });
    }

    function toggleTodayFilter() {
      ui.todayOnly = !ui.todayOnly;
      persistFilters();
      resetToFirstPage();
      renderLibrary({ motion: "filter" });
    }

    function toggleUpdatedTodayFilter() {
      ui.updatedTodayOnly = !ui.updatedTodayOnly;
      persistFilters();
      resetToFirstPage();
      renderLibrary({ motion: "filter" });
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
      renderLibrary({ motion: "filter" });
    }

    function showTrashSpace() {
      resetRegularFilters();
      ui.trashOnly = true;
      persistFilters();
      resetToFirstPage();
      renderLibrary({ motion: "filter" });
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
      renderLibrary({ motion: "filter" });
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
      if (ui.secondarySelectedNoteTagIds) {
        ui.secondarySelectedNoteTagIds = new Set(
          [...ui.secondarySelectedNoteTagIds].filter((tagId) => availableTagIds.has(tagId)),
        );
      }
      if (ui.secondaryNoteTypeId && !availableTypeIds.has(ui.secondaryNoteTypeId)) {
        ui.secondaryNoteTypeId = storage.FALLBACK_TYPE_ID;
      }
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
      const timestamps = new Map();
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
        timestamps.set(note, { createdAt, updatedAt });
        if (!normalizedQuery) return true;
        const searchableText =
          library.searchIndex.get(note.id) || `${note.title}\n${note.content}`.toLocaleLowerCase();
        return searchableText.includes(normalizedQuery);
      });

      return notes.sort((left, right) => {
        if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
        const leftTime = timestamps.get(left);
        const rightTime = timestamps.get(right);
        if (ui.sort === "title-asc" || ui.sort === "title-desc") {
          const direction = ui.sort === "title-asc" ? 1 : -1;
          const titleComparison = collator.compare(left.title, right.title);
          if (titleComparison) return titleComparison * direction;
        } else if (ui.sort === "updated-asc" || ui.sort === "updated-desc") {
          const direction = ui.sort === "updated-asc" ? 1 : -1;
          const updatedComparison = leftTime.updatedAt - rightTime.updatedAt;
          if (!Number.isNaN(updatedComparison) && updatedComparison) return updatedComparison * direction;
        } else {
          const direction = ui.sort === "created-asc" ? 1 : -1;
          const dateComparison = leftTime.createdAt - rightTime.createdAt;
          if (!Number.isNaN(dateComparison) && dateComparison) return dateComparison * direction;
        }

        const timestampComparison = rightTime.createdAt - leftTime.createdAt;
        if (!Number.isNaN(timestampComparison) && timestampComparison) return timestampComparison;
        return collator.compare(left.id, right.id);
      });
    }

    Object.assign(api, {
      normalizedSearchQuery,
      appendHighlightedText,
      previewForSearch,
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
  });
})();
