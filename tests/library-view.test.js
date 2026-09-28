"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/app/library.js"), "utf8");
const functionStart = source.indexOf("  function formatNotesRange(");
const functionEnd = source.indexOf("\n  function ", functionStart + 1);
assert.ok(functionStart >= 0 && functionEnd > functionStart);
const context = {
  pluralize: (count, label) => `${count} ${label}${count === 1 ? "" : "s"}`,
};
vm.runInNewContext(source.slice(functionStart, functionEnd), context);

test("note range copy distinguishes empty, filtered, and Trash states", () => {
  assert.equal(context.formatNotesRange({
    matchingCount: 0,
    start: 0,
    end: 0,
    activeCollectionCount: 0,
    trashOnly: false,
  }), "0 notes");
  assert.equal(context.formatNotesRange({
    matchingCount: 0,
    start: 0,
    end: 0,
    activeCollectionCount: 4,
    trashOnly: false,
  }), "No matching notes");
  assert.equal(context.formatNotesRange({
    matchingCount: 0,
    start: 0,
    end: 0,
    activeCollectionCount: 0,
    trashOnly: true,
  }), "Trash is empty");
  assert.equal(context.formatNotesRange({
    matchingCount: 2,
    start: 0,
    end: 2,
    activeCollectionCount: 2,
    trashOnly: false,
  }), "Showing 1–2 of 2 notes");
});
