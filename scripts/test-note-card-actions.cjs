"use strict";

// Isolated synthetic notes on loopback; no personal browser profile or library.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

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
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.NOOK_BROWSER_CHANNEL ? { channel: process.env.NOOK_BROWSER_CHANNEL } : {}) });
  const errors = [];
  const passed = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ready = page => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
  const settle = page => page.waitForTimeout(160);
  async function setup(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", ...options });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin); await ready(page);
    await page.evaluate(async () => {
      const s = PersonalNotesStorage;
      const type = await s.addType({ name: "Planning long category", color: "rose" });
      const tags = await Promise.all(["prototype", "graph", "a useful long tag", "another long tag"].map(name => s.addTag({ name })));
      for (const title of ["Primary", "Side", "Reference", "Other reference"]) {
        const note = await s.saveNote({ title, content: "# Synthetic note\n\nA paragraph for reading and copying.", typeId: type.id, tagIds: tags.map(tag => tag.id) });
        if (title === "Primary") await s.setNotePinned(note.id, true);
        if (title === "Reference") {
          await new Promise(resolve => setTimeout(resolve, 10));
          await s.saveNote({ ...note, content: note.content + "\nEdited later." });
        }
      }
    });
    await page.reload(); await ready(page);
    return page;
  }
  const isOpen = card => card.locator(".note-card__actions").evaluate(el => el.matches(":popover-open"));
  const pinOpacity = card => card.locator(".note-card__pin-toggle").evaluate(el => getComputedStyle(el).opacity);
  async function assertFits(card, label) {
    const issues = await card.evaluate(el => {
      const box = el.getBoundingClientRect();
      const controls = el.querySelector(".note-card__top-actions").getBoundingClientRect();
      const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const visible = node => getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0;
      const result = [];
      if (controls.left < box.left - 1 || controls.right > box.right + 1 || controls.top < box.top - 1 || controls.bottom > box.bottom + 1) result.push("controls outside card");
      if (el.closest(".notes-list--compact") && innerWidth > 820) {
        const style = getComputedStyle(el);
        const end = box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
        if (Math.abs(controls.right - end) > 2) result.push("Compact controls not at far right");
      }
      for (const node of el.querySelectorAll(".type-badge, .note-card__date, .note-card__title, .note-card__preview, .note-card__tags")) {
        const rect = node.getBoundingClientRect().toJSON();
        if (node.classList.contains("note-card__title")) rect.right -= parseFloat(getComputedStyle(node).paddingRight) || 0;
        if (visible(node) && overlap(controls, rect)) result.push("controls overlap " + node.className);
      }
      const tags = el.querySelector(".note-card__tags").getBoundingClientRect();
      const date = el.querySelector(".note-card__date").getBoundingClientRect();
      if (overlap(tags, date)) result.push("tags overlap date");
      const menu = el.querySelector(".note-card__actions");
      if (menu.matches(":popover-open")) {
        const m = menu.getBoundingClientRect();
        const style = getComputedStyle(menu);
        const contentLeft = m.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const contentRight = m.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        if (m.left < -1 || m.right > innerWidth + 1 || m.top < -1 || m.bottom > innerHeight + 1) result.push("menu outside viewport");
        for (const button of menu.querySelectorAll("button")) {
          if (!visible(button)) continue;
          const b = button.getBoundingClientRect();
          if (Math.abs(b.left - contentLeft) > 1 || Math.abs(b.right - contentRight) > 1) result.push("menu row not stretched to left/right padding");
          if (b.left < m.left - 1 || b.right > m.right + 1 || b.bottom > m.bottom + 1) result.push("item outside menu");
        }
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) result.push("horizontal overflow");
      return result;
    });
    assert.deepEqual(issues, [], label);
  }
  async function screenshot(page, name) {
    if (!process.env.NOOK_SCREENSHOT_DIR) return;
    await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, name + ".png") });
  }
  async function assertMenuMotion(card, label) {
    const frames = await card.evaluate(async el => {
      const menu = el.querySelector(".note-card__actions");
      const trigger = el.querySelector(".note-card__more");
      async function sample() {
        const result = [];
        for (let frame = 0; frame < 18; frame++) {
          await new Promise(requestAnimationFrame);
          const rect = menu.getBoundingClientRect(), style = getComputedStyle(menu);
          result.push({ width: rect.width, height: rect.height, opacity: +style.opacity,
            direction: style.flexDirection, display: style.display, pointerEvents: style.pointerEvents });
        }
        return result;
      }
      trigger.click();
      const opening = await sample();
      trigger.click();
      const closing = await sample();
      // Reverse an in-progress exit; it must not hide the newly reopened menu.
      trigger.click();
      await new Promise(requestAnimationFrame);
      trigger.click();
      await new Promise(requestAnimationFrame);
      trigger.click();
      const reopened = await sample();
      const stillOpen = menu.matches(":popover-open");
      trigger.click();
      await sample();
      return { opening, closing, reopened, stillOpen };
    });
    const settled = frames.opening.at(-1);
    assert.equal(settled.opacity, 1, label + " opens fully");
    for (const frame of [...frames.opening, ...frames.closing, ...frames.reopened].filter(frame => frame.width > 0)) {
      assert.ok(Math.abs(frame.width - settled.width) < 1 && Math.abs(frame.height - settled.height) < 1,
        label + " preserves menu dimensions throughout motion");
      assert.equal(frame.direction, "column", label + " preserves vertical layout during exit");
    }
    assert.equal(frames.closing.at(-1).display, "none", label + " completes dismissal");
    assert.ok(frames.closing.every(frame => frame.pointerEvents === "none"), label + " exit cannot intercept clicks");
    assert.equal(frames.stillOpen, true, label + " rapid reopen remains open");
    assert.equal(frames.reopened.at(-1).opacity, 1, label + " rapid reopen becomes fully visible");
  }
  try {
    const page = await setup();
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await page.evaluate(theme => localStorage.setItem("nook:theme", theme), theme);
      await page.reload(); await ready(page);
      for (const layout of ["comfortable", "compact", "grid"]) {
        await page.locator("#" + layout + "-view-btn").click();
        for (const width of [821, 960, 1440, 1920]) {
          await page.setViewportSize({ width, height: 900 }); await settle(page);
          await page.mouse.move(0, 899);
          await page.evaluate(() => document.activeElement?.blur()); await settle(page);
          const cards = page.locator("#notes-list .note-card");
          const card = cards.first();
          const unpinned = cards.filter({ hasNot: page.locator(".note-card__pin-toggle[aria-pressed='true']") }).first();
          assert.equal(await isOpen(card), false);
          assert.equal(await card.locator(".note-card__more").isVisible(), true);
          assert.equal(await pinOpacity(card), "1", "pinned marker always visible");
          assert.equal(await pinOpacity(unpinned), "0", "unpinned marker hidden at rest");
          const before = await unpinned.boundingBox();
          await unpinned.hover(); await settle(page);
          assert.equal(await pinOpacity(unpinned), "1", "hover reveals pin");
          assert.equal(await isOpen(unpinned), false, "hover does not open menu");
          const after = await unpinned.boundingBox();
          assert.ok(Math.abs(before.height - after.height) < 1 && Math.abs(before.width - after.width) < 1, "hover keeps geometry stable");
          await assertFits(card, theme + "/" + layout + "/" + width);
          const pinBox = await card.locator(".note-card__pin-toggle").boundingBox();
          const moreBox = await card.locator(".note-card__more").boundingBox();
          assert.ok(pinBox.x + pinBox.width <= moreBox.x + 1, "Pin precedes More");
          await card.locator(".note-card__more").click(); await settle(page);
          assert.equal(await isOpen(card), true);
          assert.equal(await card.locator(".note-card__more").getAttribute("aria-expanded"), "true");
          await assertFits(card, theme + "/" + layout + "/" + width + " menu");
          await card.locator(".note-card__more").click(); await settle(page);
          assert.equal(await isOpen(card), false, "second More click closes rather than reopening");
          await card.locator(".note-card__more").click(); await settle(page);
          const labels = await card.locator(".note-card__action-label:visible").allTextContents();
          assert.deepEqual(labels, width < 960 ? ["Edit note", "Copy content", "Move to Trash"] : ["Edit note", "Copy content", "Open Side Note", "Move to Trash"]);
          await page.keyboard.press("End");
          assert.equal(await page.evaluate(() => document.activeElement.classList.contains("note-card__action--danger")), true);
          if (width === 1440) await screenshot(page, theme + "-" + layout);
          await page.keyboard.press("Escape"); await settle(page);
          assert.equal(await isOpen(card), false);
          assert.equal(await page.evaluate(() => document.activeElement.classList.contains("note-card__more")), true);
          await card.locator(".note-card__more").press("ArrowDown"); await settle(page);
          assert.equal(await isOpen(card), true, "keyboard opens menu");
          await page.mouse.click(0, 899); await settle(page);
          assert.equal(await isOpen(card), false, "outside click closes");
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await assertMenuMotion(page.locator("#notes-list .note-card").first(), theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const motionCard = page.locator("#notes-list .note-card").first();
      await motionCard.locator(".note-card__more").click();
      assert.equal(await motionCard.locator(".note-card__actions").evaluate(menu => menu.getAnimations().length), 0,
        "reduced motion disables menu animations");
      await motionCard.locator(".note-card__more").click();
      await page.locator("#select-notes-btn").click(); await settle(page);
      const selected = page.locator("#notes-list .note-card").first();
      await assertFits(selected, theme + " selection");
      await selected.locator(".note-selection input").check();
      assert.equal(await page.locator("#bulk-selection-count").textContent(), "1 selected");
      await page.locator("#bulk-clear-btn").click();
      passed.push(theme + ": 3 layouts at 821/960/1440/1920, persistent More, conditional pin, menu keyboard/dismissal, footer and selection; stable animation, rapid reopen and reduced motion");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#comfortable-view-btn").click();
    const primary = page.locator("#notes-list .note-card").filter({ has: page.getByRole("button", { name: "Open note: Primary", exact: true }) });
    const fresh = page.locator("#notes-list .note-card").filter({ has: page.getByRole("button", { name: "Open note: Other reference", exact: true }) });
    assert.match(await fresh.locator(".note-card__date").textContent(), /^Created /);
    const reference = page.locator("#notes-list .note-card").filter({ has: page.getByRole("button", { name: "Open note: Reference", exact: true }) });
    assert.match(await reference.locator(".note-card__date").textContent(), /^Updated /, "last update is shown even with created sort");
    const relativeDates = await fresh.locator(".note-card__date").evaluate(time => {
      const original = time.dateTime;
      const ages = [0, 5 * 60000, 2 * 3600000, 3 * 86400000, 14 * 86400000, 90 * 86400000, 730 * 86400000];
      const results = ages.map(age => {
        time.dateTime = new Date(Date.now() - age).toISOString();
        document.dispatchEvent(new Event("visibilitychange"));
        return time.textContent;
      });
      time.dateTime = original;
      document.dispatchEvent(new Event("visibilitychange"));
      return results;
    });
    assert.deepEqual(relativeDates, ["Created just now", "Created 5m ago", "Created 2h ago", "Created 3d ago", "Created 2w ago", "Created 3mo ago", "Created 2y ago"]);
    await page.locator("#grid-view-btn").click(); await settle(page);
    assert.ok(await primary.locator(".more-tags:not(.is-hidden)").count(), "overflow tags use a count");
    await page.locator("#comfortable-view-btn").click(); await settle(page);
    await primary.locator(".note-card__more").click();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await primary.getByRole("menuitem", { name: "Copy Primary", exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector("#notes-list .note-card__action.is-copied")));
    assert.equal(await isOpen(primary), true, "copy feedback remains in menu");
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Synthetic note/);
    await primary.getByRole("menuitem", { name: "Open Primary with Side Note", exact: true }).click(); await settle(page);
    const side = page.locator("#secondary-notes-list .note-card").first();
    await side.hover();
    await side.locator(".note-card__pin-toggle").click(); await settle(page);
    assert.equal(await page.locator("#secondary-picker-view").isVisible(), true, "pin does not navigate the picker");
    assert.equal(await side.locator(".note-card__pin-toggle").getAttribute("aria-pressed"), "true");
    await side.locator(".note-card__more").click(); await settle(page);
    await assertFits(side, "Side Note picker menu");
    assert.equal(await side.locator(".note-card__action--side-note").count(), 0);
    await page.keyboard.press("Escape"); await settle(page);
    assert.equal(await page.locator("#secondary-picker-view").isVisible(), true, "Escape closes only menu");
    await side.locator(".note-card__more").click(); await settle(page);
    const padding = await side.locator(".note-card__actions").boundingBox();
    await page.mouse.click(padding.x + 2, padding.y + padding.height / 2);
    assert.equal(await page.locator("#secondary-picker-view").isVisible(), true, "menu padding does not select note");
    await side.getByRole("menuitem", { name: /^Edit / }).click(); await settle(page);
    assert.equal(await page.locator("#secondary-note-content-editor").isVisible(), true);
    await page.locator("#primary-switch-note-btn").click(); await settle(page);
    const picker = page.locator("#primary-notes-list .note-card").first();
    await picker.locator(".note-card__more").click(); await settle(page);
    await assertFits(picker, "Primary picker menu");
    await picker.getByRole("menuitem", { name: /^Edit / }).click(); await settle(page);
    assert.equal(await page.locator("#note-content").isVisible(), true);
    passed.push("Created/Updated independent of sorting, tag overflow, real clipboard, both picker menus, Edit and Escape preserve the correct pane");
    await page.context().close();

    const touch = await setup({ hasTouch: true });
    for (const width of [1440, 320, 375, 414, 768, 820]) {
      await touch.setViewportSize({ width, height: 900 }); await settle(touch);
      const card = touch.locator("#notes-list .note-card").first();
      assert.ok(await card.locator(".note-card__more").evaluate(el => el.getBoundingClientRect().width >= 44));
      await card.locator(".note-card__more").click(); await settle(touch);
      await assertFits(card, "touch " + width);
      assert.ok(await card.locator(".note-card__action").first().evaluate(el => el.getBoundingClientRect().height >= 44));
      await screenshot(touch, "touch-" + width);
      await touch.keyboard.press("Escape");
    }
    await touch.locator("#notes-list .note-card__more").first().click();
    await touch.getByRole("menuitem", { name: "Edit Primary", exact: true }).click();
    await touch.locator("#note-content").waitFor({ state: "visible" });
    await touch.locator("#close-note-dialog-btn").click(); await settle(touch);
    assert.equal(await touch.evaluate(() => document.activeElement?.classList.contains("note-card__more")), true);
    await touch.locator("#notes-list .note-card__more").first().click();
    await touch.getByRole("menuitem", { name: "Move Primary to Trash", exact: true }).click(); await settle(touch);
    await touch.locator("#mobile-nav-trash").click(); await settle(touch);
    const trashed = touch.locator("#notes-list .note-card").first();
    await trashed.locator(".note-card__more").click(); await settle(touch);
    await assertFits(trashed, "mobile Trash menu");
    assert.deepEqual(await trashed.locator(".note-card__action-label").allTextContents(), ["Copy content", "Restore", "Delete permanently"]);
    await trashed.getByRole("menuitem", { name: "Delete Primary permanently", exact: true }).click();
    await touch.getByRole("dialog", { name: "Delete note permanently?", exact: true }).waitFor({ state: "visible" });
    await touch.keyboard.press("Escape"); await settle(touch);
    assert.equal(await trashed.isVisible(), true, "canceling permanent delete preserves note");
    await trashed.locator(".note-card__more").click();
    await trashed.getByRole("menuitem", { name: "Restore Primary", exact: true }).click(); await settle(touch);
    await touch.locator("#mobile-nav-notes").click(); await settle(touch);
    assert.equal(await touch.getByRole("button", { name: "Open note: Primary", exact: true }).isVisible(), true);
    await touch.setViewportSize({ width: 375, height: 320 }); await settle(touch);
    const bottomCard = touch.locator("#notes-list .note-card").last();
    await bottomCard.locator(".note-card__more").click(); await settle(touch);
    await assertFits(bottomCard, "menu in a short viewport");
    await touch.keyboard.press("Escape");
    await touch.emulateMedia({ forcedColors: "active" });
    await bottomCard.locator(".note-card__more").press("ArrowDown");
    assert.equal(await bottomCard.locator(".note-card__action").first().evaluate(el => getComputedStyle(el).outlineStyle), "solid");
    passed.push("Shared touch/mobile menu at 320/375/414/768/820/1440, 44px targets and editor focus restoration");
    await touch.context().close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed, consoleErrors: errors }, null, 2));
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
