"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "js", "app", "editor-session.js");
const source = fs.readFileSync(sourcePath, "utf8");

function loadApi(overrides = {}) {
  let installer;
  const registry = {
    register(name, install) {
      assert.equal(name, "editor-session");
      installer = install;
    },
  };
  const context = { console, Symbol, ...overrides };
  context.globalThis = context;
  context[Symbol.for("nook.app.modules")] = registry;
  vm.runInNewContext(source, context, { filename: sourcePath });
  assert.equal(typeof installer, "function");
  const app = { api: {} };
  installer(app);
  return app.api;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function note(content, revision = 1, overrides = {}) {
  return {
    id: "note-1",
    title: "Test note",
    typeId: "type-1",
    tagIds: ["tag-1"],
    content,
    revision,
    ...overrides,
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

test("default recovery stores share one stable tab identity", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();
  const { createDraftRecoveryStore } = loadApi({ sessionStorage, localStorage });

  const primary = createDraftRecoveryStore();
  const secondary = createDraftRecoveryStore();

  assert.equal(primary.tabId, secondary.tabId);
  assert.match(primary.tabId, /^tab-/);
  assert.equal(sessionStorage.getItem("nook:editor-tab:v1"), primary.tabId);
});

test("a slow save cannot mutate a disposed session or its replacement", async () => {
  const { createEditorSession } = loadApi();
  const pending = deferred();
  const storage = { saveNote: () => pending.promise };
  const original = note("before");
  const session = createEditorSession({
    storage,
    pane: "primary",
    sessionId: "primary-old",
    committed: original,
    currentDraft: note("local"),
    baseRevision: 1,
  });

  const save = session.save();
  await flush();
  session.dispose();
  const replacement = createEditorSession({
    storage,
    pane: "primary",
    sessionId: "primary-new",
    committed: original,
    currentDraft: original,
    baseRevision: 1,
  });

  pending.resolve(note("local", 2));
  const result = await save;

  assert.equal(result.status, "stale");
  assert.equal(session.status, "disposed");
  assert.equal(session.getState().saving, false);
  assert.equal(replacement.status, "saved");
  assert.equal(replacement.currentDraft.content, original.content);
});

test("typing during a save remains dirty after the captured draft commits", async () => {
  const { createEditorSession } = loadApi();
  const pending = deferred();
  const storage = { saveNote: () => pending.promise };
  const committed = note("before");
  const session = createEditorSession({
    storage,
    committed,
    currentDraft: note("first"),
    baseRevision: 1,
  });

  const save = session.save();
  await flush();
  session.updateDraft(note("typed while saving"));
  pending.resolve(note("first", 2));
  const result = await save;

  assert.equal(result.status, "saved");
  assert.equal(result.currentMatchesCapture, false);
  assert.equal(session.baseRevision, 2);
  assert.equal(session.phase, "dirty");
  assert.equal(session.currentDraft.content, "typed while saving");
  assert.equal(session.committedSnapshot.content, "first");
});

test("a new note adopts the durable id returned by storage", async () => {
  const { createEditorSession } = loadApi();
  const storage = {
    saveNote: async (input) => note(input.content, 1, {
      ...input,
      id: "created-note",
      createdAt: "2026-09-19T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
    }),
  };
  const draft = note("first save", 0, { id: "" });
  const session = createEditorSession({ storage, currentDraft: draft, baseRevision: 0 });

  const result = await session.save();

  assert.equal(result.status, "saved");
  assert.equal(result.savedNote.id, "created-note");
  assert.equal(result.savedNote.updatedAt, "2026-09-19T00:00:00.000Z");
  assert.equal(session.noteId, "created-note");
  assert.equal(session.currentDraft.id, "created-note");
  assert.equal(session.phase, "saved");
  assert.equal(session.isDirty(), false);
});

test("a failed save preserves the draft and exposes an error phase", async () => {
  const { createEditorSession } = loadApi();
  const failure = new Error("offline");
  const storage = { saveNote: async () => { throw failure; } };
  const session = createEditorSession({
    storage,
    committed: note("before"),
    currentDraft: note("unsaved"),
    baseRevision: 1,
  });

  const result = await session.save();

  assert.equal(result.status, "error");
  assert.equal(session.phase, "error");
  assert.equal(session.isDirty(), true);
  assert.equal(session.currentDraft.content, "unsaved");
  assert.equal(session.committedSnapshot.content, "before");
  assert.equal(session.getState().error.message, failure.message);
});

test("overlapping save intentions serialize the latest draft without a false Saved state", async () => {
  const { createEditorSession } = loadApi();
  const calls = [];
  const storage = {
    saveNote(input) {
      const request = deferred();
      calls.push({ input, ...request });
      return request.promise;
    },
  };
  const session = createEditorSession({
    storage,
    committed: note("before"),
    currentDraft: note("first"),
    baseRevision: 1,
  });

  const firstSave = session.save();
  await flush();
  session.updateDraft(note("second"));
  const secondSave = session.save();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(session.phase, "saving");

  calls[0].resolve(note("first", 2));
  const firstResult = await firstSave;
  await flush();
  assert.equal(firstResult.status, "saved");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input.content, "second");
  assert.equal(calls[1].input.expectedRevision, 2);
  assert.equal(session.phase, "saving");

  calls[1].resolve(note("second", 3));
  const secondResult = await secondSave;
  assert.equal(secondResult.status, "saved");
  assert.equal(session.phase, "saved");
  assert.equal(session.currentDraft.content, "second");
  assert.equal(session.baseRevision, 3);
});

test("a conflict keeps the local draft and Keep mine retries against the latest revision", async () => {
  const { createEditorSession } = loadApi();
  const calls = [];
  const storage = {
    saveNote(input) {
      const request = deferred();
      calls.push({ input, ...request });
      return request.promise;
    },
  };
  const session = createEditorSession({
    storage,
    committed: note("before", 6),
    currentDraft: note("mine", 6),
    baseRevision: 6,
  });

  const firstSave = session.save();
  await flush();
  const conflict = new Error("stale write");
  conflict.code = "NOTE_CONFLICT";
  conflict.latestNote = note("server", 7, { title: "Server version" });
  calls[0].reject(conflict);
  const conflictResult = await firstSave;

  assert.equal(conflictResult.status, "conflict");
  assert.equal(session.phase, "conflict");
  assert.equal(session.baseRevision, 7);
  assert.equal(session.currentDraft.content, "mine");
  assert.equal(session.conflict.latest.content, "server");

  const retry = session.retryKeepMine();
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input.content, "mine");
  assert.equal(calls[1].input.expectedRevision, 7);
  calls[1].resolve(note("mine", 8));
  const retryResult = await retry;

  assert.equal(retryResult.status, "saved");
  assert.equal(session.phase, "saved");
  assert.equal(session.baseRevision, 8);
  assert.equal(session.currentDraft.content, "mine");
  assert.equal(session.conflict, null);
});

test("an external refresh cannot turn the next save into a silent overwrite", async () => {
  const { createEditorSession } = loadApi();
  const calls = [];
  const storage = {
    async saveNote(input) {
      calls.push(input);
      return note(input.content, input.expectedRevision + 1);
    },
  };
  const session = createEditorSession({
    storage,
    committed: note("before", 2),
    currentDraft: note("local draft", 2),
    baseRevision: 2,
  });

  const external = session.applyExternalSnapshot(note("other tab", 3));
  const blockedSave = await session.save();

  assert.equal(external.conflict, true);
  assert.equal(blockedSave.status, "conflict");
  assert.equal(blockedSave.latest.content, "other tab");
  assert.equal(session.currentDraft.content, "local draft");
  assert.equal(calls.length, 0);

  const kept = await session.keepMine();
  assert.equal(kept.status, "saved");
  assert.equal(calls[0].expectedRevision, 3);
});

test("a deleted-note conflict keeps the draft and Save as new creates a new note", async () => {
  const { createEditorSession } = loadApi();
  const calls = [];
  const storage = {
    async saveNote(input) {
      calls.push(input);
      if (calls.length === 1) {
        const conflict = new Error("deleted elsewhere");
        conflict.code = "NOTE_CONFLICT";
        conflict.latestNote = null;
        throw conflict;
      }
      return note(input.content, 1, { ...input, id: "replacement-note" });
    },
  };
  const session = createEditorSession({
    storage,
    committed: note("before", 4),
    currentDraft: note("local draft", 4),
    baseRevision: 4,
  });

  const conflictResult = await session.save();

  assert.equal(conflictResult.status, "conflict");
  assert.equal(conflictResult.deleted, true);
  assert.equal(conflictResult.latestNote, null);
  assert.equal(session.currentDraft.content, "local draft");
  assert.equal(session.conflict.deleted, true);

  const replacement = await session.keepMine();

  assert.equal(replacement.status, "saved");
  assert.equal(calls[1].id, "");
  assert.equal("expectedRevision" in calls[1], false);
  assert.equal(replacement.savedNote.id, "replacement-note");
  assert.equal(session.noteId, "replacement-note");
  assert.equal(session.currentDraft.content, "local draft");
  assert.equal(session.phase, "saved");
});

test("draft recovery records are independent by tab, pane, and session", () => {
  const { createDraftRecoveryStore } = loadApi();
  const storage = new MemoryStorage();
  const primary = createDraftRecoveryStore({ storage, tabId: "tab-a", now: () => 1000 });
  const otherTab = createDraftRecoveryStore({ storage, tabId: "tab-b", now: () => 1000 });
  const draft = {
    id: "note-1",
    title: "Draft",
    typeId: "type-1",
    tagIds: ["tag-1"],
    content: "content",
  };

  assert.equal(primary.write({ pane: "primary", sessionId: "one" }, draft, { baseRevision: 4 }), true);
  assert.equal(primary.write({ pane: "secondary", sessionId: "two" }, draft, { baseRevision: 5 }), true);
  assert.equal(otherTab.write({ pane: "primary", sessionId: "one" }, draft, { baseRevision: 6 }), true);
  const primaryKey = primary.keyFor({ pane: "primary", sessionId: "one" });
  const secondaryKey = primary.keyFor({ pane: "secondary", sessionId: "two" });
  const otherTabKey = otherTab.keyFor({ pane: "primary", sessionId: "one" });

  assert.notEqual(primaryKey, secondaryKey);
  assert.notEqual(primaryKey, otherTabKey);
  assert.equal(primary.remove({ pane: "primary", sessionId: "one" }), true);
  assert.equal(storage.getItem(primaryKey), null);
  assert.notEqual(storage.getItem(secondaryKey), null);
  assert.notEqual(storage.getItem(otherTabKey), null);
  assert.equal(primary.enumerate().length, 2);
});

test("malformed and expired recovery records are ignored and pruned safely", () => {
  const { createDraftRecoveryStore } = loadApi();
  const storage = new MemoryStorage();
  let currentTime = 1000;
  const recovery = createDraftRecoveryStore({
    storage,
    tabId: "tab-a",
    now: () => currentTime,
    maxAgeMs: 100,
  });
  const draft = {
    id: "note-1",
    title: "Draft",
    typeId: "type-1",
    tagIds: [],
    content: "content",
  };
  const validKey = recovery.keyFor({ pane: "primary", sessionId: "valid" });
  const malformedKey = `${recovery.prefix}malformed`;
  const invalidKey = `${recovery.prefix}invalid`;
  storage.setItem(malformedKey, "not-json");
  storage.setItem(invalidKey, JSON.stringify({
    version: 2,
    tabId: "tab-a",
    pane: "primary",
    sessionId: "invalid",
    savedAt: "not-a-date",
    baseRevision: 0,
    draft,
  }));
  assert.equal(recovery.write({ pane: "primary", sessionId: "valid" }, draft), true);
  assert.equal(recovery.enumerate().length, 1);
  assert.notEqual(storage.getItem(validKey), null);
  assert.equal(storage.getItem(malformedKey), null);
  assert.equal(storage.getItem(invalidKey), null);

  currentTime = 5000;
  assert.equal(recovery.enumerate().length, 0);
  assert.equal(storage.getItem(validKey), null);
});
