"use strict";

// Optional local QA. Playwright and Node 20+ are development tools only.
// All writes use isolated synthetic browser data, never a personal origin.
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
  const passed = [];
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const ready = (page) => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
    async function newPage(options = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", ...options });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(origin); await ready(page);
      return page;
    }
    async function seed(page) {
      const records = await page.evaluate(async () => {
        const s = PersonalNotesStorage;
        const tag = await s.addTag({ name: "Focus" });
        const type = await s.addType({ name: "Projects", color: "indigo" });
        const notes = await Promise.all(["Primary", "Side"].map((title) => s.saveNote({ title, typeId: type.id, tagIds: [tag.id], content: "# Heading\n\n**Markdown** and a paragraph." })));
        return { notes, type, tag };
      });
      await page.reload(); await ready(page); return records;
    }
    async function screenshot(page, name) {
      if (!process.env.NOOK_SCREENSHOT_DIR) return;
      await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
    }

    const first = await newPage();
    assert.equal(await first.locator("#welcome-card").isVisible(), true);
    assert.equal((await first.evaluate(() => PersonalNotesStorage.getSnapshot())).notes.length, 0);
    await first.locator("#welcome-dismiss").click();
    await first.reload(); await ready(first);
    assert.equal(await first.locator("#welcome-card").isVisible(), false);
    passed.push("First-use explanation creates no records; dismissal survives reload");
    await first.context().close();

    const guide = await newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await screenshot(guide, "welcome-mobile");
    await guide.locator("#welcome-guide").click();
    await guide.locator("#note-dialog").waitFor({ state: "visible" });
    const guideNote = (await guide.evaluate(() => PersonalNotesStorage.getSnapshot())).notes[0];
    assert.equal(guideNote.title, "Welcome to Nook");
    assert.match(guideNote.content, /JSON backup/);
    assert.equal(await guide.locator("#note-save-status-label").innerText(), "Saved");
    const guideBackup = await guide.evaluate(() => PersonalNotesStorage.buildExport());
    assert.ok(guideBackup.data.notes.some((note) => note.id === guideNote.id));
    await guide.locator("#close-note-dialog-btn").click();
    await guide.evaluate((id) => PersonalNotesStorage.deleteNote(id), guideNote.id);
    await guide.reload(); await ready(guide);
    assert.equal(await guide.locator("#welcome-card").isVisible(), false);
    passed.push("Guide note is explicit, ordinary, backup-compatible, and removable");
    await guide.context().close();

    for (const [value, expected] of [["warm", "coffee"], ["midnight-blue", "midnight"], ["unknown", "light"], ["auto", "dark"]]) {
      const page = await newPage({ colorScheme: "dark" });
      await page.evaluate((value) => localStorage.setItem("nook:theme", value), value);
      await page.reload(); await ready(page);
      assert.equal(await page.locator("html").getAttribute("data-theme"), expected);
      assert.equal(await page.locator("#nook-theme-stylesheet").count(), 1);
      await page.locator("#organize-btn").click();
      await page.locator("#display-tab").click();
      const themeMode = await page.locator("html").getAttribute("data-theme-mode");
      assert.equal(themeMode, value === "auto" ? "auto" : expected);
      assert.equal(await page.locator("#theme-select").inputValue(), themeMode);
      passed.push(`Theme ${value}: boot, preferences, and stylesheet agree`);
      await page.context().close();
    }

    const themeIcons = await newPage({ viewport: { width: 375, height: 812 } });
    const iconModes = [["light", "sun"], ["coffee", "coffee"], ["forest", "forest"], ["midnight", "midnight"],
      ["dark", "moon"], ["retro", "retro"], ["eink", "eink"], ["auto", "auto"]];
    async function assertThemeIcon(mode, icon) {
      await themeIcons.waitForFunction(({ mode, icon }) => {
        const visible = (id) => [...document.querySelectorAll(`${id} .theme-toggle__icon`)]
          .filter(node => getComputedStyle(node).display !== "none");
        const desktop = visible("#theme-toggle"), mobile = visible("#mobile-theme-btn");
        return document.documentElement.dataset.themeMode === mode && desktop.length === 1 && mobile.length === 1 &&
          desktop[0].classList.contains(`theme-toggle__icon--${icon}`) && mobile[0].className === desktop[0].className;
      }, { mode, icon });
      assert.equal(await themeIcons.locator("#mobile-theme-btn").getAttribute("aria-label"),
        await themeIcons.locator("#theme-toggle").getAttribute("aria-label"));
    }
    for (const [mode, icon] of iconModes) {
      await assertThemeIcon(mode, icon);
      await themeIcons.locator("#mobile-theme-btn").click();
    }
    await assertThemeIcon("light", "sun");
    await themeIcons.locator("#mobile-theme-btn").click();
    await themeIcons.reload(); await ready(themeIcons);
    await assertThemeIcon("coffee", "coffee");
    await themeIcons.evaluate(() => localStorage.setItem("nook:theme", "auto"));
    await themeIcons.reload(); await ready(themeIcons);
    await assertThemeIcon("auto", "auto");
    await themeIcons.emulateMedia({ colorScheme: "dark" });
    await themeIcons.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await assertThemeIcon("auto", "auto");
    await themeIcons.emulateMedia({ colorScheme: "light" });
    await themeIcons.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await assertThemeIcon("auto", "auto");
    await themeIcons.setViewportSize({ width: 1280, height: 900 });
    await themeIcons.locator("#theme-toggle").click();
    await themeIcons.setViewportSize({ width: 375, height: 812 });
    await assertThemeIcon("light", "sun");
    passed.push("Mobile and desktop share theme icons through all eight modes, reload, system Auto changes and resize");
    await themeIcons.context().close();

    const commands = await newPage();
    const commandRecords = await seed(commands);
    for (const width of [1440, 1366, 1280, 1024, 821]) {
      await commands.setViewportSize({ width, height: 900 });
      const geometry = await commands.locator("#quick-actions-btn").evaluate((button) => {
        const label = button.querySelector(".button-label");
        return { label: getComputedStyle(label).display, width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height, icon: !!button.querySelector("svg"),
          name: button.getAttribute("aria-label") };
      });
      assert.notEqual(geometry.label, "none");
      assert.equal(geometry.icon, true);
      assert.equal(geometry.name, "Actions");
      assert.ok(geometry.width > geometry.height);
    }
    passed.push("Quick actions keeps its visible label within the shared header group at 821–1440px");
    await commands.setViewportSize({ width: 1280, height: 800 });
    await commands.locator("#quick-actions-btn").click();
    const commandIcons = await commands.locator(".command-result").evaluateAll((buttons) => buttons.map((button) => ({
      title: button.querySelector(".command-result__title").textContent,
      icon: button.querySelector("svg")?.dataset.commandIcon,
      paths: button.querySelectorAll("svg path, svg circle, svg rect").length,
    })));
    assert.ok(commandIcons.every((item) => item.icon && item.paths));
    assert.ok(new Set(commandIcons.map((item) => item.icon)).size >= 10);
    assert.equal(commandIcons.find((item) => item.title === "Primary").icon, "note");
    assert.equal(await commands.locator(".command-group").count(), 2);
    assert.equal(await commands.locator("#command-notes-count").innerText(), "2 notes total");
    await commands.keyboard.press("ArrowUp");
    assert.equal(await commands.locator('.command-result[aria-selected="true"]').getAttribute("data-command-index"), String(commandIcons.length - 1));
    await commands.keyboard.press("ArrowDown");
    assert.equal(await commands.locator('.command-result[aria-selected="true"]').getAttribute("data-command-index"), "0");
    const actionCount = await commands.locator('.command-group[aria-label="Quick actions"] .command-result').count();
    for (let index = 0; index < actionCount; index += 1) await commands.keyboard.press("ArrowDown");
    assert.equal(await commands.locator('.command-result[aria-selected="true"] svg').getAttribute("data-command-icon"), "note");
    await commands.locator("#command-search").fill("Settings");
    assert.equal(await commands.locator(".command-group").count(), 1);
    await commands.locator("#command-search").fill("no matching synthetic command");
    assert.equal(await commands.locator(".command-group").count(), 0);
    assert.equal(await commands.locator("#command-status").innerText(), "No matching notes or actions.");
    passed.push("Quick actions groups skip headings during arrow navigation and handle action-only, note-only, and empty searches");
    await commands.locator("#command-search").fill("Primary");
    await commands.keyboard.press("Enter");
    await commands.locator("#note-dialog").waitFor({ state: "visible" });
    assert.equal(await commands.locator("#note-id").inputValue(), commandRecords.notes[0].id);
    passed.push("Every action and note has an app-style icon; search and Enter still open the selected note");
    for (const width of [1440, 1280, 1024, 960]) {
      await commands.setViewportSize({ width, height: 900 });
      for (const mode of ["preview", "edit", "split"]) {
        await commands.locator(`[data-note-editor-mode="${mode}"]`).click();
        const trigger = commands.locator("#note-quick-actions-btn");
        assert.equal(await trigger.isVisible(), true);
        assert.equal(await trigger.innerText(), "");
        const box = await trigger.boundingBox();
        assert.ok(box.width >= 30 && box.height >= 30);
        await trigger.click();
        await commands.locator("#command-dialog").waitFor({ state: "visible" });
        assert.equal(await commands.locator('.command-result__icon[data-command-icon="save"]').count(), 1);
        await commands.keyboard.press("Escape");
        assert.equal(await trigger.evaluate((button) => document.activeElement === button), true);
      }
    }
    await commands.locator("#primary-switch-note-btn").focus();
    await commands.keyboard.press("Tab");
    await commands.waitForFunction(() => getComputedStyle(document.querySelector("#note-quick-actions-tooltip")).opacity === "1");
    const tooltipVisible = await commands.locator("#note-quick-actions-btn").evaluate((button) => {
      const tooltip = document.querySelector("#note-quick-actions-tooltip");
      const rect = tooltip.getBoundingClientRect();
      for (let parent = tooltip.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return false;
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) return false;
      }
      return button.matches(":focus-visible") && getComputedStyle(tooltip).opacity === "1";
    });
    assert.equal(tooltipVisible, true, "The detail shortcut tooltip must escape the mode group's scroll clipping");
    await commands.locator("#toggle-dual-pane-btn").click();
    await commands.locator("#note-quick-actions-btn").click();
    await commands.keyboard.press("ArrowDown");
    assert.equal(await commands.locator('.command-result[aria-selected="true"] .command-result__title').innerText(), "New note");
    await commands.keyboard.press("Escape");
    passed.push("Detail icon works in Preview/Edit/Split and Side note; arrow selection and focus return remain intact");
    await commands.context().close();

    const desktop = await newPage({ viewport: { width: 1024, height: 900 } });
    const records = await seed(desktop);
    const collapsed = () => desktop.locator(".app-shell").evaluate((shell) => shell.classList.contains("is-sidebar-collapsed"));
    const sidebarPreference = () => desktop.evaluate(() => localStorage.getItem("nook:sidebar-collapsed"));
    await desktop.getByRole("button", { name: "Open note: Primary", exact: true }).click();
    const originalPreference = await sidebarPreference();
    await desktop.locator("#toggle-dual-pane-btn").click();
    assert.equal(await collapsed(), true);
    assert.equal(await sidebarPreference(), originalPreference);
    await desktop.locator("#close-secondary-pane-btn").click();
    assert.equal(await collapsed(), false);
    assert.equal(await sidebarPreference(), originalPreference);
    passed.push("Side note borrows sidebar space at 1024px and restores the untouched preference");
    await desktop.locator("#toggle-dual-pane-btn").click();
    await desktop.locator("#sidebar-toggle-btn").click();
    assert.equal(await collapsed(), false);
    assert.equal(await sidebarPreference(), "false");
    await desktop.locator("#close-secondary-pane-btn").click();
    assert.equal(await collapsed(), false);
    passed.push("Manual sidebar expansion during Side note remains the user's preference");
    await desktop.locator("#sidebar-toggle-btn").click();
    assert.equal(await collapsed(), true);
    await desktop.locator("#toggle-dual-pane-btn").click();
    await desktop.locator("#close-secondary-pane-btn").click();
    assert.equal(await collapsed(), true);
    passed.push("Opening and closing Side note preserves an already collapsed sidebar");
    await desktop.locator("#sidebar-toggle-btn").click();
    await desktop.locator("#toggle-dual-pane-btn").click();
    await desktop.setViewportSize({ width: 1440, height: 900 });
    await desktop.waitForFunction(() => !document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"));
    await desktop.setViewportSize({ width: 1024, height: 900 });
    await desktop.waitForFunction(() => document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"));
    passed.push("Workspace collapse responds to resize without saving an automatic preference");
    await desktop.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Side", exact: true }).click();
    await desktop.locator('[data-secondary-editor-mode="edit"]').click();
    await desktop.locator("#secondary-note-content-editor").fill("Saved when closing Side note");
    await desktop.locator("#secondary-reader-close-btn").click();
    await desktop.locator("#note-secondary-surface").waitFor({ state: "hidden" });
    assert.equal((await desktop.evaluate((id) => PersonalNotesStorage.getNote(id), records.notes[1].id)).content, "Saved when closing Side note");
    assert.equal(await collapsed(), false);
    passed.push("Dirty Side note saves before closing and restoring the sidebar");
    await desktop.locator('[data-note-editor-mode="edit"]').click();
    await desktop.locator("#note-content").fill("Primary saved on return");
    assert.equal(await desktop.locator('#note-form button[type="submit"]').innerText(), "Save & return");
    await desktop.locator('#note-form button[type="submit"]').click();
    await desktop.locator("#note-dialog").waitFor({ state: "hidden" });
    assert.equal((await desktop.evaluate((id) => PersonalNotesStorage.getNote(id), records.notes[0].id)).content, "Primary saved on return");
    passed.push("Save & return commits the primary note before leaving the editor");

    await desktop.locator("#organize-btn").click();
    const typeRow = desktop.locator("#types-list .management-row").filter({ hasText: "Projects" });
    const typeMenu = typeRow.locator(".management-actions-menu");
    assert.equal(await typeRow.getByRole("button", { name: "Delete Projects", exact: true }).isVisible(), false);
    await typeRow.hover();
    await typeMenu.locator("summary").click();
    await typeRow.getByRole("button", { name: "Delete Projects", exact: true }).click();
    await desktop.locator("#confirmation-dialog").waitFor({ state: "visible" });
    await desktop.keyboard.press("Escape");
    assert.equal(await desktop.evaluate(() => document.activeElement?.getAttribute("aria-label")), "More actions for Projects");
    assert.ok((await desktop.evaluate(() => PersonalNotesStorage.getSnapshot())).types.some((type) => type.id === records.type.id));
    await typeMenu.locator("summary").click();
    await desktop.keyboard.press("Escape");
    assert.equal(await typeMenu.getAttribute("open"), null);
    assert.equal(await desktop.locator("#organize-dialog").isVisible(), true);
    passed.push("Type Delete stays in More; cancel and Escape preserve records and the settings dialog");
    await desktop.locator("#tags-tab").click();
    const tagRow = desktop.locator("#tags-list .management-row").filter({ hasText: "Focus" });
    const tagMenu = tagRow.locator(".management-actions-menu");
    assert.equal(await tagRow.getByRole("button", { name: "Delete Focus", exact: true }).isVisible(), false);
    await tagRow.hover();
    await tagMenu.locator("summary").click();
    await desktop.locator("#organize-dialog h2").click();
    assert.equal(await tagMenu.getAttribute("open"), null);
    await screenshot(desktop, "settings-desktop");
    passed.push("Tag Delete stays in More; outside click dismisses the menu");
    await desktop.evaluate(async () => {
      for (let index = 0; index < 40; index++) await PersonalNotesStorage.addTag({ name: `Overflow ${String(index).padStart(2, "0")}` });
    });
    await desktop.reload(); await ready(desktop);
    for (const width of [1024, 375]) {
      await desktop.setViewportSize({ width, height: 812 });
      await desktop.locator(width <= 820 ? "#mobile-nav-settings" : "#organize-btn").click();
      await desktop.locator(width <= 820 ? '#mobile-settings-home [data-mobile-settings-tab="tags"]' : "#tags-tab").click();
      const lastRow = desktop.locator("#tags-list .management-row").filter({ hasText: "Overflow 39" });
      await lastRow.scrollIntoViewIfNeeded(); await lastRow.hover();
      await lastRow.locator("summary").click();
      const remove = lastRow.getByRole("button", { name: "Delete Overflow 39", exact: true });
      await screenshot(desktop, `settings-menu-${width}`);
      assert.equal(await remove.evaluate((button) => {
        const box = button.getBoundingClientRect();
        return [[box.left + box.width / 2, box.top + 2], [box.left + box.width / 2, box.bottom - 2],
          [box.left + 2, box.top + box.height / 2], [box.right - 2, box.top + box.height / 2]].every(([x, y]) =>
          button.contains(document.elementFromPoint(x, y)));
      }), true, `the Delete control escapes clipping at the list edge at ${width}px`);
      await remove.click();
      await desktop.locator("#confirmation-dialog").waitFor({ state: "visible" });
      await desktop.keyboard.press("Escape");
      await screenshot(desktop, `settings-overflow-${width}`);
      await desktop.keyboard.press("Escape");
      await desktop.locator("#organize-dialog").waitFor({ state: "hidden" });
    }
    passed.push("More menu remains clickable in the last row of long desktop and mobile catalogues");
    await desktop.context().close();

    for (const theme of ["light", "coffee", "forest", "dark", "midnight", "retro", "eink"]) {
      const page = await newPage(); await seed(page);
      await page.evaluate((theme) => localStorage.setItem("nook:theme", theme), theme);
      await page.reload(); await ready(page);
      for (const width of [320, 375, 414, 768, 820, 821, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 812 });
        const select = page.locator("#select-notes-btn");
        if (width <= 820) {
          await select.waitFor({ state: "hidden" });
          assert.equal(await page.locator("#mobile-select-notes-slot").isVisible(), false);
          await select.evaluate(button => button.click());
          assert.equal(await page.locator(".note-selection input").count(), 0);
        } else {
          await select.waitFor({ state: "visible" });
          const selectionLayout = await select.evaluate((button) => {
            const peer = document.querySelector(".view-mode-control__choices");
            const box = button.getBoundingClientRect(), peerBox = peer.getBoundingClientRect();
            return { singleControl: document.querySelectorAll("#select-notes-btn").length === 1,
              sameRow: box.top < peerBox.bottom && peerBox.top < box.bottom,
              placement: button.parentElement.classList.contains("view-mode-choice--selection") && !!button.closest(".view-mode-control__choices"),
              noExtraRow: getComputedStyle(document.querySelector(".selection-heading")).display === "none",
              label: getComputedStyle(button.querySelector(".select-notes__label")).display };
          });
          assert.ok(selectionLayout.singleControl && selectionLayout.sameRow && selectionLayout.placement && selectionLayout.noExtraRow,
            `${theme}: selection shares the existing controls row at ${width}px`);
          assert.notEqual(selectionLayout.label, "none");
        }
        if (width === 375 || width === 1280) await screenshot(page, `library-controls-${theme}-${width}`);
        await page.locator("[data-open-commands]:visible").first().click();
        assert.equal(await page.locator('.command-result__icon[data-command-icon="select"]').count(), width <= 820 ? 0 : 1);
        const layout = await page.locator("#command-dialog").evaluate((dialog) => {
          const results = dialog.querySelector("#command-results");
          const body = dialog.querySelector(".dialog-body");
          const search = dialog.querySelector("#command-search");
          const searchTop = search.getBoundingClientRect().top;
          results.scrollTop = results.scrollHeight;
          return { viewport: document.documentElement.scrollWidth <= innerWidth + 1,
            body: body.scrollWidth <= body.clientWidth + 1,
            searchFixed: Math.abs(searchTop - search.getBoundingClientRect().top) <= 1,
            contained: results.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1,
            oneLineTitles: [...results.querySelectorAll(".command-result__title")].every((title) => getComputedStyle(title).whiteSpace === "nowrap") };
        });
        assert.ok(Object.values(layout).every(Boolean), `${theme}: Quick actions containment at ${width}px`);
        if (width === 375 || width === 1280) await screenshot(page, `quick-actions-${theme}-${width}`);
        await page.keyboard.press("Escape");
      }
      passed.push(`${theme}: Quick actions scrolls its results without moving search at 320/375/414/768/1024/1280/1440px`);
      await page.locator("#select-notes-btn").click();
      await page.locator(".note-selection input").first().check();
      assert.equal(await page.locator("#bulk-edit-btn, #bulk-edit-dialog").count(), 0);
      assert.equal(await page.locator(".bulk-actions__tools button").count(), 2);
      for (const width of [821, 1024, 1440]) {
        await page.setViewportSize({ width, height: 812 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator("#bulk-actions-bar").waitFor({ state: "visible" });
        assert.equal(await page.locator("#select-notes-btn").isVisible(), false);
        assert.equal(await page.locator("#select-notes-btn").getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#select-notes-btn svg").count(), 1);
        assert.equal(await page.locator("#bulk-selection-count").innerText(), "1 selected");
        assert.match(await page.locator("#bulk-selection-count").getAttribute("title"), /across pages and filters/);
        const compactBar = await page.locator("#bulk-actions-bar").evaluate(bar => {
          const box = bar.getBoundingClientRect();
          return { height: box.height, viewport: document.documentElement.scrollWidth <= innerWidth + 1,
            contained: [...bar.querySelectorAll("button")].every(button => {
              const b = button.getBoundingClientRect();
              return b.left >= box.left - 1 && b.right <= box.right + 1 && b.bottom <= box.bottom + 1;
            }) };
        });
        assert.ok(compactBar.viewport && compactBar.contained, `${theme}: selection toolbar fits at ${width}px`);
        assert.ok(compactBar.height <= (width <= 820 ? 114 : 54), `${theme}: compact toolbar height at ${width}px`);
      }
      await page.locator("[data-open-commands]:visible").first().click();
      for (const width of [320, 375, 414, 768, 820]) {
        await page.setViewportSize({ width, height: 812 });
        await page.waitForFunction(() => !document.querySelector(".note-selection"));
        assert.equal(await page.locator("#bulk-actions-bar").isVisible(), false);
        assert.equal(await page.locator("#select-notes-btn").isVisible(), false);
        assert.equal(await page.locator(".note-card--selected, .note-card--selectable").count(), 0);
        assert.equal(await page.locator('.command-result__icon[data-command-icon="select"]').count(), 0);
      }
      await page.setViewportSize({ width: 821, height: 812 });
      await page.locator("#bulk-actions-bar").waitFor({ state: "visible" });
      assert.equal(await page.locator('.command-result__icon[data-command-icon="select"]').count(), 1);
      assert.equal(await page.locator("#bulk-selection-count").innerText(), "1 selected");
      assert.equal(await page.locator(".note-selection input").first().isChecked(), true);
      await page.keyboard.press("Escape");
      await page.locator("#bulk-clear-btn").click();
      assert.equal(await page.locator("#bulk-actions-bar").isVisible(), false);
      assert.equal(await page.locator("#select-notes-btn").isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "select-notes-btn");
      assert.equal(await page.locator("#select-notes-label").innerText(), "Select");
      assert.equal(await page.locator("#select-notes-btn").getAttribute("aria-label"), "Select notes");
      passed.push(`${theme}: desktop selection resumes after mobile; mobile hides trigger, checkboxes, toolbar and Actions entry`);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("button", { name: "Open note: Primary", exact: true }).click();
      await page.locator('[data-note-editor-mode="edit"]').click();
      const geometry = await page.locator("#selected-note-tags .selected-tag").evaluate((el) => {
        const style = getComputedStyle(el); return { height: el.getBoundingClientRect().height, fontSize: style.fontSize, surface: style.backgroundColor, text: style.color };
      });
      assert.ok(geometry.height >= 20 && geometry.height <= 35, `${theme}: compact metadata remains bounded`);
      assert.notEqual(geometry.surface, geometry.text);
      await page.locator("#note-dialog .note-type-picker__trigger").click();
      assert.equal(await page.locator("#note-dialog .note-type-picker__menu").isVisible(), true);
      await page.keyboard.press("Escape");
      await page.locator("#add-tag-btn").click();
      await page.locator("#tag-input").fill("Missing");
      assert.equal(await page.locator("#tag-suggestions").isVisible(), true);
      await screenshot(page, `editor-${theme}`);
      passed.push(`${theme}: metadata, type picker, and tag menu render`);
      for (const width of [320, 375, 820]) {
        await page.setViewportSize({ width, height: 812 });
        await page.waitForFunction(() => document.querySelector("#note-form > .note-formatting-toolbar"));
        const more = page.locator('#note-form [data-formatting-scroll="after"]');
        const track = page.locator("#note-form .formatting-scroll-track");
        await page.waitForFunction(() => {
          const track = document.querySelector("#note-form .formatting-scroll-track");
          return !track || track.scrollWidth <= track.clientWidth + 1 || !document.querySelector('#note-form [data-formatting-scroll="after"]').hidden;
        });
        if (await track.evaluate((el) => el.scrollWidth > el.clientWidth + 1)) {
          assert.equal(await more.isVisible(), true);
          await more.click();
          assert.ok(await track.evaluate((el) => el.scrollLeft > 0));
          await page.locator('#note-form [data-formatting-scroll="before"]').waitFor({ state: "visible" });
          await track.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
          await more.waitFor({ state: "hidden" });
          await track.evaluate((el) => { el.scrollLeft = 0; });
        }
        assert.equal(await page.locator("#note-content").inputValue(), "# Heading\n\n**Markdown** and a paragraph.");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (width === 375) await screenshot(page, `phone-${theme}`);
      }
      await screenshot(page, `mobile-${theme}`);
      passed.push(`${theme}: mobile formatting cues and width containment at 320/375/820px`);
      await page.context().close();
    }
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ passed: passed.length, checks: passed, consoleErrors: errors }, null, 2) + "\n");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
