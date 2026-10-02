globalThis[Symbol.for("nook.app.modules")].register("library", (app) => {
  "use strict";

  const { api, elements, ui, constants } = app;
  const { PAGE_SIZE, MOTION } = constants;
  let notesContentAnimation = null;
  let responsivePaginationFrame = 0;
  let responsivePaginationTimer = 0;
  let responsivePaginationPending = false;
  let sortPicker = null;
  const RESPONSIVE_PAGINATION_QUERIES = [
    "(max-width: 1200px)",
    "(max-width: 960px)",
    "(max-width: 620px)",
  ];
  const RESPONSIVE_PAGINATION_SETTLE_DELAY = 180;
  const SORT_LABELS = Object.freeze({
    "created-desc": "Newest created",
    "created-asc": "Oldest created",
    "updated-desc": "Newest updated",
    "updated-asc": "Oldest updated",
    "title-asc": "Title A–Z",
    "title-desc": "Title Z–A",
  });
  const syncViewModeUI = (...args) => api.syncViewModeUI(...args);
  const createElement = (...args) => api.createElement(...args);
  const appendHighlightedText = (...args) => api.appendHighlightedText(...args);
  const previewForSearch = (...args) => api.previewForSearch(...args);
  const typeFor = (...args) => api.typeFor(...args);
  const tagFor = (...args) => api.tagFor(...args);
  const tagLabel = (...args) => api.tagLabel(...args);
  const pluralize = (...args) => api.pluralize(...args);
  const getNoteCardDateInfo = (...args) => api.getNoteCardDateInfo(...args);
  const isDeletedNote = (...args) => api.isDeletedNote(...args);
  const notesInActiveCollection = (...args) => api.notesInActiveCollection(...args);
  const showAllNotesSpace = (...args) => api.showAllNotesSpace(...args);
  const clearFilters = (...args) => api.clearFilters(...args);
  const getVisibleNotes = (...args) => api.getVisibleNotes(...args);
  const openNoteEditor = (...args) => api.openNoteEditor(...args);
  const moveNoteToTrash = (...args) => api.moveNoteToTrash(...args);
  const toggleNotePinned = (...args) => api.toggleNotePinned(...args);
  const restoreNoteWithFeedback = (...args) => api.restoreNoteWithFeedback(...args);
  const permanentlyDeleteNoteWithConfirmation = (...args) => api.permanentlyDeleteNoteWithConfirmation(...args);
  let secondarySortPicker = null;
  let primarySortPicker = null;
  let cardMenuSequence = 0;
  let openCardMenu = null;
  const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
  const makeTagButton = (...args) => api.makeTagButton(...args);
  const observeNoteCardTagRows = (...args) => api.observeNoteCardTagRows(...args);
  const openQuickView = (...args) => api.openQuickView(...args);
  const copyNoteCardContent = (...args) => api.copyNoteCardContent(...args);
  const openDualPane = (...args) => api.openDualPane(...args);
  const selectSecondaryNote = (...args) => api.selectSecondaryNote(...args);

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
        event.stopPropagation();
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
    if (!primarySortPicker && elements.primarySort) {
      primarySortPicker = createCustomSortPicker(elements.primarySort, { idPrefix: "primary-sort", fallbackValue: "updated-desc" });
    }
    return sortPicker;
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

  function closeNoteCardMenu({ focusTrigger = false } = {}) {
    if (!openCardMenu) return false;
    const { menu, trigger } = openCardMenu;
    openCardMenu = null;
    if (menu.matches(":popover-open")) menu.hidePopover();
    trigger.setAttribute("aria-expanded", "false");
    if (focusTrigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    return true;
  }

  function installNoteCardMenu(menu, trigger) {
    // Register the native invoker so light-dismiss does not close the menu
    // before a second More click can toggle it closed.
    trigger.setAttribute("popovertarget", menu.id);
    const enabledItems = () => [...menu.querySelectorAll("button:not(:disabled)")].filter((button) => button.getClientRects().length);
    function open(last = false) {
      closeNoteCardMenu();
      menu.showPopover();
      const rect = trigger.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const right = left + (viewport?.width || window.innerWidth);
      const bottom = top + (viewport?.height || window.innerHeight);
      menu.style.left = `${Math.max(left + 8, Math.min(rect.right - bounds.width, right - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(top + 8, rect.bottom + bounds.height + 8 <= bottom ? rect.bottom + 4 : rect.top - bounds.height - 4)}px`;
      openCardMenu = { menu, trigger };
      trigger.setAttribute("aria-expanded", "true");
      const items = enabledItems();
      (last ? items.at(-1) : items[0])?.focus({ preventScroll: true });
    }
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (menu.matches(":popover-open")) closeNoteCardMenu({ focusTrigger: true });
      else open();
    });
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      open(event.key === "ArrowUp");
    });
    menu.addEventListener("toggle", (event) => {
      if (event.newState !== "closed") return;
      trigger.setAttribute("aria-expanded", "false");
      if (openCardMenu?.menu === menu) openCardMenu = null;
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        event.stopPropagation();
        closeNoteCardMenu({ focusTrigger: true });
        return;
      }
      const items = enabledItems();
      const index = items.indexOf(document.activeElement);
      let next;
      if (event.key === "ArrowDown") next = (index + 1) % items.length;
      else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else return;
      event.preventDefault();
      items[next]?.focus();
    });
    // Close before navigation/confirmation so the visible More button owns focus.
    // Copy keeps the menu open to show its existing success feedback.
    menu.addEventListener("click", (event) => {
      if (event.target.closest("button:not(.note-card__action--copy)")) closeNoteCardMenu({ focusTrigger: true });
    }, true);
  }

  function bindNoteCardEvents() {
    window.addEventListener("resize", () => closeNoteCardMenu());
    document.addEventListener("scroll", (event) => {
      if (openCardMenu && !openCardMenu.menu.contains(event.target)) closeNoteCardMenu();
    }, true);
    function refreshDates() {
      if (document.hidden) return;
      document.querySelectorAll(".note-card__date[data-date-label]").forEach((time) => {
        time.textContent = `${time.dataset.dateLabel} ${api.formatRelativeNoteDate(time.dateTime)}`;
      });
    }
    window.setInterval(refreshDates, 60000);
    document.addEventListener("visibilitychange", refreshDates);
  }

  function createNoteCard(note, { secondary = false, onOpen = null } = {}) {
    const type = typeFor(note.typeId);
    const isDeleted = isDeletedNote(note);
    const card = createElement("article", {
      className: `note-card${secondary ? " secondary-note-card" : ""}${note.isPinned ? " note-card--pinned" : ""}`,
    });
    const more = createElement("button", {
      className: "icon-button note-card__more", type: "button",
      attributes: { "aria-label": `Actions for ${note.title}`, title: "More actions", "aria-haspopup": "menu", "aria-expanded": "false" },
    });
    more.append(createNoteCardActionIcon([
      ["circle", { cx: "5", cy: "12", r: "1" }],
      ["circle", { cx: "12", cy: "12", r: "1" }],
      ["circle", { cx: "19", cy: "12", r: "1" }],
    ]));
    const content = createElement("div", { className: "note-card__content" });
    const meta = createElement("div", { className: "note-card__meta" });
    meta.append(makeTypeBadge(type, { isFilter: !secondary && !ui.trashOnly }));
    const dateInfo = getNoteCardDateInfo(note);
    const dateElement = createElement("time", {
      className: "note-card__date",
      text: dateInfo.text,
      dataset: { dateLabel: dateInfo.label },
      attributes: { datetime: dateInfo.datetime, title: dateInfo.title },
    });

    const titleButton = createElement("button", {
      className: "note-card__title",
      type: "button",
      attributes: { "aria-label": `Open note: ${note.title}` },
    });
    appendHighlightedText(titleButton, note.title);
    const openPickerNote = (mode) => onOpen ? onOpen(note.id, mode) : selectSecondaryNote(note.id, mode);
    titleButton.addEventListener("click", () => secondary ? openPickerNote("preview") : openQuickView(note, titleButton));
    const preview = createElement("p", { className: "note-card__preview" });
    appendHighlightedText(preview, previewForSearch(note.content));
    content.append(meta, titleButton, preview);

    const footer = createElement("div", { className: "note-card__footer" });
    const tags = createElement("div", { className: "note-card__tags" });
    const resolvedTags = note.tagIds.map(tagFor).filter(Boolean);
    resolvedTags.forEach((tag) => {
      tags.append(
        (secondary || ui.trashOnly)
          ? createElement("span", { className: "tag-chip", text: tagLabel(tag), attributes: { title: tagLabel(tag) } })
          : makeTagButton(tag, ui.tagIds.has(tag.id)),
      );
    });
    if (resolvedTags.length) {
      tags.append(
        createElement("span", {
          className: "more-tags is-hidden",
        }),
      );
    }
    if (!resolvedTags.length) tags.append(createElement("span", { className: "untagged", text: "No tags" }));

    const actions = createElement("div", {
      className: "note-card__actions",
      attributes: { id: `note-card-menu-${++cardMenuSequence}`, popover: "auto", role: "menu", "aria-label": `Actions for ${note.title}` },
    });
    const copy = createElement("button", {
      className: "note-card__action note-card__action--copy",
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
    edit.addEventListener("click", () => secondary ? openPickerNote("edit") : openNoteEditor(note, {
      invoker: more,
    }));
    if (!isDeleted) actions.append(edit);
    actions.append(copy);
    const remove = createElement("button", {
      className: `note-card__action note-card__action--separated ${isDeleted ? "note-card__action--restore" : "note-card__action--danger"}`,
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
    remove.addEventListener("click", () => (isDeleted ? restoreNoteWithFeedback(note) : moveNoteToTrash(note, { preserveSidePicker: secondary })));
    if (!isDeleted && !secondary) {
      const sideNote = createElement("button", {
        className: "note-card__action note-card__action--side-note",
        type: "button",
        attributes: {
          "aria-label": `Open ${note.title} with Side Note`,
          title: "Open Side Note",
        },
      });
      sideNote.append(createNoteCardActionIcon([
        ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "3.5" }],
        ["rect", { x: "13.5", y: "6", width: "4.5", height: "12", rx: "1.5", fill: "currentColor", stroke: "none" }],
      ]));
      sideNote.addEventListener("click", () => {
        if (!window.matchMedia("(min-width: 960px)").matches) return;
        openQuickView(note, more);
        void openDualPane({ startWithPicker: true });
      });
      actions.append(sideNote);
    }
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
    [...actions.children].forEach((button) => {
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      const label = button === edit ? "Edit note" : button.title;
      button.append(createElement("span", { className: "note-card__action-label", text: label }));
    });
    more.setAttribute("aria-controls", actions.id);
    installNoteCardMenu(actions, more);
    footer.append(tags, dateElement);
    const topActions = createElement("div", { className: "note-card__top-actions" });
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
      topActions.append(pin);
    }
    topActions.append(more);
    card.append(content, footer, actions);
    if (topActions.childElementCount) card.append(topActions);
    if (secondary) card.addEventListener("click", (event) => {
      if (!event.target.closest("button, .note-card__actions")) void openPickerNote("preview");
    });
    if (!secondary) api.decorateSelectableNoteCard?.(card, note);
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
    observeNoteCardTagRows();
  }

  function formatNotesRange({ matchingCount, start, end, activeCollectionCount, trashOnly }) {
    if (matchingCount) return `Showing ${start + 1}–${end} of ${pluralize(matchingCount, "note")}`;
    if (activeCollectionCount) return "No matching notes";
    return trashOnly ? "Trash is empty" : "0 notes";
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

  function effectiveNotesColumnCount() {
    const value = window.getComputedStyle(elements.notesList).getPropertyValue("--notes-columns");
    const columns = Number.parseInt(value, 10);
    return Number.isInteger(columns) && columns > 0 ? columns : 1;
  }

  function pageSizeForColumns(columns) {
    if (ui.viewMode === "compact" || ui.viewMode === "focus") return PAGE_SIZE;
    return Math.ceil(PAGE_SIZE / columns) * columns;
  }

  function syncPaginationMetrics() {
    const columns = effectiveNotesColumnCount();
    const previousPageSize = ui.pageSize || PAGE_SIZE;
    const nextPageSize = pageSizeForColumns(columns);
    if (ui.paginationColumns === columns && previousPageSize === nextPageSize) return false;

    const pageSizeChanged = previousPageSize !== nextPageSize;
    const anchorIndex = Math.max(0, (ui.page - 1) * previousPageSize);
    ui.paginationColumns = columns;
    if (!pageSizeChanged) return false;

    ui.pageSize = nextPageSize;
    ui.page = Math.floor(anchorIndex / nextPageSize) + 1;
    return true;
  }

  function cancelResponsivePaginationSchedule() {
    window.clearTimeout(responsivePaginationTimer);
    window.cancelAnimationFrame(responsivePaginationFrame);
    responsivePaginationTimer = 0;
    responsivePaginationFrame = 0;
    responsivePaginationPending = false;
  }

  function syncResponsivePagination() {
    cancelResponsivePaginationSchedule();
    if (!syncPaginationMetrics()) return false;
    renderNotes();
    return true;
  }

  function scheduleResponsivePagination() {
    if (!responsivePaginationPending) return;
    window.clearTimeout(responsivePaginationTimer);
    window.cancelAnimationFrame(responsivePaginationFrame);
    responsivePaginationFrame = 0;
    responsivePaginationTimer = window.setTimeout(() => {
      responsivePaginationTimer = 0;
      responsivePaginationFrame = window.requestAnimationFrame(() => {
        responsivePaginationFrame = 0;
        responsivePaginationPending = false;
        syncResponsivePagination();
      });
    }, RESPONSIVE_PAGINATION_SETTLE_DELAY);
  }

  function deferResponsivePagination() {
    responsivePaginationPending = true;
    scheduleResponsivePagination();
  }

  function observeResponsivePagination() {
    RESPONSIVE_PAGINATION_QUERIES.forEach((query) => {
      window.matchMedia(query).addEventListener("change", deferResponsivePagination);
    });
    window.addEventListener("resize", scheduleResponsivePagination, { passive: true });
  }

  function renderNotes({ motion = "none" } = {}) {
    api.syncBulkSelection?.();
    api.syncMobileLibrary?.();
    syncViewModeUI();
    syncPaginationMetrics();
    elements.sort.value = ui.sort;
    syncSortPicker();
    const matchingNotes = getVisibleNotes();
    const pageSize = ui.pageSize || PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(matchingNotes.length / pageSize));
    ui.page = Math.min(ui.page, totalPages);
    const start = (ui.page - 1) * pageSize;
    const pageNotes = matchingNotes.slice(start, start + pageSize);
    const end = start + pageNotes.length;

    const activeCollectionCount = notesInActiveCollection().length;
    elements.notesRange.textContent = formatNotesRange({
      matchingCount: matchingNotes.length,
      start,
      end,
      activeCollectionCount,
      trashOnly: ui.trashOnly,
    });
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
    observeNoteCardTagRows();
    renderPagination(totalPages);
    animateNotesContent(motion);
  }

  function syncSecondarySortPicker() { secondarySortPicker?.sync(); }
  function syncPrimarySortPicker() { primarySortPicker?.sync(); }

  Object.assign(api, {
    bindNoteCardEvents,
    closeNoteCardMenu,
    closeSortPicker,
    syncSortPicker,
    enhanceSortSelect,
    createPinIcon,
    createRestoreIcon,
    createNoteCardActionIcon,
    createNoteCard,
    renderEmptyState,
    formatNotesRange,
    paginationItems,
    animateNotesContent,
    renderPagination,
    syncResponsivePagination,
    observeResponsivePagination,
    renderNotes,
    syncSecondarySortPicker,
    syncPrimarySortPicker,
  });
});
