globalThis[Symbol.for("nook.app.modules")].register("mobile", (app) => {
  "use strict";

  // Mobile changes the presentation of existing controls, never their data or
  // save lifecycle. Anchors return those same controls to desktop on resize.
  const { api, elements, ui, library } = app;
  const mobileQuery = window.matchMedia("(max-width: 820px)");
  Object.assign(elements, {
    mobileNavigation: document.querySelector("#mobile-navigation"),
    mobileNotes: document.querySelector("#mobile-nav-notes"),
    mobileSearch: document.querySelector("#mobile-nav-search"),
    mobileNew: document.querySelector("#mobile-nav-new"),
    mobileTrash: document.querySelector("#mobile-nav-trash"),
    mobileSettings: document.querySelector("#mobile-nav-settings"),
    mobileTitle: document.querySelector("#mobile-library-title"),
    mobileTheme: document.querySelector("#mobile-theme-btn"),
    mobileChips: document.querySelector("#mobile-type-chips"),
    mobileTrashActions: document.querySelector("#mobile-trash-actions"),
    mobileFilters: document.querySelector("#mobile-open-filters"),
    mobileFilterCount: document.querySelector("#mobile-active-filter-count"),
    mobileFilterDialog: document.querySelector("#mobile-filter-dialog"),
    mobileFilterBody: document.querySelector("#mobile-filter-body"),
    mobileSearchSlot: document.querySelector("#mobile-search-slot"),
    mobileResetFilters: document.querySelector("#mobile-reset-filters"),
    mobileSpacePicker: document.querySelector("#mobile-space-picker"),
    mobileSpaceDialog: document.querySelector("#mobile-space-dialog"),
    mobileSpaceNotes: document.querySelector("#mobile-space-notes"),
    mobileSpaceNotesCount: document.querySelector("#mobile-space-notes-count"),
    mobileSpaceTrash: document.querySelector("#mobile-space-trash"),
    mobileSpaceTrashCount: document.querySelector("#mobile-space-trash-count"),
    mobileCardDialog: document.querySelector("#mobile-card-dialog"),
    mobileCardTitle: document.querySelector("#mobile-card-title"),
    mobileCardActions: document.querySelector("#mobile-card-actions"),
    mobileSettingsHome: document.querySelector("#mobile-settings-home"),
    mobileSettingsBack: document.querySelector("#mobile-settings-back"),
    mobileSettingsBackup: document.querySelector("#mobile-settings-backup"),
    mobileSettingsTheme: document.querySelector("#mobile-settings-theme"),
    mobileSettingsTypes: document.querySelector("#mobile-settings-types"),
    mobileSettingsTags: document.querySelector("#mobile-settings-tags"),
    mobileSettingsTrash: document.querySelector("#mobile-settings-trash"),
    mobileSettingsTrashCount: document.querySelector("#mobile-settings-trash-count"),
    mobileSortSlot: document.querySelector("#mobile-sort-slot"),
    mobileFilterResults: document.querySelector("#mobile-filter-results"),
    mobileFiltersDone: document.querySelector("#mobile-filters-done"),
    mobileFiltersClose: document.querySelector("#mobile-close-filters"),
    mobileNoteActions: document.querySelector("#mobile-note-actions-btn"),
    mobileNoteActionsDialog: document.querySelector("#mobile-note-actions-dialog"),
    mobileNoteActionsBody: document.querySelector("#mobile-note-actions-body"),
    mobileNoteActionsClose: document.querySelector("#mobile-close-note-actions"),
    mobileNoteDone: document.querySelector("#mobile-note-done"),
    primaryFormatting: elements.noteDialog.querySelector(".note-formatting-toolbar"),
    primaryFooter: elements.noteDialog.querySelector(".dialog-footer"),
    primaryFooterTools: elements.noteDialog.querySelector(".dialog-footer__tools"),
    primarySortField: elements.sort.closest(".sort-field"),
    primarySearchField: elements.search.closest(".search-field"),
  });
  let anchors = [];
  let chipSignature = "";
  let viewportFrame = 0;
  let mobileLayout = false;
  let detailHistoryEntry = null;
  let historySequence = 0;
  let navigationHome = null;

  function rememberMobileDetail() {
    if (!mobileQuery.matches || detailHistoryEntry || !api.isNoteEditorOpen()) return;
    const marker = `nook-detail-${Date.now()}-${++historySequence}`;
    try {
      window.history.pushState({ ...window.history.state, nookMobileDetail: marker }, "");
      detailHistoryEntry = marker;
    } catch {
      // The explicit Back/Done controls still work in restricted file contexts.
    }
  }

  function releaseMobileDetail() {
    const marker = detailHistoryEntry;
    detailHistoryEntry = null;
    if (marker && window.history.state?.nookMobileDetail === marker) window.history.back();
  }

  async function handleMobileBack() {
    if (!detailHistoryEntry || window.history.state?.nookMobileDetail === detailHistoryEntry) return;
    detailHistoryEntry = null;
    if (!mobileQuery.matches || !api.isNoteEditorOpen() || ui.detailClosing) return;
    // Keep a guard in history while a confirmation or async save is pending;
    // another Back press must not navigate away with an unresolved draft.
    rememberMobileDetail();
    const modal = api.activeModalDialog();
    if (modal) {
      // Escape has the dialog's own cancel behavior (including confirmations).
      if (modal.dispatchEvent(new Event("cancel", { cancelable: true }))) modal.close();
      rememberMobileDetail();
      return;
    }
    await api.requestNoteEditorClose();
    // A rejected save, title-less draft, or an in-flight save must keep Back
    // inside Nook. A successful delayed close releases this entry normally.
    if (api.isNoteEditorOpen() && !ui.detailClosing) rememberMobileDetail();
  }

  function syncMobileLibrary() {
    elements.mobileTitle.textContent = ui.trashOnly ? "Trash" : "All notes";
    syncMobileNavigation();
    elements.mobileSpaceNotesCount.textContent = String(library.notes.filter((note) => !note.deletedAt).length);
    elements.mobileSpaceTrashCount.textContent = String(library.notes.filter((note) => note.deletedAt).length);
    elements.mobileSpaceNotes.setAttribute("aria-pressed", String(!ui.trashOnly));
    elements.mobileSpaceTrash.setAttribute("aria-pressed", String(ui.trashOnly));
    const count = Number(ui.typeId !== "all") + ui.tagIds.size + Number(ui.todayOnly) + Number(ui.updatedTodayOnly);
    elements.mobileFilterCount.textContent = String(count);
    elements.mobileFilterCount.classList.toggle("is-hidden", !count);
    elements.mobileFilters.setAttribute("aria-label", count ? `Filters and sort, ${count} active filters` : "Filters and sort");
    elements.mobileFilterResults.textContent = api.pluralize(api.getVisibleNotes().length, "matching note");
    elements.mobileResetFilters.disabled = !count && !ui.query && ui.sort === "created-desc";
    elements.mobileSortSlot.querySelectorAll("[data-mobile-sort]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mobileSort === ui.sort));
    });

    const signature = JSON.stringify(library.types.map(({ id, name, color }) => [id, name, color]));
    if (signature !== chipSignature) {
      chipSignature = signature;
      const fragment = document.createDocumentFragment();
      [{ id: "all", name: "All" }, ...library.types].forEach((type) => {
        const button = api.createElement("button", {
          className: "button button-secondary mobile-type-chip",
          type: "button",
        });
        button.dataset.typeId = type.id;
        if (type.id !== "all") button.append(api.createElement("span", {
          className: `type-dot type-dot--${api.safeTypeColor(type)}`,
          attributes: { "aria-hidden": "true" },
        }));
        button.append(api.createElement("span", { text: type.name }));
        button.append(api.createElement("span", { className: "mobile-type-chip__count" }));
        fragment.append(button);
      });
      elements.mobileChips.replaceChildren(fragment);
    }
    const counts = new Map();
    let total = 0;
    library.notes.forEach((note) => {
      if (note.deletedAt) return;
      total += 1;
      counts.set(note.typeId, (counts.get(note.typeId) || 0) + 1);
    });
    elements.mobileChips.querySelectorAll("button").forEach((button) => {
      const id = button.dataset.typeId;
      button.setAttribute("aria-pressed", String(ui.typeId === id));
      button.classList.toggle("is-active", ui.typeId === id);
      button.lastElementChild.textContent = String(id === "all" ? total : counts.get(id) || 0);
    });
  }

  function syncMobileNavigation() {
    const current = elements.organizeDialog.open ? elements.mobileSettings
      : elements.mobileFilterDialog.open ? elements.mobileSearch
        : ui.trashOnly ? elements.mobileTrash : elements.mobileNotes;
    [elements.mobileNotes, elements.mobileSearch, elements.mobileTrash, elements.mobileSettings].forEach((button) => {
      if (button === current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showMobileSettingsHome() {
    elements.mobileSettingsBackup.textContent = elements.backupHealthMessage.textContent;
    elements.mobileSettingsTheme.textContent = `Theme: ${ui.theme.charAt(0).toUpperCase()}${ui.theme.slice(1)}`;
    elements.mobileSettingsTypes.textContent = api.pluralize(library.types.length, "type");
    elements.mobileSettingsTags.textContent = api.pluralize(library.tags.length, "tag");
    elements.mobileSettingsTrashCount.textContent = `${library.notes.filter((note) => note.deletedAt).length} notes you can restore`;
    elements.organizeDialog.classList.add("is-mobile-settings-home");
  }

  function dockMobileNavigation() {
    const parent = mobileQuery.matches && elements.organizeDialog.open ? elements.organizeDialog : navigationHome;
    if (parent && elements.mobileNavigation.parentElement !== parent) parent.append(elements.mobileNavigation);
  }

  function openMobileCardActions(card, invoker) {
    if (!mobileQuery.matches) return;
    elements.mobileCardTitle.textContent = card.querySelector(".note-card__title").textContent;
    const actions = [...card.querySelectorAll(".note-card__pin-toggle, .note-card__actions > button")];
    elements.mobileCardActions.replaceChildren(...actions.map((source) => {
      const isDanger = source.classList.contains("note-card__action--danger");
      const button = api.createElement("button", {
        className: `button mobile-card-action-item ${isDanger ? "button-danger mobile-card-action-item--danger" : "button-secondary"}`,
        type: "button", disabled: source.disabled,
      });
      const svgSource = source.querySelector("svg");
      if (svgSource) {
        const icon = svgSource.cloneNode ? svgSource.cloneNode(true) : svgSource;
        if (icon.classList?.add) icon.classList.add("mobile-card-action-item__icon");
        button.append(icon);
      }
      const labelText = source.title === "Pin" ? "Pin note"
        : source.title === "Unpin" ? "Unpin note"
        : source.title === "Preview" ? "Quick preview"
        : source.title;
      button.append(api.createElement("span", {
        className: "mobile-card-action-item__label",
        text: labelText,
      }));
      button.addEventListener("click", () => {
        elements.mobileCardDialog.close();
        // Keep confirmation/editor focus restoration anchored to a visible
        // library control, rather than a hidden desktop action button.
        invoker.focus({ preventScroll: true });
        source.click();
      });
      return button;
    }));
    openMobileSheet(elements.mobileCardDialog);
  }

  function syncMobileViewport() {
    viewportFrame = 0;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    // Leave pinch zoom to the browser. These are measured geometry values only.
    if (!mobileQuery.matches || !viewport || viewport.scale !== 1) {
      root.style.removeProperty("--mobile-viewport-height");
      root.style.removeProperty("--mobile-viewport-top");
      root.classList.remove("is-mobile-keyboard-open");
      return;
    }
    root.style.setProperty("--mobile-viewport-height", `${viewport.height}px`);
    root.style.setProperty("--mobile-viewport-top", `${viewport.offsetTop}px`);
    const typing = document.activeElement?.matches("input, textarea, [contenteditable='true']");
    root.classList.toggle("is-mobile-keyboard-open", Boolean(typing && window.innerHeight - viewport.height > 120));
  }

  function scheduleMobileViewport() {
    if (!viewportFrame) viewportFrame = window.requestAnimationFrame(syncMobileViewport);
  }

  function closeMobileSheets() {
    elements.mobileFilterDialog.close();
    elements.mobileNoteActionsDialog.close();
    elements.mobileSpaceDialog.close();
    elements.mobileCardDialog.close();
  }

  function placeResponsiveControls(useMobileLayout) {
    let moved = false;
    anchors.forEach(({ node, target, anchor, originalParent, originalNextSibling }) => {
      const expectedParent = useMobileLayout ? target : originalParent;
      if (node.parentNode === expectedParent) return;
      if (useMobileLayout) {
        target.append(node);
      } else if (anchor.parentNode === originalParent) {
        anchor.after(node);
      } else {
        // Browser zoom can cross the breakpoint while layout work is being
        // coalesced. Keep the original parent as a recovery path if the marker
        // was detached before the desktop pass ran.
        const reference = originalNextSibling?.parentNode === originalParent
          ? originalNextSibling
          : null;
        originalParent.insertBefore(node, reference);
      }
      moved = true;
    });
    return moved;
  }

  function syncMobileLayout() {
    const next = mobileQuery.matches;
    const breakpointChanged = next !== mobileLayout;
    const controlsMoved = placeResponsiveControls(next);
    if (breakpointChanged) {
      mobileLayout = next;
      closeMobileSheets();
      if (api.isNoteEditorOpen()) {
        if (next) api.setNoteEditorMode(ui.noteEditorMode);
        api.syncNoteEditorControls();
      }
      if (next) rememberMobileDetail();
      else {
        releaseMobileDetail();
        elements.organizeDialog.classList.remove("is-mobile-settings-home");
      }
    }
    if (breakpointChanged || controlsMoved) {
      api.scheduleTopbarActionsPinning();
      api.scheduleTagFilterLayout();
    }
    dockMobileNavigation();
    scheduleMobileViewport();
  }

  function openMobileSheet(dialog) {
    if (!mobileQuery.matches || dialog.open) return;
    dialog.showModal();
    api.syncToastHost();
    syncMobileNavigation();
  }

  function focusMobileSearch() {
    if (elements.organizeDialog.open) elements.organizeDialog.close();
    if (mobileQuery.matches) openMobileSheet(elements.mobileFilterDialog);
    elements.search.focus({ preventScroll: true });
  }

  function bindMobileEvents() {
    navigationHome = elements.mobileNavigation.parentElement;
    elements.mobileNoteDone.textContent = "Edit note";
    elements.mobileNoteDone.setAttribute("aria-label", "Return to note editor");
    // This slot belongs only to the mobile sheet. Keeping it outside the
    // scrolling body avoids sticky search padding covering filter options.
    elements.mobileFilterDialog.insertBefore(elements.mobileSearchSlot, elements.mobileFilterBody);
    const sortChoices = api.createElement("div", {
      className: "mobile-sort-choices",
      attributes: { role: "group", "aria-label": "Sort notes by" },
    });
    elements.sort.querySelectorAll("option").forEach((option) => {
      const button = api.createElement("button", {
        className: "button button-secondary",
        type: "button", text: option.textContent,
      });
      button.dataset.mobileSort = option.value;
      button.addEventListener("click", () => {
        // Reuse the canonical sort handler and its persistence. The desktop
        // picker stays synchronized without moving focus into its hidden UI.
        elements.sort.value = option.value;
        elements.sort.dispatchEvent(new Event("change", { bubbles: true }));
      });
      sortChoices.append(button);
    });
    elements.mobileSortSlot.append(sortChoices);
    elements.primaryFooterTools.querySelectorAll(".note-detail-action-tooltip > button").forEach((button) => {
      button.append(api.createElement("span", {
        className: "mobile-only mobile-action-label",
        text: button.nextElementSibling?.textContent || button.getAttribute("aria-label"),
      }));
    });
    anchors = [
      [elements.regularFilterControls, elements.mobileFilterBody],
      [elements.primarySortField, elements.mobileSortSlot],
      [elements.emptyTrash, elements.mobileTrashActions],
      [elements.primaryFormatting, elements.noteForm],
      [elements.primaryFooterTools, elements.mobileNoteActionsBody],
      [elements.primarySearchField, elements.mobileSearchSlot],
    ].map(([node, target]) => {
      const anchor = document.createComment("Mobile layout return position");
      const originalParent = node.parentNode;
      const originalNextSibling = node.nextSibling;
      node.before(anchor);
      return { node, target, anchor, originalParent, originalNextSibling };
    });
    elements.mobileNotes.addEventListener("click", () => {
      elements.organizeDialog.close();
      api.showAllNotesSpace();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    elements.mobileTrash.addEventListener("click", () => {
      elements.organizeDialog.close();
      api.showTrashSpace();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    elements.mobileSearch.addEventListener("click", focusMobileSearch);
    elements.mobileNew.addEventListener("click", () => {
      elements.organizeDialog.close();
      api.openNoteEditor(null, { invoker: elements.mobileNew });
    });
    elements.mobileSettings.addEventListener("click", () => {
      showMobileSettingsHome();
      api.openOrganize("data");
      dockMobileNavigation();
      syncMobileNavigation();
    });
    elements.mobileSettingsHome.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mobile-settings-tab]");
      if (!button) return;
      elements.organizeDialog.classList.remove("is-mobile-settings-home");
      api.setManagementTab(button.dataset.mobileSettingsTab);
      elements.mobileSettingsBack.focus({ preventScroll: true });
    });
    elements.mobileSettingsBack.addEventListener("click", () => {
      showMobileSettingsHome();
      elements.mobileSettingsHome.querySelector("button")?.focus({ preventScroll: true });
    });
    elements.mobileSettingsTrash.addEventListener("click", () => {
      elements.organizeDialog.close();
      elements.mobileTrash.click();
    });
    elements.organizeDialog.addEventListener("close", () => {
      elements.organizeDialog.classList.remove("is-mobile-settings-home");
      dockMobileNavigation();
      syncMobileNavigation();
    });
    elements.mobileTheme.addEventListener("click", () => elements.themeToggle.click());
    elements.mobileChips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-type-id]");
      if (button) api.setTypeFilter(button.dataset.typeId);
    });
    elements.mobileFilters.addEventListener("click", () => openMobileSheet(elements.mobileFilterDialog));
    elements.mobileSpacePicker.addEventListener("click", () => openMobileSheet(elements.mobileSpaceDialog));
    elements.mobileSpaceNotes.addEventListener("click", () => {
      elements.mobileSpaceDialog.close();
      elements.mobileNotes.click();
    });
    elements.mobileSpaceTrash.addEventListener("click", () => {
      elements.mobileSpaceDialog.close();
      elements.mobileTrash.click();
    });
    elements.mobileResetFilters.addEventListener("click", () => {
      api.clearFilters({ preserveSort: false });
      elements.search.focus({ preventScroll: true });
    });
    elements.search.addEventListener("keydown", (event) => {
      if (mobileQuery.matches && event.key === "Enter") {
        event.preventDefault();
        elements.mobileFilterDialog.close();
      }
    });
    elements.mobileFiltersClose.addEventListener("click", () => elements.mobileFilterDialog.close());
    elements.mobileFiltersDone.addEventListener("click", () => elements.mobileFilterDialog.close());
    elements.notesList.addEventListener("click", (event) => {
      if (!mobileQuery.matches || event.target.closest("button, a, input, select, textarea") || window.getSelection()?.toString()) return;
      const card = event.target.closest(".note-card");
      card?.querySelector("button.note-card__title")?.click();
    });
    elements.mobileNoteActions.addEventListener("click", () => openMobileSheet(elements.mobileNoteActionsDialog));
    elements.mobileNoteActionsClose.addEventListener("click", () => elements.mobileNoteActionsDialog.close());
    elements.mobileNoteDone.addEventListener("click", () => {
      if (ui.noteEditorMode === "preview") {
        api.setNoteEditorMode("edit");
        elements.noteContent.focus({ preventScroll: true });
        return;
      }
      api.requestNoteEditorClose();
    });
    // Close this sheet before an existing action opens History or confirmation.
    elements.mobileNoteActionsBody.addEventListener("click", (event) => {
      if (event.target.closest(".note-detail-action-tooltip > button")) elements.mobileNoteActionsDialog.close();
    }, true);
    elements.historyDialog.addEventListener("close", () => {
      if (mobileQuery.matches && api.isNoteEditorOpen()) elements.mobileNoteActions.focus({ preventScroll: true });
    });
    [elements.mobileFilterDialog, elements.mobileNoteActionsDialog, elements.mobileSpaceDialog, elements.mobileCardDialog].forEach((dialog) => {
      dialog.querySelector("[data-mobile-close]")?.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
      });
      dialog.addEventListener("close", () => {
        api.closeSortPicker?.();
        api.syncToastHost();
        syncMobileNavigation();
      });
    });
    mobileQuery.addEventListener("change", syncMobileLayout);
    window.visualViewport?.addEventListener("resize", scheduleMobileViewport);
    window.visualViewport?.addEventListener("scroll", scheduleMobileViewport);
    // Browser zoom and window maximization both emit resize. Some engines can
    // coalesce the matching MediaQueryList change, so also reconcile layout
    // from the resize event itself.
    window.addEventListener("resize", syncMobileLayout);
    window.addEventListener("popstate", handleMobileBack);
    document.addEventListener("focusin", scheduleMobileViewport);
    document.addEventListener("focusout", scheduleMobileViewport);
    syncMobileLayout();
    syncMobileLibrary();
  }

  Object.assign(api, { bindMobileEvents, syncMobileLibrary, rememberMobileDetail, releaseMobileDetail, focusMobileSearch, openMobileCardActions });
});
