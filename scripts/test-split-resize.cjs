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
          if (key.startsWith("nook:split-ratio:")) throw new Error("Synthetic blocked size preference");
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

  const handle = "#note-split-resize";
  const sideHandle = "#secondary-split-resize";
  const ratio = (page, selector = handle) => page.locator(selector).getAttribute("aria-valuenow").then(Number);
  async function drag(page, selector, delta, cancel = "") {
    const box = await page.locator(selector).boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + delta, y, { steps: 8 });
    if (cancel === "escape") await page.keyboard.press("Escape");
    if (cancel === "capture") await page.locator(selector).evaluate(el => {
      // Pointer ID 1 is the mouse pointer in Chromium.
      if (el.hasPointerCapture(1)) el.releasePointerCapture(1);
    });
    await page.mouse.up(); await settle(page);
  }
  async function split(page) {
    await page.locator('[data-note-editor-mode="split"]').click(); await settle(page);
  }
  async function screenshot(page, name) {
    if (!process.env.NOOK_SCREENSHOT_DIR) return;
    await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, name + ".png") });
  }
  try {
    const page = await setup(1800);
    await split(page);
    const source = await page.locator("#note-content").inputValue();
    closeTo(await ratio(page), 50);
    await drag(page, handle, 140);
    const resized = await ratio(page);
    assert.ok(resized > 55);
    assert.equal(await page.locator("#note-content").inputValue(), source);
    await screenshot(page, "primary-resized");
    await drag(page, handle, -100, "escape");
    closeTo(await ratio(page), resized);
    assert.equal(await page.locator("#note-dialog").isVisible(), true);
    await drag(page, handle, -100, "capture");
    closeTo(await ratio(page), resized);
    const cancelBox = await page.locator(handle).boundingBox();
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + 40);
    await page.mouse.down(); await page.mouse.move(cancelBox.x + 90, cancelBox.y + 40);
    await page.locator(handle).dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up(); await settle(page); closeTo(await ratio(page), resized);
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + 40);
    await page.mouse.down(); await page.mouse.move(cancelBox.x + 90, cancelBox.y + 40);
    await page.setViewportSize({ width: 1700, height: 900 }); await settle(page);
    await page.mouse.up(); closeTo(await ratio(page), resized);
    await page.setViewportSize({ width: 1800, height: 900 }); await settle(page);
    assert.equal(await page.locator(".app-shell").evaluate(el => el.classList.contains("is-split-resizing")), false);
    passed.push("Pointer drag changes columns; Escape and lost capture restore size without closing or changing content");

    await page.locator(handle).focus();
    await press(page, "Home"); closeTo(await ratio(page), Number(await page.locator(handle).getAttribute("aria-valuemin")));
    await press(page, "End"); closeTo(await ratio(page), Number(await page.locator(handle).getAttribute("aria-valuemax")));
    await press(page, "Enter"); closeTo(await ratio(page), 50);
    await press(page, "ArrowRight"); closeTo(await ratio(page), 52);
    await press(page, "Shift+ArrowLeft"); closeTo(await ratio(page), 42);
    await page.locator(handle).dblclick(); closeTo(await ratio(page), 50);
    await press(page, "ArrowRight");
    await page.reload(); await ready(page);
    await page.getByRole("button", { name: "Open note: Reading notes", exact: true }).click();
    await split(page); closeTo(await ratio(page), 52);
    passed.push("Keyboard limits, reset, fine/coarse steps and persisted ratio work");

    await page.locator("#note-content").evaluate(el => { el.scrollTop = 700; el.dispatchEvent(new Event("scroll")); });
    await settle(page); await drag(page, handle, 70);
    await page.locator("#note-content").evaluate(el => { el.scrollTop = 1100; el.dispatchEvent(new Event("scroll")); });
    await settle(page);
    assert.ok(await page.locator("#note-content-preview").evaluate(el => el.scrollTop) > 0);
    assert.equal(await page.locator("#note-content").inputValue(), source);
    await page.locator('[data-note-editor-mode="edit"]').click();
    assert.equal(await page.locator(handle).isVisible(), false);
    await split(page);
    passed.push("Scroll mapping survives reflow and mode switching preserves content");

    const primaryRatio = await ratio(page);
    await page.locator("#toggle-dual-pane-btn").click();
    await page.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Project reference", exact: true }).click();
    await page.locator('[data-secondary-editor-mode="split"]').click(); await settle(page);
    await page.locator(sideHandle).focus(); await press(page, "Home");
    const secondaryRatio = await ratio(page, sideHandle);
    assert.ok(secondaryRatio < 50);
    // The primary preference remains independent even when the narrower pane clamps it.
    const preference = await page.evaluate(() => Number(localStorage.getItem("nook:split-ratio:primary")) * 100);
    closeTo(preference, primaryRatio);
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await page.evaluate(theme => {
        localStorage.setItem("nook:theme", theme);
        localStorage.setItem("nook:glass", JSON.stringify({ enabled: true, transparency: 50 }));
      }, theme);
      await page.reload(); await ready(page);
      await page.getByRole("button", { name: "Open note: Reading notes", exact: true }).click(); await split(page);
      await page.locator("#toggle-dual-pane-btn").click();
      await page.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Project reference", exact: true }).click();
      await page.locator('[data-secondary-editor-mode="split"]').click(); await settle(page);
      assert.equal(await page.locator(sideHandle).isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator(sideHandle).hover();
      await screenshot(page, theme + "-split");
      await page.locator(sideHandle).focus(); await press(page, "ArrowRight");
    }
    passed.push("Both splitters work independently across all seven Glass themes");

    await page.setViewportSize({ width: 1024, height: 900 }); await settle(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator(handle).getAttribute("aria-disabled"), "true");
    await page.setViewportSize({ width: 375, height: 812 }); await settle(page);
    assert.equal(await page.locator(handle).isVisible(), false);
    assert.equal(await page.locator(sideHandle).isVisible(), false);
    passed.push("Narrow dual panes disable dragging; mobile hides splitters");

    const blocked = await setup(1440, { blockedSizeStorage: true });
    await split(blocked); await drag(blocked, handle, 90);
    assert.ok(await ratio(blocked) > 50);
    await blocked.context().close();
    passed.push("Blocked preference storage does not prevent resizing");

    const touch = await setup(1440, { hasTouch: true });
    await split(touch);
    const box = await touch.locator(handle).boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await touch.context().newCDPSession(touch);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 100, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await settle(touch);
    assert.ok(await ratio(touch) > 50);
    await touch.emulateMedia({ forcedColors: "active" });
    assert.equal(await touch.locator(handle).isVisible(), true);
    await touch.context().close();
    passed.push("Synthesized touch drag and forced-colors separator remain usable");
    await page.context().close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, errors }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
