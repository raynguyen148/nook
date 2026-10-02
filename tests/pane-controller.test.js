"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const path = require("node:path");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(pane, save, choices = []) {
  const installers = new Map();
  const api = { requestConflictResolution: async () => choices.shift() || "keep-editing" };
  const app = { api, storage: { saveNote: save } };
  const values = new Map();
  const memory = { get length() { return values.size; }, key: (index) => [...values.keys()][index],
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const context = { console, Symbol, localStorage: memory };
  context.globalThis = context;
  context[Symbol.for("nook.app.modules")] = { register: (name, install) => installers.set(name, install) };
  vm.createContext(context);
  for (const name of ["editor-session", "pane-controller"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/app", `${name}.js`), "utf8"), context);
    installers.get(name)(app);
  }
  const original = { id: "note-original", title: "Original", typeId: "type-general", tagIds: [], content: "base", revision: 1 };
  let draft = { ...original };
  let active = true;
  let published = null;
  const controller = api.createPaneController({ pane, readDraft: () => draft, isActive: () => active,
    invoker: () => null, setStatus() {}, onSession: (session) => { published = session; } });
  return { controller, original, api, memory, published: () => published,
    edit: (content) => { draft = { ...draft, content }; controller.sync(); },
    setDraft: (value) => { draft = value; }, deactivate: () => { active = false; } };
}

for (const pane of ["primary", "secondary"]) {
  test(`${pane}: a replaced pane ignores a late save and publishes the replacement session`, async () => {
    const pending = deferred();
    const f = fixture(pane, () => pending.promise);
    f.controller.open(f.original, f.original);
    f.edit("dirty");
    const saving = f.controller.save();
    f.controller.dispose();
    const next = { ...f.original, id: "next" };
    f.setDraft(next);
    const replacement = f.controller.open(next, next);
    pending.resolve({ ...f.original, content: "dirty", revision: 2 });
    assert.equal((await saving).status, "stale");
    assert.equal(f.controller.session, replacement);
    assert.equal(f.published(), replacement);
  });

  test(`${pane}: concurrent requests share one save and retain typing during the save`, async () => {
    const pending = deferred();
    let calls = 0;
    const f = fixture(pane, () => { calls++; return pending.promise; });
    f.controller.open(f.original, f.original);
    f.edit("captured");
    const first = f.controller.save();
    const second = f.controller.save();
    assert.equal(first, second);
    f.edit("typed later");
    pending.resolve({ ...f.original, content: "captured", revision: 2 });
    const result = await first;
    assert.equal(calls, 1);
    assert.equal(result.currentMatchesCapture, false);
    assert.equal(f.controller.hasUnsavedChanges(), true);
    assert.equal(f.controller.session.currentDraft.content, "typed later");
  });

  test(`${pane}: keeping a conflict never overwrites the newer note`, async () => {
    let calls = 0;
    const latest = { id: "note-original", title: "Original", typeId: "type-general", tagIds: [], content: "theirs", revision: 2 };
    const f = fixture(pane, () => { calls++; const error = new Error("Conflict"); error.code = "NOTE_CONFLICT"; error.latestNote = latest; throw error; });
    f.controller.open(f.original, f.original);
    f.edit("mine");
    assert.equal((await f.controller.save()).status, "conflict-kept");
    assert.equal(calls, 1);
    assert.equal(f.controller.session.currentDraft.content, "mine");
    assert.equal(f.controller.hasUnsavedChanges(), true);
  });

  test(`${pane}: recovered changed originals require an explicit Keep mine decision`, async () => {
    let calls = 0;
    const f = fixture(pane, (draft) => { calls++; return { ...draft, revision: 3 }; }, ["keep-editing", "keep-mine"]);
    const latest = { ...f.original, revision: 2, content: "theirs" };
    const draft = { ...f.original, content: "recovered" };
    f.setDraft(draft);
    f.controller.open(latest, draft, { recovery: { key: "", savedAt: "2026-10-02T00:00:00Z", draft,
      baseRevision: 1, committedSnapshot: f.original } });
    assert.equal((await f.controller.save()).status, "conflict-kept");
    assert.equal(calls, 0);
    assert.equal((await f.controller.save()).status, "saved");
    assert.equal(calls, 1);
  });
}
