globalThis[Symbol.for("nook.app.modules")].register("productivity", (app) => {
  "use strict";

  const { api, storage, elements, library, ui, shared } = app;
  const create = (...args) => api.createElement(...args);
  const dialogInvokers = new WeakMap();
  let commandItems = [];
  let activeCommand = 0;
  let navigationBusy = false;
  let navigationVersion = 0;
  // Reuse the actual app icons; the remaining symbols follow their SVG stroke.
  const commandIconSources = {
    "new-note": elements.newNote.querySelector("svg"),
    template: elements.copyNoteContent.querySelector("svg"),
    recovery: elements.noteHistory.querySelector("svg"),
    export: elements.bulkExport.querySelector("svg"),
    settings: elements.organize.querySelector("svg"),
    save: elements.quickSaveNote.querySelector("svg"),
  };
  const commandIconPaths = {
    note: ["M14 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9Z", "M14 3.5v6h6M8 13h8M8 16.5h6"],
    daily: ["M8 3v4M16 3v4M4 10h16", "M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM8 14h3M8 17h6"],
    markdown: ["M14 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9Z", "M14 3.5v6h6M12 12v6m-3-3 3 3 3-3"],
    import: ["M12 16V4m-4.5 4.5L12 4l4.5 4.5M4.5 16v4h15v-4"],
    select: ["M9 4H5a1 1 0 0 0-1 1v4m11-5h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m6 0h4a1 1 0 0 0 1-1v-4", "m8 12 3 3 5-6"],
  };
  const BUILT_IN_TEMPLATES = Object.freeze([
    { title: "Meeting · {{date}}", name: "Meeting", content: "## Agenda\n\n- \n\n## Notes\n\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] " },
    { title: "Learning · {{date}}", name: "Learning", content: "## Topic\n\n\n## Key ideas\n\n- \n\n## Examples\n\n\n## Questions\n\n- \n\n## Next steps\n\n- [ ] " },
    { title: "Daily · {{date}}", name: "Daily reflection", content: "## Focus\n\n- [ ] \n\n## Notes\n\n\n## Reflection\n\n" },
  ]);

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function expandTemplate(text, date = new Date()) {
    return text.replace(/\{\{(date|time)\}\}/g, (_, name) => name === "date"
      ? localDateKey(date)
      : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
  }

  async function runWorkflow(action) {
    try { return await action(); } catch (error) { api.showError(error); return false; }
  }

  function openWorkflowDialog(dialog) {
    if (dialog.open) return;
    dialogInvokers.set(dialog, document.activeElement);
    dialog.showModal();
    api.syncToastHost();
  }

  function closeWorkflowDialog(dialog) {
    if (dialog.open && dialog.getAttribute("aria-busy") !== "true") dialog.close();
  }

  async function guardNoteNavigation() {
    if (ui.noteSaveInFlight || navigationBusy) {
      api.showToast("Wait for the current save to finish.", "error");
      return false;
    }
    navigationBusy = true;
    const version = ++navigationVersion;
    try {
      if (api.isNoteEditorOpen()) {
        await api.requestNoteEditorClose();
        if (api.isNoteEditorOpen()) return false;
      }
      api.closeOrganize();
      return version;
    } finally { navigationBusy = false; }
  }

  function isCurrentWorkflowNavigation(version) {
    return version === navigationVersion && !api.isNoteEditorOpen() && !api.activeModalDialog();
  }

  async function navigateToNote(id, { mode = "preview" } = {}) {
    const version = await guardNoteNavigation();
    if (!version) return false;
    const note = await storage.getNote(id);
    if (!isCurrentWorkflowNavigation(version)) return false;
    if (!note || note.deletedAt) throw new Error("This note was removed. Refresh the results and try again.");
    api.openNoteEditor(note, { initialMode: mode, focusTitle: mode === "edit" });
    return true;
  }

  async function openDailyNote() {
    const version = await guardNoteNavigation();
    if (!version) return;
    const note = await storage.getOrCreateDailyNote(localDateKey());
    await api.refreshLibrary({ broadcast: true });
    if (!isCurrentWorkflowNavigation(version)) return;
    api.openNoteEditor(note, { initialMode: "edit", focusTitle: false });
    elements.noteContent.focus();
  }

  function workflowRow(title, meta = "", source = null) {
    const row = create("section", { className: "workflow-row" });
    row.append(create("h3", { className: "workflow-row__title", text: title }));
    if (meta) row.append(create("p", { className: "workflow-row__meta", text: meta }));
    if (source !== null) {
      const details = create("details");
      details.append(create("summary", { text: "Preview Markdown" }), create("pre", { className: "workflow-row__source", text: source }));
      row.append(details);
    }
    return row;
  }

  function workflowButton(label, action, { primary = false, danger = false, disabled = false } = {}) {
    const button = create("button", { type: "button", disabled, text: label,
      className: `button ${danger ? "button-danger" : primary ? "button-primary" : "button-secondary"}` });
    button.addEventListener("click", () => {
      button.disabled = true;
      void runWorkflow(action).finally(() => { button.disabled = disabled; });
    });
    return button;
  }

  function currentTemplateSource() {
    if (ui.dualPaneOpen && ui.activePane === "secondary" && shared.secondaryEditorSession) {
      return api.syncSecondaryEditorDraft()?.currentDraft || null;
    }
    if (!api.isNoteEditorOpen()) return null;
    return api.getNoteEditorDraftData();
  }

  async function useTemplate(template) {
    api.closeWorkflowDialog(elements.templateDialog);
    if (!await guardNoteNavigation()) return;
    api.openNoteEditor();
    elements.noteTitle.value = expandTemplate(template.title);
    elements.noteContent.value = expandTemplate(template.content);
    api.renderNoteTypeOptions(library.types.some((type) => type.id === template.typeId) ? template.typeId : storage.FALLBACK_TYPE_ID);
    const templateTag = library.tags.find((tag) => tag.normalizedName === "template");
    ui.selectedNoteTagIds = new Set((template.tagIds || []).filter((id) => id !== templateTag?.id && api.tagFor(id)));
    api.renderSelectedNoteTags();
    api.syncEditorDraftRecovery();
    api.scheduleNoteEditorHeight({ allowShrink: true });
    api.setNoteSaveStatus("dirty", "From template · save when ready");
    elements.noteContent.focus();
  }

  function openTemplates() {
    const templateTag = library.tags.find((tag) => tag.normalizedName === "template");
    const custom = library.notes.filter((note) => !note.deletedAt && note.tagIds.includes(templateTag?.id));
    const fragment = document.createDocumentFragment();
    [...BUILT_IN_TEMPLATES, ...custom].forEach((template) => {
      const row = workflowRow(template.name || template.title, template.id ? "Your template" : "Built-in template", template.content);
      const actions = create("div", { className: "workflow-row__actions" });
      actions.append(workflowButton("Use template", () => useTemplate(template), { primary: true }));
      if (template.id) actions.append(workflowButton("Edit template", async () => {
        closeWorkflowDialog(elements.templateDialog);
        await navigateToNote(template.id, { mode: "edit" });
      }));
      row.append(actions);
      fragment.append(row);
    });
    elements.templateList.replaceChildren(fragment);
    elements.saveTemplate.disabled = !currentTemplateSource();
    openWorkflowDialog(elements.templateDialog);
  }

  async function saveCurrentAsTemplate() {
    const draft = currentTemplateSource();
    if (!draft) return;
    const note = await storage.createTemplateNote(draft);
    await api.refreshLibrary({ broadcast: true });
    openTemplates();
    api.showToast(`Template “${note.title}” saved.`);
  }

  async function newTemplate() {
    closeWorkflowDialog(elements.templateDialog);
    const version = await guardNoteNavigation();
    if (!version) return;
    const tag = await storage.addTag({ name: "template" }, { reuseExisting: true });
    await api.refreshLibrary({ broadcast: true });
    if (!isCurrentWorkflowNavigation(version)) return;
    api.openNoteEditor();
    ui.selectedNoteTagIds = new Set([tag.id]);
    api.renderSelectedNoteTags();
    api.syncEditorDraftRecovery();
    api.showToast("Write a template, then save. Use {{date}} and {{time}} as placeholders.");
  }

  function commandActions() {
    const sideActive = ui.dualPaneOpen && ui.activePane === "secondary" && shared.secondaryEditorSession;
    const actions = [
      { title: "New note", hint: "Start writing", icon: "new-note", action: async () => { if (await guardNoteNavigation()) api.openNoteEditor(); } },
      { title: "Open today's Daily note", hint: localDateKey(), icon: "daily", action: openDailyNote },
      { title: "Templates", hint: "Start from a reusable note", icon: "template", action: openTemplates },
      { title: "Draft Recovery", hint: "Recover unfinished notes from all tabs", icon: "recovery", action: () => api.openDraftRecovery() },
      { title: "Import Markdown files", hint: "Add .md files to this library", icon: "markdown", action: () => elements.markdownImportInput.click() },
      { title: "Import or merge backup", hint: "Inspect a local JSON backup", icon: "import", action: () => elements.importInput.click() },
      { title: "Export library backup", hint: "Download notes and history as JSON", icon: "export", action: () => api.exportLibrary() },
      { title: "Settings", hint: "Types, tags, display, and local data", icon: "settings", action: () => api.openOrganize() },
    ];
    if (api.isNoteEditorOpen()) {
      actions.unshift({ title: "Save current note", hint: sideActive ? "Save the active Side note" : "Keep the editor open", icon: "save", action: () => sideActive ? api.saveSecondaryNote() : api.saveNote({ preventDefault() {} }, { closeAfterSave: false }) });
      actions.push({ title: "Save current note as template", hint: "Create a reusable copy", icon: "template", action: async () => { await saveCurrentAsTemplate(); } });
    } else if (api.isBulkSelectionAvailable()) {
      actions.push({ title: "Select multiple notes", hint: "Export, move to Trash, or restore notes", icon: "select", action: () => api.startBulkSelection() });
    }
    return actions;
  }

  function createCommandIcon(name) {
    const source = commandIconSources[name];
    const icon = source ? source.cloneNode(true) : document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (!source) {
      Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7",
        "stroke-linecap": "round", "stroke-linejoin": "round" }).forEach(([key, value]) => icon.setAttribute(key, value));
      (commandIconPaths[name] || commandIconPaths.note).forEach((d) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        icon.append(path);
      });
    }
    icon.setAttribute("class", "command-result__icon");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.dataset.commandIcon = name;
    return icon;
  }

  function renderCommandResults() {
    const query = elements.commandSearch.value.trim().toLocaleLowerCase();
    const actions = commandActions().filter((item) => `${item.title} ${item.hint}`.toLocaleLowerCase().includes(query));
    const notes = library.notes.filter((note) => !note.deletedAt && (!query || (library.searchIndex.get(note.id) || note.title.toLocaleLowerCase()).includes(query)))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    commandItems = [...actions, ...notes.slice(0, 30).map((note) => ({ title: note.title, icon: "note",
      hint: `Note · ${api.typeFor(note.typeId)?.name || "General"}`, action: () => navigateToNote(note.id) }))];
    activeCommand = 0;
    const fragment = document.createDocumentFragment();
    function resultGroup(title, meta) {
      const group = create("div", { className: "command-group", attributes: { role: "group", "aria-label": title } });
      const heading = create("div", { className: "command-group__heading", attributes: { "aria-hidden": "true" } });
      heading.append(create("span", { text: title }), create("span", { className: "command-group__meta", text: meta }));
      group.append(heading);
      fragment.append(group);
      return group;
    }
    const actionGroup = actions.length ? resultGroup("Quick actions", `${actions.length} ${actions.length === 1 ? "action" : "actions"}`) : null;
    const noteGroup = notes.length ? resultGroup("Matching notes", query ? `${Math.min(notes.length, 30)} of ${notes.length}` : "Showing recent") : null;
    commandItems.forEach((item, index) => {
      const button = create("button", { type: "button", className: `command-result${index === 0 ? " is-active" : ""}`,
        attributes: { role: "option", "aria-selected": String(index === 0) }, dataset: { commandIndex: String(index) } });
      const copy = create("span", { className: "command-result__copy" });
      copy.append(create("span", { className: "command-result__title", text: item.title }),
        create("span", { className: "command-result__hint", text: item.hint }));
      button.title = item.title;
      button.append(createCommandIcon(item.icon), copy);
      button.addEventListener("click", () => void executeCommand(index));
      (index < actions.length ? actionGroup : noteGroup).append(button);
    });
    elements.commandResults.replaceChildren(fragment);
    const total = library.notes.filter((note) => !note.deletedAt).length;
    elements.commandNotesCount.textContent = `${total} ${total === 1 ? "note" : "notes"} total`;
    elements.commandResults.scrollTop = 0;
    elements.commandStatus.textContent = !commandItems.length ? "No matching notes or actions." : notes.length > 30 ? `${notes.length} matching notes. Showing the first 30; refine your search.` : "";
  }

  function openCommands() {
    if (api.activeModalDialog()) return;
    elements.commandSearch.value = "";
    renderCommandResults();
    openWorkflowDialog(elements.commandDialog);
    elements.commandSearch.focus();
  }

  async function executeCommand(index) {
    const item = commandItems[index];
    if (!item) return;
    closeWorkflowDialog(elements.commandDialog);
    await runWorkflow(item.action);
  }

  function handleCommandKeydown(event) {
    if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key) && commandItems.length) {
      event.preventDefault();
      activeCommand = (activeCommand + (event.key === "ArrowDown" ? 1 : -1) + commandItems.length) % commandItems.length;
      const buttons = [...elements.commandResults.querySelectorAll(".command-result")];
      buttons.forEach((button, index) => {
        button.classList.toggle("is-active", index === activeCommand);
        button.setAttribute("aria-selected", String(index === activeCommand));
      });
      buttons[activeCommand].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && event.target === elements.commandSearch) {
      event.preventDefault();
      if (!event.repeat) void executeCommand(activeCommand);
    }
  }

  function bindProductivityEvents() {
    window.matchMedia("(max-width: 820px)").addEventListener("change", () => {
      if (elements.commandDialog.open) renderCommandResults();
    });
    const dialogs = [elements.commandDialog, elements.templateDialog, elements.recoveryDialog, elements.importDialog];
    dialogs.forEach((dialog) => {
      dialog.addEventListener("cancel", (event) => {
        if (dialog.getAttribute("aria-busy") === "true") event.preventDefault();
      });
      dialog.addEventListener("close", () => {
        const invoker = dialogInvokers.get(dialog);
        if (!api.activeModalDialog() && invoker instanceof HTMLElement && invoker.isConnected && invoker.getClientRects().length) invoker.focus({ preventScroll: true });
        api.syncToastHost();
      });
    });
    document.querySelectorAll("[data-close-workflow]").forEach((button) => button.addEventListener("click", () => closeWorkflowDialog(elements[button.dataset.closeWorkflow])));
    const shortcut = api.usesMacKeyboardShortcuts() ? "⌘⇧P" : "Ctrl+Shift+P";
    document.querySelectorAll("[data-command-shortcut]").forEach((hint) => { hint.textContent = shortcut; });
    elements.commandShortcutHelp.title = `Open Quick actions: ${shortcut}`;
    document.querySelectorAll("[data-open-commands]").forEach((button) => {
      button.title = `Quick actions (${shortcut})`;
      button.setAttribute("aria-keyshortcuts", api.usesMacKeyboardShortcuts() ? "Meta+Shift+P" : "Control+Shift+P");
      button.addEventListener("click", openCommands);
    });
    document.querySelectorAll("[data-open-recovery]").forEach((button) => button.addEventListener("click", () => api.openDraftRecovery()));
    document.querySelectorAll("[data-import-markdown]").forEach((button) => button.addEventListener("click", () => elements.markdownImportInput.click()));
    elements.commandSearch.addEventListener("input", renderCommandResults);
    elements.commandDialog.addEventListener("keydown", handleCommandKeydown);
    document.addEventListener("keydown", (event) => {
      const modifier = api.usesMacKeyboardShortcuts() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (modifier && event.shiftKey && !event.altKey && event.key.toLowerCase() === "p" && !event.isComposing) {
        event.preventDefault();
        if (!event.repeat) {
          if (elements.commandDialog.open) closeWorkflowDialog(elements.commandDialog);
          else openCommands();
        }
      }
    });
    elements.newTemplate.addEventListener("click", () => void runWorkflow(newTemplate));
    elements.saveTemplate.addEventListener("click", () => {
      elements.saveTemplate.disabled = true;
      void runWorkflow(saveCurrentAsTemplate).finally(() => { elements.saveTemplate.disabled = !currentTemplateSource(); });
    });
  }

  Object.assign(api, { localDateKey, expandTemplate, runWorkflow, openWorkflowDialog, closeWorkflowDialog,
    guardNoteNavigation, isCurrentWorkflowNavigation, navigateToNote, workflowRow, workflowButton, openDailyNote, openTemplates, openCommands, bindProductivityEvents });
});
