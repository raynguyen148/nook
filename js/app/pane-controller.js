(() => {
  "use strict";
  /** @type {import('./contracts').ModuleRegistry} */
  const registry = Reflect.get(globalThis, Symbol.for("nook.app.modules"));
  registry.register("pane-controller", (app) => {
    /**
     * Shared lifecycle and save/conflict/recovery policy. Pane adapters own DOM
     * reading, status presentation, and the committed-note UI update.
     * @param {import('./contracts').PaneAdapter} adapter
     * @returns {import('./contracts').PaneController}
     */
    function createPaneController(adapter) {
      const { createEditorSession, createDraftRecoveryStore, requestConflictResolution } = app.api;
      const recoveryStore = createDraftRecoveryStore();
      /** @type {import('./contracts').EditorSession | null} */
      let current = null;
      /** @type {{ session: import('./contracts').EditorSession, promise: Promise<import('./contracts').SaveResult> } | null} */
      let saveInFlight = null;

      /** @param {import('./contracts').NoteDraft | null | undefined} left @param {import('./contracts').NoteDraft} right */
      function sameFields(left, right) {
        return left && left.title === right.title && left.content === right.content && left.typeId === right.typeId &&
          JSON.stringify([...left.tagIds].sort()) === JSON.stringify([...right.tagIds].sort());
      }

      /** @param {import('./contracts').EditorSession} session */
      function isCurrent(session) { return session === current && adapter.isActive(); }

      /** @type {import('./contracts').PaneController['open']} */
      function open(note, draft, { baseRevision = note?.revision || 0, recovery = null } = {}) {
        current?.dispose();
        current = createEditorSession({
          storage: app.storage, pane: adapter.pane, noteId: note?.id || draft.id,
          baseRevision, committed: note, currentDraft: draft, recoveryStore,
          recoverySources: recovery ? [...(recovery.sources || []), ...(recovery.key ? [{ key: recovery.key, savedAt: recovery.savedAt }] : [])] : [],
          initialConflict: recovery && note && (recovery.conflicted || !recovery.committedSnapshot ||
            recovery.baseRevision !== note.revision || !sameFields(recovery.committedSnapshot, note))
            ? { latest: note, expectedRevision: recovery.baseRevision } : null,
        });
        adapter.onSession(current);
        app.api.publishDraftPresence?.();
        return current;
      }

      function sync() { return current?.updateDraft(adapter.readDraft()).state || null; }

      /** @param {import('./contracts').EditorSession} session @returns {Promise<import('./contracts').SaveResult>} */
      async function performSave(session) {
        adapter.setStatus("saving");
        let result = await session.save();
        while (isCurrent(session) && result.status === "conflict") {
          adapter.setStatus("error", "Conflict · draft kept");
          const latest = result.latestNote || (result.deleted ? null : { ...result.latest, revision: result.latestRevision });
          const choice = await requestConflictResolution({ localDraft: session.currentDraft,
            latestNote: latest, deleted: result.deleted === true, invoker: adapter.invoker() });
          if (!isCurrent(session)) return { status: "stale" };
          if (choice !== "keep-mine") {
            session.keepEditing();
            if (choice === "view-latest" && latest) app.api.openConflictLatestPreview?.(latest, adapter.invoker());
            adapter.setStatus("dirty", "Conflict · draft kept");
            return { status: "conflict-kept" };
          }
          adapter.setStatus("saving");
          result = await session.keepMine();
        }
        return isCurrent(session) ? result : { status: "stale" };
      }

      /** @returns {Promise<import('./contracts').SaveResult>} */
      function save() {
        const session = current;
        if (!session || !isCurrent(session)) return Promise.resolve({ status: "stale" });
        if (saveInFlight?.session === session) return saveInFlight.promise;
        sync();
        const promise = performSave(session).finally(() => {
          if (saveInFlight?.session === session) saveInFlight = null;
        });
        saveInFlight = { session, promise };
        return promise;
      }

      function dispose({ discard = false } = {}) {
        current?.dispose();
        if (discard) current?.discardRecovery();
        current = null;
        adapter.onSession(null);
        app.api.publishDraftPresence?.();
      }

      return Object.freeze({ open, sync, save, dispose,
        hasUnsavedChanges() { sync(); return current?.hasUnsavedChanges() || false; },
        get session() { return current; },
      });
    }

    app.api.createPaneController = createPaneController;
  });
})();
