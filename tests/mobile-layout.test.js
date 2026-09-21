"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/app/mobile.js"), "utf8");

class NodeStub extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = { toggle() {}, remove() {}, add() {}, contains() { return false; } };
    this.style = { values: new Map(), setProperty(k, v) { this.values.set(k, v); }, removeProperty(k) { this.values.delete(k); } };
    this.dataset = {};
    this.open = false;
  }
  get parentNode() { return this.parentElement; }
  get nextSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return this.parentElement.children[index + 1] || null;
  }
  append(node) {
    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    this.children.push(node);
    node.parentElement = this;
  }
  insertBefore(node, reference) {
    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node.parentElement = this;
  }
  before(node) { const parent = this.parentElement; parent.append(node); parent.children.splice(parent.children.indexOf(node), 1); parent.children.splice(parent.children.indexOf(this), 0, node); }
  after(node) { const parent = this.parentElement; parent.append(node); parent.children.splice(parent.children.indexOf(node), 1); parent.children.splice(parent.children.indexOf(this) + 1, 0, node); }
  replaceChildren() { this.children = []; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  setAttribute(k, v) { this.attributes.set(k, v); }
  getAttribute(k) { return this.attributes.get(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  toggleAttribute(k, present) { if (!present) this.attributes.delete(k); }
  close() { if (this.open) { this.open = false; this.dispatchEvent(new Event("close")); } }
  showModal() { this.open = true; }
  click() { this.dispatchEvent(new Event("click")); }
  focus() {}
}

function fixture() {
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, new NodeStub());
    return nodes.get(key);
  };
  const elements = {};
  for (const name of ["noteDialog", "noteForm", "sort", "regularFilterControls", "emptyTrash", "notesList", "historyDialog", "search", "themeToggle", "organizeDialog", "backupHealthMessage"]) elements[name] = node(name);
  elements.noteDialog.querySelector = node;
  elements.sort.closest = node;
  elements.search.closest = node;
  const moved = [elements.regularFilterControls, node(".sort-field"), elements.emptyTrash, node(".note-formatting-toolbar"), node(".dialog-footer__tools"), node(".search-field")];
  moved.forEach((el, index) => node(`original-${index}`).append(el));
  const originalParents = moved.map((el) => el.parentElement);
  const query = new EventTarget();
  query.matches = false;
  const listeners = new Map();
  const frames = [];
  const history = {
    entries: [{ unrelatedState: "preserved" }],
    get state() { return this.entries.at(-1); },
    pushState(value) { this.entries.push(value); },
    back() { if (this.entries.length > 1) this.entries.pop(); },
  };
  const viewport = new NodeStub();
  Object.assign(viewport, { height: 800, offsetTop: 0, scale: 1 });
  const comments = [];
  const document = {
    querySelector: node,
    createComment: () => {
      const comment = new NodeStub();
      comments.push(comment);
      return comment;
    },
    createDocumentFragment: () => new NodeStub(),
    documentElement: new NodeStub(),
    activeElement: null,
    addEventListener() {},
  };
  const window = {
    matchMedia: () => query,
    history,
    innerHeight: 800,
    visualViewport: viewport,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    scrollTo() {},
  };
  let open = false;
  let modal = null;
  const api = {
    isNoteEditorOpen: () => open,
    activeModalDialog: () => modal,
    getVisibleNotes: () => [],
    pluralize: (n) => `${n} notes`,
    createElement: () => new NodeStub(),
    scheduleTopbarActionsPinning() {},
    scheduleTagFilterLayout() {},
    syncToastHost() {},
    requestNoteEditorClose: async () => {},
  };
  const app = { api, elements, ui: { typeId: "all", tagIds: new Set(), noteEditorMode: "edit" }, library: { types: [], notes: [] } };
  const context = { window, document, Event, Symbol, Date };
  context.globalThis = context;
  context[Symbol.for("nook.app.modules")] = { register(name, install) { assert.equal(name, "mobile"); install(app); } };
  vm.runInNewContext(source, context);
  api.bindMobileEvents();
  return {
    app, nodes, moved, originalParents, history, document, viewport, comments,
    setOpen(value) { open = value; },
    setModal(value) { modal = value; },
    resize(mobile) { query.matches = mobile; query.dispatchEvent(new Event("change")); },
    resizeWindow(mobile) { query.matches = mobile; listeners.get("resize")(); },
    back() { history.back(); return listeners.get("popstate")(); },
    frame() { const callbacks = frames.splice(0); callbacks.forEach((callback) => callback()); },
  };
}

test("mobile layout returns the same controls and draft values to desktop on resize", () => {
  const f = fixture();
  f.moved[0].value = "existing selection";
  f.resize(true);
  f.moved.forEach((node, i) => assert.notEqual(node.parentElement, f.originalParents[i]));
  f.app.elements.mobileFilterDialog.open = true;
  f.resize(false);
  f.moved.forEach((node, i) => assert.equal(node.parentElement, f.originalParents[i]));
  assert.equal(f.moved[0].value, "existing selection");
  assert.equal(f.app.elements.mobileFilterDialog.open, false);
});

test("window resize restores desktop controls even when the media change and return marker are lost", () => {
  const f = fixture();
  f.resize(true);
  const filterAnchor = f.comments[0];
  filterAnchor.parentElement.children.splice(filterAnchor.parentElement.children.indexOf(filterAnchor), 1);
  filterAnchor.parentElement = null;
  f.resizeWindow(false);
  assert.equal(f.moved[0].parentElement, f.originalParents[0]);
  f.moved.forEach((node, i) => assert.equal(node.parentElement, f.originalParents[i]));
});

test("mobile search opens the filter sheet and keeps the query when returning to desktop", () => {
  const f = fixture();
  f.resize(true);
  f.app.elements.search.value = "stored query";
  f.app.api.focusMobileSearch();
  assert.equal(f.app.elements.mobileFilterDialog.open, true);
  assert.equal(f.app.elements.mobileSearch.getAttribute("aria-current"), "page");
  f.resizeWindow(false);
  assert.equal(f.app.elements.mobileFilterDialog.open, false);
  assert.equal(f.app.elements.primarySearchField.parentElement, f.originalParents[5]);
  assert.equal(f.app.elements.search.value, "stored query");
  f.app.api.focusMobileSearch();
  assert.equal(f.app.elements.mobileFilterDialog.open, false, "desktop search remains inline");
});

test("clicking mobile navigation search opens the filter sheet without auto-focusing the search input", () => {
  const f = fixture();
  f.resize(true);
  let focused = false;
  f.app.elements.search.focus = () => { focused = true; };
  f.app.elements.mobileSearch.click();
  assert.equal(f.app.elements.mobileFilterDialog.open, true);
  assert.equal(focused, false, "search input must not be auto-focused when footer search is clicked");
});

test("closing the search sheet restores the current Trash navigation state", () => {
  const f = fixture();
  f.resize(true);
  f.app.ui.trashOnly = true;
  f.app.api.focusMobileSearch();
  f.app.elements.mobileFilterDialog.close();
  assert.equal(f.app.elements.mobileTrash.getAttribute("aria-current"), "page");
  assert.equal(f.app.elements.mobileSearch.getAttribute("aria-current"), undefined);
});

test("Reset all delegates query, filter and sort reset to the existing library action", () => {
  const f = fixture();
  let resetCalls = 0;
  f.app.api.clearFilters = (options) => {
    resetCalls += 1;
    assert.equal(options.preserveSort, false);
  };
  f.app.elements.mobileResetFilters.click();
  assert.equal(resetCalls, 1);
});

test("opening a mobile note adds one Back guard without overwriting unrelated history state", () => {
  const f = fixture();
  f.resize(true);
  f.app.api.rememberMobileDetail();
  assert.equal(f.history.entries.length, 1);
  f.setOpen(true);
  f.app.api.rememberMobileDetail();
  f.app.api.rememberMobileDetail();
  assert.equal(f.history.entries.length, 2);
  assert.equal(f.history.state.unrelatedState, "preserved");
  f.app.api.releaseMobileDetail();
  assert.equal(f.history.entries.length, 1);
});

test("repeated browser Back during an unresolved draft confirmation stays inside the editor", async () => {
  const f = fixture();
  f.resize(true);
  f.setOpen(true);
  f.app.api.rememberMobileDetail();
  const confirmation = new NodeStub();
  let closeRequests = 0;
  f.app.api.requestNoteEditorClose = () => {
    closeRequests += 1;
    confirmation.open = true;
    f.setModal(confirmation);
    return new Promise((resolve) => confirmation.addEventListener("close", resolve, { once: true }));
  };
  const pendingBack = f.back();
  assert.equal(confirmation.open, true);
  assert.equal(f.history.entries.length, 2, "Back remains guarded while confirmation waits");
  await f.back();
  await pendingBack;
  assert.equal(confirmation.open, false);
  assert.equal(closeRequests, 1, "second Back cancels confirmation instead of requesting another close");
  assert.equal(f.history.entries.length, 2);
});

test("a failed mobile save retains the Back guard; a successful close releases it", async () => {
  const f = fixture();
  f.resize(true);
  f.setOpen(true);
  f.app.api.rememberMobileDetail();
  await f.back();
  assert.equal(f.history.entries.length, 2);
  f.app.api.requestNoteEditorClose = async () => { f.setOpen(false); f.app.api.releaseMobileDetail(); };
  await f.back();
  assert.equal(f.history.entries.length, 1);
});

test("visual viewport geometry updates mobile height and is removed on desktop", () => {
  const f = fixture();
  f.viewport.height = 410;
  f.viewport.offsetTop = 25;
  f.resize(true);
  f.frame();
  const values = f.document.documentElement.style.values;
  assert.equal(values.get("--mobile-viewport-height"), "410px");
  assert.equal(values.get("--mobile-viewport-top"), "25px");
  assert.equal(values.get("--mobile-keyboard-offset"), "365px");
  f.resize(false);
  f.frame();
  assert.equal(values.has("--mobile-viewport-height"), false);
  assert.equal(values.has("--mobile-viewport-top"), false);
  assert.equal(values.has("--mobile-keyboard-offset"), false);
});
