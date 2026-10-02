globalThis[Symbol.for("nook.app.modules")].register("data-import", (app) => {
  "use strict";

  const { api, storage, elements, library, ui } = app;
  const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
  const MAX_MARKDOWN_BYTES = 200000;
  const MAX_MARKDOWN_BATCH_BYTES = 10 * 1024 * 1024;
  let pendingImport = null;
  let previewSequence = 0;
  let busy = false;

  function setImportBusy(value) {
    busy = value;
    elements.importDialog.setAttribute("aria-busy", String(value));
    [elements.importMode, elements.importConflicts, elements.importMarkdownType, elements.confirmImport,
      ...elements.importDialog.querySelectorAll("[data-close-workflow]")].forEach((button) => { button.disabled = value; });
  }

  function showImportRows(rows) {
    const labels = { add: "Add", copy: "Import a copy · keep local", skip: "Skip · keep local", identical: "Already present · skip" };
    const fragment = document.createDocumentFragment();
    rows.slice(0, 100).forEach((row) => fragment.append(api.workflowRow(row.title, labels[row.status] || "Add as a new note", row.content ?? null)));
    if (rows.length > 100) fragment.append(api.createElement("p", { className: "field-help", text: `Showing 100 of ${rows.length} notes. The totals above cover the full import.` }));
    elements.importPreviewList.replaceChildren(fragment);
  }

  async function updateImportPreview() {
    const pending = pendingImport;
    if (!pending || busy) return;
    const sequence = ++previewSequence;
    elements.confirmImport.disabled = true;
    if (pending.kind === "markdown") {
      showImportRows(pending.notes);
      elements.importResultSummary.textContent = `${pending.notes.length} notes will be added. Existing notes are kept; Markdown is stored as written.`;
      elements.confirmImport.textContent = "Import Markdown";
      elements.confirmImport.disabled = false;
      return;
    }
    const replace = elements.importMode.value === "replace";
    elements.importConflictField.classList.toggle("is-hidden", replace);
    if (replace) {
      elements.importResultSummary.textContent = "The current notes, types, tags, Trash, and history will be replaced. Download a backup first.";
      elements.confirmImport.textContent = "Replace library…";
      elements.importPreviewList.replaceChildren();
      elements.confirmImport.disabled = false;
      return;
    }
    try {
      const preview = await storage.inspectBackupMerge(pending.value, { conflictPolicy: elements.importConflicts.value });
      if (pendingImport !== pending || sequence !== previewSequence) return;
      pending.preview = preview;
      pending.conflictPolicy = elements.importConflicts.value;
      const { added, copied, skipped, identical } = preview.counts;
      elements.importResultSummary.textContent = `${added} new · ${copied} conflicting copies · ${skipped} conflicts skipped · ${identical} already present. Existing notes are kept.`;
      elements.confirmImport.textContent = "Add to library";
      showImportRows(preview.rows);
      elements.confirmImport.disabled = false;
    } catch (error) {
      if (sequence !== previewSequence) return;
      elements.importResultSummary.textContent = error.message || "This import could not be inspected.";
      pending.preview = null;
    }
  }

  async function inspectSelectedBackup() {
    const file = elements.importInput.files?.[0];
    if (!file || busy || elements.importDialog.open) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Choose a backup smaller than 50 MB.");
      const value = JSON.parse(await file.text());
      const inspection = storage.inspectBackup(value);
      pendingImport = { kind: "backup", value, preview: null };
      elements.importSummary.textContent = `${file.name} · ${inspection.counts.notes} notes · ${inspection.counts.types} types · ${inspection.counts.tags} tags · ${inspection.counts.noteVersions} saved versions. Choose how to import.`;
      elements.importMode.value = "merge";
      elements.importConflicts.value = "copy";
      elements.importBackupOptions.classList.remove("is-hidden");
      elements.importMarkdownOptions.classList.add("is-hidden");
      api.openWorkflowDialog(elements.importDialog);
      await updateImportPreview();
    } finally { elements.importInput.value = ""; }
  }

  async function inspectSelectedMarkdown() {
    const files = [...(elements.markdownImportInput.files || [])];
    if (!files.length || busy || elements.importDialog.open) return;
    try {
      if (files.length > 100 || files.reduce((total, file) => total + file.size, 0) > MAX_MARKDOWN_BATCH_BYTES) throw new Error("Import up to 100 Markdown files and 10 MB per batch.");
      if (files.some((file) => file.size > MAX_MARKDOWN_BYTES)) throw new Error("Each Markdown file must be 200 KB or smaller, and at most 50,000 characters.");
      const sources = [];
      for (const file of files) sources.push({ name: file.name, content: await file.text() });
      const notes = storage.inspectMarkdownFiles(sources);
      pendingImport = { kind: "markdown", sources, notes };
      elements.importSummary.textContent = `${files.length} Markdown files. File names become titles; the source content stays intact.`;
      elements.importBackupOptions.classList.add("is-hidden");
      elements.importMarkdownOptions.classList.remove("is-hidden");
      elements.importMarkdownType.replaceChildren(...library.types.map((type) => api.createElement("option", { value: type.id, text: type.name })));
      elements.importMarkdownType.value = storage.FALLBACK_TYPE_ID;
      api.openWorkflowDialog(elements.importDialog);
      await updateImportPreview();
    } finally { elements.markdownImportInput.value = ""; }
  }

  async function confirmImport() {
    if (!pendingImport || busy || elements.confirmImport.disabled) return;
    const pending = pendingImport;
    if (pending.kind === "backup" && elements.importMode.value === "replace") {
      if (api.hasUnsavedNoteChanges() || api.hasUnsavedSecondaryChanges?.()) throw new Error("Save or close unfinished editor drafts before replacing the library.");
      const confirmed = await api.requestConfirmation({ title: "Replace the entire library?",
        description: "This replaces every saved note, type, tag, Trash entry, and history version. Export your current library first. Recovery drafts stay in this browser.",
        confirmLabel: "Replace library", cancelLabel: "Keep library" });
      if (!confirmed) return;
      if (api.hasUnsavedNoteChanges() || api.hasUnsavedSecondaryChanges?.()) throw new Error("An editor changed while confirming. Save or close it before replacing the library.");
    }
    setImportBusy(true);
    try {
      let message;
      if (pending.kind === "markdown") {
        const notes = await storage.importMarkdownFiles(pending.sources, { typeId: elements.importMarkdownType.value });
        message = `Added ${notes.length} Markdown notes.`;
      } else if (elements.importMode.value === "replace") {
        await storage.importBackup(pending.value);
        api.resetRegularFilters();
        ui.trashOnly = false;
        ui.query = "";
        elements.search.value = "";
        api.persistFilters();
        message = "Library replaced from the selected backup.";
      } else {
        if (!pending.preview) throw new Error("Inspect the backup again before importing.");
        const counts = await storage.mergeBackup(pending.value, { conflictPolicy: pending.conflictPolicy, expectedMutationId: pending.preview.mutationId });
        message = `Added ${counts.added + counts.copied} notes. Kept all existing notes.`;
      }
      api.resetToFirstPage();
      await api.refreshLibrary({ broadcast: true });
      pendingImport = null;
      setImportBusy(false);
      api.closeWorkflowDialog(elements.importDialog);
      api.showToast(message);
    } catch (error) {
      setImportBusy(false);
      elements.importResultSummary.textContent = error.message || "Import failed. Your library was not changed.";
      elements.confirmImport.disabled = true;
      throw error;
    }
  }

  function bindDataImportEvents() {
    elements.markdownImportInput.addEventListener("change", () => void api.runWorkflow(inspectSelectedMarkdown));
    elements.importMode.addEventListener("change", () => void api.runWorkflow(updateImportPreview));
    elements.importConflicts.addEventListener("change", () => void api.runWorkflow(updateImportPreview));
    elements.confirmImport.addEventListener("click", () => void api.runWorkflow(confirmImport));
    elements.importDialog.addEventListener("close", () => { if (!busy) { pendingImport = null; previewSequence += 1; } });
  }

  Object.assign(api, { importLibrary: () => api.runWorkflow(inspectSelectedBackup), bindDataImportEvents });
});
