globalThis[Symbol.for("nook.app.modules")].register("editor", (app) => {
  "use strict";

  // Note editor lifecycle, pickers, Markdown modes, autosave, and draft safety.
  const { api, storage, elements, library, ui, constants, shared } = app;
  const { NOTE_AUTO_SAVE_DELAY, MOTION } = constants;
  const { openColorPickers } = shared;
  const NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS = 320;
  let noteTypePicker = shared.noteTypePicker;
  let secondaryNoteTypePicker = shared.secondaryNoteTypePicker;
  let noteEditorModeAnimation = null;
  const draftRecoveryStore = api.createDraftRecoveryStore();
  let primaryEditorSession = null;

  const clearStoredNoteDraft = (...args) => api.clearStoredNoteDraft(...args);
  const getStoredNoteDraft = (...args) => api.getStoredNoteDraft(...args);
  const createElement = (...args) => api.createElement(...args);
  const typeFor = (...args) => api.typeFor(...args);
  const tagFor = (...args) => api.tagFor(...args);
  const tagLabel = (...args) => api.tagLabel(...args);
  const cleanTagInput = (...args) => api.cleanTagInput(...args);
  const safeTypeColor = (...args) => api.safeTypeColor(...args);
  const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
  const formatFullDate = (...args) => api.formatFullDate(...args);
  const syncToastHost = (...args) => api.syncToastHost(...args);
  const showToast = (...args) => api.showToast(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const requestConflictResolution = (...args) => api.requestConflictResolution(...args);
  const showError = (...args) => api.showError(...args);
  const createChipCloseIcon = (...args) => api.createChipCloseIcon(...args);
  const renderQuickView = (...args) => api.renderQuickView(...args);
  const syncNotePreviewActions = (...args) => api.syncNotePreviewActions(...args);
  const isNoteEditorOpen = (...args) => api.isNoteEditorOpen(...args);
  const openNoteDetail = (...args) => api.openNoteDetail(...args);
  const closeNoteDetail = (...args) => api.closeNoteDetail(...args);
  const resetCopyButtonFeedback = (...args) => api.resetCopyButtonFeedback(...args);
  const closeColorPicker = (...args) => api.closeColorPicker(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const onSecondaryNoteInput = (...args) => api.onSecondaryNoteInput(...args);

  function createCustomTypePicker(selectElement, { ariaDescribedBy = "note-type-error", onSelect = null } = {}) {
    if (!selectElement) return null;

    const picker = createElement("div", { className: "note-type-picker" });
    const trigger = createElement("button", {
      className: "note-type-picker__trigger type-badge",
      type: "button",
      attributes: {
        "aria-label": "Note type",
        "aria-describedby": ariaDescribedBy,
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const dot = createElement("span", { attributes: { "aria-hidden": "true" } });
    const label = createElement("span", { className: "note-type-picker__label" });
    trigger.append(dot, label);
    const menu = createElement("div", { className: "note-type-picker__menu", attributes: { role: "listbox", "aria-label": "Note type options" } });
    menu.hidden = true;

    selectElement.classList.add("note-type-picker__native");
    selectElement.tabIndex = -1;
    selectElement.setAttribute("aria-hidden", "true");
    selectElement.hidden = true;
    selectElement.parentElement?.insertBefore(picker, selectElement);
    picker.append(selectElement, trigger, menu);

    const pickerInstance = {
      select: selectElement,
      root: picker,
      trigger,
      dot,
      label,
      menu,
      options: [],
      colorClass: "",
      close() {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      },
      setValue(typeId, { focusTrigger = false } = {}) {
        const type = typeFor(typeId) || typeFor(storage.FALLBACK_TYPE_ID);
        if (!type) return;

        selectElement.value = type.id;
        if (pickerInstance.colorClass) {
          trigger.classList.remove(pickerInstance.colorClass);
        }
        pickerInstance.colorClass = `type-badge--${safeTypeColor(type)}`;
        trigger.classList.add(pickerInstance.colorClass);
        dot.className = `type-dot type-dot--${safeTypeColor(type)}`;
        label.textContent = type.name;
        pickerInstance.options.forEach((option) => {
          const selected = option.dataset.typeId === type.id;
          option.setAttribute("aria-selected", String(selected));
          option.tabIndex = selected ? 0 : -1;
        });
        if (focusTrigger) trigger.focus();
      },
      renderOptions() {
        const currentTypeId = selectElement.value || storage.FALLBACK_TYPE_ID;
        const fragment = document.createDocumentFragment();
        pickerInstance.options = library.types.map((type) => {
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
        fragment.append(...pickerInstance.options);
        menu.replaceChildren(fragment);
        pickerInstance.setValue(currentTypeId);
      },
    };

    trigger.addEventListener("click", () => {
      if (menu.hidden) {
        openColorPickers.forEach((openPicker) => closeColorPicker(openPicker));
        if (noteTypePicker && noteTypePicker !== pickerInstance) noteTypePicker.close();
        if (secondaryNoteTypePicker && secondaryNoteTypePicker !== pickerInstance) secondaryNoteTypePicker.close();
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        pickerInstance.options.find((option) => option.dataset.typeId === selectElement.value)?.focus();
      } else {
        pickerInstance.close();
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
      pickerInstance.setValue(option.dataset.typeId, { focusTrigger: true });
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      pickerInstance.close();
      if (typeof onSelect === "function") {
        onSelect(option.dataset.typeId);
      }
    });

    menu.addEventListener("keydown", (event) => {
      const currentIndex = pickerInstance.options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        pickerInstance.close();
        trigger.focus();
        return;
      }
      if (event.key === "Tab") {
        pickerInstance.close();
        return;
      }
      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % pickerInstance.options.length;
      else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + pickerInstance.options.length) % pickerInstance.options.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = pickerInstance.options.length - 1;
      else return;
      event.preventDefault();
      pickerInstance.options[nextIndex].focus();
    });

    selectElement.addEventListener("change", () => pickerInstance.setValue(selectElement.value));
    pickerInstance.renderOptions();
    return pickerInstance;
  }

  function closeNoteTypePicker() {
    noteTypePicker?.close();
    secondaryNoteTypePicker?.close();
  }

  function setNoteTypePickerValue(typeId, options) {
    noteTypePicker?.setValue(typeId, options);
  }

  function setSecondaryNoteTypePickerValue(typeId, options) {
    secondaryNoteTypePicker?.setValue(typeId, options);
  }

  function renderNoteTypePickerOptions() {
    noteTypePicker?.renderOptions();
    secondaryNoteTypePicker?.renderOptions();
  }

  function populateTypeSelectOptions(selectElement, preferredTypeId) {
    if (!selectElement) return;
    const currentValue = preferredTypeId || storage.FALLBACK_TYPE_ID;
    const fragment = document.createDocumentFragment();
    library.types.forEach((type) => {
      const option = createElement("option", { value: type.id, text: type.name });
      option.selected = type.id === currentValue;
      fragment.append(option);
    });
    selectElement.replaceChildren(fragment);
    if (![...selectElement.options].some((option) => option.value === currentValue)) {
      selectElement.value = storage.FALLBACK_TYPE_ID;
    }
  }

  function renderNoteTypeOptions(preferredTypeId = elements.noteType?.value) {
    populateTypeSelectOptions(elements.noteType, preferredTypeId);
    noteTypePicker?.renderOptions();
    if (elements.secondaryEditorTypeSelect) {
      populateTypeSelectOptions(
        elements.secondaryEditorTypeSelect,
        ui.secondaryNoteTypeId || elements.secondaryEditorTypeSelect.value,
      );
      secondaryNoteTypePicker?.renderOptions();
    }
  }

  function renderSecondaryNoteTypeOptions(preferredTypeId) {
    if (!elements.secondaryEditorTypeSelect) return;
    populateTypeSelectOptions(elements.secondaryEditorTypeSelect, preferredTypeId);
    if (secondaryNoteTypePicker) {
      secondaryNoteTypePicker.renderOptions();
      secondaryNoteTypePicker.setValue(preferredTypeId);
    }
  }

  function enhanceNoteTypeSelect() {
    if (!noteTypePicker && elements.noteType) {
      noteTypePicker = createCustomTypePicker(elements.noteType, {
        ariaDescribedBy: "note-type-error",
      });
      shared.noteTypePicker = noteTypePicker;
    }
    if (!secondaryNoteTypePicker && elements.secondaryEditorTypeSelect) {
      secondaryNoteTypePicker = createCustomTypePicker(elements.secondaryEditorTypeSelect, {
        ariaDescribedBy: "secondary-note-type-error",
        onSelect: (typeId) => {
          ui.secondaryNoteTypeId = typeId;
          if (elements.secondaryNoteType) {
            elements.secondaryNoteType.replaceChildren(makeTypeBadge(typeFor(typeId)));
          }
          onSecondaryNoteInput();
        },
      });
      shared.secondaryNoteTypePicker = secondaryNoteTypePicker;
    }
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

  function renderSecondarySelectedNoteTags() {
    if (!elements.secondarySelectedNoteTags) return;
    elements.secondarySelectedNoteTags.replaceChildren();
    const selectedTags = [...(ui.secondarySelectedNoteTagIds || [])].map(tagFor).filter(Boolean);
    selectedTags.forEach((tag) => {
      const chip = createElement("span", {
        className: "selected-tag",
        attributes: { title: tagLabel(tag) },
      });
      chip.append(createElement("span", { text: tagLabel(tag) }));
      const remove = createElement("button", {
        type: "button",
        attributes: { "aria-label": `Remove tag ${tagLabel(tag)}` },
      });
      remove.append(createChipCloseIcon());
      remove.addEventListener("click", () => {
        ui.secondarySelectedNoteTagIds.delete(tag.id);
        renderSecondarySelectedNoteTags();
        renderSecondaryTagSuggestions();
        onSecondaryNoteInput();
      });
      chip.append(remove);
      elements.secondarySelectedNoteTags.append(chip);
    });
  }

  function renderSecondaryTagSuggestions() {
    if (!elements.secondaryTagSuggestions || !elements.secondaryTagInput) return;
    if (!ui.secondaryTagInputExpanded) {
      elements.secondaryTagSuggestions.replaceChildren();
      return;
    }
    const queryText = cleanTagInput(elements.secondaryTagInput.value);
    const query = queryText.toLocaleLowerCase();
    const available = library.tags
      .filter((tag) => !ui.secondarySelectedNoteTagIds?.has(tag.id))
      .filter((tag) => !query || tagLabel(tag).toLocaleLowerCase().includes(query))
      .slice(0, 5);
    const hasExactMatch = library.tags.some((tag) => tagLabel(tag).toLocaleLowerCase() === query);
    elements.secondaryTagSuggestions.replaceChildren();
    if (!query) return;
    if (available.length) {
      elements.secondaryTagSuggestions.append(createElement("span", { className: "tag-suggestions__label", text: "Suggested" }));
    }
    available.forEach((tag) => {
      const button = createElement("button", {
        className: "tag-suggestion",
        type: "button",
        text: tagLabel(tag),
        attributes: { "aria-label": `Add tag ${tagLabel(tag)}` },
      });
      button.addEventListener("click", () => selectSecondaryNoteTag(tag.id));
      elements.secondaryTagSuggestions.append(button);
    });
    if (!hasExactMatch) {
      const create = createElement("button", {
        className: "tag-suggestion tag-suggestion--create",
        type: "button",
        text: `Create “${queryText}”`,
      });
      create.addEventListener("click", addSecondaryTagFromEditor);
      elements.secondaryTagSuggestions.append(create);
    }
  }

  function normalizeSecondaryTagEditorInput() {
    if (!elements.secondaryTagInput) return;
    const withoutPrefix = elements.secondaryTagInput.value.replace(/^\s*#+\s*/, "");
    if (withoutPrefix !== elements.secondaryTagInput.value) elements.secondaryTagInput.value = withoutPrefix;
    renderSecondaryTagSuggestions();
  }

  function setSecondaryTagInputExpanded(expanded, { focus = false } = {}) {
    if (!elements.secondaryTagInputRow || !elements.secondaryAddTag) return;
    ui.secondaryTagInputExpanded = Boolean(expanded);
    elements.secondaryTagInputRow.hidden = !ui.secondaryTagInputExpanded;
    elements.secondaryAddTag.setAttribute("aria-expanded", String(ui.secondaryTagInputExpanded));
    if (!ui.secondaryTagInputExpanded) {
      if (elements.secondaryTagInput) elements.secondaryTagInput.value = "";
      renderSecondaryTagSuggestions();
    }
    if (focus && elements.secondaryTagInput) {
      window.requestAnimationFrame(() => {
        if (ui.secondaryTagInputExpanded) elements.secondaryTagInput.focus();
      });
    }
  }

  function selectSecondaryNoteTag(tagId) {
    if (!tagFor(tagId)) return;
    if (!ui.secondarySelectedNoteTagIds) ui.secondarySelectedNoteTagIds = new Set();
    ui.secondarySelectedNoteTagIds.add(tagId);
    if (elements.secondaryTagInput) elements.secondaryTagInput.value = "";
    renderSecondarySelectedNoteTags();
    setSecondaryTagInputExpanded(false);
    onSecondaryNoteInput();
  }

  async function addSecondaryTagFromEditor() {
    if (!elements.secondaryTagInput) return;
    const rawName = cleanTagInput(elements.secondaryTagInput.value);
    if (!rawName) return;
    const existing = library.tags.find(
      (tag) => tagLabel(tag).toLocaleLowerCase() === rawName.toLocaleLowerCase(),
    );
    if (existing) {
      selectSecondaryNoteTag(existing.id);
      return;
    }
    try {
      const tag = await storage.addTag({ name: rawName });
      await refreshLibrary({ broadcast: true });
      if (!ui.secondarySelectedNoteTagIds) ui.secondarySelectedNoteTagIds = new Set();
      ui.secondarySelectedNoteTagIds.add(tag.id);
      if (elements.secondaryTagInput) elements.secondaryTagInput.value = "";
      renderSecondarySelectedNoteTags();
      setSecondaryTagInputExpanded(false);
      onSecondaryNoteInput();
      showToast(`Tag “${tagLabel(tag)}” created.`);
    } catch (error) {
      showError(error);
    }
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

  function clampScrollPosition(position, maximum) {
    return Math.min(Math.max(0, position), Math.max(0, maximum));
  }

  function getNoteEditorMaximumScrollTop(element) {
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }

  function getNoteEditorLineStartOffsets(source) {
    const offsets = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source.charCodeAt(index) === 10) offsets.push(index + 1);
    }
    return offsets;
  }

  function createNoteEditorSourceMirror(source, textarea = elements.noteContent) {
    if (!textarea) return null;
    const styles = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
    const textProperties = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fontVariant",
      "fontStretch",
      "fontKerning",
      "fontFeatureSettings",
      "letterSpacing",
      "wordSpacing",
      "lineHeight",
      "textTransform",
      "textIndent",
      "textAlign",
      "direction",
      "tabSize",
    ];
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, {
      position: "fixed",
      top: "0",
      left: "-100000px",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: "content-box",
      width: `${Math.max(1, textarea.clientWidth - horizontalPadding)}px`,
      minHeight: "0",
      margin: "0",
      paddingTop: styles.paddingTop,
      paddingRight: styles.paddingRight,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      border: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      wordBreak: styles.wordBreak === "normal" ? "break-word" : styles.wordBreak,
      overflow: "visible",
      contain: "layout style paint",
    });
    textProperties.forEach((property) => {
      mirror.style[property] = styles[property];
    });
    const textNode = document.createTextNode(source || "\u200b");
    mirror.append(textNode);
    document.body.append(mirror);
    return { mirror, textNode };
  }

  function getNoteEditorMirrorCaretTop(textNode, offset) {
    const safeOffset = Math.min(Math.max(0, offset), textNode.length);
    const range = document.createRange();
    const getRangeTop = () => {
      const rect = range.getBoundingClientRect();
      return rect.height > 0 ? rect.top : null;
    };
    range.setStart(textNode, safeOffset);
    range.collapse(true);
    let top = getRangeTop();
    if (top !== null) return top;
    if (safeOffset < textNode.length) {
      range.setEnd(textNode, safeOffset + 1);
      top = getRangeTop();
      if (top !== null) return top;
    }
    if (safeOffset > 0) {
      range.setStart(textNode, safeOffset - 1);
      range.setEnd(textNode, safeOffset);
      top = getRangeTop();
      if (top !== null) return top;
    }
    return 0;
  }

  function measureNoteEditorSourceLineOffsets(source, lineStarts, sourceLines, sourceMaximum, textarea = elements.noteContent) {
    const mirrorResult = createNoteEditorSourceMirror(source, textarea);
    if (!mirrorResult) return new Map();
    const { mirror, textNode } = mirrorResult;
    try {
      const mirrorTop = mirror.getBoundingClientRect().top;
      const origin = getNoteEditorMirrorCaretTop(textNode, 0) - mirrorTop;
      const mirrorMaximum = Math.max(0, mirror.scrollHeight - textarea.clientHeight);
      const scale = mirrorMaximum > 0 && sourceMaximum > 0 ? sourceMaximum / mirrorMaximum : 1;
      const offsets = new Map();
      sourceLines.forEach((line) => {
        const characterOffset = lineStarts[line];
        if (!Number.isInteger(characterOffset)) return;
        const measuredOffset = getNoteEditorMirrorCaretTop(textNode, characterOffset) - mirrorTop - origin;
        offsets.set(line, clampScrollPosition(measuredOffset * scale, sourceMaximum));
      });
      return offsets;
    } finally {
      mirror.remove();
    }
  }

  function getPreviewContentOffset(element, maximum, previewTop, previewScrollTop) {
    const elementBounds = element.getBoundingClientRect();
    return clampScrollPosition(
      elementBounds.top - previewTop + previewScrollTop,
      maximum,
    );
  }

  function createMonotonicScrollMap(points, fromKey, toKey, duplicateTarget = "min") {
    const sorted = points
      .map((point) => ({ from: point[fromKey], to: point[toKey] }))
      .filter((point) => Number.isFinite(point.from) && Number.isFinite(point.to))
      .sort((first, second) => first.from - second.from || first.to - second.to);
    const map = [];
    sorted.forEach((point) => {
      const previous = map.at(-1);
      if (!previous) {
        map.push(point);
        return;
      }
      if (point.from <= previous.from + 0.5) {
        previous.to = duplicateTarget === "max"
          ? Math.max(previous.to, point.to)
          : Math.min(previous.to, point.to);
        return;
      }
      map.push({ from: point.from, to: Math.max(previous.to, point.to) });
    });
    return map;
  }

  function sampleNoteEditorScrollAnchors(anchors) {
    const uniqueAnchors = [];
    const mappedSourceLines = new Set();
    anchors.forEach((anchor) => {
      if (mappedSourceLines.has(anchor.sourceLine)) return;
      mappedSourceLines.add(anchor.sourceLine);
      uniqueAnchors.push(anchor);
    });
    if (uniqueAnchors.length <= NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS) return uniqueAnchors;
    return Array.from({ length: NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS }, (_, index) => {
      const fraction = index / (NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS - 1);
      return uniqueAnchors[Math.round((uniqueAnchors.length - 1) * fraction)];
    });
  }

  function getSplitScrollSession(element) {
    if (
      (elements.secondaryNoteContentEditor && element === elements.secondaryNoteContentEditor) ||
      (elements.secondarySplitPreview && element === elements.secondarySplitPreview)
    ) {
      return {
        isSplit: ui.secondaryNoteMode === "split" && Boolean(ui.dualPaneOpen),
        source: elements.secondaryNoteContentEditor,
        preview: elements.secondarySplitPreview,
        getScrollMap: () => ui.secondaryScrollMap,
        setScrollMap: (map) => {
          ui.secondaryScrollMap = map;
        },
        getSyncTarget: () => ui.secondaryScrollSyncTarget,
        getSyncTargetTop: () => ui.secondaryScrollSyncTargetTop,
        setSyncTarget: (target, top) => {
          ui.secondaryScrollSyncTarget = target;
          ui.secondaryScrollSyncTargetTop = top;
        },
        resetSyncTarget: () => {
          ui.secondaryScrollSyncTarget = null;
          ui.secondaryScrollSyncTargetTop = 0;
          ui.secondaryScrollSyncResetFrame = 0;
        },
        cancelResetFrame: () => window.cancelAnimationFrame(ui.secondaryScrollSyncResetFrame),
        getMapFrame: () => ui.secondaryScrollMapFrame,
        setMapFrame: (frame) => {
          ui.secondaryScrollMapFrame = frame;
        },
      };
    }

    return {
      isSplit: ui.noteEditorMode === "split",
      source: elements.noteContent,
      preview: elements.noteContentPreview,
      getScrollMap: () => ui.noteScrollMap,
      setScrollMap: (map) => {
        ui.noteScrollMap = map;
      },
      getSyncTarget: () => ui.noteScrollSyncTarget,
      getSyncTargetTop: () => ui.noteScrollSyncTargetTop,
      setSyncTarget: (target, top) => {
        ui.noteScrollSyncTarget = target;
        ui.noteScrollSyncTargetTop = top;
      },
      resetSyncTarget: () => {
        ui.noteScrollSyncTarget = null;
        ui.noteScrollSyncTargetTop = 0;
        ui.noteScrollSyncResetFrame = 0;
      },
      cancelResetFrame: () => window.cancelAnimationFrame(ui.noteScrollSyncResetFrame),
      getMapFrame: () => ui.noteScrollMapFrame,
      setMapFrame: (frame) => {
        ui.noteScrollMapFrame = frame;
      },
    };
  }

  function buildSplitScrollMap(session) {
    if (!session || !session.isSplit) {
      if (session) session.setScrollMap(null);
      return null;
    }
    const { source, preview } = session;
    if (
      !source ||
      !preview ||
      preview.hidden ||
      source.clientWidth <= 0 ||
      preview.clientWidth <= 0
    ) {
      session.setScrollMap(null);
      return null;
    }

    const sourceMaximum = getNoteEditorMaximumScrollTop(source);
    const previewMaximum = getNoteEditorMaximumScrollTop(preview);
    const lineStarts = getNoteEditorLineStartOffsets(source.value);
    const renderedAnchors = [...preview.querySelectorAll("[data-markdown-source-start]")]
      .filter((element) => !element.closest(".markdown-footnotes"))
      .map((element) => ({
        element,
        sourceLine: Number.parseInt(element.dataset.markdownSourceStart, 10),
      }))
      .filter(({ sourceLine }) => Number.isInteger(sourceLine) && sourceLine >= 0 && sourceLine < lineStarts.length);
    const anchors = sampleNoteEditorScrollAnchors(renderedAnchors);
    const sourceLines = new Set(anchors.map(({ sourceLine }) => sourceLine));
    const sourceOffsets = sourceLines.size
      ? measureNoteEditorSourceLineOffsets(source.value, lineStarts, sourceLines, sourceMaximum, source)
      : new Map();
    const points = [{ source: 0, preview: 0 }];
    const previewTop = preview.getBoundingClientRect().top;
    const previewScrollTop = preview.scrollTop;
    anchors.forEach(({ element, sourceLine }) => {
      const sourceOffset = sourceOffsets.get(sourceLine);
      if (!Number.isFinite(sourceOffset) || sourceOffset <= 0.5 || sourceOffset >= sourceMaximum - 0.5) return;
      points.push({
        source: sourceOffset,
        preview: getPreviewContentOffset(element, previewMaximum, previewTop, previewScrollTop),
      });
    });
    points.push({ source: sourceMaximum, preview: previewMaximum });

    const sourceToPreview = createMonotonicScrollMap(points, "source", "preview");
    const previewToSource = createMonotonicScrollMap(sourceToPreview, "to", "from", "max");
    const scrollMap = {
      sourceToPreview,
      previewToSource,
      sourceMaximum,
      previewMaximum,
      sourceClientWidth: source.clientWidth,
      sourceClientHeight: source.clientHeight,
      previewClientWidth: preview.clientWidth,
      previewClientHeight: preview.clientHeight,
    };
    session.setScrollMap(scrollMap);
    return scrollMap;
  }

  function isNoteEditorScrollMapCurrent(scrollMap, source = elements.noteContent, preview = elements.noteContentPreview) {
    if (!scrollMap || !source || !preview) return false;
    return (
      scrollMap.sourceMaximum === getNoteEditorMaximumScrollTop(source) &&
      scrollMap.previewMaximum === getNoteEditorMaximumScrollTop(preview) &&
      scrollMap.sourceClientWidth === source.clientWidth &&
      scrollMap.sourceClientHeight === source.clientHeight &&
      scrollMap.previewClientWidth === preview.clientWidth &&
      scrollMap.previewClientHeight === preview.clientHeight
    );
  }

  function interpolateNoteEditorScrollMap(map, position) {
    if (!map.length) return 0;
    if (position <= map[0].from) return map[0].to;
    const last = map.at(-1);
    if (position >= last.from) return last.to;
    let low = 0;
    let high = map.length - 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (map[middle].from <= position) low = middle;
      else high = middle;
    }
    const start = map[low];
    const end = map[high];
    const distance = end.from - start.from;
    if (distance <= 0) return end.to;
    return start.to + ((position - start.from) / distance) * (end.to - start.to);
  }

  function resetNoteEditorScrollSyncTarget() {
    ui.noteScrollSyncTarget = null;
    ui.noteScrollSyncTargetTop = 0;
    ui.noteScrollSyncResetFrame = 0;
  }

  function syncNoteEditorScroll(source, target) {
    if (!source || !target) return;
    const session = getSplitScrollSession(source);
    if (!session || !session.isSplit) return;
    if (source === session.getSyncTarget()) {
      session.cancelResetFrame();
      if (Math.abs(source.scrollTop - session.getSyncTargetTop()) < 1) {
        session.resetSyncTarget();
        return;
      }
      session.resetSyncTarget();
    }
    const currentMap = session.getScrollMap();
    if (!isNoteEditorScrollMapCurrent(currentMap, session.source, session.preview)) {
      // Mirror/Range measurements belong to the scheduled layout pass, never
      // to a native scroll event. Keep the user's pane as the scroll leader.
      scheduleNoteEditorScrollMap(source);
      return;
    }
    const scrollMap = currentMap;
    const map = source === session.source
      ? scrollMap.sourceToPreview
      : scrollMap.previewToSource;
    const targetPosition = clampScrollPosition(
      interpolateNoteEditorScrollMap(map, source.scrollTop),
      source === session.source ? scrollMap.previewMaximum : scrollMap.sourceMaximum,
    );
    if (Math.abs(target.scrollTop - targetPosition) < 0.5) return;
    target.scrollTop = targetPosition;
    // Read back the browser-clamped position. Keep the echo guard until that
    // scroll arrives, even if delivery happens after the next animation frame.
    session.setSyncTarget(target, target.scrollTop);
  }

  function scheduleNoteEditorScrollMap(source = elements.noteContent) {
    const session = getSplitScrollSession(source);
    if (!session || !session.isSplit) return;
    window.cancelAnimationFrame(session.getMapFrame());
    session.setMapFrame(window.requestAnimationFrame(() => {
      session.setMapFrame(0);
      const liveSession = getSplitScrollSession(source);
      if (!liveSession.isSplit) return;
      if (buildSplitScrollMap(liveSession)) {
        const other = source === liveSession.source ? liveSession.preview : liveSession.source;
        syncNoteEditorScroll(source, other);
      }
    }));
  }

  function renderNoteEditorPreview() {
    if (ui.noteEditorMode !== "split") return;
    globalThis.NookMarkdown.renderInto(
      elements.noteContentPreview,
      elements.noteContent.value,
      "No content yet.",
      { sourceMap: true },
    );
    ui.noteScrollMap = null;
    scheduleNoteEditorScrollMap(elements.noteContent);
  }

  function scheduleNoteEditorPreview() {
    if (ui.noteEditorMode !== "split") return;
    ui.noteScrollMap = null;
    window.cancelAnimationFrame(ui.noteEditorPreviewFrame);
    ui.noteEditorPreviewFrame = window.requestAnimationFrame(() => {
      ui.noteEditorPreviewFrame = 0;
      renderNoteEditorPreview();
    });
  }

  function syncNotePreviewHeader() {
    const collapsed = Boolean(ui.notePreviewHeaderCollapsed);
    elements.quickViewDocumentHeader?.classList.toggle("is-collapsed", collapsed);
    elements.quickViewDocumentDetails?.setAttribute("aria-hidden", String(collapsed));
    if (!elements.quickViewHeaderToggle) return;
    const label = collapsed ? "Expand note details" : "Collapse note details";
    elements.quickViewHeaderToggle.setAttribute("aria-expanded", String(!collapsed));
    elements.quickViewHeaderToggle.setAttribute("aria-label", label);
    elements.quickViewHeaderToggle.title = label;
  }

  function toggleNotePreviewHeader() {
    if (ui.noteEditorMode !== "preview") return;
    ui.notePreviewHeaderCollapsed = !ui.notePreviewHeaderCollapsed;
    syncNotePreviewHeader();
  }

  function setNoteEditorMode(mode) {
    if (!["edit", "split", "preview"].includes(mode)) return;
    const previousMode = ui.noteEditorMode;
    resetCopyButtonFeedback(elements.copyNoteContent);
    if (mode !== "split") {
      ui.noteScrollMap = null;
      window.cancelAnimationFrame(ui.noteScrollMapFrame);
      ui.noteScrollMapFrame = 0;
      window.cancelAnimationFrame(ui.noteScrollSyncResetFrame);
      resetNoteEditorScrollSyncTarget();
    }
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
    syncNotePreviewHeader();
    elements.noteEditorModeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.noteEditorMode === mode));
    });
    syncNotePreviewActions();
    if (mode === "preview") renderQuickView();
    else renderNoteEditorPreview();
    scheduleNoteEditorHeight();
    if (previousMode !== mode && isNoteEditorOpen()) {
      noteEditorModeAnimation?.cancel();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animation = elements.noteDialog.querySelector(".dialog-body")?.animate(
        [{ opacity: reducedMotion ? 0.82 : 0.64 }, { opacity: 1 }],
        { duration: reducedMotion ? MOTION.micro : MOTION.short, easing: MOTION.easeOut },
      );
      if (animation) {
        noteEditorModeAnimation = animation;
        animation.finished.catch(() => {}).finally(() => {
          if (noteEditorModeAnimation === animation) noteEditorModeAnimation = null;
        });
      }
    }
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

  function noteEditorValidationTarget(fieldName) {
    if (fieldName === "title") {
      return {
        control: elements.noteTitle,
        error: elements.noteTitleError,
      };
    }
    if (fieldName === "type") {
      return {
        control: noteTypePicker?.trigger || elements.noteType,
        error: elements.noteTypeError,
      };
    }
    return null;
  }

  function setNoteEditorFieldError(fieldName, message = "") {
    const target = noteEditorValidationTarget(fieldName);
    if (!target) return;
    const hasError = Boolean(message);
    target.error.textContent = message;
    target.error.classList.toggle("is-visible", hasError);
    if (hasError) target.control.setAttribute("aria-invalid", "true");
    else target.control.removeAttribute("aria-invalid");
  }

  function noteEditorFieldError(fieldName) {
    if (fieldName === "title") {
      return elements.noteTitle.value.trim() ? "" : "Enter a title.";
    }
    if (fieldName === "type") {
      const typeExists = library.types.some(({ id }) => id === elements.noteType.value);
      return typeExists ? "" : "Choose a note type.";
    }
    return "";
  }

  function revalidateNoteEditorField(fieldName) {
    const target = noteEditorValidationTarget(fieldName);
    if (!target?.error.classList.contains("is-visible")) return;
    setNoteEditorFieldError(fieldName, noteEditorFieldError(fieldName));
  }

  function clearNoteEditorValidation() {
    setNoteEditorFieldError("title");
    setNoteEditorFieldError("type");
  }

  function validateNoteEditor({ focusFirst = true } = {}) {
    const fields = ["title", "type"];
    let firstInvalidTarget = null;
    fields.forEach((fieldName) => {
      const message = noteEditorFieldError(fieldName);
      setNoteEditorFieldError(fieldName, message);
      if (!firstInvalidTarget && message) {
        firstInvalidTarget = noteEditorValidationTarget(fieldName)?.control || null;
      }
    });
    if (!firstInvalidTarget) return true;
    if (focusFirst) {
      if (ui.noteEditorMode === "preview") setNoteEditorMode("edit");
      firstInvalidTarget.focus();
    }
    return false;
  }

  function handleNoteSaveFieldError(error, { focus = true } = {}) {
    const message = error instanceof Error ? error.message : "";
    let fieldName = "";
    if (message.startsWith("Note title ")) fieldName = "title";
    if (message === "Choose a valid note type." || message.startsWith("Note type ")) fieldName = "type";
    if (!fieldName) return false;
    const inlineMessage = fieldName === "title" ? "Shorten the title." : "Choose a note type.";
    setNoteEditorFieldError(fieldName, noteEditorFieldError(fieldName) || inlineMessage);
    if (focus) {
      if (ui.noteEditorMode === "preview") setNoteEditorMode("edit");
      noteEditorValidationTarget(fieldName)?.control.focus();
    }
    return true;
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

  function createPrimaryEditorSession(note = null, draft = getNoteEditorDraftData(), baseRevision = note?.revision || 0) {
    primaryEditorSession?.dispose();
    const committed = note ? {
      id: note.id,
      title: note.title,
      typeId: note.typeId,
      tagIds: note.tagIds,
      content: note.content,
    } : null;
    primaryEditorSession = api.createEditorSession({
      storage,
      pane: "primary",
      noteId: note?.id || draft.id || "",
      baseRevision,
      committed,
      currentDraft: draft,
      recoveryStore: draftRecoveryStore,
    });
    shared.primaryEditorSession = primaryEditorSession;
    return primaryEditorSession;
  }

  function syncPrimaryEditorSessionDraft() {
    if (!primaryEditorSession) return null;
    primaryEditorSession.updateDraft(getNoteEditorDraftData());
    return primaryEditorSession.getState();
  }

  function hasUnsavedNoteChanges() {
    if (primaryEditorSession) {
      syncPrimaryEditorSessionDraft();
      return primaryEditorSession.hasUnsavedChanges();
    }
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
    syncPrimaryEditorSessionDraft();
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

  function replaceNoteContentSelection(replacement, selectionStart, selectionEnd, nextSelectionStart, nextSelectionEnd, targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (!textarea) return;
    textarea.focus();
    textarea.setRangeText(replacement, selectionStart, selectionEnd, "preserve");
    textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function toggleNoteContentWrapper(marker, targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (!textarea) return;
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
        textarea,
      );
      return;
    }

    replaceNoteContentSelection(
      `${marker}${selectedText}${marker}`,
      selectionStart,
      selectionEnd,
      selectionStart + marker.length,
      selectionEnd + marker.length,
      textarea,
    );
  }

  function insertNoteLink(targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (!textarea) return;
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
      textarea,
    );
  }

  function applyNoteFormattingShortcut(formatting, targetTextarea = elements.noteContent) {
    if (formatting === "link") return insertNoteLink(targetTextarea);
    applyNoteFormatting(formatting, targetTextarea);
  }

  function selectedNoteContentLineRange(targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    const value = textarea ? textarea.value : "";
    const selectionStart = textarea ? textarea.selectionStart : 0;
    const selectionEnd = textarea ? textarea.selectionEnd : 0;
    const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextLineBreak = value.indexOf("\n", selectionEnd);
    const end = nextLineBreak === -1 ? value.length : nextLineBreak;
    return { start, end, text: value.slice(start, end) };
  }

  function toggleNoteContentLinePrefix(prefix, expression, targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    const { start, end, text } = selectedNoteContentLineRange(textarea);
    const lines = text.split("\n");
    const removePrefix = lines.every((line) => expression.test(line));
    const replacement = lines
      .map((line) => removePrefix ? line.replace(expression, "") : `${prefix}${line}`)
      .join("\n");
    replaceNoteContentSelection(replacement, start, end, start, start + replacement.length, textarea);
  }

  function toggleNoteContentOrderedList(targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    const { start, end, text } = selectedNoteContentLineRange(textarea);
    const lines = text.split("\n");
    const expression = /^\d+\.\s+/;
    const removePrefix = lines.every((line) => expression.test(line));
    const replacement = lines
      .map((line, index) => removePrefix ? line.replace(expression, "") : `${index + 1}. ${line}`)
      .join("\n");
    replaceNoteContentSelection(replacement, start, end, start, start + replacement.length, textarea);
  }

  function insertNoteContentTemplate(template, selectionOffset, selectionLength = () => 0, targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (!textarea) return;
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
      textarea,
    );
  }

  function nextFootnoteNumber(targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (!textarea) return 1;
    const references = [...textarea.value.matchAll(/\[\^(\d+)\]/g)]
      .map((match) => Number.parseInt(match[1], 10))
      .filter(Number.isFinite);
    return references.length ? Math.max(...references) + 1 : 1;
  }

  function applyNoteFormatting(formatting, targetTextarea = elements.noteContent) {
    const textarea = targetTextarea || elements.noteContent;
    if (formatting === "bold") return toggleNoteContentWrapper("**", textarea);
    if (formatting === "italic") return toggleNoteContentWrapper("*", textarea);
    if (formatting === "strikethrough") return toggleNoteContentWrapper("~~", textarea);
    if (formatting === "inline-code") return toggleNoteContentWrapper("`", textarea);
    if (formatting === "heading") return toggleNoteContentLinePrefix("## ", /^#{1,6}\s+/, textarea);
    if (formatting === "bullet-list") return toggleNoteContentLinePrefix("- ", /^[-*+]\s+/, textarea);
    if (formatting === "task-list") return toggleNoteContentLinePrefix("- [ ] ", /^-\s\[[ xX]\]\s+/, textarea);
    if (formatting === "ordered-list") return toggleNoteContentOrderedList(textarea);
    if (formatting === "code-block") {
      return insertNoteContentTemplate(
        (selectedText) => `\`\`\`\n${selectedText}\n\`\`\``,
        () => 4,
        (selectedText) => selectedText.length,
        textarea,
      );
    }
    if (formatting === "table") {
      return insertNoteContentTemplate(
        () => "| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |",
        () => 2,
        () => "Column 1".length,
        textarea,
      );
    }
    if (formatting === "alert") {
      return insertNoteContentTemplate(
        (selectedText) => `> [!NOTE]\n> ${selectedText || "Add a note"}`,
        () => 12,
        (selectedText) => (selectedText || "Add a note").length,
        textarea,
      );
    }
    if (formatting === "footnote") {
      const number = nextFootnoteNumber(textarea);
      return insertNoteContentTemplate(
        (selectedText) => `${selectedText}[^${number}]\n\n[^${number}]: `,
        (selectedText, replacement) => replacement.length,
        () => 0,
        textarea,
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
    ui.notePreviewHeaderCollapsed = false;
    ui.selectedNoteTagIds = new Set(note?.tagIds || []);
    elements.noteForm.reset();
    clearNoteEditorValidation();
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
    openNoteDetail(elements.noteDialog, preserveDetail ? null : invoker || elements.newNote);
    ui.noteEditorSnapshot = getNoteEditorDraft();
    createPrimaryEditorSession(note, getNoteEditorDraftData(), note?.revision || 0);
    elements.noteHistory?.classList.toggle("is-hidden", !note);
    syncToastHost();
    syncNoteEditorControls();
    setNoteSaveStatus(note ? "saved" : "new");
    scheduleNoteEditorHeight({ allowShrink: true });
    if (initialMode === "split") scheduleNoteEditorScrollMap(elements.noteContent);
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
    primaryEditorSession?.dispose();
    draftRecoveryStore.remove(recovery.key);
    createPrimaryEditorSession(note, getNoteEditorDraftData(), recovery.baseRevision || note?.revision || 0);
    scheduleNoteAutoSave();
    showToast("Unfinished draft restored. Save when you are ready.");
  }

  async function offerStoredNoteDraftRecovery() {
    let recovery = draftRecoveryStore.enumerate()
      .filter((record) => record.tabId === draftRecoveryStore.tabId && record.pane === "primary")
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0];
    let legacy = false;
    if (!recovery) {
      const legacyDraft = getStoredNoteDraft();
      if (legacyDraft) {
        legacy = true;
        recovery = {
          key: "",
          pane: "primary",
          savedAt: legacyDraft.savedAt,
          baseRevision: library.notes.find((note) => note.id === legacyDraft.draft.id)?.revision || 0,
          draft: legacyDraft.draft,
        };
      }
    }
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
      if (legacy) clearStoredNoteDraft();
      else draftRecoveryStore.remove(recovery.key);
      showToast("Unfinished draft discarded.");
      return;
    }
    if (legacy) clearStoredNoteDraft();
    restoreStoredNoteDraft(recovery);
  }

  function syncEditorDraftRecovery() {
    if (primaryEditorSession && isNoteEditorOpen()) syncPrimaryEditorSessionDraft();
    api.syncSecondaryEditorDraft?.();
  }

  function hydratePrimaryEditorFromCommittedNote(note) {
    elements.noteId.value = note.id;
    elements.noteTitle.value = note.title;
    elements.noteContent.value = note.content;
    ui.editingNoteId = note.id;
    ui.selectedNoteTagIds = new Set(note.tagIds || []);
    renderNoteTypeOptions(note.typeId || storage.FALLBACK_TYPE_ID);
    renderSelectedNoteTags();
    renderTagSuggestions();
    renderNoteMetadata(note);
    ui.noteEditorSnapshot = getNoteEditorDraft();
    setNoteSaveStatus("saved");
    if (ui.noteEditorMode !== "edit") renderNoteEditorPreview();
    scheduleNoteEditorHeight({ allowShrink: true });
  }

  function reconcileEditorSessionsAfterLibraryRefresh({ external = false } = {}) {
    if (primaryEditorSession && isNoteEditorOpen() && primaryEditorSession.noteId) {
      const session = primaryEditorSession;
      const latest = library.notes.find((note) => note.id === session.noteId && !note.deletedAt);
      if (!latest) {
        if (session.hasUnsavedChanges()) {
          setNoteSaveStatus("error", "Saved note changed elsewhere");
          showToast("This note changed or was removed elsewhere. Your draft was kept locally.", "error");
        } else {
          closeNoteEditor({ discardStoredDraft: true });
        }
      } else {
        const result = session.applyExternalSnapshot(latest);
        if (result.conflict) {
          setNoteSaveStatus("error", "Newer version found");
          if (external) showToast("A newer version was saved in another tab. Your draft was kept.", "error");
        } else if (result.applied && primaryEditorSession === session) {
          hydratePrimaryEditorFromCommittedNote(latest);
        }
      }
    }
    api.reconcileSecondaryEditorAfterLibraryRefresh?.({ external });
  }

  function closeNoteEditor({ discardStoredDraft = false } = {}) {
    clearNoteAutoSave();
    window.cancelAnimationFrame(ui.noteEditorPreviewFrame);
    window.cancelAnimationFrame(ui.noteScrollMapFrame);
    window.cancelAnimationFrame(ui.noteScrollSyncResetFrame);
    ui.noteEditorPreviewFrame = 0;
    ui.noteScrollMapFrame = 0;
    ui.noteScrollMap = null;
    resetNoteEditorScrollSyncTarget();
    const recoveryIdentity = primaryEditorSession
      ? { pane: primaryEditorSession.pane, sessionId: primaryEditorSession.sessionId }
      : null;
    primaryEditorSession?.dispose();
    if (discardStoredDraft && recoveryIdentity) draftRecoveryStore.remove(recoveryIdentity);
    primaryEditorSession = null;
    shared.primaryEditorSession = null;
    ui.noteEditorSession += 1;
    ui.pendingTagCreation = null;
    ui.noteSaveInFlight = false;
    ui.noteAutoSaveInFlight = false;
    ui.noteCloseAfterSaveRequested = false;
    setTagInputExpanded(false);
    elements.noteContentEditor.style.removeProperty("height");
    ui.editingNoteId = "";
    ui.selectedNoteTagIds.clear();
    ui.noteEditorSnapshot = null;
    ui.notePreviewHeaderCollapsed = false;
    closeNoteDetail();
    // Keep the currently visible surface intact for the exit animation. The
    // next editor open re-syncs the DOM classes before it becomes visible.
    ui.noteEditorMode = "edit";
    ui.viewInvoker = null;
  }

  async function closeEditorAfterProtectedSaves({ discardStoredDraft = false } = {}) {
    if (ui.dualPaneOpen) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen) return false;
    }
    if (!isNoteEditorOpen()) return false;
    closeNoteEditor({ discardStoredDraft });
    return true;
  }

  async function requestNoteEditorClose({ afterClose = null } = {}) {
    if (ui.noteSaveInFlight) {
      ui.noteCloseAfterSaveRequested = true;
      return;
    }
    if (ui.dualPaneOpen) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen || !isNoteEditorOpen()) return;
    }
    if (!hasUnsavedNoteChanges()) {
      closeNoteEditor();
      afterClose?.();
      return;
    }
    if (elements.noteTitle.value.trim()) {
      await saveNote({ preventDefault() {} }, { closeAfterSave: true });
      if (!isNoteEditorOpen()) afterClose?.();
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
    if (!validateNoteEditor({ focusFirst: !isAutoSave })) {
      return;
    }
    const session = ui.noteEditorSession;
    const pendingTagCreation = ui.pendingTagCreation;
    if (pendingTagCreation?.session === session) {
      await pendingTagCreation.promise;
      if (!isCurrentNoteEditorSession(session)) return;
    }

    const editorSession = primaryEditorSession;
    if (!editorSession) return;
    syncPrimaryEditorSessionDraft();

    ui.noteSaveInFlight = true;
    ui.noteAutoSaveInFlight = isAutoSave;
    setNoteSaveStatus("saving");
    syncNoteEditorControls();
    let didSave = false;
    try {
      const isEditing = Boolean(editorSession.noteId);
      let result = await editorSession.save();
      if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;

      while (result.status === "conflict") {
        setNoteSaveStatus("error", "Newer version found");
        const choice = await requestConflictResolution({
          localDraft: editorSession.currentDraft,
          latestNote: result.latestNote || (result.deleted ? null : { ...result.latest, revision: result.latestRevision }),
          deleted: result.deleted === true,
          invoker: noteSubmitButton(),
        });
        if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;
        if (choice === "keep-mine") {
          setNoteSaveStatus("saving");
          result = await editorSession.keepMine();
          if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;
        } else {
          editorSession.keepEditing();
          if (choice === "view-latest" && !result.deleted) {
            api.openConflictLatestPreview?.(
              result.latestNote || { ...result.latest, revision: result.latestRevision },
              noteSubmitButton(),
            );
          }
          setNoteSaveStatus("dirty", "Conflict · draft kept");
          return;
        }
      }

      if (result.status === "error") throw result.error;
      if (result.status === "stale") return;
      if (result.status === "noop") {
        setNoteSaveStatus("saved");
        if (closeAfterSave) await closeEditorAfterProtectedSaves({ discardStoredDraft: true });
        return;
      }
      if (result.status !== "saved") return;

      didSave = true;
      const savedNote = result.savedNote;
      elements.noteId.value = savedNote.id;
      if (result.currentMatchesCapture) {
        if (elements.noteTitle.value !== savedNote.title) elements.noteTitle.value = savedNote.title;
        if (elements.noteContent.value !== savedNote.content) elements.noteContent.value = savedNote.content;
        ui.selectedNoteTagIds = new Set(savedNote.tagIds || []);
        renderNoteTypeOptions(savedNote.typeId);
        renderSelectedNoteTags();
      }
      ui.editingNoteId = savedNote.id;
      elements.noteDialogTitle.textContent = "Edit note";
      elements.deleteNote.classList.remove("is-hidden");
      elements.noteHistory?.classList.remove("is-hidden");
      renderNoteMetadata(savedNote);
      ui.noteEditorSnapshot = createNoteEditorDraft(savedNote);
      await refreshLibrary({ broadcast: true });
      if (!isCurrentNoteEditorSession(session) || primaryEditorSession !== editorSession) return;

      if (result.currentMatchesCapture && !editorSession.hasUnsavedChanges()) {
        setNoteSaveStatus("saved");
        if (closeAfterSave) await closeEditorAfterProtectedSaves({ discardStoredDraft: true });
      } else {
        setNoteSaveStatus("dirty");
        scheduleNoteAutoSave();
      }
      if (!isAutoSave) {
        showToast(closeAfterSave && !editorSession.hasUnsavedChanges()
          ? (isEditing ? "Note updated." : "Note saved.")
          : "Changes saved. Keep editing.");
      }
    } catch (error) {
      if (isCurrentNoteEditorSession(session) && primaryEditorSession === editorSession) {
        ui.noteCloseAfterSaveRequested = false;
        setNoteSaveStatus("error");
        if (!handleNoteSaveFieldError(error, { focus: !isAutoSave })) {
          showError(error, "We could not save this note.");
        }
      }
    } finally {
      if (isCurrentNoteEditorSession(session) && primaryEditorSession === editorSession) {
        ui.noteSaveInFlight = false;
        ui.noteAutoSaveInFlight = false;
        syncNoteEditorControls();
        if (didSave && hasUnsavedNoteChanges()) scheduleNoteAutoSave();
        if (ui.noteCloseAfterSaveRequested) {
          ui.noteCloseAfterSaveRequested = false;
          void requestNoteEditorClose();
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
    if (ui.dualPaneOpen) {
      const sideClosed = await api.closeDualPane?.();
      if (!sideClosed || ui.dualPaneOpen) return;
    }
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

  Object.assign(api, {
    renderNoteTypeOptions,
    renderSecondaryNoteTypeOptions,
    closeNoteTypePicker,
    setNoteTypePickerValue,
    setSecondaryNoteTypePickerValue,
    renderNoteTypePickerOptions,
    enhanceNoteTypeSelect,
    renderSelectedNoteTags,
    renderSecondarySelectedNoteTags,
    renderTagSuggestions,
    renderSecondaryTagSuggestions,
    normalizeTagEditorInput,
    normalizeSecondaryTagEditorInput,
    setSecondaryTagInputExpanded,
    selectSecondaryNoteTag,
    addSecondaryTagFromEditor,
    renderNoteMetadata,
    syncNoteEditorScroll,
    scheduleNoteEditorScrollMap,
    renderNoteEditorPreview,
    scheduleNoteEditorPreview,
    setNoteEditorMode,
    toggleNotePreviewHeader,
    syncNoteEditorHeight,
    scheduleNoteEditorHeight,
    noteSubmitButton,
    revalidateNoteEditorField,
    clearNoteEditorValidation,
    validateNoteEditor,
    getNoteEditorDraftData,
    getNoteEditorDraft,
    createNoteEditorDraft,
    hasUnsavedNoteChanges,
    clearNoteAutoSave,
    setNoteSaveStatus,
    scheduleNoteAutoSave,
    replaceNoteContentSelection,
    toggleNoteContentWrapper,
    insertNoteLink,
    applyNoteFormattingShortcut,
    selectedNoteContentLineRange,
    toggleNoteContentLinePrefix,
    toggleNoteContentOrderedList,
    insertNoteContentTemplate,
    nextFootnoteNumber,
    applyNoteFormatting,
    isCurrentNoteEditorSession,
    syncNoteEditorControls,
    openNoteEditor,
    restoreStoredNoteDraft,
    offerStoredNoteDraftRecovery,
    syncEditorDraftRecovery,
    reconcileEditorSessionsAfterLibraryRefresh,
    closeNoteEditor,
    requestNoteEditorClose,
    setTagInputExpanded,
    selectNoteTag,
    addTagFromEditor,
    saveNote,
    deleteNoteWithConfirmation,
  });
});
