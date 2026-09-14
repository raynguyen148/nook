globalThis[Symbol.for("nook.app.modules")].register("organize", (app) => {
  "use strict";

  // Type/tag management, render orchestration, and import/export workflows.
  const { api, storage, elements, library, ui, constants, shared } = app;
  const { MOTION } = constants;
  const { openColorPickers } = shared;
  const colorPickerInstances = new WeakMap();
  const managementAnimations = new WeakMap();
  let refreshSequence = 0;
  let appliedRefreshSequence = 0;

  const persistFilters = (...args) => api.persistFilters(...args);
  const resetRegularFilters = (...args) => api.resetRegularFilters(...args);
  const clearStoredNoteDraft = (...args) => api.clearStoredNoteDraft(...args);
  const recordBackupExport = (...args) => api.recordBackupExport(...args);
  const createElement = (...args) => api.createElement(...args);
  const typeFor = (...args) => api.typeFor(...args);
  const tagLabel = (...args) => api.tagLabel(...args);
  const safeTypeColor = (...args) => api.safeTypeColor(...args);
  const pluralize = (...args) => api.pluralize(...args);
  const notifyLibraryMutation = (...args) => api.notifyLibraryMutation(...args);
  const syncToastHost = (...args) => api.syncToastHost(...args);
  const showToast = (...args) => api.showToast(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const showError = (...args) => api.showError(...args);
  const resetToFirstPage = (...args) => api.resetToFirstPage(...args);
  const clearSearchRenderTimer = (...args) => api.clearSearchRenderTimer(...args);
  const ensureUiReferencesAreValid = (...args) => api.ensureUiReferencesAreValid(...args);
  const syncClearFiltersState = (...args) => api.syncClearFiltersState(...args);
  const renderSidebar = (...args) => api.renderSidebar(...args);
  const renderActiveFilters = (...args) => api.renderActiveFilters(...args);
  const noteForQuickView = (...args) => api.noteForQuickView(...args);
  const previewNoteFromEditor = (...args) => api.previewNoteFromEditor(...args);
  const renderQuickView = (...args) => api.renderQuickView(...args);
  const isQuickViewOpen = (...args) => api.isQuickViewOpen(...args);
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const closeQuickView = (...args) => api.closeQuickView(...args);
  const renderNotes = (...args) => api.renderNotes(...args);
  const renderNoteTypeOptions = (...args) => api.renderNoteTypeOptions(...args);
  const renderSelectedNoteTags = (...args) => api.renderSelectedNoteTags(...args);
  const renderTagSuggestions = (...args) => api.renderTagSuggestions(...args);
  const hasUnsavedNoteChanges = (...args) => api.hasUnsavedNoteChanges(...args);
  const syncNoteEditorControls = (...args) => api.syncNoteEditorControls(...args);
  const isDeletedNote = (...args) => api.isDeletedNote(...args);

  function managementTabs() {
    return [
      ["types", elements.typesTab, elements.typesPanel],
      ["tags", elements.tagsTab, elements.tagsPanel],
      ["display", elements.displayTab, elements.displayPanel],
      ["data", elements.dataTab, elements.dataPanel],
      ["shortcuts", elements.shortcutsTab, elements.shortcutsPanel],
    ];
  }

  function setManagementTab(tab) {
    const tabs = managementTabs();
    const nextTab = tabs.some(([name]) => name === tab) ? tab : "types";
    const changed = ui.managementTab !== nextTab;
    ui.managementTab = nextTab;
    tabs.forEach(([name, tabElement, panel]) => {
      const active = name === nextTab;
      tabElement.classList.toggle("is-active", active);
      tabElement.setAttribute("aria-selected", String(active));
      tabElement.tabIndex = active ? 0 : -1;
      panel.classList.toggle("is-hidden", !active);
    });
    if (changed && elements.organizeDialog.open) {
      const activePanel = tabs.find(([name]) => name === nextTab)[2];
      animateManagementSurface(activePanel);
    }
  }

  function animateManagementSurface(surface) {
    managementAnimations.get(surface)?.cancel();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = surface.animate(
      [{ opacity: reducedMotion ? 0.82 : 0.62 }, { opacity: 1 }],
      { duration: reducedMotion ? MOTION.micro : MOTION.short, easing: MOTION.easeOut },
    );
    managementAnimations.set(surface, animation);
    animation.finished.catch(() => {}).finally(() => {
      if (managementAnimations.get(surface) === animation) managementAnimations.delete(surface);
    });
  }

  function syncManagementControls() {
    const typeCount = library.types.length;
    const tagCount = library.tags.length;
    const showingTypes = ui.managementCreateKind === "types";
    const showingTags = ui.managementCreateKind === "tags";

    elements.typesPanelCount.textContent = pluralize(typeCount, "type");
    elements.tagsPanelCount.textContent = pluralize(tagCount, "tag");
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

  function formatUsageCounts(total, active) {
    return `${total} total · ${active} active`;
  }

  function createTrashUsageIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const lid = document.createElementNS("http://www.w3.org/2000/svg", "path");
    lid.setAttribute("d", "M3 6h18M9 6V4h6v2M6 6l1 14h10l1-14");
    svg.append(lid);
    return svg;
  }

  function createManagementUsageMetadata(total, active) {
    const metadata = createElement("div", { className: "management-row__metadata" });
    metadata.append(createElement("span", { className: "management-row__usage", text: pluralize(active, "note") }));

    const trashed = Math.max(0, total - active);
    if (!trashed) return metadata;

    const trashUsage = createElement("span", {
      className: "management-row__trash-usage",
      title: `${pluralize(trashed, "note")} in Trash`,
    });
    trashUsage.append(
      createTrashUsageIcon(),
      createElement("span", { text: String(trashed), attributes: { "aria-hidden": "true" } }),
      createElement("span", { className: "sr-only", text: `${pluralize(trashed, "note")} in Trash` }),
    );
    metadata.append(trashUsage);
    return metadata;
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
    const tabs = managementTabs();
    const currentIndex = tabs.findIndex(([, tabElement]) => tabElement === event.currentTarget);
    if (currentIndex < 0) return;

    let nextIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const [nextTabName, nextTab] = tabs[nextIndex];
    setManagementTab(nextTabName);
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

  function renderTypeManagement({ animate = false } = {}) {
    const totalUsageCounts = new Map();
    const activeUsageCounts = new Map();
    library.notes.forEach((note) => {
      totalUsageCounts.set(note.typeId, (totalUsageCounts.get(note.typeId) || 0) + 1);
      if (!isDeletedNote(note)) activeUsageCounts.set(note.typeId, (activeUsageCounts.get(note.typeId) || 0) + 1);
    });
    elements.typesList.replaceChildren();
    const visibleTypes = library.types.filter((type) => managementMatchesQuery("types", type.name));
    if (!visibleTypes.length) {
      const query = ui.managementQueries.types.trim();
      elements.typesList.append(
        createElement("p", { className: "management-empty", text: query ? `No note types match “${query}”.` : "No note types yet." }),
      );
      if (animate) animateManagementSurface(elements.typesList);
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleTypes.forEach((type) => {
      const totalUsage = totalUsageCounts.get(type.id) || 0;
      const activeUsage = activeUsageCounts.get(type.id) || 0;
      const usageLabel = formatUsageCounts(totalUsage, activeUsage);
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
        controls.append(colorPicker.root, createElement("span", { className: "usage-count", text: usageLabel }), cancel, save);
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
        const metadata = createManagementUsageMetadata(totalUsage, activeUsage);
        const edit = createElement("button", {
          className: "button button-secondary button-compact",
          type: "button",
          text: "Edit",
          attributes: { "aria-label": `Edit ${type.name}` },
        });
        main.append(createElement("span", { className: "management-row__name", text: type.name }));
        if (type.id === storage.FALLBACK_TYPE_ID) main.append(createElement("span", { className: "management-row__default", text: "Default" }));
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
            const affected = totalUsageCounts.get(type.id) || 0;
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
        row.append(main, metadata, actions);
      }
      fragment.append(row);
    });
    elements.typesList.append(fragment);
    if (animate) animateManagementSurface(elements.typesList);
  }

  function renderTagManagement({ animate = false } = {}) {
    const totalUsageCounts = new Map();
    const activeUsageCounts = new Map();
    library.notes.forEach((note) => {
      note.tagIds.forEach((tagId) => {
        totalUsageCounts.set(tagId, (totalUsageCounts.get(tagId) || 0) + 1);
        if (!isDeletedNote(note)) activeUsageCounts.set(tagId, (activeUsageCounts.get(tagId) || 0) + 1);
      });
    });
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
      if (animate) animateManagementSurface(elements.tagsList);
      return;
    }
    const fragment = document.createDocumentFragment();
    visibleTags.forEach((tag) => {
      const totalUsage = totalUsageCounts.get(tag.id) || 0;
      const activeUsage = activeUsageCounts.get(tag.id) || 0;
      const usageLabel = formatUsageCounts(totalUsage, activeUsage);
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
        controls.append(createElement("span", { className: "usage-count", text: usageLabel }), cancel, save);
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
        const metadata = createManagementUsageMetadata(totalUsage, activeUsage);
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
        actions.append(edit, remove);
        edit.addEventListener("click", () => startManagementEdit("tags", tag.id));
        remove.addEventListener("click", async () => {
          const affected = totalUsageCounts.get(tag.id) || 0;
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
        row.append(main, metadata, actions);
      }
      fragment.append(row);
    });
    elements.tagsList.append(fragment);
    if (animate) animateManagementSurface(elements.tagsList);
  }

  function renderManagement() {
    renderTypeManagement();
    renderTagManagement();
    syncManagementControls();
    setManagementTab(ui.managementTab);
  }

  function renderLibrary({ motion = "none" } = {}) {
    clearSearchRenderTimer();
    ensureUiReferencesAreValid();
    renderSidebar();
    renderActiveFilters();
    renderNotes({ motion });
    if (elements.organizeDialog.open) renderManagement();
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
    renderNotes({ motion: "search" });
    syncClearFiltersState();
  }

  async function refreshLibrary({ broadcast = false, external = false } = {}) {
    // Broadcast the committed mutation even if this refresh is superseded.
    if (broadcast) notifyLibraryMutation();
    if (external && isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      ui.externalRefreshPending = true;
      showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      return;
    }
    const sequence = ++refreshSequence;
    const snapshot = await storage.getSnapshot();
    if (sequence < appliedRefreshSequence) return;
    // The user may have started typing while IndexedDB was being read.
    if (external && isNoteEditorOpen() && hasUnsavedNoteChanges()) {
      ui.externalRefreshPending = true;
      showToast("The library changed in another tab. Save or close this note to refresh.", "error");
      return;
    }
    appliedRefreshSequence = sequence;
    const previousNotes = new Map(library.notes.map((note) => [note.id, note]));
    const searchIndex = new Map(snapshot.notes.map((note) => {
      const previous = previousNotes.get(note.id);
      const unchanged = previous?.title === note.title && previous?.content === note.content;
      return [note.id, unchanged && library.searchIndex.has(note.id)
        ? library.searchIndex.get(note.id)
        : `${note.title}\n${note.content}`.toLocaleLowerCase()];
    }));
    library.notes = snapshot.notes;
    library.types = snapshot.types;
    library.tags = snapshot.tags;
    library.searchIndex = searchIndex;
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

  function syncDeleteLibraryConfirmation() {
    const confirmationMatches = elements.deleteLibraryConfirmation.value.trim() === "DELETE";
    const busy = ui.deleteLibraryInFlight || ui.deleteLibraryBackupInFlight;
    elements.deleteLibraryConfirmation.disabled = ui.deleteLibraryInFlight;
    elements.deleteLibraryBackup.disabled = busy;
    elements.confirmDeleteLibrary.disabled = !confirmationMatches || busy;
    elements.confirmDeleteLibrary.textContent = ui.deleteLibraryInFlight ? "Deleting…" : "Delete all data";
    elements.deleteLibraryDialog.setAttribute("aria-busy", String(busy));
  }

  function openDeleteLibraryDialog() {
    if (elements.deleteLibraryDialog.open || ui.deleteLibraryInFlight) return;
    const noteCount = library.notes.length;
    const trashCount = library.notes.filter(isDeletedNote).length;
    const trashDetail = trashCount ? `, including ${pluralize(trashCount, "note")} in Trash,` : "";
    elements.deleteLibraryDescription.textContent =
      `This permanently deletes ${pluralize(noteCount, "note")}${trashDetail} and ${pluralize(library.tags.length, "tag")}. ` +
      `It resets ${pluralize(library.types.length, "note type")} to Nook’s defaults and removes any unfinished draft stored in this browser.`;
    elements.deleteLibraryBackupStatus.textContent =
      "Download a backup and close other Nook tabs before continuing. Downloaded backup files will not be deleted.";
    elements.deleteLibraryConfirmation.value = "";
    ui.deleteLibraryInvoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ui.deleteLibraryBackupInFlight = false;
    syncDeleteLibraryConfirmation();
    elements.deleteLibraryDialog.showModal();
    syncToastHost();
    window.requestAnimationFrame(() => elements.cancelDeleteLibrary.focus());
  }

  function closeDeleteLibraryDialog() {
    if (ui.deleteLibraryInFlight || !elements.deleteLibraryDialog.open) return;
    elements.deleteLibraryDialog.close("cancelled");
  }

  function finishDeleteLibraryClose() {
    const invoker = ui.deleteLibraryInvoker;
    ui.deleteLibraryInvoker = null;
    ui.deleteLibraryBackupInFlight = false;
    ui.deleteLibraryInFlight = false;
    elements.deleteLibraryConfirmation.value = "";
    syncDeleteLibraryConfirmation();
    if (invoker instanceof HTMLElement && invoker.isConnected && !invoker.disabled) {
      window.requestAnimationFrame(() => invoker.focus());
    }
  }

  async function exportBeforeDeleteLibrary() {
    if (ui.deleteLibraryBackupInFlight || ui.deleteLibraryInFlight) return;
    ui.deleteLibraryBackupInFlight = true;
    elements.deleteLibraryBackup.textContent = "Exporting…";
    syncDeleteLibraryConfirmation();
    const backup = await exportLibrary();
    if (backup) {
      elements.deleteLibraryBackupStatus.textContent =
        `Backup download started with ${pluralize(backup.data.notes.length, "note")}. Keep the file somewhere safe.`;
    }
    ui.deleteLibraryBackupInFlight = false;
    elements.deleteLibraryBackup.textContent = "Export backup";
    syncDeleteLibraryConfirmation();
  }

  async function deleteLibraryData() {
    if (elements.deleteLibraryConfirmation.value.trim() !== "DELETE" || ui.deleteLibraryInFlight) return;
    ui.deleteLibraryInFlight = true;
    syncDeleteLibraryConfirmation();
    try {
      const counts = await storage.resetLibrary();
      clearStoredNoteDraft();
      resetRegularFilters();
      ui.trashOnly = false;
      ui.selectedNoteTagIds.clear();
      ui.managementQueries.types = "";
      ui.managementQueries.tags = "";
      ui.managementEditing = null;
      elements.typesManagementSearch.value = "";
      elements.tagsManagementSearch.value = "";
      setManagementCreateMode("");
      persistFilters();
      resetToFirstPage();
      await refreshLibrary({ broadcast: true });
      elements.deleteLibraryDialog.close("deleted");
      showToast(`Deleted ${pluralize(counts.notes, "note")} and ${pluralize(counts.tags, "tag")}.`);
    } catch (error) {
      ui.deleteLibraryInFlight = false;
      syncDeleteLibraryConfirmation();
      showError(error, "We could not delete the local library. Your data was not changed.");
    }
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
      return backup;
    } catch (error) {
      showError(error, "We could not export this backup.");
      return null;
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

  Object.assign(api, {
    setManagementTab,
    syncManagementControls,
    setManagementCreateMode,
    managementQuery,
    managementMatchesQuery,
    startManagementEdit,
    cancelManagementEdit,
    handleManagementTabKeydown,
    colorLabel,
    createColorOptions,
    closeColorPicker,
    setColorPickerValue,
    enhanceColorSelect,
    renderTypeManagement,
    renderTagManagement,
    renderManagement,
    renderLibrary,
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
    downloadExport,
    safeNoteFileName,
    plainTextFromMarkdown,
    downloadNoteFile,
    exportCurrentNote,
    exportLibrary,
    importLibrary,
  });
});
