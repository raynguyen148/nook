globalThis[Symbol.for("nook.app.modules")].register("recovery", (app) => {
  "use strict";

  const { api, storage, elements, library, shared } = app;
  const store = api.createDraftRecoveryStore();
  const PRESENCE_PREFIX = "nook:editor-presence:v1:";
  let presenceTimer = 0;

  function localSessions() {
    return [shared.primaryEditorSession, shared.secondaryEditorSession].filter(Boolean);
  }

  function publishPresence() {
    try {
      localStorage.setItem(`${PRESENCE_PREFIX}${store.tabId}`, JSON.stringify({
        at: Date.now(), sessions: localSessions().map((session) => session.sessionId),
      }));
    } catch { /* Recovery remains usable when localStorage is unavailable. */ }
  }

  function draftIsOpen(record) {
    if (record.tabId === store.tabId) return localSessions().some((session) => session.sessionId === record.sessionId);
    try {
      const presence = JSON.parse(localStorage.getItem(`${PRESENCE_PREFIX}${record.tabId}`));
      return presence && Date.now() - presence.at < 60000 && presence.sessions?.includes(record.sessionId);
    } catch { return false; }
  }

  function recoveryRecords() {
    const records = store.enumerate();
    const sources = records.flatMap((record) => record.sources);
    const sourceRevisions = new Set(sources.map((source) => `${source.key}\n${source.savedAt}`));
    return records.filter((record) => !sourceRevisions.has(`${record.key}\n${record.savedAt}`)).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  function freshRecord(record) {
    const current = store.read(record);
    if (!current || current.savedAt !== record.savedAt) throw new Error("This draft changed since you opened recovery. Review the latest draft and try again.");
    return current;
  }

  function normalizedRecoveredDraft(record) {
    return { ...record.draft, id: "", title: record.draft.title.trim() || "Recovered draft",
      typeId: library.types.some((type) => type.id === record.draft.typeId) ? record.draft.typeId : storage.FALLBACK_TYPE_ID,
      tagIds: record.draft.tagIds.filter((id) => api.tagFor(id)) };
  }

  function removeRecoveredRecord(record) {
    if (draftIsOpen(record)) return;
    if (!store.removeUnchanged(record)) throw new Error("This draft changed elsewhere and was kept. Review it again.");
    record.sources.forEach((source) => store.removeUnchanged(source));
  }

  async function saveRecoveredAsNew(record) {
    record = freshRecord(record);
    await storage.saveNote(normalizedRecoveredDraft(record));
    if (!draftIsOpen(record) && store.removeUnchanged(record)) record.sources.forEach((source) => store.removeUnchanged(source));
    await api.refreshLibrary({ broadcast: true });
    renderDraftRecovery();
    api.showToast("Draft saved as a new note. The original note was kept.");
  }

  async function recoverRecord(record) {
    record = freshRecord(record);
    if (draftIsOpen(record)) throw new Error("This draft is still open in a tab. Save a copy or export it instead.");
    api.closeWorkflowDialog(elements.recoveryDialog);
    const version = await api.guardNoteNavigation();
    if (!version) return;
    record = freshRecord(record);
    await api.refreshLibrary();
    if (!api.isCurrentWorkflowNavigation(version)) return;
    api.restoreStoredNoteDraft(record);
  }

  async function discardRecord(record) {
    record = freshRecord(record);
    if (draftIsOpen(record)) return;
    const confirmed = await api.requestConfirmation({ title: "Discard this draft?",
      description: `Permanently discard the unfinished draft “${record.draft.title.trim() || "Untitled note"}”. Saved notes and other drafts stay in place.`,
      confirmLabel: "Discard draft", cancelLabel: "Keep draft" });
    if (!confirmed) return;
    removeRecoveredRecord(record);
    renderDraftRecovery();
    api.showToast("Unfinished draft discarded.");
  }

  function renderDraftRecovery() {
    const records = recoveryRecords();
    const fragment = document.createDocumentFragment();
    records.forEach((record) => {
      const live = draftIsOpen(record);
      const note = library.notes.find((note) => note.id === record.draft.id);
      const removed = record.draft.id && (!note || note.deletedAt);
      const missingOrganization = !library.types.some((type) => type.id === record.draft.typeId) || record.draft.tagIds.some((id) => !api.tagFor(id));
      const state = live ? "Still open in a Nook tab" : removed ? "Original note removed · recover as a new note" : "Unfinished draft";
      const row = api.workflowRow(record.draft.title.trim() || "Untitled note",
        `${record.pane === "secondary" ? "Side note" : "Note"} · ${api.formatFullDate(record.savedAt)} · ${state}${record.conflicted ? " · Conflict kept" : ""}${missingOrganization ? " · Missing type becomes General; missing tags are omitted" : ""}`,
        record.draft.content);
      const actions = api.createElement("div", { className: "workflow-row__actions" });
      actions.append(
        api.workflowButton("Recover draft", () => recoverRecord(record), { primary: true, disabled: live }),
        api.workflowButton("Save as new", () => saveRecoveredAsNew(record)),
        api.workflowButton("Export .md", () => { const current = freshRecord(record); api.downloadNoteFile(current.draft); }),
        api.workflowButton("Discard", () => discardRecord(record), { danger: true, disabled: live }),
      );
      row.append(actions);
      fragment.append(row);
    });
    elements.recoveryList.replaceChildren(fragment);
    elements.recoveryStatus.textContent = records.length ? `${records.length} local ${records.length === 1 ? "draft" : "drafts"}. Recovery keeps the source until save or explicit discard.` : "No unfinished drafts found.";
    const count = records.filter((record) => !draftIsOpen(record)).length;
    elements.recoveryIndicator.classList.toggle("is-hidden", !count);
    elements.recoveryIndicator.textContent = `Recover drafts (${count})`;
  }

  function openDraftRecovery() {
    api.syncEditorDraftRecovery();
    publishPresence();
    renderDraftRecovery();
    api.openWorkflowDialog(elements.recoveryDialog);
  }

  function syncDraftRecoveryIndicator() {
    const count = recoveryRecords().filter((record) => !draftIsOpen(record)).length;
    elements.recoveryIndicator.classList.toggle("is-hidden", !count);
    elements.recoveryIndicator.textContent = `Recover drafts (${count})`;
  }

  function offerStoredNoteDraftRecovery() {
    const legacy = api.getStoredNoteDraft();
    if (legacy) {
      const written = store.write({ pane: "primary", sessionId: "legacy-recovery" }, legacy.draft, { savedAt: legacy.savedAt, baseRevision: 0 });
      if (written) api.clearStoredNoteDraft();
    }
    publishPresence();
    renderDraftRecovery();
    if (recoveryRecords().some((record) => !draftIsOpen(record))) {
      api.showToast("Unfinished drafts are available in Draft Recovery.", "success", { label: "Review drafts", onClick: openDraftRecovery });
    }
  }

  function bindRecoveryEvents() {
    publishPresence();
    presenceTimer = window.setInterval(publishPresence, 15000);
    window.addEventListener("pagehide", () => {
      window.clearInterval(presenceTimer);
      try { localStorage.removeItem(`${PRESENCE_PREFIX}${store.tabId}`); } catch { /* Optional presence only. */ }
    });
    window.addEventListener("pageshow", () => {
      window.clearInterval(presenceTimer);
      publishPresence();
      presenceTimer = window.setInterval(publishPresence, 15000);
    });
    window.addEventListener("storage", (event) => {
      if (event.key?.startsWith(store.prefix) || event.key?.startsWith(PRESENCE_PREFIX) || event.key === null) {
        if (elements.recoveryDialog.open) renderDraftRecovery();
        else {
          const count = recoveryRecords().filter((record) => !draftIsOpen(record)).length;
          elements.recoveryIndicator.classList.toggle("is-hidden", !count);
          elements.recoveryIndicator.textContent = `Recover drafts (${count})`;
        }
      }
    });
  }

  Object.assign(api, { openDraftRecovery, renderDraftRecovery, offerStoredNoteDraftRecovery, bindRecoveryEvents,
    publishDraftPresence: publishPresence, syncDraftRecoveryIndicator });
});
