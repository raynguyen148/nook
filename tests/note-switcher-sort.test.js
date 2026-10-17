"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(new URL("../js/app/note-switcher.js", `file://${__filename}`), "utf8");

function fixture() {
  const element = () => ({ classList: { toggle() {} }, setAttribute() {}, replaceChildren() {}, append() {} });
  const elements = new Proxy({}, { get(target, key) { return target[key] ||= element(); } });
  const rendered = [];
  const state = () => ({ query: "", sort: "title-asc", viewMode: "comfortable", scrollTop: 0 });
  const ui = { editingNoteId: "active-primary", dualPaneOpen: true, notePickers: { primary: state(), secondary: state() } };
  const library = { notes: [], searchIndex: new Map() };
  const api = {
    isDeletedNote: note => Boolean(note.deletedAt), syncPrimarySortPicker() {}, syncSecondarySortPicker() {},
    observeNoteCardTagRows() {}, createElement: element,
    createNoteCard(note) { rendered.push(note.title); return element(); },
  };
  const context = {
    Intl, document: { createDocumentFragment: element },
    [Symbol.for("nook.app.modules")]: { register(name, install) {
      install({ api, elements, ui, library, shared: { secondaryEditorSession: { noteId: "active-secondary" } } });
    } },
  };
  vm.runInNewContext(source, context);
  const note = (title, isPinned, created, updated, extra = {}) => ({
    id: title, title, isPinned, content: "match", createdAt: `2026-01-0${created}T00:00:00Z`,
    updatedAt: `2026-01-0${updated}T00:00:00Z`, ...extra,
  });
  library.notes = [note("Yankee", false, 2, 3), note("Zulu", true, 1, 4),
    note("Bravo", undefined, 4, 1), note("Alpha", true, 3, 2),
    note("active-primary", true, 1, 1), note("active-secondary", true, 1, 1),
    note("trashed", true, 1, 1, { deletedAt: "2026-01-05T00:00:00Z" })];
  return { ui, library, render(pane) { rendered.length = 0; api.renderPaneNotePicker(pane); return [...rendered]; } };
}

for (const pane of ["primary", "secondary"]) {
  test(`${pane} picker keeps pinned notes first for all sort modes, sorting within each group`, () => {
    const f = fixture();
    const ascending = ["Alpha", "Zulu", "Bravo", "Yankee"];
    const descending = ["Zulu", "Alpha", "Yankee", "Bravo"];
    const originalIds = f.library.notes.map(note => note.id);
    for (const [sort, expected] of Object.entries({
      "title-asc": ascending, "title-desc": descending, "created-asc": descending,
      "created-desc": ascending, "updated-asc": ascending, "updated-desc": descending,
    })) {
      f.ui.notePickers[pane].sort = sort;
      assert.deepEqual(f.render(pane), expected, sort);
    }
    assert.deepEqual(f.library.notes.map(note => note.id), originalIds);
  });

  test(`${pane} picker preserves search, pin changes, exclusions and the result limit`, () => {
    const f = fixture();
    f.ui.notePickers[pane].query = "Zulu";
    assert.deepEqual(f.render(pane), ["Zulu"]);
    f.ui.notePickers[pane].query = "match";
    f.library.notes.find(note => note.title === "Yankee").isPinned = true;
    assert.deepEqual(f.render(pane), ["Alpha", "Yankee", "Zulu", "Bravo"]);
    const template = f.library.notes[0];
    f.library.notes = Array.from({ length: 60 }, (_, i) => ({ ...template, id: `note-${i}`, title: `Note ${i}`, isPinned: i === 59 }));
    const result = f.render(pane);
    assert.equal(result.length, 50);
    assert.equal(result[0], "Note 59");
  });
}
