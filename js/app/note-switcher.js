(() => {
  "use strict";

  // Both panes browse the same card picker without replacing their editor session.
  globalThis[Symbol.for("nook.app.modules")].register("note-switcher", (app) => {
    const { api, elements, library, ui, shared } = app;
    const RESULT_LIMIT = 50;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const pickers = {
      primary: {
        surface: elements.noteDialog, reader: elements.noteForm, view: elements.primaryPickerView,
        trigger: elements.primarySwitchNote, back: elements.primaryPickerBack,
        search: elements.primaryNoteSearch, clear: elements.primaryClearSearch, sort: elements.primarySort,
        focus: elements.primaryFocusView, comfortable: elements.primaryComfortableView, list: elements.primaryNotesList,
      },
      secondary: {
        surface: elements.secondarySurface, reader: elements.secondaryReaderView, view: elements.secondaryPickerView,
        trigger: elements.secondaryBackToPicker, back: elements.secondaryPickerBack,
        search: elements.secondaryNoteSearch, clear: elements.secondaryClearSearch, sort: elements.secondarySort,
        focus: elements.secondaryFocusView, comfortable: elements.secondaryComfortableView, list: elements.secondaryNotesList,
      },
    };
    Object.values(pickers).forEach((picker) => Object.assign(picker, {
      sequence: 0, busy: false, scrollPositions: [], resumeAutoSave: false,
    }));

    function sessionFor(pane) {
      return pane === "primary" ? shared.primaryEditorSession : shared.secondaryEditorSession;
    }

    function isPaneActive(pane) {
      return api.isNoteEditorOpen() && (pane === "primary" || (ui.dualPaneOpen && !ui.secondaryClosing));
    }

    function isPaneNotePickerOpen(pane) {
      return Boolean(ui.notePickers[pane]?.open && isPaneActive(pane));
    }

    function activePaneNotePicker(target = document.activeElement) {
      return Object.keys(pickers).find((pane) => isPaneNotePickerOpen(pane) && pickers[pane].surface.contains(target)) || null;
    }

    function deferPaneNoteAutoSave(pane) {
      pickers[pane].resumeAutoSave = true;
    }

    function setPickerBusy(pane, busy) {
      const picker = pickers[pane];
      picker.busy = busy;
      picker.list.inert = busy;
      picker.list.setAttribute("aria-busy", String(busy));
      [picker.search, picker.clear, picker.sort, picker.focus, picker.comfortable].forEach((control) => {
        control.disabled = busy;
      });
      const sortTrigger = picker.sort.closest(".sort-field")?.querySelector(".sort-field__trigger");
      if (sortTrigger) sortTrigger.disabled = busy;
    }

    function syncPaneNotePickerLayout(pane) {
      const picker = pickers[pane];
      const { viewMode } = ui.notePickers[pane];
      picker.list.classList.toggle("secondary-notes-list--comfortable", viewMode === "comfortable");
      [["focus", picker.focus], ["comfortable", picker.comfortable]].forEach(([mode, button]) => {
        button.classList.toggle("is-active", mode === viewMode);
        button.setAttribute("aria-pressed", String(mode === viewMode));
      });
    }

    function setPaneNotePickerLayout(pane, mode) {
      if (!["focus", "comfortable"].includes(mode) || pickers[pane].busy) return;
      ui.notePickers[pane].viewMode = mode;
      syncPaneNotePickerLayout(pane);
      if (pane === "secondary") {
        try { localStorage.setItem("nook:secondary-view-mode", mode); } catch { /* Keep the session preference. */ }
      }
    }

    function renderPaneNotePicker(pane) {
      const picker = pickers[pane];
      const state = ui.notePickers[pane];
      const query = state.query.trim().toLocaleLowerCase();
      const scrollTop = state.scrollTop;
      syncPaneNotePickerLayout(pane);
      picker.search.value = state.query;
      picker.clear.classList.toggle("is-hidden", !state.query);
      picker.sort.value = state.sort;
      if (pane === "primary") api.syncPrimarySortPicker();
      else api.syncSecondarySortPicker();
      // Active notes are excluded so picker card actions cannot mutate either draft.
      const excluded = new Set([ui.editingNoteId, ...(ui.dualPaneOpen ? [sessionFor("secondary")?.noteId] : [])]);
      const notes = library.notes.filter((note) => !api.isDeletedNote(note) && !excluded.has(note.id) &&
        (!query || (library.searchIndex.get(note.id) || `${note.title}\n${note.content}`.toLocaleLowerCase()).includes(query)));
      notes.sort((left, right) => {
        const direction = state.sort.endsWith("asc") ? 1 : -1;
        let comparison;
        if (state.sort.startsWith("title")) comparison = collator.compare(left.title, right.title);
        else {
          const field = state.sort.startsWith("created") ? "createdAt" : "updatedAt";
          comparison = new Date(left[field] || left.createdAt || 0) - new Date(right[field] || right.createdAt || 0);
        }
        return (comparison && !Number.isNaN(comparison) ? comparison * direction : 0) || collator.compare(left.id, right.id);
      });
      picker.list.replaceChildren();
      if (!notes.length) {
        picker.list.append(api.createElement("div", {
          className: "secondary-notes-empty", text: query ? `No notes matching “${state.query.trim()}”.` : "No other notes available to open.",
        }));
        return;
      }
      const fragment = document.createDocumentFragment();
      notes.slice(0, RESULT_LIMIT).forEach((note) => fragment.append(api.createNoteCard(note, {
        secondary: true, onOpen: (id, mode) => selectPaneNote(pane, id, mode),
      })));
      if (notes.length > RESULT_LIMIT) fragment.append(api.createElement("p", {
        className: "secondary-notes-limit dialog-description",
        text: `Showing the first ${RESULT_LIMIT} of ${notes.length} notes. Refine your search to narrow the list.`,
      }));
      picker.list.append(fragment);
      api.observeNoteCardTagRows();
      picker.list.scrollTop = scrollTop;
    }

    function showPaneNotePicker(pane, { resetSearch = false, isCurrent = () => true } = {}) {
      if (!isPaneActive(pane) || !isCurrent()) return false;
      const picker = pickers[pane];
      const state = ui.notePickers[pane];
      if (!state.open) {
        picker.scrollPositions = [...picker.reader.querySelectorAll("textarea, .dialog-body, .quick-view-content-card, .note-content-preview, .note-editor-pane--preview")]
          .map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
        picker.resumeAutoSave = Boolean(pane === "primary" ? ui.noteAutoSaveTimer : ui.secondaryAutoSaveTimer);
      }
      if (pane === "primary") api.clearNoteAutoSave();
      else api.clearSecondaryNoteAutoSave();
      api.closeNoteFontSizePopover();
      api.closeNoteTypePicker();
      if (resetSearch) { state.query = ""; state.scrollTop = 0; }
      state.open = true;
      const sequence = ++picker.sequence;
      setPickerBusy(pane, false);
      picker.back.classList.toggle("is-hidden", !sessionFor(pane));
      picker.trigger.setAttribute("aria-expanded", "true");
      picker.reader.classList.add("is-hidden");
      picker.view.classList.remove("is-hidden");
      ui.activePane = pane;
      renderPaneNotePicker(pane);
      window.requestAnimationFrame(() => {
        if (sequence === picker.sequence && isPaneNotePickerOpen(pane) && isCurrent()) picker.search.focus({ preventScroll: true });
      });
      return true;
    }

    function resetPaneNotePicker(pane) {
      const picker = pickers[pane];
      ++picker.sequence;
      ui.notePickers[pane].open = false;
      setPickerBusy(pane, false);
      picker.view.classList.add("is-hidden");
      picker.reader.classList.remove("is-hidden");
      picker.trigger.setAttribute("aria-expanded", "false");
    }

    function cancelPaneNotePicker(pane, { restoreFocus = true, resumeAutoSave = true } = {}) {
      if (!isPaneNotePickerOpen(pane)) return false;
      if (!sessionFor(pane)) {
        if (pane === "secondary") void api.closeDualPane();
        return true;
      }
      const picker = pickers[pane];
      ui.notePickers[pane].scrollTop = picker.list.scrollTop;
      resetPaneNotePicker(pane);
      const sequence = picker.sequence;
      const session = sessionFor(pane);
      window.requestAnimationFrame(() => {
        if (sequence !== picker.sequence || session !== sessionFor(pane) || !isPaneActive(pane)) return;
        picker.scrollPositions.forEach(({ element, top, left }) => { element.scrollTop = top; element.scrollLeft = left; });
        if (restoreFocus) {
          const control = picker.reader.querySelector('[aria-invalid="true"]') || picker.trigger;
          (control.disabled ? picker.surface : control).focus({ preventScroll: true });
        }
      });
      if (resumeAutoSave && picker.resumeAutoSave) {
        if (pane === "primary") api.scheduleNoteAutoSave();
        else api.scheduleSecondaryNoteAutoSave();
      }
      return true;
    }

    async function selectPaneNote(pane, noteId, mode = "preview") {
      if (!isPaneNotePickerOpen(pane) || pickers[pane].busy) return false;
      const picker = pickers[pane];
      const session = sessionFor(pane);
      if (session?.noteId === noteId) return cancelPaneNotePicker(pane);
      const availableNote = () => library.notes.find((note) => note.id === noteId && !api.isDeletedNote(note) &&
        note.id !== (pane === "primary" && ui.dualPaneOpen ? sessionFor("secondary")?.noteId : pane === "secondary" ? ui.editingNoteId : ""));
      if (!availableNote()) return false;
      const sequence = ++picker.sequence;
      const isCurrent = () => sequence === picker.sequence && isPaneNotePickerOpen(pane) && session === sessionFor(pane);
      ui.notePickers[pane].scrollTop = picker.list.scrollTop;
      setPickerBusy(pane, true);
      try {
        const saved = pane === "primary" ? await api.preparePrimaryNoteSwitch() : await api.prepareSecondaryNoteSwitch();
        if (!isCurrent()) return false;
        if (!saved) {
          cancelPaneNotePicker(pane, { resumeAutoSave: false });
          return false;
        }
        const note = availableNote();
        if (!note) { renderPaneNotePicker(pane); return false; }
        resetPaneNotePicker(pane);
        ui.activePane = pane;
        if (pane === "primary") {
          api.openNoteEditor(note, { preserveDetail: true, initialMode: mode, focusTitle: false });
          elements.primarySwitchNote.focus({ preventScroll: true });
        } else api.openSecondaryNote(note, mode);
        // An open picker in the other pane must exclude the newly selected note.
        const other = pane === "primary" ? "secondary" : "primary";
        if (isPaneNotePickerOpen(other)) renderPaneNotePicker(other);
        return true;
      } catch (error) {
        if (isCurrent()) {
          cancelPaneNotePicker(pane, { resumeAutoSave: false });
          api.showError(error, "We could not switch notes. Your draft was kept.");
        }
        return false;
      } finally {
        if (isCurrent()) setPickerBusy(pane, false);
      }
    }

    function bindPaneNotePickers() {
      Object.entries(pickers).forEach(([pane, picker]) => {
        const state = ui.notePickers[pane];
        const renderFromStart = () => { state.scrollTop = 0; picker.list.scrollTop = 0; renderPaneNotePicker(pane); };
        picker.trigger.addEventListener("click", () => showPaneNotePicker(pane));
        picker.back.addEventListener("click", () => cancelPaneNotePicker(pane));
        picker.search.addEventListener("input", () => { state.query = picker.search.value; renderFromStart(); });
        picker.clear.addEventListener("click", () => { state.query = ""; renderFromStart(); picker.search.focus(); });
        picker.sort.addEventListener("change", () => { state.sort = picker.sort.value; renderFromStart(); });
        picker.focus.addEventListener("click", () => setPaneNotePickerLayout(pane, "focus"));
        picker.comfortable.addEventListener("click", () => setPaneNotePickerLayout(pane, "comfortable"));
        picker.list.addEventListener("scroll", () => { if (state.open) state.scrollTop = picker.list.scrollTop; });
      });
      elements.primaryPickerLibrary.addEventListener("click", () => api.requestNoteEditorClose());
    }

    Object.assign(api, {
      isPaneNotePickerOpen, activePaneNotePicker, deferPaneNoteAutoSave, showPaneNotePicker, cancelPaneNotePicker, resetPaneNotePicker,
      renderPaneNotePicker, setPaneNotePickerLayout, syncPaneNotePickerLayout, selectPaneNote, bindPaneNotePickers,
    });
  });
})();
