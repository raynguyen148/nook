"use strict";

// Isolated browser regression checks. Uses synthetic notes on loopback only.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

async function main() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some((part) => part.startsWith("."))) {
        response.writeHead(403); response.end(); return;
      }
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.NOOK_BROWSER_CHANNEL ? { channel: process.env.NOOK_BROWSER_CHANNEL } : {}) });
  const errors = [];
  const passed = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ready = (page) => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
  const settle = (page) => page.waitForTimeout(350);
  async function press(page, key) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
  const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 2, `${actual} should be close to ${expected}`);
  async function setup(width = 1440, options = {}) {
    const { blockedSizeStorage = false, ...browserOptions } = options;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", ...browserOptions });
    if (blockedSizeStorage) await context.addInitScript(() => {
      for (const method of ["getItem", "setItem"]) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (key, ...args) {
          if (["nook:note-detail-expansion", "nook:note-detail-ratio"].includes(key)) throw new Error("Synthetic blocked size preference");
          return original.call(this, key, ...args);
        };
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin); await ready(page);
    await page.evaluate(async () => {
      const content = "# A useful workspace\n\nRead and write with a reference nearby.\n\n" + Array.from({ length: 35 }, (_, i) => `Paragraph ${i}: synthetic content that wraps when the workspace width changes.`).join("\n\n");
      for (const title of ["Reading notes", "Project reference", "Draft reference"]) await PersonalNotesStorage.saveNote({ title, content, typeId: PersonalNotesStorage.FALLBACK_TYPE_ID, tagIds: [] });
    });
    await page.reload(); await ready(page);
    await page.getByRole("button", { name: "Open note: Reading notes", exact: true }).click();
    await settle(page);
    return page;
  }
  async function geometry(page) {
    return page.evaluate(() => {
      const rect = (id) => document.querySelector(id).getBoundingClientRect().toJSON();
      return { primary: rect("#note-dialog"), secondary: rect("#note-secondary-surface"), track: rect("#note-detail-workspace"), guide: rect("#note-detail-width-guide"),
        gap: parseFloat(getComputedStyle(document.querySelector("#note-detail-workspace")).columnGap) || 0,
        overflow: document.documentElement.scrollWidth > innerWidth,
        disabled: document.querySelector("#note-resize-end").getAttribute("aria-disabled"),
        resizing: document.querySelector(".app-shell").classList.contains("is-note-resizing") };
    });
  }
  async function drag(page, selector, delta, cancel = false) {
    const box = await page.locator(selector).boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + delta, y, { steps: 8 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up(); await settle(page);
  }
  async function dual(page) {
    await page.locator("#toggle-dual-pane-btn").click();
    await page.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Project reference", exact: true }).click();
    await settle(page);
  }
  async function screenshot(page, name) {
    if (!process.env.NOOK_SCREENSHOT_DIR) return;
    await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, `${name}.png`) });
  }
  async function assertDocumentFillsPane(page, mode) {
    const widths = await page.evaluate((mode) => {
      const body = document.querySelector(mode === "preview" ? "#note-dialog .detail-preview-panel .quick-view-body" : "#note-dialog .dialog-body");
      const style = getComputedStyle(body);
      const available = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const selectors = mode === "preview"
        ? [".quick-view-document-header", ".quick-view-content-card", ".quick-view-dates"]
        : [".note-content-field", "#note-meta"];
      return { available, actual: selectors.map((selector) => document.querySelector(`#note-dialog ${selector}`).getBoundingClientRect().width) };
    }, mode);
    for (const actual of widths.actual) closeTo(actual, widths.available);
  }
  try {
    const page = await setup();
    const baseline = await geometry(page);
    closeTo(baseline.primary.width, 1063.21875);
    await drag(page, "#note-resize-end", 1000);
    closeTo((await geometry(page)).primary.width, baseline.track.width);
    await drag(page, "#note-resize-start", 1000);
    closeTo((await geometry(page)).primary.width, baseline.primary.width);
    await drag(page, "#note-resize-end", 20, true);
    closeTo((await geometry(page)).primary.width, baseline.primary.width);
    assert.equal(await page.locator("#note-dialog").isVisible(), true);
    assert.equal((await geometry(page)).resizing, false);
    const edge = page.locator("#note-resize-end");
    await edge.focus(); await press(page, "End");
    closeTo((await geometry(page)).primary.width, baseline.track.width);
    await edge.dblclick();
    await settle(page);
    closeTo((await geometry(page)).primary.width, baseline.primary.width);
    await edge.focus(); await press(page, "ArrowRight");
    closeTo((await geometry(page)).primary.width, baseline.primary.width + 16);
    await press(page, "End");
    await page.reload(); await ready(page);
    await page.getByRole("button", { name: "Open note: Reading notes", exact: true }).click(); await settle(page);
    closeTo((await geometry(page)).primary.width, baseline.track.width);
    await dual(page);
    assert.equal(await page.locator("#note-resize-start").isVisible(), false);
    const balanced = await geometry(page);
    closeTo(balanced.primary.width, balanced.secondary.width);
    await drag(page, "#note-resize-end", 2000);
    const biased = await geometry(page);
    assert.ok(biased.secondary.width >= 399);
    assert.ok(biased.primary.width <= (biased.track.width - biased.gap) * 0.7 + 2);
    await drag(page, "#note-resize-end", -2000);
    assert.ok((await geometry(page)).primary.width >= 399);
    await edge.focus(); await press(page, "End");
    await screenshot(page, "light-dual-biased");
    await page.locator('[data-note-editor-mode="split"]').click();
    await page.locator('[data-secondary-editor-mode="split"]').click();
    await settle(page);
    const draft = await page.locator("#note-content").inputValue();
    const split = await geometry(page);
    assert.equal(split.disabled, "true");
    closeTo(split.primary.width, split.secondary.width);
    await page.setViewportSize({ width: 1920, height: 900 }); await settle(page);
    await drag(page, "#note-resize-end", -300);
    assert.ok((await geometry(page)).primary.width >= 559);
    await page.locator('[data-note-editor-mode="preview"]').click(); await settle(page);
    await edge.focus(); await press(page, "End");
    assert.ok((await geometry(page)).secondary.width >= 559);
    await page.locator('[data-note-editor-mode="split"]').click(); await settle(page);
    assert.equal(await page.locator("#note-content").inputValue(), draft);
    assert.equal(await page.locator("#secondary-note-content-editor").isVisible(), true);
    await screenshot(page, "light-dual-split");
    await page.locator("#toggle-dual-pane-btn").click(); await settle(page);
    const restored = await geometry(page);
    closeTo(restored.primary.width, restored.track.width);
    await page.context().close();
    passed.push("Single width, both edges, bounded divider, keyboard, reset, cancellation, persistence, and Split content");

    const interrupted = await setup(1920);
    const initial = await geometry(interrupted);
    const interruptHandle = await interrupted.locator("#note-resize-end").boundingBox();
    const interruptX = interruptHandle.x + interruptHandle.width / 2;
    const interruptY = interruptHandle.y + 100;
    await interrupted.mouse.move(interruptX, interruptY);
    await interrupted.mouse.down();
    await interrupted.mouse.move(interruptX + 50, interruptY);
    await interrupted.waitForTimeout(50);
    assert.equal((await geometry(interrupted)).resizing, true);
    const modifier = await interrupted.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Meta" : "Control");
    await press(interrupted, `${modifier}+Shift+P`);
    assert.equal(await interrupted.locator("#command-dialog").isVisible(), true);
    assert.equal((await geometry(interrupted)).resizing, false);
    closeTo((await geometry(interrupted)).primary.width, initial.primary.width);
    await interrupted.mouse.move(interruptX + 80, interruptY);
    await interrupted.mouse.up();
    await press(interrupted, "Escape");
    assert.equal(await interrupted.locator("#command-dialog").isVisible(), false);
    assert.equal(await interrupted.locator("#note-dialog").isVisible(), true);
    closeTo((await geometry(interrupted)).primary.width, initial.primary.width);
    assert.equal(await interrupted.evaluate(() => localStorage.getItem("nook:note-detail-expansion")), null);
    await interrupted.context().close();
    passed.push("Opening Quick actions during a drag cancels resizing and lets Escape close the modal");

    const matrix = await setup(2560);
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await matrix.evaluate((theme) => localStorage.setItem("nook:theme", theme), theme);
      await matrix.reload(); await ready(matrix);
      await matrix.getByRole("button", { name: "Open note: Reading notes", exact: true }).click(); await settle(matrix);
      for (const width of [1440, 1920, 2560]) {
        await matrix.setViewportSize({ width, height: 900 }); await settle(matrix);
        const g = await geometry(matrix);
        closeTo(g.primary.width, width === 1440 ? 1063.21875 : 1428);
        await matrix.locator("#note-resize-end").focus(); await press(matrix, "End");
        closeTo((await geometry(matrix)).primary.width, g.track.width);
        assert.equal((await geometry(matrix)).overflow, false);
        for (const mode of ["edit", "split", "preview"]) {
          await matrix.locator(`[data-note-editor-mode="${mode}"]`).click(); await settle(matrix);
          await assertDocumentFillsPane(matrix, mode);
          assert.equal((await geometry(matrix)).overflow, false);
        }
        if (width === 2560) await screenshot(matrix, `${theme}-single-expanded-preview`);
        await matrix.locator('[data-note-editor-mode="edit"]').click(); await settle(matrix);
        await matrix.locator("#note-resize-end").focus();
        await press(matrix, "Enter");
      }
      await screenshot(matrix, `${theme}-single-default`);
      await dual(matrix);
      for (const width of [960, 1024, 1180, 1200, 1201, 1440, 1920, 2560]) {
        await matrix.setViewportSize({ width, height: 900 }); await settle(matrix);
        const handle = matrix.locator("#note-resize-end");
        for (const limit of ["Home", "End"]) {
          await handle.focus(); await press(matrix, limit);
          const g = await geometry(matrix);
          const usable = g.track.width - g.gap;
          assert.ok(Math.min(g.primary.width, g.secondary.width) >= Math.min(400, usable / 2) - 2);
          assert.equal(g.overflow, false);
          assert.ok(g.primary.x >= g.track.x - 1 && g.secondary.right <= g.track.right + 1);
        }
      }
      await screenshot(matrix, `${theme}-dual-biased`);
      await matrix.setViewportSize({ width: 960, height: 900 }); await settle(matrix);
      await matrix.locator("#sidebar-toggle-btn").click(); await settle(matrix);
      const small = await geometry(matrix);
      assert.equal(small.disabled, "true");
      closeTo(small.primary.width, small.secondary.width);
      await matrix.setViewportSize({ width: 959, height: 900 }); await settle(matrix);
      assert.equal(await matrix.locator("#note-secondary-surface").isVisible(), false);
      for (const width of [320, 375, 414, 768]) {
        await matrix.setViewportSize({ width, height: 900 }); await settle(matrix);
        assert.equal(await matrix.locator("#note-resize-end").isVisible(), false);
        assert.equal((await geometry(matrix)).overflow, false);
        await screenshot(matrix, `${theme}-mobile-${width}`);
      }
      await matrix.setViewportSize({ width: 2560, height: 900 }); await settle(matrix);
      await matrix.locator("#note-resize-end").focus(); await press(matrix, "Enter");
      passed.push(`${theme}: desktop min/max, divider bounds at eight widths, narrow lock, mobile at 320/375/414/768`);
    }
    await matrix.emulateMedia({ forcedColors: "active" });
    await matrix.locator("#note-resize-end").focus();
    assert.equal(await matrix.locator("#note-resize-end").evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
    await screenshot(matrix, "forced-colors-resize");
    await matrix.context().close();
    const canceled = await setup(2560);
    await canceled.locator("#sidebar-toggle-btn").click(); await settle(canceled);
    closeTo((await geometry(canceled)).primary.width, 1608);
    const handle = canceled.locator("#note-resize-end");
    const box = await handle.boundingBox();
    await canceled.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await canceled.mouse.down(); await canceled.mouse.move(box.x + 150, box.y + 100);
    await canceled.setViewportSize({ width: 768, height: 900 }); await settle(canceled);
    assert.equal((await geometry(canceled)).resizing, false);
    await canceled.mouse.up();
    await canceled.setViewportSize({ width: 2560, height: 900 }); await settle(canceled);
    closeTo((await geometry(canceled)).primary.width, 1608);
    await canceled.evaluate(() => {
      localStorage.setItem("nook:note-detail-expansion", "not-a-number");
      localStorage.setItem("nook:note-detail-ratio", "999");
    });
    await canceled.reload(); await ready(canceled);
    await canceled.getByRole("button", { name: "Open note: Reading notes", exact: true }).click(); await settle(canceled);
    closeTo((await geometry(canceled)).primary.width, 1608);
    await dual(canceled);
    const clamped = await geometry(canceled);
    closeTo(clamped.primary.width, (clamped.track.width - clamped.gap) * 0.7);
    await canceled.context().close();
    const blocked = await setup(1920, { blockedSizeStorage: true });
    const before = await geometry(blocked);
    await blocked.locator("#note-resize-end").focus(); await press(blocked, "End");
    closeTo((await geometry(blocked)).primary.width, before.track.width);
    await blocked.locator("#close-note-dialog-btn").click(); await settle(blocked);
    await blocked.getByRole("button", { name: "Open note: Reading notes", exact: true }).click(); await settle(blocked);
    closeTo((await geometry(blocked)).primary.width, before.track.width);
    await blocked.context().close();
    passed.push("Collapsed-sidebar baseline, viewport cancellation, malformed preferences, and session-only storage fallback");
    const newNote = await setup();
    await newNote.locator("#close-note-dialog-btn").click(); await settle(newNote);
    await newNote.locator("#new-note-btn").click();
    await newNote.locator("#note-title").fill("Unfinished resize draft");
    await newNote.locator("#note-content").fill("Draft survives a canceled resize.");
    await drag(newNote, "#note-resize-end", 40, true);
    assert.equal(await newNote.locator("#note-content").inputValue(), "Draft survives a canceled resize.");
    assert.equal(await newNote.locator("#note-dialog").isVisible(), true);
    await newNote.context().close();
    passed.push("Forced-colors focus and unsaved new-note draft survive resize cancellation");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, consoleErrors: errors }, null, 2));
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
