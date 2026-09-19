globalThis[Symbol.for("nook.app.modules")].register("history", (app) => {
  "use strict";

  // Version-history preview and restore. IndexedDB ownership remains in the
  // storage module; this controller only renders committed snapshots.
  const { api, storage, elements, library, ui } = app;
  let versions = [];
  let previewOnly = false;

  const createElement = (...args) => api.createElement(...args);
  const formatFullDate = (...args) => api.formatFullDate(...args);
  const refreshLibrary = (...args) => api.refreshLibrary(...args);
  const requestConfirmation = (...args) => api.requestConfirmation(...args);
  const showError = (...args) => api.showError(...args);
  const showToast = (...args) => api.showToast(...args);
  const syncToastHost = (...args) => api.syncToastHost(...args);

  function selectedVersion() {
    return versions.find((version) => version.id === ui.historySelectedVersionId) || null;
  }

  function renderHistoryPreview(version) {
    ui.historySelectedVersionId = version?.id || "";
    elements.historyRestore.disabled = previewOnly || !version;
    elements.historyList.querySelectorAll("[role='option']").forEach((option) => {
      const selected = option.dataset.versionId === ui.historySelectedVersionId;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    if (!version) {
      elements.historyPreviewTitle.textContent = "No earlier versions";
      elements.historyPreviewMeta.textContent = "A version is created only when saved content changes.";
      globalThis.NookMarkdown.renderInto(elements.historyPreviewContent, "", "Nothing to preview yet.", {
        idPrefix: "history-empty",
      });
      return;
    }
    elements.historyPreviewTitle.textContent = version.title || "Untitled note";
    elements.historyPreviewMeta.textContent = `Revision ${version.revision} · saved ${formatFullDate(version.archivedAt || version.updatedAt)}`;
    globalThis.NookMarkdown.renderInto(
      elements.historyPreviewContent,
      version.content || "",
      "No content in this version.",
      { idPrefix: `history-${String(version.id).replace(/[^a-zA-Z0-9_-]+/g, "-")}` },
    );
  }

  function renderHistoryList() {
    elements.historyList.replaceChildren();
    if (!versions.length) {
      elements.historyList.append(createElement("p", {
        className: "history-list__empty dialog-description",
        text: "No earlier saved versions yet.",
      }));
      renderHistoryPreview(null);
      return;
    }
    const fragment = document.createDocumentFragment();
    versions.forEach((version) => {
      const option = createElement("button", {
        className: "history-list__option",
        type: "button",
        attributes: {
          role: "option",
          "aria-selected": "false",
          "data-version-id": version.id,
        },
      });
      option.append(
        createElement("span", { className: "history-list__title", text: version.title || "Untitled note" }),
        createElement("span", {
          className: "history-list__meta",
          text: `Revision ${version.revision} · ${formatFullDate(version.archivedAt || version.updatedAt)}`,
        }),
      );
      option.addEventListener("click", () => renderHistoryPreview(version));
      fragment.append(option);
    });
    elements.historyList.append(fragment);
    renderHistoryPreview(versions[0]);
  }

  async function openNoteHistory(noteId, invoker = null) {
    const note = library.notes.find((item) => item.id === noteId);
    if (!note || typeof storage.listNoteVersions !== "function") return;
    ui.historyInvoker = invoker || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    previewOnly = false;
    ui.historyNoteId = note.id;
    ui.historySelectedVersionId = "";
    elements.historyPreviewTitle.textContent = "Loading versions…";
    elements.historyPreviewMeta.textContent = "Reading committed history from this browser.";
    elements.historyRestore.disabled = true;
    elements.historyList.replaceChildren();
    elements.historyDialog.showModal();
    syncToastHost();
    try {
      versions = await storage.listNoteVersions(note.id);
      if (!elements.historyDialog.open || ui.historyNoteId !== note.id) return;
      renderHistoryList();
      window.requestAnimationFrame(() => {
        const first = elements.historyList.querySelector("[role='option']");
        (first || elements.closeHistoryDialog).focus();
      });
    } catch (error) {
      versions = [];
      renderHistoryPreview(null);
      showError(error, "We could not load this note's history.");
    }
  }

  function openConflictLatestPreview(note, invoker = null) {
    if (!note) return;
    previewOnly = true;
    versions = [{
      ...note,
      id: `latest-${note.id || "note"}-${note.revision || 0}`,
      archivedAt: note.updatedAt,
    }];
    ui.historyInvoker = invoker || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    ui.historyNoteId = note.id || "";
    ui.historySelectedVersionId = versions[0].id;
    elements.historyDialog.querySelector("h2").textContent = "Newer saved version";
    elements.historyRestore.classList.add("is-hidden");
    elements.historyList.replaceChildren();
    renderHistoryPreview(versions[0]);
    elements.historyDialog.showModal();
    syncToastHost();
    window.requestAnimationFrame(() => elements.closeHistoryDialog.focus());
  }

  function closeNoteHistory() {
    if (elements.historyDialog.open) elements.historyDialog.close();
  }

  function handleHistoryListKeydown(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = [...elements.historyList.querySelectorAll("[role='option']")];
    if (!options.length) return;
    event.preventDefault();
    const current = Math.max(0, options.indexOf(document.activeElement));
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown"
          ? (current + 1) % options.length
          : (current - 1 + options.length) % options.length;
    options[next].focus({ preventScroll: true });
    options[next].click();
  }

  function finishNoteHistoryClose() {
    const invoker = ui.historyInvoker;
    versions = [];
    previewOnly = false;
    ui.historyInvoker = null;
    ui.historyNoteId = "";
    ui.historySelectedVersionId = "";
    elements.historyList.replaceChildren();
    elements.historyPreviewContent.replaceChildren();
    elements.historyDialog.querySelector("h2").textContent = "Version history";
    elements.historyRestore.classList.remove("is-hidden");
    if (invoker instanceof HTMLElement && invoker.isConnected && !invoker.disabled) {
      window.requestAnimationFrame(() => invoker.focus({ preventScroll: true }));
    }
  }

  async function restoreSelectedNoteVersion() {
    const version = selectedVersion();
    const current = library.notes.find((note) => note.id === ui.historyNoteId);
    if (!version || !current) return;
    const primaryDirty = current.id === ui.editingNoteId && api.hasUnsavedNoteChanges?.();
    const secondaryDirty = current.id === ui.secondaryNoteId && api.hasUnsavedSecondaryChanges?.();
    if (primaryDirty || secondaryDirty) {
      showToast("Save or close the unfinished draft before restoring history.", "error");
      return;
    }
    const confirmed = await requestConfirmation({
      title: "Restore this version?",
      description: "The current note will be kept in version history before this earlier version becomes current.",
      confirmLabel: "Restore version",
      cancelLabel: "Keep current note",
      tone: "primary",
      initialFocus: "cancel",
    });
    if (!confirmed || !elements.historyDialog.open) return;
    elements.historyRestore.disabled = true;
    elements.historyRestore.textContent = "Restoring…";
    try {
      await storage.restoreNoteVersion(current.id, version.revision, { expectedRevision: current.revision });
      await refreshLibrary({ broadcast: true });
      closeNoteHistory();
      showToast("Earlier version restored. The previous current version is still in history.");
    } catch (error) {
      showError(error, "We could not restore this version.");
    } finally {
      elements.historyRestore.textContent = "Restore this version";
      if (elements.historyDialog.open) elements.historyRestore.disabled = !selectedVersion();
    }
  }

  Object.assign(api, {
    openNoteHistory,
    openConflictLatestPreview,
    closeNoteHistory,
    handleHistoryListKeydown,
    finishNoteHistoryClose,
    restoreSelectedNoteVersion,
  });
});
