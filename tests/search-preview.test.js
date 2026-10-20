"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "js", "app", "search.js");
const sourceCode = fs.readFileSync(sourcePath, "utf8");

function realMarkdown() {
  const context = {};
  context.globalThis = context;
  const markdownPath = path.join(__dirname, "..", "js", "markdown.js");
  vm.runInNewContext(fs.readFileSync(markdownPath, "utf8"), context, { filename: markdownPath });
  return context.NookMarkdown;
}

function fixture(query = "", markdown = null) {
  let installer;
  let conversions = 0;
  const registry = { register(name, install) { assert.equal(name, "search"); installer = install; } };
  const context = { Date, Intl, Map, Set, Symbol };
  context.globalThis = context;
  context[Symbol.for("nook.app.modules")] = registry;
  context.NookMarkdown = markdown || {
    toPlainText(value) {
      conversions += 1;
      return String(value).replace(/\*\*/g, "");
    },
  };
  vm.runInNewContext(sourceCode, context, { filename: sourcePath });
  const app = {
    api: {},
    elements: {},
    library: { notes: [], types: [], tags: [], searchIndex: new Map(), previewIndex: new Map() },
    storage: { FALLBACK_TYPE_ID: "general" },
    ui: { query, tagIds: new Set(), selectedNoteTagIds: new Set() },
  };
  installer(app);
  return { api: app.api, library: app.library, conversions: () => conversions };
}

test("note-card previews are bounded and reused until note content changes", () => {
  const f = fixture();
  const note = { id: "note-1", content: "word ".repeat(500) };
  const first = f.api.previewForSearch(note);
  const second = f.api.previewForSearch(note);
  assert.equal(first, second);
  assert.ok(first.length <= 1201);
  assert.match(first, /…$/);
  assert.equal(f.conversions(), 1);

  note.content = "changed content";
  assert.equal(f.api.previewForSearch(note), "changed content");
  assert.equal(f.conversions(), 2);
});

test("search previews retain a late matching context without putting the full note in the card", () => {
  const f = fixture("needle");
  const note = { id: "note-1", content: `${"early text ".repeat(500)}**Needle** near the end` };
  const preview = f.api.previewForSearch(note);
  assert.match(preview, /Needle/);
  assert.ok(preview.length < 220);
  assert.match(preview, /^…/);
});

test("removed and changed notes are pruned from the preview cache", () => {
  const f = fixture();
  f.library.previewIndex.set("keep", { content: "a", preview: "a" });
  f.library.previewIndex.set("remove", { content: "b", preview: "b" });
  f.library.previewIndex.set("changed", { content: "old", preview: "old" });
  f.api.syncNotePreviewIndex([{ id: "keep", content: "a" }, { id: "changed", content: "new" }]);
  assert.deepEqual([...f.library.previewIndex.keys()], ["keep"]);
});

test("note-card previews keep block boundaries and skip an opening heading that repeats the title", () => {
  const f = fixture("", realMarkdown());
  const note = {
    id: "note-1",
    title: "Code review checklist for risky changes",
    content: "# Code review checklist\n\nA useful review starts\nwith behavior.\n\n## Before approving\n\n- [ ] One purpose\n- [ ] Tests cover it\n",
  };
  assert.equal(
    f.api.previewForSearch(note),
    "A useful review starts with behavior. Before approving · One purpose · Tests cover it",
  );

  note.title = "Unrelated title";
  assert.match(f.api.previewForSearch(note), /^Code review checklist · A useful review/);
});
