(() => {
  "use strict";

  // Shared type/tag picker components and per-pane rendering adapters.
  globalThis[Symbol.for("nook.app.modules")].register("note-pickers", (app) => {

    const { api, storage, elements, library, ui, shared } = app;
    const { openColorPickers } = shared;
    let noteTypePicker = shared.noteTypePicker;
    let secondaryNoteTypePicker = shared.secondaryNoteTypePicker;
    const createElement = (...args) => api.createElement(...args);
    const typeFor = (...args) => api.typeFor(...args);
    const tagFor = (...args) => api.tagFor(...args);
    const tagLabel = (...args) => api.tagLabel(...args);
    const cleanTagInput = (...args) => api.cleanTagInput(...args);
    const safeTypeColor = (...args) => api.safeTypeColor(...args);
    const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
    const showToast = (...args) => api.showToast(...args);
    const showError = (...args) => api.showError(...args);
    const createChipCloseIcon = (...args) => api.createChipCloseIcon(...args);
    const closeColorPicker = (...args) => api.closeColorPicker(...args);
    const refreshLibrary = (...args) => api.refreshLibrary(...args);
    const onSecondaryNoteInput = (...args) => api.onSecondaryNoteInput(...args);
    const scheduleNoteAutoSave = (...args) => api.scheduleNoteAutoSave(...args);
    const selectNoteTag = (...args) => api.selectNoteTag(...args);
    const addTagFromEditor = (...args) => api.addTagFromEditor(...args);

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
          trigger.setAttribute("aria-label", `Note type: ${type.name}`);
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
          className: "selected-tag__remove",
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
          className: "selected-tag__remove",
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
      const session = shared.secondaryEditorSession;
      if (!session) return;
      if (ui.pendingSecondaryTagCreation?.session === session) return ui.pendingSecondaryTagCreation.promise;
      const rawName = cleanTagInput(elements.secondaryTagInput.value);
      if (!rawName) return;
      const existing = library.tags.find(
        (tag) => tagLabel(tag).toLocaleLowerCase() === rawName.toLocaleLowerCase(),
      );
      if (existing) {
        selectSecondaryNoteTag(existing.id);
        return;
      }
      const pending = { session, promise: null };
      ui.pendingSecondaryTagCreation = pending;
      const operation = (async () => {
        try {
          const tag = await storage.addTag({ name: rawName });
          await refreshLibrary({ broadcast: true });
          if (shared.secondaryEditorSession !== session || !ui.dualPaneOpen) return;
          if (!ui.secondarySelectedNoteTagIds) ui.secondarySelectedNoteTagIds = new Set();
          ui.secondarySelectedNoteTagIds.add(tag.id);
          if (elements.secondaryTagInput) elements.secondaryTagInput.value = "";
          renderSecondarySelectedNoteTags();
          setSecondaryTagInputExpanded(false);
          onSecondaryNoteInput();
          showToast(`Tag “${tagLabel(tag)}” created.`);
        } catch (error) {
          if (shared.secondaryEditorSession === session) showError(error);
        } finally {
          if (ui.pendingSecondaryTagCreation === pending) ui.pendingSecondaryTagCreation = null;
        }
      })();
      pending.promise = operation;
      return operation;
    }

    Object.assign(api, {
      closeNoteTypePicker,
      setNoteTypePickerValue,
      setSecondaryNoteTypePickerValue,
      renderNoteTypePickerOptions,
      renderNoteTypeOptions,
      renderSecondaryNoteTypeOptions,
      enhanceNoteTypeSelect,
      renderSelectedNoteTags,
      renderTagSuggestions,
      normalizeTagEditorInput,
      renderSecondarySelectedNoteTags,
      renderSecondaryTagSuggestions,
      normalizeSecondaryTagEditorInput,
      setSecondaryTagInputExpanded,
      selectSecondaryNoteTag,
      addSecondaryTagFromEditor,
    });
  });
})();
