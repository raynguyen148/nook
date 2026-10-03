"use strict";

// Optional visual audit. All records belong to a fresh, synthetic browser context.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const output = process.env.NOOK_SCREENSHOT_DIR || "/tmp/nook-ui-audit";
const baseline = process.env.NOOK_UI_BASELINE === "1";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) {
        response.writeHead(403); response.end(); return;
      }
      const content = await fs.readFile(file);
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const report = { completed: false, generatedAt: new Date().toISOString(), captures: [], errors: [], externalRequests: [], checks: [] };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    let storage;
    Object.defineProperty(globalThis, "PersonalNotesStorage", { configurable: true, get: () => storage,
      set(value) {
        const wrapped = { ...value };
        wrapped.getSnapshot = async (...args) => {
          if (globalThis.__snapshotGate) {
            globalThis.__snapshotWaiting = true;
            await globalThis.__snapshotGate;
            globalThis.__snapshotWaiting = false;
          }
          return value.getSnapshot(...args);
        };
        for (const name of ["addType", "addTag", "updateType", "updateTag"]) {
          wrapped[name] = async (...args) => {
            globalThis.__managementCalls = (globalThis.__managementCalls || 0) + 1;
            if (globalThis.__managementGate) await globalThis.__managementGate;
            if (globalThis.__failManagement) throw new Error("Synthetic management failure");
            return value[name](...args);
          };
        }
        storage = Object.freeze(wrapped);
      },
    });
  });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
  page.on("requestfailed", request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("request", request => { if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) report.externalRequests.push(request.url()); });
  const ready = () => page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
  async function capture(name) {
    // Measure the resting state rather than a color halfway through a class
    // transition. Infinite saving indicators remain active for state captures.
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime)
      ).map(animation => animation.finished.catch(() => {})));
    });
    const state = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const painter = canvas.getContext("2d", { willReadFrequently: true });
      const rgb = value => {
        painter.clearRect(0, 0, 1, 1);
        painter.fillStyle = value;
        painter.fillRect(0, 0, 1, 1);
        const pixel = [...painter.getImageData(0, 0, 1, 1).data];
        return [...pixel.slice(0, 3), pixel[3] / 255];
      };
      const blend = (front, back) => {
        const alpha = front[3] ?? 1;
        return front.slice(0, 3).map((value, index) => value * alpha + back[index] * (1 - alpha));
      };
      const background = node => {
        const stack = [];
        for (let current = node; current; current = current.parentElement) stack.unshift(rgb(getComputedStyle(current).backgroundColor));
        return stack.reduce((color, layer) => layer.length ? blend(layer, color) : color, [255, 255, 255]);
      };
      const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (front, back) => {
        const a = luminance(blend(front, back)), b = luminance(back);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const label = node => node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`;
      const visible = node => {
        const modal = document.querySelector("dialog[open]");
        if (modal && !modal.contains(node)) return false;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height || node.closest(".sr-only, [hidden], .is-hidden")) return false;
        for (let current = node; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
      };
      const contrastFindings = [];
      for (const node of document.querySelectorAll("body *")) {
        if (!visible(node) || node.closest("svg") || node.matches(":disabled")) continue;
        const style = getComputedStyle(node), back = background(node);
        const text = !node.closest('[aria-hidden="true"]') && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
        if (text && Number(style.opacity) === 1) {
          const ratio = contrast(rgb(style.color), back);
          const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) contrastFindings.push({ selector: label(node), ratio: +ratio.toFixed(2), color: style.color, background: back, text: node.textContent.trim().slice(0, 55) });
        }
        if (node.matches("input[placeholder], textarea[placeholder]")) {
          const ratio = contrast(rgb(getComputedStyle(node, "::placeholder").color), back);
          if (ratio < 4.5) contrastFindings.push({ selector: `${label(node)}::placeholder`, ratio: +ratio.toFixed(2) });
        }
      }
      return {
        width: innerWidth, theme: document.documentElement.dataset.theme,
        overflow: document.documentElement.scrollWidth > innerWidth,
        contrastFindings,
        undersizedControls: [...document.querySelectorAll("button, input:not([type=hidden]), select")].filter(visible).filter(node => !node.closest(".color-picker__native, .note-type-picker__native, .theme-picker__native"))
          .map(node => ({ selector: label(node), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })).filter(box => box.width < 44 || box.height < 44),
      };
    });
    report.captures.push({ name, ...state });
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    assert.equal(state.overflow, false, `${name}: document overflow`);
  }
  async function command(title) {
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
    await page.keyboard.press(`${modifier}+Shift+P`);
    await page.locator("#command-search").fill(title);
    await page.locator(".command-result").filter({ has: page.locator(".command-result__title", { hasText: title }) }).first().click();
  }
  async function settings(tab) {
    await page.locator("#organize-btn").click();
    await page.locator(`#${tab}-tab`).click();
  }
  try {
    await page.goto(origin); await ready();
    await capture("empty-desktop");
    const fixture = JSON.parse(await fs.readFile(path.join(root, "docs/sample-data/nook-demo-library.json"), "utf8"));
    await page.evaluate(async backup => {
      await PersonalNotesStorage.importBackup(backup);
      const s = PersonalNotesStorage;
      const type = await s.addType({ name: "A deliberately long note type name for review", color: "emerald" });
      const tag = await s.addTag({ name: "Long label · Tiếng Việt 日本語 العربية 🌿" });
      let note = await s.saveNote({ title: "Long title · Tiếng Việt 日本語 العربية 🌿 · " + "unbroken".repeat(12), typeId: type.id, tagIds: [tag.id], content: "# A readable workspace\n\nSynthetic audit content.\n\n" + "longword".repeat(80) + "\n\n| Column | Details |\n| --- | --- |\n| Value | " + "widecell".repeat(50) + " |\n\n```js\n" + "code".repeat(90) + "\n```" });
      await s.saveNote({ ...note, content: note.content + "\n\nA second saved version.", expectedRevision: note.revision });
      localStorage.setItem("nook:onboarding-dismissed", "1");
    }, fixture);
    await page.reload(); await ready();
    const themes = (process.env.NOOK_UI_THEMES ?? "light,coffee,forest,midnight,dark,retro,eink").split(",").filter(Boolean);
    for (const theme of themes) {
      await page.evaluate(value => localStorage.setItem("nook:theme", value), theme);
      await page.reload(); await ready();
      await capture(`${theme}-library`);
      for (const mode of ["compact", "comfortable", "grid"]) {
        await page.locator(`#${mode}-view-btn`).click();
        if (theme === "light") await capture(`light-library-${mode}`);
      }
      await settings("types"); await capture(`${theme}-settings-types`);
      for (const tab of ["tags", "display", "data", "shortcuts"]) {
        await page.locator(`#${tab}-tab`).click();
        await capture(`${theme}-settings-${tab}`);
        if (tab === "data") {
          await page.locator("#delete-library-btn").click();
          await capture(`${theme}-delete-library-confirmation`);
          assert.equal(await page.locator("#confirm-delete-library-btn").isDisabled(), true);
          await page.keyboard.press("Escape");
          await page.locator("#delete-library-dialog").waitFor({ state: "hidden" });
        }
      }
      await page.keyboard.press("Escape");
      await page.locator("#quick-actions-btn").click(); await capture(`${theme}-commands`);
      await page.keyboard.press("Escape");
      await page.locator(".note-card__title").filter({ hasText: "Long title" }).click();
      await capture(`${theme}-preview`);
      await page.locator('[data-note-editor-mode="edit"]').click(); await capture(`${theme}-edit`);
      await page.locator('[data-note-editor-mode="split"]').click(); await capture(`${theme}-split`);
      await page.locator("#note-history-btn").click(); await capture(`${theme}-history`);
      await page.keyboard.press("Escape");
      await page.locator("#close-note-dialog-btn").click();
      await page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    }
    await page.evaluate(() => localStorage.setItem("nook:theme", "light"));
    await page.reload(); await ready();
    await command("Templates"); await capture("templates"); await page.keyboard.press("Escape");
    await command("Draft Recovery"); await capture("recovery-empty"); await page.keyboard.press("Escape");
    await page.locator("#markdown-import-input").setInputFiles([{ name: "Synthetic audit.md", mimeType: "text/markdown", buffer: Buffer.from("# Safe local test") }]);
    await capture("import-markdown"); await page.keyboard.press("Escape");
    await page.locator("#select-notes-btn").click(); await page.locator(".note-selection input").first().check();
    await capture("bulk-selection"); await page.locator("#bulk-clear-btn").click();
    await page.locator("#trash-space").click(); await capture("trash"); await page.locator("#all-notes-space").click();
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 820) {
        await page.locator("#mobile-nav-settings").click();
        await page.locator('[data-mobile-settings-tab="data"]').click();
      } else await settings("data");
      await page.locator("#delete-library-btn").click();
      assert.equal(await page.locator("#confirm-delete-library-btn").isDisabled(), true);
      await capture(`delete-library-${width}`);
      await page.keyboard.press("Escape");
      await page.locator("#delete-library-dialog").waitFor({ state: "hidden" });
      assert.equal(await page.locator("#organize-dialog").isVisible(), true);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    report.checks.push("Delete-library confirmation fits desktop/mobile, begins disabled, and Escape returns to Settings without deleting data");
    await page.locator("#new-note-btn").click();
    await page.locator("#note-content").fill("A synthetic unsaved draft");
    await page.locator("#close-note-dialog-btn").click(); await capture("dirty-confirmation");
    await page.locator("#cancel-confirmation-btn").click();
    await page.waitForFunction(() => document.activeElement?.id === "close-note-dialog-btn");
    assert.equal(await page.locator("#note-content").inputValue(), "A synthetic unsaved draft");
    await page.locator("#close-note-dialog-btn").click(); await page.locator("#confirm-action-btn").click();
    await page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    report.checks.push("Dirty close retains input when canceled; explicit discard closes the draft");
    for (const width of [320, 375, 768, 820, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(`width-${width}-library`);
      if (width <= 820) {
        await page.locator("#mobile-open-filters").click(); await capture(`width-${width}-filters`); await page.keyboard.press("Escape");
        await page.locator("#mobile-nav-settings").click(); await capture(`width-${width}-settings-home`);
        for (const tab of ["types", "tags", "display", "data", "shortcuts"]) {
          await page.locator(`[data-mobile-settings-tab="${tab}"]`).click(); await capture(`width-${width}-settings-${tab}`);
          if (tab === "data") {
            await page.locator("#delete-library-btn").click();
            await capture(`width-${width}-delete-library-confirmation`);
            assert.equal(await page.locator("#confirm-delete-library-btn").isDisabled(), true);
            await page.keyboard.press("Escape");
            await page.locator("#delete-library-dialog").waitFor({ state: "hidden" });
          }
          await page.locator("#mobile-settings-back").click();
        }
        await page.keyboard.press("Escape");
      }
      await page.locator(".note-card__title").filter({ hasText: "Long title" }).click();
      await capture(`width-${width}-preview`);
      await page.locator('[data-note-editor-mode="edit"]').click(); await capture(`width-${width}-edit`);
      if (width <= 820 && !baseline) {
        for (const selector of ["#mobile-note-actions-btn", "[data-note-editor-mode=edit]", ".note-type-picker__trigger", "#add-tag-btn", ".note-formatting-tool__button"]) {
          const height = await page.locator(selector).first().evaluate(node => node.getBoundingClientRect().height);
          assert.ok(height >= 44, `${selector}: mobile control height ${height}`);
        }
      }
      await page.locator("#close-note-dialog-btn").click();
      await page.locator("#note-detail-workspace").waitFor({ state: "hidden" });
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.externalRequests, []);
    report.checks.push("All captured surfaces have no document overflow, console errors, failed requests, or external requests");
    if (!baseline) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator("[data-open-commands]:visible").first().click();
      const search = page.locator("#command-search");
      assert.equal(await search.getAttribute("role"), "combobox");
      await page.keyboard.press("ArrowDown");
      assert.equal(await search.getAttribute("aria-activedescendant"), await page.locator('.command-result[aria-selected="true"]').getAttribute("id"));
      assert.equal(await search.evaluate(node => document.activeElement === node), true);
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".command-dialog__close").evaluate(node => document.activeElement === node), true);
      await page.keyboard.press("Shift+Tab");
      await search.fill("no synthetic match");
      assert.equal(await search.getAttribute("aria-activedescendant"), null);
      await search.fill("Long title");
      await page.keyboard.press("Enter");
      await page.locator("#note-dialog").waitFor({ state: "visible" });
      assert.match(await page.locator("#note-title").inputValue(), /^Long title/);
      assert.equal(await search.getAttribute("aria-expanded"), "false");
      report.checks.push("Quick actions announces arrow selection, keeps one input focus, skips results in Tab order, and opens the selected result with Enter");

      await page.locator("#toggle-dual-pane-btn").click();
      await page.locator("#secondary-notes-list .note-card__title").first().click();
      await page.locator('[data-secondary-editor-mode="edit"]').click();
      const secondaryId = await page.locator("#secondary-note-title-input").evaluate(async node => {
        const snapshot = await PersonalNotesStorage.getSnapshot();
        return snapshot.notes.find(note => note.title === node.value).id;
      });
      const original = await page.evaluate(id => PersonalNotesStorage.getNote(id), secondaryId);
      await page.locator("#secondary-note-title-input").fill("");
      await page.locator("#secondary-note-content-editor").fill("Synthetic Side note draft retained through validation");
      await page.waitForTimeout(1700);
      assert.equal((await page.evaluate(id => PersonalNotesStorage.getNote(id), secondaryId)).title, original.title);
      assert.equal((await page.evaluate(id => PersonalNotesStorage.getNote(id), secondaryId)).content, original.content);
      await page.locator("#secondary-save-changes-btn").click();
      await page.waitForFunction(() => document.querySelector("#secondary-note-title-error").textContent === "Enter a title.");
      await capture("side-note-validation");
      assert.equal(await page.locator("#secondary-note-title-input").getAttribute("aria-invalid"), "true");
      assert.equal(await page.locator("#secondary-note-title-error").innerText(), "Enter a title.");
      assert.equal(await page.locator("#secondary-note-title-input").evaluate(node => document.activeElement === node), true);
      await page.locator("#secondary-note-title-input").fill(original.title);
      assert.equal(await page.locator("#secondary-note-title-input").getAttribute("aria-invalid"), null);
      await page.locator("#secondary-save-changes-btn").click();
      await page.waitForFunction(() => document.querySelector("#secondary-note-save-status").classList.contains("is-saved"));
      assert.equal((await page.evaluate(id => PersonalNotesStorage.getNote(id), secondaryId)).content, "Synthetic Side note draft retained through validation");
      assert.equal(await page.locator("#secondary-note-save-status path").getAttribute("d"), await page.locator("#note-save-status path").getAttribute("d"));
      report.checks.push("An empty Side note title does not autosave; explicit save shows/focuses an inline error, retains the draft, and succeeds after correction");
      await page.locator("#secondary-note-content-editor").fill("Captured before refresh");
      await page.evaluate(() => {
        globalThis.__snapshotWaiting = false;
        globalThis.__snapshotGate = new Promise(resolve => { globalThis.__releaseSnapshot = resolve; });
      });
      await page.locator("#secondary-save-changes-btn").click();
      await page.waitForFunction(() => globalThis.__snapshotWaiting);
      await page.locator("#secondary-note-title-input").fill("Newer Side title during refresh");
      await page.locator("#secondary-note-content-editor").fill("Newer typing during refresh");
      await page.evaluate(() => { globalThis.__snapshotGate = null; globalThis.__releaseSnapshot(); });
      await page.waitForFunction(() => globalThis.__snapshotWaiting === false);
      assert.equal(await page.locator("#secondary-note-title-input").inputValue(), "Newer Side title during refresh");
      assert.equal(await page.locator("#secondary-note-content-editor").inputValue(), "Newer typing during refresh");
      await page.waitForFunction(async id => {
        const note = await PersonalNotesStorage.getNote(id);
        return note.title === "Newer Side title during refresh" && note.content === "Newer typing during refresh";
      }, secondaryId);
      report.checks.push("Typing a newer Side note title/content during delayed post-save refresh stays in the controls and autosaves afterward");
      await page.locator("#toggle-dual-pane-btn").click();
      await page.locator("#close-note-dialog-btn").click();

      await settings("types");
      await page.locator("#add-type-toggle").click();
      await page.locator("#new-type-name").fill("Repeated submit test");
      await page.evaluate(() => {
        globalThis.__managementCalls = 0;
        globalThis.__managementGate = new Promise(resolve => { globalThis.__releaseManagement = resolve; });
        const form = document.querySelector("#new-type-form");
        form.requestSubmit(); form.requestSubmit();
      });
      assert.equal(await page.evaluate(() => globalThis.__managementCalls), 1);
      assert.equal(await page.locator("#new-type-form").getAttribute("aria-busy"), "true");
      assert.equal(await page.locator('#new-type-form button[type="submit"]').isDisabled(), true);
      await capture("catalog-create-pending");
      await page.evaluate(() => { globalThis.__releaseManagement(); globalThis.__managementGate = null; });
      await page.locator("#new-type-form").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(async () => (await PersonalNotesStorage.getSnapshot()).types.filter(type => type.name === "Repeated submit test").length), 1);
      await page.locator("#tags-tab").click();
      await page.locator("#add-tag-toggle").click();
      await page.locator("#new-tag-name").fill("Retry after failure");
      await page.evaluate(() => { globalThis.__failManagement = true; });
      await page.locator('#new-tag-form button[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector("#new-tag-form").hasAttribute("aria-busy"));
      assert.equal(await page.locator("#new-tag-name").inputValue(), "Retry after failure");
      assert.equal(await page.locator('#new-tag-form button[type="submit"]').isEnabled(), true);
      await capture("catalog-create-error");
      await page.evaluate(() => { globalThis.__failManagement = false; });
      await page.locator('#new-tag-form button[type="submit"]').click();
      await page.locator("#new-tag-form").waitFor({ state: "hidden" });
      for (const kind of ["types", "tags"]) {
        const label = kind === "types" ? "Repeated submit test" : "Retry after failure";
        const renamed = kind === "types" ? "Renamed pending type" : "Renamed pending tag";
        await page.locator(`#${kind}-tab`).click();
        await page.locator(`#${kind}-list .management-row--summary`).filter({ has: page.getByRole("button", { name: `Edit ${label}`, exact: true }) }).hover();
        await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
        const form = page.locator(`#${kind}-list form.management-row`);
        await form.locator('input[type="text"]').fill(renamed);
        await page.evaluate(() => {
          globalThis.__managementCalls = 0;
          globalThis.__managementGate = new Promise(resolve => { globalThis.__releaseManagement = resolve; });
        });
        await form.locator('button[type="submit"]').click();
        await page.locator(`#${kind}-management-search`).fill(label);
        // Searching cancels the edit. Reopening the same pending entity must
        // recover its captured draft and keep its mutation controls disabled.
        await page.locator(`#${kind}-list .management-row--summary`).filter({ has: page.getByRole("button", { name: `Edit ${label}`, exact: true }) }).hover();
        await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
        assert.equal(await form.locator('input[type="text"]').inputValue(), renamed);
        assert.equal(await form.getAttribute("aria-busy"), "true");
        assert.equal(await form.locator('button[type="submit"]').isDisabled(), true);
        await capture(`${kind}-edit-pending`);
        await form.evaluate(node => node.requestSubmit());
        assert.equal(await page.evaluate(() => globalThis.__managementCalls), 1);
        await page.locator(`#${kind}-management-search`).fill("");
        const otherEdit = page.locator(`#${kind}-list .management-row--summary`).getByRole("button", { name: /^Edit / }).first();
        await otherEdit.locator("..").locator("..").hover();
        await otherEdit.click();
        await form.locator('input[type="text"]').fill(`Retained ${kind} draft`);
        await page.evaluate(() => { globalThis.__managementGate = null; globalThis.__releaseManagement(); });
        await page.waitForFunction(async ({ kind, renamed }) => (await PersonalNotesStorage.getSnapshot())[kind].some(item => item.name === renamed), { kind, renamed });
        await page.waitForFunction(() => !document.querySelector("#organize-dialog [aria-busy=true]"));
        assert.equal(await form.locator('input[type="text"]').inputValue(), `Retained ${kind} draft`);
        await form.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await page.keyboard.press("Escape");
      report.checks.push("Repeated catalog submission creates one record; a failed submission retains input and re-enables retry");
      report.checks.push("Search-rebuilt type/tag edit forms stay busy and reject repeat submission; completing an old save preserves another edit and its typed draft");

      await page.evaluate(() => localStorage.setItem("nook:theme", "eink"));
      await page.reload(); await ready();
      await page.locator(".note-card__title").filter({ hasText: "Long title" }).click();
      await page.locator('[data-note-editor-mode="edit"]').click();
      await page.keyboard.press("Tab");
      await page.locator("#note-content").focus();
      assert.equal(await page.locator("#note-content").evaluate(node => getComputedStyle(node).outlineStyle), "solid");
      await page.locator('[data-note-editor-mode="split"]').click();
      await page.keyboard.press("Tab");
      await page.locator("#note-content-preview").focus();
      assert.equal(await page.locator("#note-content-preview").evaluate(node => {
        const style = getComputedStyle(node);
        return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      }), true);
      report.checks.push("E-Ink preserves visible keyboard focus in the raw editor and Split preview");
      await page.locator("#toggle-dual-pane-btn").click();
      if (await page.locator("#secondary-picker-view").isVisible()) await page.locator("#secondary-notes-list .note-card__title").first().click();
      await page.locator('[data-secondary-editor-mode="edit"]').click();
      await page.keyboard.press("Tab"); await page.locator("#secondary-note-content-editor").focus();
      assert.equal(await page.locator("#secondary-note-content-editor").evaluate(node => getComputedStyle(node).outlineStyle), "solid");
      await page.locator('[data-secondary-editor-mode="split"]').click();
      await page.keyboard.press("Tab"); await page.locator("#secondary-split-preview").focus();
      assert.equal(await page.locator("#secondary-split-preview").evaluate(node => parseFloat(getComputedStyle(node).outlineWidth) >= 2), true);
      await page.emulateMedia({ forcedColors: "active" });
      await capture("forced-colors-paired-editor");
      await page.locator("[data-open-commands]:visible").first().click();
      await capture("forced-colors-quick-actions");
      assert.equal(await page.locator("#command-search").evaluate(node => document.activeElement === node), true);
      await page.keyboard.press("Escape");
      await page.emulateMedia({ forcedColors: "none" });
      report.checks.push("Side note keeps keyboard focus in E-Ink Edit/Split; forced-colors paired editor and Quick actions fit and retain focus");
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.externalRequests, []);
    }
    report.completed = true;
    console.log(JSON.stringify({ captures: report.captures.length, checks: report.checks, output }, null, 2));
  } finally {
    await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
