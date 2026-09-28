"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../js/app/note-actions.js");
const source = fs.readFileSync(sourcePath, "utf8");

function fixture({ confirm = true, dirty = false } = {}) {
  const calls = [];
  let toastOptions = null;
  let installer;
  const context = { Symbol };
  context.globalThis = context;
  context[Symbol.for("nook.app.modules")] = {
    register(name, install) {
      assert.equal(name, "note-actions");
      installer = install;
    },
  };
  vm.runInNewContext(source, context, { filename: sourcePath });

  const storage = {
    async deleteNote(id) { calls.push(["delete", id]); },
    async restoreNote(id) { calls.push(["restore", id]); },
    async setNotePinned(id, pinned) { calls.push(["pin", id, pinned]); },
    async permanentlyDeleteNote(id) { calls.push(["permanent", id]); },
    async emptyTrash() { calls.push(["empty"]); return 1; },
  };
  const ui = { noteSaveInFlight: false, editingNoteId: "", dualPaneOpen: false };
  const api = {
    pluralize: (count, label) => `${count} ${label}${count === 1 ? "" : "s"}`,
    async requestConfirmation(options) { calls.push(["confirm", options.title]); return confirm; },
    showError(error, message) { calls.push(["error", message, error]); },
    showToast(message, tone, options) { calls.push(["toast", message, tone]); toastOptions = options; },
    async refreshLibrary(options) { calls.push(["refresh", options.broadcast]); },
    isDeletedNote: (note) => Boolean(note.deletedAt),
    hasUnsavedNoteChanges: () => dirty,
    closeNoteEditor(options) { calls.push(["close-editor", options.discardStoredDraft]); },
    async closeDualPane() { ui.dualPaneOpen = false; return true; },
  };
  const app = {
    api,
    storage,
    elements: { secondaryPickerView: { classList: { contains: () => true } } },
    library: { notes: [{ id: "note-1", deletedAt: "2026-09-28" }] },
    ui,
  };
  installer(app);
  return { api, calls, ui, getToastOptions: () => toastOptions };
}

test("a clean note moves directly to Trash and exposes Undo", async () => {
  const f = fixture();
  const note = { id: "note-1", title: "Example", isPinned: false };
  assert.equal(await f.api.moveNoteToTrash(note), true);
  assert.equal(f.calls.some(([name]) => name === "confirm"), false);
  assert.deepEqual(f.calls.slice(0, 3), [
    ["delete", "note-1"],
    ["refresh", true],
    ["toast", "Note moved to Trash.", "success"],
  ]);
  await f.getToastOptions().onClick();
  assert.deepEqual(f.calls.slice(-2), [["restore", "note-1"], ["refresh", true]]);
});

test("moving the open note confirms only when unsaved edits would be lost", async () => {
  const cancelled = fixture({ confirm: false, dirty: true });
  cancelled.ui.editingNoteId = "note-1";
  assert.equal(await cancelled.api.moveNoteToTrash({ id: "note-1", title: "Draft" }), false);
  assert.deepEqual(cancelled.calls, [["confirm", "Move note and discard unsaved edits?"]]);

  const accepted = fixture({ confirm: true, dirty: true });
  accepted.ui.editingNoteId = "note-1";
  assert.equal(await accepted.api.moveNoteToTrash({ id: "note-1", title: "Draft" }), true);
  assert.ok(accepted.calls.some(([name]) => name === "close-editor"));
});

test("irreversible Trash actions still require confirmation", async () => {
  const f = fixture();
  assert.equal(await f.api.permanentlyDeleteNoteWithConfirmation({ id: "note-1", title: "Old" }), true);
  assert.equal(await f.api.emptyTrashWithConfirmation(), true);
  assert.deepEqual(f.calls.filter(([name]) => name === "confirm").map(([, title]) => title), [
    "Delete note permanently?",
    "Empty Trash?",
  ]);
  assert.ok(f.calls.some(([name]) => name === "permanent"));
  assert.ok(f.calls.some(([name]) => name === "empty"));
});
