"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Exercise the production functions without bootstrapping storage or UI.
const sourceCode = fs.readFileSync(new URL("../js/app/editor.js", `file://${__filename}`), "utf8");
function fixture() {
  const source = { scrollTop: 400, clientWidth: 400, clientHeight: 200, scrollHeight: 1200 };
  const preview = { scrollTop: 0, clientWidth: 400, clientHeight: 200, scrollHeight: 1000 };
  const frames = new Map();
  let frameId = 0;
  let builds = 0;
  const context = {
    elements: { noteContent: source, noteContentPreview: preview },
    ui: { noteEditorMode: "split", noteScrollMapFrame: 0 },
    window: {
      requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame(id) { frames.delete(id); },
    },
    NookMarkdown: { renderInto() {} },
  };
  vm.createContext(context);
  for (const name of ["clampScrollPosition", "getNoteEditorMaximumScrollTop", "getSplitScrollSession", "isNoteEditorScrollMapCurrent", "interpolateNoteEditorScrollMap", "lockNoteEditorScrollLeader", "syncNoteEditorScroll", "scheduleNoteEditorScrollMap", "renderNoteEditorPreview"]) {
    const start = sourceCode.indexOf(`  function ${name}(`);
    const end = sourceCode.indexOf("\n  function ", start + 1);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(sourceCode.slice(start, end), context);
  }
  const map = {
    sourceMaximum: 1000, previewMaximum: 800,
    sourceClientWidth: 400, sourceClientHeight: 200,
    previewClientWidth: 400, previewClientHeight: 200,
    sourceToPreview: [{ from: 0, to: 0 }, { from: 300, to: 200 }, { from: 500, to: 200 }, { from: 1000, to: 800 }],
    previewToSource: [{ from: 0, to: 0 }, { from: 200, to: 500 }, { from: 800, to: 1000 }],
  };
  context.buildSplitScrollMap = (session) => { builds++; session.setScrollMap(map); return map; };
  return { context, source, preview, map, frames, builds: () => builds, flush() {
    const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback());
  } };
}

test("invalid map defers measurement and coalesces scroll bursts using latest position", () => {
  const f = fixture();
  f.context.syncNoteEditorScroll(f.source, f.preview);
  f.source.scrollTop = 750;
  f.context.syncNoteEditorScroll(f.source, f.preview);
  assert.equal(f.builds(), 0);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.builds(), 1);
  assert.equal(f.preview.scrollTop, 500);
});

test("delayed programmatic echo cannot reverse a plateau mapping", () => {
  const f = fixture();
  f.context.ui.noteScrollMap = f.map;
  f.context.syncNoteEditorScroll(f.source, f.preview);
  f.flush();
  f.context.syncNoteEditorScroll(f.preview, f.source);
  assert.equal(f.source.scrollTop, 400);
  f.preview.scrollTop = 500;
  f.context.syncNoteEditorScroll(f.preview, f.source);
  assert.equal(f.source.scrollTop, 750);
  assert.equal(f.builds(), 0);
});

test("already aligned preview echo cannot reverse a plateau mapping", () => {
  const f = fixture();
  f.context.ui.noteScrollMap = f.map;
  f.preview.scrollTop = 200;
  f.context.syncNoteEditorScroll(f.source, f.preview);
  f.context.syncNoteEditorScroll(f.preview, f.source);
  assert.equal(f.source.scrollTop, 400);
});

test("preview redraw scroll cannot take control away from the typing textarea", () => {
  const f = fixture();
  f.context.lockNoteEditorScrollLeader(f.source);
  f.context.syncNoteEditorScroll(f.preview, f.source);
  assert.equal(f.frames.size, 0);
  assert.equal(f.source.scrollTop, 400);

  f.context.scheduleNoteEditorScrollMap(f.source);
  f.flush();
  assert.equal(f.preview.scrollTop, 200);
  assert.equal(f.context.ui.noteScrollLeader, null);
});

test("preview render measures once in a scheduled pass", () => {
  const f = fixture();
  f.context.renderNoteEditorPreview();
  assert.equal(f.builds(), 0);
  f.flush();
  assert.equal(f.builds(), 1);
});

test("queued measurement does not run after leaving split mode", () => {
  const f = fixture();
  f.context.scheduleNoteEditorScrollMap(f.source);
  f.context.ui.noteEditorMode = "edit";
  f.flush();
  assert.equal(f.builds(), 0);
});
