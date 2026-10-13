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
