(() => {
  "use strict";

  const DB_NAME = "personal-notes";
  const DRAFT_PREFIX = "nook:editor-draft:v2:";
  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const RUN_ID = `harness-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const statusElement = document.querySelector("#status");
  const resultsElement = document.querySelector("#results");
  const originElement = document.querySelector("#origin");
  const rerunButton = document.querySelector("#rerun");

  let caseNumber = 0;
  let failedCases = 0;

  originElement.textContent = location.origin || location.href;
  rerunButton.addEventListener("click", () => location.reload());

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function appendResult(name, passed, error = null) {
    const item = document.createElement("li");
    item.className = `case ${passed ? "pass" : "fail"}`;
    item.dataset.status = passed ? "pass" : "fail";
    item.textContent = `${passed ? "PASS" : "FAIL"} ${name}`;
    if (error) {
      const details = document.createElement("pre");
      details.textContent = error.stack || String(error);
      item.append(details);
    }
    resultsElement.append(item);
  }

  async function runCase(name, callback) {
    caseNumber += 1;
    try {
      await callback();
      appendResult(`${caseNumber}. ${name}`, true);
    } catch (error) {
      failedCases += 1;
      appendResult(`${caseNumber}. ${name}`, false, error);
    }
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function deleteHarnessDatabase() {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.deleteDatabase(DB_NAME);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error || new Error("Could not reset harness database."));
      request.onblocked = () => reject(new Error("Harness database reset was blocked; close other harness tabs."));
    });
  }

  function removeHarnessRecoveryRecords() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}.`));
      document.head.append(script);
    });
  }

  function installEditorSessionModule() {
    let installer = null;
    const registry = Object.freeze({
      register(name, moduleInstaller) {
        if (name !== "editor-session") throw new Error(`Unexpected module registration: ${name}`);
        if (installer) throw new Error("EditorSession module registered more than once.");
        installer = moduleInstaller;
      },
    });
    globalThis[APP_MODULES_KEY] = registry;
    return {
      registry,
      install(app) {
        if (typeof installer !== "function") throw new Error("EditorSession module did not register.");
        installer(app);
      },
    };
  }

  function draftFromNote(note, content) {
    return {
      id: note.id,
      title: note.title,
      typeId: note.typeId,
      tagIds: [...note.tagIds],
      content,
    };
  }

  function seedInput(label, content = "seed") {
    return {
      title: `EditorSession harness ${label}`,
      typeId: "type-general",
      tagIds: [],
      content,
    };
  }

  async function seedNote(storage, label) {
    return storage.saveNote(seedInput(label));
  }

  function createDeferredStorage(storage, { fail = null } = {}) {
    let pending = null;
    const wrapper = {
      saveNote(input) {
        return new Promise((resolve, reject) => {
          pending = { input: { ...input, tagIds: [...input.tagIds] }, resolve, reject };
        });
      },
      release() {
        if (!pending) throw new Error("No delayed save is waiting.");
        const request = pending;
        pending = null;
        if (fail) {
          request.reject(fail);
          return;
        }
        storage.saveNote(request.input).then(request.resolve, request.reject);
      },
      get pendingInput() {
        return pending?.input || null;
      },
    };
    return wrapper;
  }

  function createLoggedStorage(storage, calls) {
    return {
      saveNote(input) {
        calls.push({ ...input, tagIds: [...input.tagIds] });
        return storage.saveNote(input);
      },
    };
  }

  async function runHarness() {
    statusElement.textContent = "Resetting this origin and loading storage/session modules…";
    statusElement.dataset.status = "running";
    resultsElement.replaceChildren();
    caseNumber = 0;
    failedCases = 0;

    await deleteHarnessDatabase();
    removeHarnessRecoveryRecords();
    await loadScript("../../js/storage.js");
    const module = installEditorSessionModule();
    await loadScript("../../js/app/editor-session.js");
    const app = { api: Object.create(null) };
    module.install(app);
    const storage = globalThis.PersonalNotesStorage;
    assert(storage && typeof storage.initialize === "function", "PersonalNotesStorage did not load.");
    assert(typeof app.api.createEditorSession === "function", "EditorSession API did not install.");
    assert(typeof app.api.createDraftRecoveryStore === "function", "Draft recovery API did not install.");
    await storage.initialize();

    await runCase("IndexedDB CAS conflict keeps local draft and Keep mine retries latest revision", async () => {
      const base = await seedNote(storage, "CAS");
      const calls = [];
      const loggedStorage = createLoggedStorage(storage, calls);
      const sessionA = app.api.createEditorSession({
        storage: loggedStorage,
        pane: "primary",
        sessionId: `${RUN_ID}-cas-a`,
        committed: base,
        currentDraft: draftFromNote(base, "local A"),
        baseRevision: base.revision,
      });
      const sessionB = app.api.createEditorSession({
        storage: loggedStorage,
        pane: "secondary",
        sessionId: `${RUN_ID}-cas-b`,
        committed: base,
        currentDraft: draftFromNote(base, "local B"),
        baseRevision: base.revision,
      });

      const saveB = await sessionB.save();
      assert(saveB.status === "saved", "session B did not save");
      const conflict = await sessionA.save();
      assert(conflict.status === "conflict", "session A did not receive NOTE_CONFLICT");
      assert(sessionA.phase === "conflict", "session A did not enter conflict phase");
      assert(sessionA.currentDraft.content === "local A", "local draft was discarded");
      assert(sessionA.conflict.latest.content === "local B", "latest stored draft was not retained");
      assert(sessionA.baseRevision === saveB.savedNote.revision, "latest revision was not adopted");

      const keepMine = await sessionA.retryKeepMine();
      assert(keepMine.status === "saved", "Keep mine retry did not save");
      const retryInput = calls[calls.length - 1];
      assert(retryInput.expectedRevision === saveB.savedNote.revision, "retry did not use latest CAS revision");
      assert((await storage.getNote(base.id)).content === "local A", "Keep mine content was not committed");
    });

    await runCase("slow IndexedDB save captures old draft while later typing remains dirty", async () => {
      const base = await seedNote(storage, "slow");
      const slowStorage = createDeferredStorage(storage);
      const session = app.api.createEditorSession({
        storage: slowStorage,
        pane: "primary",
        sessionId: `${RUN_ID}-slow`,
        committed: base,
        currentDraft: draftFromNote(base, "captured draft"),
        baseRevision: base.revision,
      });
      const save = session.save();
      await tick();
      assert(slowStorage.pendingInput?.content === "captured draft", "save did not capture the original draft");
      session.updateDraft(draftFromNote(base, "typed after capture"));
      slowStorage.release();
      const result = await save;
      assert(result.status === "saved", "slow save did not complete");
      assert(result.currentMatchesCapture === false, "save falsely reported current draft as captured");
      assert(session.phase === "dirty", "typing during save was lost");
      assert(session.currentDraft.content === "typed after capture", "later typing was overwritten");
      assert((await storage.getNote(base.id)).content === "captured draft", "captured draft was not written to IndexedDB");
    });

    await runCase("disposed save completion cannot mutate the replacement session", async () => {
      const base = await seedNote(storage, "dispose");
      const slowStorage = createDeferredStorage(storage);
      const oldSession = app.api.createEditorSession({
        storage: slowStorage,
        pane: "primary",
        sessionId: `${RUN_ID}-disposed-old`,
        committed: base,
        currentDraft: draftFromNote(base, "old session"),
        baseRevision: base.revision,
      });
      const save = oldSession.save();
      await tick();
      oldSession.dispose();
      const replacement = app.api.createEditorSession({
        storage,
        pane: "primary",
        sessionId: `${RUN_ID}-disposed-new`,
        committed: base,
        currentDraft: draftFromNote(base, base.content),
        baseRevision: base.revision,
      });
      slowStorage.release();
      const result = await save;
      assert(result.status === "stale" && result.ignored === true, "disposed completion was not ignored");
      assert(oldSession.phase === "disposed", "old session was not disposed");
      assert(replacement.phase === "saved", "replacement session was mutated by old completion");
      assert(replacement.currentDraft.content === base.content, "replacement draft changed unexpectedly");
    });

    await runCase("failed save keeps draft and per-session recovery record", async () => {
      const base = await seedNote(storage, "failure");
      const identity = { pane: "primary", sessionId: `${RUN_ID}-failure` };
      const recovery = app.api.createDraftRecoveryStore({
        storage: localStorage,
        tabId: `${RUN_ID}-tab-failure`,
      });
      const failingStorage = createDeferredStorage(storage, { fail: new Error("synthetic offline failure") });
      const session = app.api.createEditorSession({
        storage: failingStorage,
        pane: identity.pane,
        sessionId: identity.sessionId,
        committed: base,
        currentDraft: draftFromNote(base, "draft retained after failure"),
        baseRevision: base.revision,
        recoveryStore: recovery,
      });
      const result = session.save();
      await tick();
      failingStorage.release();
      const saveResult = await result;
      assert(saveResult.status === "error", "failed save did not report error");
      assert(session.currentDraft.content === "draft retained after failure", "failed save discarded draft");
      assert(session.isDirty(), "failed save incorrectly cleared dirty state");
      const recovered = recovery.read(identity);
      assert(recovered?.draft.content === "draft retained after failure", "recovery record did not retain draft");
      recovery.remove(identity);
    });

    await runCase("primary/secondary and two tab recovery records stay independent", async () => {
      const recoveryA = app.api.createDraftRecoveryStore({ storage: localStorage, tabId: `${RUN_ID}-tab-a` });
      const recoveryB = app.api.createDraftRecoveryStore({ storage: localStorage, tabId: `${RUN_ID}-tab-b` });
      const draft = { id: "synthetic-note", title: "Draft", typeId: "type-general", tagIds: [], content: "draft" };
      const primary = { pane: "primary", sessionId: `${RUN_ID}-primary` };
      const secondary = { pane: "secondary", sessionId: `${RUN_ID}-secondary` };
      assert(recoveryA.write(primary, draft, { baseRevision: 1 }), "primary recovery write failed");
      assert(recoveryA.write(secondary, draft, { baseRevision: 2 }), "secondary recovery write failed");
      assert(recoveryB.write(primary, draft, { baseRevision: 3 }), "second tab recovery write failed");
      const primaryKey = recoveryA.keyFor(primary);
      const secondaryKey = recoveryA.keyFor(secondary);
      const otherTabKey = recoveryB.keyFor(primary);
      assert(primaryKey !== secondaryKey && primaryKey !== otherTabKey, "recovery keys are not independent");
      assert(recoveryA.remove(primaryKey), "exact primary key removal failed");
      assert(localStorage.getItem(primaryKey) === null, "primary recovery key was not removed");
      assert(localStorage.getItem(secondaryKey) !== null, "secondary recovery key was removed accidentally");
      assert(localStorage.getItem(otherTabKey) !== null, "other tab recovery key was removed accidentally");
      recoveryA.remove(secondaryKey);
      recoveryB.remove(otherTabKey);
    });

    const passed = failedCases === 0;
    statusElement.textContent = passed
      ? `All ${caseNumber} EditorSession browser checks passed.`
      : `${failedCases} of ${caseNumber} EditorSession browser checks failed.`;
    statusElement.dataset.status = passed ? "pass" : "fail";
  }

  runHarness().catch((error) => {
    failedCases += 1;
    appendResult("bootstrap", false, error);
    statusElement.textContent = "Harness bootstrap failed.";
    statusElement.dataset.status = "fail";
  });
})();
