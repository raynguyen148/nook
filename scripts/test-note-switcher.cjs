"use strict";

// Optional Chromium regression checks on a fresh origin with synthetic notes.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

async function main() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some((part) => part.startsWith("."))) {
        response.writeHead(403); response.end(); return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  const passed = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.NOOK_BROWSER_CHANNEL ? { channel: process.env.NOOK_BROWSER_CHANNEL } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const ready = (page) => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
    async function setup(options = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", ...options });
      await context.addInitScript(() => {
        let storage;
        Object.defineProperty(globalThis, "PersonalNotesStorage", { configurable: true,
          get: () => storage,
          set(value) {
            storage = Object.freeze({ ...value, async saveNote(...args) {
              globalThis.__saveCalls = (globalThis.__saveCalls || 0) + 1;
              if (globalThis.__saveGate) await globalThis.__saveGate;
              if (globalThis.__failSave) throw new Error("Synthetic save failure");
              return value.saveNote(...args);
            }, async addTag(...args) {
              globalThis.__tagCalls = (globalThis.__tagCalls || 0) + 1;
              if (globalThis.__tagGate) await globalThis.__tagGate;
              return value.addTag(...args);
            } });
          },
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Synthetic save failure")) errors.push(message.text()); });
      await page.goto(origin); await ready(page);
      const notes = await page.evaluate(async () => {
        const content = Array.from({ length: 120 }, (_, i) => `Paragraph ${i}: synthetic note content for scroll testing.`).join("\n\n");
        return Promise.all(["Alpha", "Beta", "Gamma", "Delta"].map((title) => PersonalNotesStorage.saveNote({
          title, content, typeId: PersonalNotesStorage.FALLBACK_TYPE_ID, tagIds: [],
        })));
      });
      await page.reload(); await ready(page);
      await page.getByRole("button", { name: "Open note: Alpha", exact: true }).click();
      if (options.viewport?.width < 960) return { page, context, notes };
      await page.locator("#toggle-dual-pane-btn").click();
      assert.equal(await page.locator("#secondary-picker-back-btn").isVisible(), false);
      await page.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Beta", exact: true }).click();
      return { page, context, notes };
    }
    const selectors = {
      primary: { trigger: "#primary-switch-note-btn", view: "#primary-picker-view", back: "#primary-picker-back-btn", editor: "#note-content", list: "#primary-notes-list", modes: "data-note-editor-mode", title: "#quick-view-title" },
      secondary: { trigger: "#secondary-back-to-picker-btn", view: "#secondary-picker-view", back: "#secondary-picker-back-btn", editor: "#secondary-note-content-editor", list: "#secondary-notes-list", modes: "data-secondary-editor-mode", title: "#secondary-note-title" },
    };

    for (const pane of ["primary", "secondary"]) {
      const { page, context, notes } = await setup();
      const s = selectors[pane];
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.locator(s.editor).fill(`Draft in ${pane}`);
      await page.locator(s.trigger).click();
      assert.equal(await page.locator(s.view).isVisible(), true);
      await page.waitForFunction((id) => document.activeElement?.id === id, `${pane}-note-search`);
      assert.equal(await page.locator(`#${pane}-note-search`).evaluate((el) => el === document.activeElement), true);
      await page.waitForTimeout(1800);
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, old.content);
      assert.equal(await page.evaluate(() => globalThis.__saveCalls || 0), 0);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(s.view).isVisible(), false);
      assert.equal(await page.locator(s.editor).inputValue(), `Draft in ${pane}`);
      assert.equal(await page.locator(`[${s.modes}="edit"]`).getAttribute("aria-pressed"), "true");
      await page.locator(s.trigger).click();
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      await page.waitForFunction(({ selector }) => document.querySelector(selector)?.textContent === "Gamma", { selector: s.title });
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, `Draft in ${pane}`);
      const other = selectors[pane === "primary" ? "secondary" : "primary"];
      assert.equal(await page.locator(other.title).innerText(), pane === "primary" ? "Beta" : "Alpha");
      assert.equal(await page.locator("#note-secondary-surface").isVisible(), true);
      passed.push(`${pane}: opening does not save; Escape keeps the draft; choosing saves only that pane`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.locator(s.editor).fill(`Failed draft in ${pane}`);
      await page.evaluate(() => { globalThis.__failSave = true; });
      await page.locator(s.trigger).click();
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      await page.locator(s.view).waitFor({ state: "hidden" });
      assert.equal(await page.locator(s.editor).inputValue(), `Failed draft in ${pane}`);
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, old.content);
      assert.equal(await page.locator("#note-secondary-surface").isVisible(), true);
      await page.reload(); await ready(page);
      assert.ok(await page.evaluate((content) => Object.keys(localStorage).some((key) =>
        key.startsWith("nook:") && (localStorage.getItem(key) || "").includes(content)), `Failed draft in ${pane}`));
      await page.locator("#recovery-indicator").click();
      await page.locator("#recovery-dialog").getByRole("button", { name: "Recover draft", exact: true }).click();
      await page.waitForFunction((content) => document.querySelector("#note-content").value === content, `Failed draft in ${pane}`);
      await page.locator("#primary-switch-note-btn").click();
      await page.locator("#primary-picker-back-btn").click();
      await page.waitForTimeout(1800);
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, old.content);
      passed.push(`${pane}: failed saves keep the note and a reload-recoverable draft`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.locator(s.editor).fill(`Delayed draft in ${pane}`);
      await page.evaluate(() => { globalThis.__saveGate = new Promise((resolve) => { globalThis.__releaseSave = resolve; }); });
      await page.locator(s.trigger).click();
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      await page.waitForFunction(() => globalThis.__saveCalls === 1);
      await page.locator(s.back).click();
      await page.evaluate(() => { globalThis.__releaseSave(); globalThis.__saveGate = null; });
      await page.waitForFunction(async ({ id, content }) => (await PersonalNotesStorage.getNote(id)).content === content,
        { id: old.id, content: `Delayed draft in ${pane}` });
      await page.waitForTimeout(100);
      assert.equal(await page.locator(s.editor).inputValue(), `Delayed draft in ${pane}`);
      assert.equal(await page.locator(s.view).isVisible(), false);
      const originalTitle = pane === "primary" ? "#note-title" : "#secondary-note-title-input";
      assert.equal(await page.locator(originalTitle).inputValue(), old.title);
      passed.push(`${pane}: canceling during a delayed save prevents late navigation`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.evaluate(() => { globalThis.__saveGate = new Promise((resolve) => { globalThis.__releaseSave = resolve; }); });
      await page.locator(s.editor).fill("First autosave capture");
      await page.waitForFunction(() => globalThis.__saveCalls === 1);
      await page.locator(s.editor).fill("Typing after autosave capture");
      await page.locator(s.trigger).click();
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      await page.evaluate(() => { globalThis.__releaseSave(); globalThis.__saveGate = null; });
      await page.waitForFunction(({ selector }) => document.querySelector(selector)?.textContent === "Gamma", { selector: s.title });
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, "Typing after autosave capture");
      passed.push(`${pane}: switching waits for an in-flight autosave and saves newer typing`);
      await context.close();
    }

    const closeDuringSave = await setup();
    await closeDuringSave.page.locator('[data-note-editor-mode="edit"]').click();
    await closeDuringSave.page.evaluate(() => { globalThis.__saveGate = new Promise((resolve) => { globalThis.__releaseSave = resolve; }); });
    await closeDuringSave.page.locator("#note-content").fill("Captured before Save and return");
    await closeDuringSave.page.waitForFunction(() => globalThis.__saveCalls === 1);
    await closeDuringSave.page.locator("#note-content").fill("Newer typing before Save and return");
    await closeDuringSave.page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await closeDuringSave.page.evaluate(() => { globalThis.__releaseSave(); globalThis.__saveGate = null; });
    await closeDuringSave.page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    assert.equal((await closeDuringSave.page.evaluate((id) => PersonalNotesStorage.getNote(id), closeDuringSave.notes[0].id)).content,
      "Newer typing before Save and return");
    passed.push("Save and return during autosave commits newer typing before closing the workspace");
    await closeDuringSave.context.close();

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.locator(s.editor).fill(`Conflict draft in ${pane}`);
      await page.locator(s.trigger).click();
      const external = await context.newPage();
      await external.goto(origin); await ready(external);
      await external.evaluate(async (note) => PersonalNotesStorage.saveNote({ ...note, content: "Newer external content" }, {
        expectedRevision: note.revision,
      }), old);
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      await page.locator("#conflict-dialog").waitFor({ state: "visible" });
      await page.locator("#conflict-keep-editing-btn").click();
      await page.locator(s.view).waitFor({ state: "hidden" });
      assert.equal(await page.locator(s.editor).inputValue(), `Conflict draft in ${pane}`);
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), old.id)).content, "Newer external content");
      passed.push(`${pane}: a second-tab conflict retains the draft and stops switching`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.evaluate(() => { globalThis.__tagGate = new Promise((resolve) => { globalThis.__releaseTag = resolve; }); });
      await page.locator(pane === "primary" ? "#add-tag-btn" : "#secondary-add-tag-btn").click();
      const tagInput = pane === "primary" ? "#tag-input" : "#secondary-tag-input";
      await page.locator(tagInput).fill("Pending tag");
      await page.locator(tagInput).press("Enter");
      await page.waitForFunction(() => globalThis.__tagCalls === 1);
      await page.locator(s.trigger).click();
      await page.locator(s.list).getByRole("button", { name: "Open note: Gamma", exact: true }).click();
      assert.equal(await page.locator(s.view).isVisible(), true);
      await page.evaluate(() => { globalThis.__releaseTag(); globalThis.__tagGate = null; });
      await page.waitForFunction(({ selector }) => document.querySelector(selector)?.textContent === "Gamma", { selector: s.title });
      const tagIds = await page.evaluate((id) => PersonalNotesStorage.getNote(id).then((note) => note.tagIds), old.id);
      assert.equal(tagIds.length, 1);
      assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), notes[2].id)).tagIds.length, 0);
      passed.push(`${pane}: pending tag creation completes on the original note before switching`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context, notes } = await setup();
      const old = notes[pane === "primary" ? 0 : 1];
      await page.locator(`[${s.modes}="edit"]`).click();
      await page.evaluate(() => { globalThis.__tagGate = new Promise((resolve) => { globalThis.__releaseTag = resolve; }); });
      await page.locator(pane === "primary" ? "#add-tag-btn" : "#secondary-add-tag-btn").click();
      await page.locator(pane === "primary" ? "#tag-input" : "#secondary-tag-input").fill("Deferred tag");
      await page.locator(pane === "primary" ? "#tag-input" : "#secondary-tag-input").press("Enter");
      await page.waitForFunction(() => globalThis.__tagCalls === 1);
      await page.locator(s.trigger).click();
      await page.evaluate(() => { globalThis.__releaseTag(); globalThis.__tagGate = null; });
      await page.waitForFunction((selector) => document.querySelector(selector).textContent.includes("Deferred tag"),
        pane === "primary" ? "#selected-note-tags" : "#secondary-selected-note-tags");
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(() => globalThis.__saveCalls || 0), 0);
      await page.locator(s.back).click();
      await page.waitForFunction(async (id) => (await PersonalNotesStorage.getNote(id)).tagIds.length === 1, old.id);
      passed.push(`${pane}: changes completed while browsing autosave only after returning to the note`);
      await context.close();
    }

    for (const pane of ["primary", "secondary"]) {
      const s = selectors[pane];
      const { page, context } = await setup();
      for (const mode of ["preview", "edit", "split"]) {
        await page.locator(`[${s.modes}="${mode}"]`).click();
        const scrollSelector = mode === "preview" ? (pane === "primary" ? "#note-form .quick-view-content-card" : "#secondary-reader-view .quick-view-content-card") : s.editor;
        const top = await page.locator(scrollSelector).evaluate((element) => { element.scrollTop = 250; return element.scrollTop; });
        assert.ok(top > 0);
        await page.locator(s.trigger).click();
        await page.locator(s.back).click();
        await page.waitForFunction(({ selector, top }) => Math.abs(document.querySelector(selector).scrollTop - top) < 2, { selector: scrollSelector, top });
        assert.equal(await page.locator(`[${s.modes}="${mode}"]`).getAttribute("aria-pressed"), "true");
      }
      passed.push(`${pane}: Back to note preserves Preview/Edit/Split mode and scroll`);
      await context.close();
    }

    const browsing = await setup();
    await browsing.page.locator("#primary-switch-note-btn").click();
    await browsing.page.locator("#primary-note-search").fill("Gamma");
    await browsing.page.locator("#secondary-back-to-picker-btn").click();
    await browsing.page.locator("#secondary-note-search").fill("Delta");
    assert.equal(await browsing.page.locator("#primary-notes-list .note-card").count(), 1);
    assert.equal(await browsing.page.locator("#secondary-notes-list .note-card").count(), 1);
    await browsing.page.locator("#primary-picker-back-btn").click();
    await browsing.page.locator("#primary-switch-note-btn").click();
    assert.equal(await browsing.page.locator("#primary-note-search").inputValue(), "Gamma");
    assert.equal(await browsing.page.locator("#secondary-note-search").inputValue(), "Delta");
    await browsing.page.locator("#primary-clear-search-btn").click();
    assert.equal(await browsing.page.locator("#primary-notes-list").getByRole("button", { name: "Open note: Alpha", exact: true }).count(), 0);
    assert.equal(await browsing.page.locator("#primary-notes-list").getByRole("button", { name: "Open note: Beta", exact: true }).count(), 0);
    await browsing.page.locator("#primary-picker-library-btn").click();
    await browsing.page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    assert.equal(await browsing.page.locator("#note-secondary-surface").isVisible(), false);
    passed.push("Picker queries are independent; active notes are excluded; All notes closes the workspace");
    await browsing.context.close();

    const pickerActions = await setup();
    await pickerActions.page.locator("#primary-switch-note-btn").click();
    await pickerActions.page.locator("#primary-notes-list").getByRole("button", { name: "Move Gamma to Trash", exact: true }).click();
    assert.equal(await pickerActions.page.locator("#note-secondary-surface").isVisible(), true);
    assert.equal(await pickerActions.page.locator("#secondary-note-title").innerText(), "Beta");
    await pickerActions.page.locator("#primary-picker-back-btn").click();
    await pickerActions.page.locator("#close-note-dialog-btn").click();
    await pickerActions.page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    await pickerActions.page.getByRole("button", { name: "Open Alpha with Side Note", exact: true }).click();
    await pickerActions.page.locator("#secondary-notes-list").getByRole("button", { name: "Move Beta to Trash", exact: true }).click();
    assert.equal(await pickerActions.page.locator("#secondary-picker-view").isVisible(), true);
    assert.equal(await pickerActions.page.locator("#quick-view-title").innerText(), "Alpha");
    passed.push("Picker card actions preserve both panes, including a remembered but unopened side note");
    await pickerActions.context.close();

    async function assertFits(page, selector) {
      const bounds = await page.locator(selector).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height,
          viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
      });
      assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.right <= bounds.viewportWidth + 1,
        `${selector} exceeds viewport: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1, `${selector} has horizontal overflow`);
    }
    const matrix = await setup();
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await matrix.page.evaluate((value) => localStorage.setItem("nook:theme", value), theme);
      await matrix.page.reload(); await ready(matrix.page);
      await matrix.page.getByRole("button", { name: "Open note: Alpha", exact: true }).click();
      await matrix.page.locator("#toggle-dual-pane-btn").click();
      await matrix.page.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Beta", exact: true }).click();
      for (const width of [960, 1180, 1440]) {
        await matrix.page.setViewportSize({ width, height: 900 });
        await assertFits(matrix.page, "#note-form .note-navigation");
        const navigation = await matrix.page.locator("#note-form .note-navigation").evaluate((group) => {
          const [back, change] = group.querySelectorAll("button");
          const left = back.getBoundingClientRect();
          const right = change.getBoundingClientRect();
          return { gap: right.left - left.right, aligned: left.top === right.top && left.height === right.height };
        });
        assert.ok(navigation.gap >= -1.1 && navigation.gap <= 0 && navigation.aligned, "Navigation segments must stay joined and aligned");
        for (const pane of ["primary", "secondary"]) {
          const s = selectors[pane];
          await assertFits(matrix.page, s.trigger);
          await matrix.page.locator(s.trigger).click();
          await assertFits(matrix.page, s.view);
          await assertFits(matrix.page, `#${pane}-note-search`);
          await matrix.page.locator(`#${pane}-comfortable-view-btn`).click();
          await assertFits(matrix.page, s.list);
          await matrix.page.locator(s.back).click();
        }
      }
      passed.push(`${theme}: paired pane pickers fit at 960/1180/1440px`);
    }
    await matrix.context.close();
    for (const width of [320, 375, 414, 768, 820]) {
      const mobile = await setup({ viewport: { width, height: 812 }, isMobile: true, hasTouch: true });
      await assertFits(mobile.page, "#primary-switch-note-btn");
      await assertFits(mobile.page, "#note-form .dialog-header");
      await assertFits(mobile.page, "#note-form .note-editor-modes");
      if (process.env.NOOK_SCREENSHOT_DIR && width === 375) {
        await mobile.page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "detail-mobile.png") });
      }
      await mobile.page.locator("#primary-switch-note-btn").click();
      await assertFits(mobile.page, "#primary-picker-view");
      await assertFits(mobile.page, "#primary-note-search");
      if (process.env.NOOK_SCREENSHOT_DIR && width === 375) {
        await mobile.page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "picker-mobile.png") });
      }
      await mobile.page.locator("#primary-picker-back-btn").click();
      await mobile.page.locator("#close-note-dialog-btn").click();
      await mobile.page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
      await mobile.page.locator("#mobile-nav-new").click();
      assert.equal(await mobile.page.locator("#primary-switch-note-btn").isVisible(), false);
      if (process.env.NOOK_SCREENSHOT_DIR && width === 375) {
        await mobile.page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "new-note-mobile.png") });
      }
      passed.push(`Mobile ${width}px: picker fits, cancel returns, new note keeps edit-only actions hidden`);
      await mobile.context.close();
    }

    const { page, context } = await setup();
    if (process.env.NOOK_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "detail-desktop.png"), fullPage: true });
      await page.locator("#primary-switch-note-btn").click();
      await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "switch-primary.png"), fullPage: true });
    }
    await context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, consoleErrors: errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
