"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const sourcePath = path.join(__dirname, "..", "js", "markdown.js");
const sourceCode = fs.readFileSync(sourcePath, "utf8");

class NodeStub {
  constructor(tagName = "", text = "") {
    this.tagName = tagName.toUpperCase();
    this.nodeType = tagName ? 1 : 3;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.value = "";
    this._text = text;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; this._text = ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener() {}
  remove() {}
  closest() { return null; }
  matches() { return false; }
  get lastElementChild() { return [...this.children].reverse().find((child) => child?.nodeType === 1) || null; }
  get textContent() { return this._text + this.children.map((child) => child?.textContent || "").join(""); }
  set textContent(value) { this._text = String(value); this.children = []; }
}

function loadMarkdown() {
  const document = {
    body: new NodeStub("body"),
    activeElement: null,
    createDocumentFragment: () => new NodeStub("fragment"),
    createElement: (tagName) => new NodeStub(tagName),
    createElementNS: (_, tagName) => new NodeStub(tagName),
    createTextNode: (value) => new NodeStub("", String(value)),
  };
  const context = {
    clearTimeout,
    console,
    document,
    Map,
    navigator: {},
    performance,
    setTimeout,
    URL,
    window: { isSecureContext: false },
  };
  context.globalThis = context;
  vm.runInNewContext(sourceCode, context, { filename: sourcePath });
  return { api: context.NookMarkdown, document };
}

test("large unmatched link delimiters stay inert without blocking Markdown rendering", () => {
  const { api } = loadMarkdown();
  for (const source of ["[".repeat(40000), "[^".repeat(20000), "<".repeat(40000)]) {
    const container = new NodeStub("div");
    const startedAt = performance.now();
    api.renderInto(container, source);
    const duration = performance.now() - startedAt;
    assert.equal(container.textContent, source);
    assert.ok(duration < 750, `unmatched delimiters blocked rendering for ${Math.round(duration)}ms`);
  }
});

test("plain-text previews keep link labels and handle unmatched delimiters in bounded time", () => {
  const { api } = loadMarkdown();
  assert.equal(
    api.toPlainText("![Diagram](local.png) [Guide](https://example.com) [Reference][docs] <https://example.com> <em>text</em>"),
    "Diagram Guide Reference https://example.com text",
  );
  const source = "[".repeat(40000);
  const startedAt = performance.now();
  assert.equal(api.toPlainText(source), source);
  const duration = performance.now() - startedAt;
  assert.ok(duration < 500, `plain-text conversion blocked for ${Math.round(duration)}ms`);
});

function findAll(node, tagName, found = []) {
  if (node?.tagName === tagName) found.push(node);
  for (const child of node?.children || []) findAll(child, tagName, found);
  return found;
}

test("a different list type at the same indent starts a sibling list", () => {
  const { api } = loadMarkdown();
  const container = new NodeStub("div");
  api.renderInto(container, "- a\n- b\n1. c\n2. d\n- e");
  const lists = container.children.filter((child) => child.tagName === "UL" || child.tagName === "OL");
  assert.deepEqual(lists.map((list) => list.tagName), ["UL", "OL", "UL"]);
  assert.equal(findAll(lists[0], "OL").length, 0);
  assert.equal(findAll(lists[0], "LI").length, 2);
  assert.equal(findAll(lists[1], "LI").length, 2);
});

test("indented markers of another type still nest inside the item", () => {
  const { api } = loadMarkdown();
  const container = new NodeStub("div");
  api.renderInto(container, "- a\n  1. b\n  2. c\n- d");
  const lists = container.children.filter((child) => child.tagName === "UL" || child.tagName === "OL");
  assert.deepEqual(lists.map((list) => list.tagName), ["UL"]);
  assert.equal(findAll(lists[0], "OL").length, 1);
  assert.equal(findAll(findAll(lists[0], "OL")[0], "LI").length, 2);
});

test("footnote back links stay inside the footnote's last paragraph", () => {
  const { api } = loadMarkdown();
  const container = new NodeStub("div");
  api.renderInto(container, "Text[^1] and more[^1].\n\n[^1]: The note body.");
  const section = findAll(container, "SECTION")[0];
  const item = findAll(section, "LI")[0];
  const paragraph = item.children.find((child) => child.tagName === "P");
  const backrefs = findAll(item, "A");
  assert.equal(backrefs.length, 2);
  backrefs.forEach((link) => assert.ok(paragraph.children.includes(link)));
});

function renderTableAlignments(api, delimiter) {
  const container = new NodeStub("div");
  api.renderInto(container, `| Left | Center | Right |\n${delimiter}\n| a | b | c |`);
  const table = findAll(container, "TABLE")[0];
  if (!table) return null;
  return findAll(table, "TH").map((cell) => cell.dataset.align);
}

test("table delimiter rows accept one or more dashes per cell and keep alignment", () => {
  const { api } = loadMarkdown();
  assert.deepEqual(renderTableAlignments(api, "| :-- | :-: | --: |"), ["left", "center", "right"]);
  assert.deepEqual(renderTableAlignments(api, "| - | - | - |"), ["left", "left", "left"]);
  assert.deepEqual(renderTableAlignments(api, "|:-|:-:|-:|"), ["left", "center", "right"]);
  assert.deepEqual(renderTableAlignments(api, ":-- | :-: | --:"), ["left", "center", "right"]);
  assert.deepEqual(renderTableAlignments(api, "| :---: | ---- | ---: |"), ["center", "left", "right"]);
});

test("malformed table delimiter rows stay paragraph text", () => {
  const { api } = loadMarkdown();
  for (const delimiter of [
    "| :-- |  | --: |",
    "| : | :: | : |",
    "| -a- | - | - |",
    "| - - | - | - |",
    "| -- : | - | - |",
    "| -=- | - | - |",
    "---",
  ]) {
    assert.equal(renderTableAlignments(api, delimiter), null, delimiter);
  }
});

test("table source mapping covers rows of a short-delimiter table", () => {
  const { api } = loadMarkdown();
  const container = new NodeStub("div");
  api.renderInto(container, "| A | B |\n| :- | -: |\n| 1 | 2 |\n| 3 | 4 |", "", { sourceMap: true });
  const rows = findAll(container, "TR").map((row) => [row.dataset.markdownSourceStart, row.dataset.markdownSourceEnd]);
  assert.deepEqual(rows, [["0", "2"], ["2", "3"], ["3", "4"]]);
});

test("plain-text previews drop short table delimiter rows", () => {
  const { api } = loadMarkdown();
  for (const delimiter of ["| :-- | :-: | --: |", "| - | - | - |", ":-- | :-: | --:", "| - | - | -"]) {
    const text = api.toPlainText(`| A | B | C |\n${delimiter}\n| 1 | 2 | 3 |`, { preserveBlocks: true });
    assert.doesNotMatch(text, /-/, delimiter);
    assert.match(text, /A\s+B\s+C/);
    assert.match(text, /1\s+2\s+3/);
  }
  assert.match(api.toPlainText("Range 1 - 2 | 3"), /Range 1 - 2/);
});
