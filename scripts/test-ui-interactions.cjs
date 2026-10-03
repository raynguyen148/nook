"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
// Optional local QA: fresh profiles, synthetic IndexedDB data, loopback only.
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const baseline = process.env.NOOK_UI_BASELINE === "1";
const observations = [];
const output = process.env.NOOK_SCREENSHOT_DIR || "/tmp/nook-ui-interactions";

async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) {
        response.writeHead(403); response.end(); return;
      }
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [], externalRequests = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.NOOK_BROWSER_CHANNEL ? { channel: process.env.NOOK_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    // Capture the app only in this isolated QA context; production exposes no API.
    await context.addInitScript(() => {
      Object.assign(globalThis, { __historyReads: [], __saveWaiting: false, __restoreCalls: 0, __restoreCompletions: 0 });
      const define = Object.defineProperty;
      Object.defineProperty = (target, key, descriptor) => {
        if (target === globalThis && key === Symbol.for("nook.app.modules") && descriptor.value?.register) {
          const registry = descriptor.value;
          descriptor = { ...descriptor, value: Object.freeze({ register: (name, install) => registry.register(name, app => {
            globalThis.__qaApp = app;
            install(app);
          }) }) };
        }
        return define(target, key, descriptor);
      };
      let storage;
      define(globalThis, "PersonalNotesStorage", { configurable: true, get: () => storage, set(value) {
        const wrapped = { ...value };
        wrapped.listNoteVersions = async (...args) => {
          const result = await value.listNoteVersions(...args);
          if (globalThis.__holdHistory) await new Promise((resolve, reject) => {
            (globalThis.__historyReads ||= []).push({ noteId: args[0], resolve, reject });
          });
          return result;
        };
        wrapped.restoreNoteVersion = async (...args) => {
          globalThis.__restoreCalls = (globalThis.__restoreCalls || 0) + 1;
          if (globalThis.__holdRestore) await new Promise(resolve => { globalThis.__releaseRestore = resolve; });
          if (globalThis.__failRestore) throw new Error("Synthetic restore failure");
          const result = await value.restoreNoteVersion(...args);
          globalThis.__restoreCompletions = (globalThis.__restoreCompletions || 0) + 1;
          return result;
        };
        wrapped.saveNote = async (...args) => {
          if (globalThis.__holdSave) await new Promise(resolve => {
            globalThis.__saveWaiting = true;
            globalThis.__releaseSave = resolve;
          });
          globalThis.__saveWaiting = false;
          return value.saveNote(...args);
        };
        storage = Object.freeze(wrapped);
      } });
    });
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on("request", request => { if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) externalRequests.push(request.url()); });
    const ready = () => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const active = () => page.evaluate(() => ({ id: document.activeElement.id, tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim(), cls: document.activeElement.className }));
    function check(name, actual, expected) {
      observations.push({ name, actual, expected, passed: actual === expected });
      console.log(name, JSON.stringify(actual));
      if (!baseline) assert.equal(actual, expected, name);
    }
    async function openEditor(id, pane = "primary") {
      await page.evaluate(async ({ id, pane }) => {
        if (pane === "primary") await __qaApp.api.openNoteEditor(__qaApp.library.notes.find(note => note.id === id));
        else {
          if (!__qaApp.ui.dualPaneOpen) await __qaApp.api.toggleDualPane();
          await __qaApp.api.openSecondaryNote(__qaApp.library.notes.find(note => note.id === id));
          __qaApp.api.setSecondaryNoteMode("edit");
        }
      }, { id, pane });
      await settle();
    }
    await page.goto(origin); await ready();
    const fixture = await page.evaluate(async () => {
      const s = PersonalNotesStorage;
      const tags = await Promise.all(["Alpha", "Beta", "Gamma"].map(name => s.addTag({ name })));
      const type = await s.addType({ name: "Projects", color: "indigo" });
      const notes = [];
      for (const title of ["Primary", "Side", ...Array.from({ length: 32 }, (_, i) => `Filler ${i}`)]) {
        let note = await s.saveNote({ title, typeId: type.id, tagIds: tags.slice(0, 2).map(tag => tag.id), content: `${title} earlier` });
        if (["Primary", "Side"].includes(title)) note = await s.saveNote({ ...note, content: `${title} current`, expectedRevision: note.revision });
        notes.push(note);
      }
      localStorage.setItem("nook:onboarding-dismissed", "1");
      return { tags, notes };
    });
    await page.reload(); await ready();
    const next = page.locator("#pagination button", { hasText: "Next" });
    await next.focus(); await page.keyboard.press("Enter"); await settle();
    check("Pagination keeps a surviving keyboard target at the last page", (await active()).tag !== "BODY", true);
    await page.locator("#pagination button", { hasText: "Previous" }).focus();
    await page.keyboard.press("Enter"); await settle();
    check("Previous navigation keeps keyboard focus", (await active()).tag !== "BODY", true);
    await openEditor(fixture.notes[0].id);
    for (const pane of ["primary", "secondary"]) {
      if (pane === "secondary") await openEditor(fixture.notes[1].id, pane);
      const prefix = pane === "primary" ? "" : "secondary-";
      const selected = `#${prefix}selected-note-tags`;
      const add = `#${prefix}add-tag-btn`, input = `#${prefix}tag-input`;
      await page.locator(`${selected} .selected-tag__remove`).first().focus();
      await page.keyboard.press("Enter"); await settle();
      check(`${pane}: removing a tag keeps focus in its metadata`, (await active()).cls.includes("selected-tag__remove"), true);
      await page.locator(`${selected} .selected-tag__remove`).first().focus();
      await page.keyboard.press("Enter"); await settle();
      check(`${pane}: removing the last tag focuses Add tag`, (await active()).id, `${prefix}add-tag-btn`);
      const noteId = fixture.notes[pane === "primary" ? 0 : 1].id;
      const paneStatus = pane === "primary" ? "#note-save-status-label" : "#secondary-note-save-status-label";
      await page.waitForFunction(({ noteId, paneStatus }) => __qaApp.library.notes.some(note => note.id === noteId && !note.tagIds.length) && document.querySelector(paneStatus).textContent === "Saved", { noteId, paneStatus });
      check(`${pane}: Add tag focus survives the following autosave`, (await active()).id, `${prefix}add-tag-btn`);
      await page.locator(add).click(); await page.locator(input).fill("Gamma");
      await page.locator(`#${prefix}tag-suggestions .tag-suggestion`).first().focus();
      await page.keyboard.press("Enter"); await settle();
      check(`${pane}: selecting a suggestion returns focus to Add tag`, (await active()).id, `${prefix}add-tag-btn`);
      await page.locator(add).click(); await page.locator(input).fill("日本");
      const countBefore = (await page.evaluate(() => PersonalNotesStorage.getSnapshot())).tags.length;
      await page.locator(input).dispatchEvent("keydown", { key: "Enter", isComposing: true });
      await page.locator(input).dispatchEvent("keydown", { key: "Escape", isComposing: true });
      await settle();
      check(`${pane}: IME confirmation leaves the tag input open`, await page.locator(input).isVisible(), true);
      check(`${pane}: IME confirmation does not create a tag`, (await page.evaluate(() => PersonalNotesStorage.getSnapshot())).tags.length, countBefore);
      if (await page.locator(input).isVisible()) {
        await page.locator(input).fill(`${pane} new tag`);
        await page.keyboard.press("Enter");
        await page.waitForFunction(({ id }) => document.getElementById(id).hidden, { id: `${prefix}tag-input-row` });
        await settle();
        check(`${pane}: completed tag creation returns focus`, (await active()).id, `${prefix}add-tag-btn`);
      }
      await page.locator(add).click(); await page.locator(input).fill(`${pane} button tag`);
      await page.locator(add).click();
      await page.waitForFunction(({ id }) => document.getElementById(id).hidden, { id: `${prefix}tag-input-row` });
      await settle();
      check(`${pane}: tag creation from the Add button returns focus`, (await active()).id, `${prefix}add-tag-btn`);
      const editor = pane === "primary" ? "#note-content" : "#secondary-note-content-editor";
      const picker = pane === "primary" ? "#note-dialog .note-type-picker" : "#secondary-editor-container .note-type-picker";
      await page.locator(editor).fill(`${pane} autosave focus check`);
      await page.locator(`${picker} .note-type-picker__trigger`).click();
      const status = pane === "primary" ? "#note-save-status-label" : "#secondary-note-save-status-label";
      await page.waitForFunction(({ status }) => document.querySelector(status)?.textContent === "Saved", { status });
      await page.waitForFunction(({ id, content }) => __qaApp.library.notes.some(note => note.id === id && note.content === content), { id: fixture.notes[pane === "primary" ? 0 : 1].id, content: `${pane} autosave focus check` });
      await settle();
      check(`${pane}: an open type picker retains its focused option after autosave`, (await active()).cls.includes("note-type-picker__option"), true);
      await page.evaluate(() => __qaApp.api.closeNoteTypePicker());
    }
    await page.evaluate(async () => { await __qaApp.api.closeDualPane(); });
    await page.evaluate(() => { __holdSave = true; });
    await page.locator("#selected-note-tags .selected-tag__remove").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => __saveWaiting);
    await page.locator("#note-title").focus();
    await page.evaluate(() => { __holdSave = false; __releaseSave(); });
    await page.waitForFunction(() => document.querySelector("#note-save-status-label").textContent === "Saved");
    await settle();
    check("Post-autosave tag focus respects movement to another field", (await active()).id, "note-title");
    await page.evaluate(() => { __holdSave = true; });
    await page.locator("#note-content").fill("Type changed during autosave");
    await page.locator("#note-dialog .note-type-picker__trigger").click();
    await page.waitForFunction(() => __saveWaiting);
    const general = page.locator('#note-dialog .note-type-picker__option[data-type-id="type-general"]');
    check("Type options stay usable during primary autosave", await general.isEnabled(), true);
    await general.click();
    await page.evaluate(() => { __holdSave = false; __releaseSave(); });
    await page.waitForFunction(id => __qaApp.library.notes.some(note => note.id === id && note.typeId === "type-general" && note.content === "Type changed during autosave") && document.querySelector("#note-save-status-label").textContent === "Saved", fixture.notes[0].id);
    check("A type selected during a delayed save is retained and committed", await page.locator("#note-type").inputValue(), "type-general");
    async function openHistory(id, hold = false) {
      await page.evaluate(({ id, hold }) => { __holdHistory = hold; void __qaApp.api.openNoteHistory(id); }, { id, hold });
      await page.locator("#history-dialog").waitFor({ state: "visible" });
    }
    async function closeHistory() {
      await page.locator("#close-history-dialog-btn").click();
      await page.waitForFunction(() => !__qaApp.ui.historyNoteId);
      await settle();
    }
    await openHistory(fixture.notes[0].id, true);
    await page.waitForFunction(() => __historyReads?.length === 1);
    await closeHistory();
    await openHistory(fixture.notes[1].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    await page.evaluate(() => __historyReads[0].resolve()); await settle();
    await page.locator("#history-list [role=option]").first().click();
    await page.locator("#history-restore-btn").click();
    await settle();
    check("A late history load cannot invalidate another note's restore", await page.locator("#confirmation-dialog").isVisible(), true);
    if (await page.locator("#confirmation-dialog").isVisible()) {
      await page.locator("#confirm-action-btn").click();
      await page.locator("#history-dialog").waitFor({ state: "hidden" }); await settle();
      check("Restore uses the selected note's own history", (await page.evaluate(id => PersonalNotesStorage.getNote(id), fixture.notes[1].id)).content, "Side current");
    } else await closeHistory();
    // Restore above selects the most recent archived content (the autosave fixture's current content).
    await openHistory(fixture.notes[0].id, true);
    await page.waitForFunction(() => __historyReads?.length === 2);
    await closeHistory(); await openHistory(fixture.notes[1].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    const titleBefore = await page.locator("#history-preview-title").innerText();
    await page.evaluate(() => __historyReads[1].reject(new Error("Expected stale history failure"))); await settle();
    check("A stale history failure cannot clear the newer dialog", await page.locator("#history-preview-title").innerText(), titleBefore);
    await closeHistory();
    await openHistory(fixture.notes[0].id, true);
    await page.waitForFunction(() => __historyReads?.length === 3);
    await closeHistory(); await openHistory(fixture.notes[0].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    await page.locator("#history-list [role=option]").last().click();
    const selected = await page.locator('#history-list [aria-selected="true"]').getAttribute("data-version-id");
    await page.evaluate(() => __historyReads[2].resolve()); await settle();
    check("Reopening the same note has a distinct history session", await page.locator('#history-list [aria-selected="true"]').getAttribute("data-version-id"), selected);
    await page.evaluate(() => { __holdRestore = true; });
    await page.locator("#history-restore-btn").click();
    await page.locator("#confirm-action-btn").click();
    await page.waitForFunction(() => typeof __releaseRestore === "function");
    const calls = await page.evaluate(() => __restoreCalls);
    const completions = await page.evaluate(() => __restoreCompletions || 0);
    await page.evaluate(() => { void __qaApp.api.restoreSelectedNoteVersion(); }); await settle();
    check("A repeated restore request has one storage operation and no second confirmation", await page.locator("#confirmation-dialog").isVisible(), false);
    if (await page.locator("#confirmation-dialog").isVisible()) await page.keyboard.press("Escape");
    await closeHistory(); await openHistory(fixture.notes[1].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    await page.evaluate(() => { __holdRestore = false; __releaseRestore(); });
    await page.waitForFunction(count => __restoreCompletions > count, completions);
    await page.waitForFunction(() => !document.querySelector("#history-restore-btn").disabled);
    await settle();
    check("An interrupted restore does not close the newer history dialog", await page.locator("#history-dialog").isVisible(), true);
    check("Interrupted/repeated restore writes once", await page.evaluate(() => __restoreCalls), calls);
    if (await page.locator("#history-dialog").isVisible()) await closeHistory();
    await openHistory(fixture.notes[1].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    await page.locator("#history-restore-btn").click();
    await page.locator("#confirmation-dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape"); await settle();
    check("Canceling a restore returns focus to its enabled control", (await active()).id, "history-restore-btn");
    await page.evaluate(() => { __failRestore = true; });
    await page.locator("#history-restore-btn").click();
    await page.locator("#confirm-action-btn").click();
    await page.waitForFunction(() => document.querySelector("#toast-message").textContent.includes("Synthetic restore failure"));
    await settle();
    check("A failed restore keeps history open with focused retry", (await active()).id, "history-restore-btn");
    check("A failed restore re-enables its control", await page.locator("#history-restore-btn").isEnabled(), true);
    await page.evaluate(() => { __failRestore = false; });
    await closeHistory();
    await openHistory(fixture.notes[1].id, true);
    await page.waitForFunction(() => __historyReads?.length === 4);
    await page.evaluate(() => __historyReads[3].reject(new Error("Synthetic current history failure"))); await settle();
    check("Current history failure gives a recovery instruction", await page.locator("#history-preview-meta").innerText(), "Close this dialog and open Version history to try again.");
    check("History failure clears loading state and disables restore", await page.locator("#history-list").getAttribute("aria-busy") === "false" && await page.locator("#history-restore-btn").isDisabled(), true);
    await closeHistory(); await openHistory(fixture.notes[1].id);
    await page.locator("#history-list [role=option]").first().waitFor();
    check("Reopening history after a read failure recovers normally", await page.locator("#history-restore-btn").isEnabled(), true);
    await closeHistory();
    check("No console or failed-request errors", errors.length, 0);
    check("No external network requests", externalRequests.length, 0);
    await fs.writeFile(path.join(output, "report.json"), JSON.stringify({ completed: true, observations, errors, externalRequests }, null, 2));
    console.log(JSON.stringify({ completed: true, observations, errors, externalRequests }, null, 2));
    await context.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
