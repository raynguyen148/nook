"use strict";
// Optional isolated browser regression; requires existing Playwright and Chrome.
const fs = require("node:fs/promises"), assert = require("node:assert/strict"), http = require("node:http"), path = require("node:path"), os = require("node:os");
let server;
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
async function main() {
  const root = path.resolve(__dirname, ".."), out = process.env.NOOK_SCREENSHOT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), "nook-sidebar-scroll-"));
  await fs.mkdir(out, { recursive: true });
  server = http.createServer(async (req, res) => { try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname), file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) {
      res.writeHead(403);
      res.end();
      return;
    }
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
    const bytes = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(bytes);
  }
  catch {
    res.writeHead(404);
    res.end();
  } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true }), context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" }), page = await context.newPage();
  const checks = [], errors = [], states = [];
  const check = (s, b) => { assert.ok(b, s); checks.push(s); };
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error")
    errors.push(m.text()); });
  const ready = async () => { await page.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false" && !!document.querySelector("#nook-theme-stylesheet")?.sheet); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(100); };
  const record = () => page.evaluate(() => { const side = document.querySelector(".sidebar"), scroll = document.querySelector("#sidebar-scroll"), film = getComputedStyle(side, "::after"); return { shellScroll: side.scrollTop, shellHeight: side.clientHeight, contentHeight: side.scrollHeight, scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, filmHeight: parseFloat(film.height), filter: film.backdropFilter, overflow: document.documentElement.scrollWidth > innerWidth }; });
  try {
    await page.goto(origin);
    await ready();
    const demo = JSON.parse(await fs.readFile(root + "/docs/sample-data/nook-demo-library.json", "utf8"));
    const tag = demo.data.tags[0];
    for (let i = 0; i < 40; i++)
      demo.data.tags.push({ ...tag, id: `tag-scroll-${i}`, name: `Example long tag ${i}`, normalizedName: `example long tag ${i}` });
    await page.evaluate(async (d) => { await PersonalNotesStorage.importBackup(d); localStorage.setItem("nook:onboarding-dismissed", "1"); localStorage.setItem("nook:glass", JSON.stringify({ enabled: true, transparency: 40 })); }, demo);
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(t => localStorage.setItem("nook:theme", t), theme);
      await page.reload();
      await ready();
      await page.locator("#tag-filter-toggle").click();
      await ready();
      const top = await record();
      // The film extends 1px over each border while the shell stays non-scrolling.
      check(`${theme}: stationary shell covers full viewport pane`, top.shellScroll === 0 && top.contentHeight <= top.shellHeight + 1 && Math.abs(top.filmHeight - top.shellHeight) <= 2 && top.filter === "blur(20px) saturate(1.25)");
      await page.screenshot({ path: `${out}/${theme}-top.png` });
      const blank = async () => { const hidden = await page.addStyleTag({ content: "#sidebar-scroll,#sidebar-scroll *{visibility:hidden!important}" }); const r = await page.locator(".sidebar").boundingBox(); const image = await page.screenshot({ clip: { x: r.x + 2, y: r.y + 2, width: r.width - 20, height: r.height - 4 } }); await hidden.evaluate(el => el.remove()); return image; };
      const first = await blank();
      await page.locator("#sidebar-scroll").evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(100);
      const bottom = await record();
      states.push({ theme, top, bottom });
      check(`${theme}: only content scrolls, full-height film stays fixed`, bottom.scrollTop > 0 && bottom.shellScroll === 0 && bottom.contentHeight <= bottom.shellHeight + 1 && bottom.filmHeight === top.filmHeight && !bottom.overflow);
      const last = await blank();
      await fs.writeFile(`${out}/${theme}-blank-top.png`, first);
      await fs.writeFile(`${out}/${theme}-blank-bottom.png`, last);
      const raster = await page.evaluate(async ({ a, b }) => { const pixels = async (data) => { const im = new Image(); im.src = "data:image/png;base64," + data; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; }; const one = await pixels(a), two = await pixels(b); let changed = 0, max = 0; for (let i = 0; i < one.length; i += 4) {
        const delta = Math.max(...[0, 1, 2].map(n => Math.abs(one[i + n] - two[i + n])));
        if (delta > 2)
          changed++;
        max = Math.max(max, delta);
      } return { changedFraction: changed / (one.length / 4), max }; }, { a: first.toString("base64"), b: last.toString("base64") });
      states[states.length - 1].raster = raster;
      check(`${theme}: background raster unchanged after scrolling`, raster.changedFraction < .001);
      await page.screenshot({ path: `${out}/${theme}-bottom.png` });
      const label = page.locator(".tag-filter-option").last(), was = await label.locator("input").isChecked();
      await label.click();
      check(`${theme}: last tag works`, (await label.locator("input").isChecked()) !== was);
      await page.locator("#tag-filter-toggle").click();
      await ready();
      check(`${theme}: Show less resets content scroll`, (await record()).scrollTop === 0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator("#sidebar-toggle-btn").click();
      const horizontalModes = await page.evaluate(() => new Promise(resolve => {
        const modes = [], start = performance.now();
        function sample() {
          modes.push(getComputedStyle(document.querySelector("#sidebar-scroll")).overflowX);
          if (performance.now() - start < 600) requestAnimationFrame(sample);
          else resolve(modes);
        }
        requestAnimationFrame(sample);
      }));
      check(`${theme}: collapse motion keeps horizontal scrolling disabled`, horizontalModes.every(mode => mode === "hidden"));
      await ready();
      check(`${theme}: collapse keeps header usable`, await page.locator("#sidebar-toggle-btn").isVisible());
      check(`${theme}: collapsed glass shell does not create a second scroll container`,
        await page.locator(".sidebar").evaluate(el => getComputedStyle(el).overflowY === "visible"));
      const collapsedScroll = await page.locator("#sidebar-scroll").evaluate(el => getComputedStyle(el).overflowX);
      check(`${theme}: collapsed navigation never shows a horizontal scrollbar`,
        collapsedScroll === "hidden");
      await page.screenshot({ path: `${out}/${theme}-collapsed.png` });
      await page.locator("#sidebar-toggle-btn").click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready();
      for (const width of [320, 375, 820]) {
        await page.setViewportSize({ width, height: 812 });
        await ready();
        check(`${theme}: glass library fits ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (width === 375) await page.screenshot({ path: `${out}/${theme}-mobile-library.png` });
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await ready();
    await page.locator("#mobile-open-filters").click();
    check("mobile filter sheet remains usable", await page.locator("#mobile-filter-dialog").evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.locator("#mobile-filters-done").click();

    // Exercise the shared material on reading, overlays and small touch layouts.
    for (const theme of ["light", "midnight"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(t => {
        localStorage.setItem("nook:theme", t);
        localStorage.removeItem("nook:active-filters");
        localStorage.setItem("nook:sidebar-collapsed", "false");
      }, theme);
      await page.reload();
      await ready();
      await page.screenshot({ path: `${out}/${theme}-glass-library.png` });
      check(`${theme}: fixed menu ancestors remain unfiltered`, await page.locator(".topbar").evaluate(el => getComputedStyle(el).backdropFilter === "none"));
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(350);
      check(`${theme}: pinned search remains above the library`, await page.locator("#search-input").evaluate(el => {
        const rect = el.getBoundingClientRect();
        return el === document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      }));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(350);
      await page.locator("#organize-btn").click();
      await page.locator("#display-tab").click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${theme}-glass-settings.png` });
      check(`${theme}: settings is a native modal with a separate film`, await page.locator("#organize-dialog").evaluate(el => el.matches(":modal") && getComputedStyle(el, "::before").backdropFilter.includes("blur(24px)")));
      await page.keyboard.press("Escape");
      check(`${theme}: settings restores keyboard focus`, await page.locator("#organize-btn").evaluate(el => el === document.activeElement));
      await page.getByRole("button", { name: /^Open note:/ }).first().click();
      for (const mode of ["preview", "edit", "split"]) {
        await page.locator(`[data-note-editor-mode="${mode}"]`).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${theme}-glass-${mode}.png` });
        check(`${theme}: ${mode} fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.locator("#note-quick-actions-btn").click();
      check(`${theme}: Quick actions opens above the glass editor`, await page.locator("#command-dialog").evaluate(el => el.matches(":modal")));
      await page.keyboard.press("Escape");
      await page.locator("#close-note-dialog-btn").click();
      for (const width of [320, 375, 414, 768]) {
        await page.setViewportSize({ width, height: 812 });
        await ready();
        await page.screenshot({ path: `${out}/${theme}-glass-mobile-${width}.png` });
        check(`${theme}: mobile ${width}px has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const transparency of [10, 50]) {
        await page.evaluate(value => {
          localStorage.setItem("nook:glass", JSON.stringify({ enabled: true, transparency: value }));
          localStorage.setItem("nook:background-style", "nature");
        }, transparency);
        await page.reload();
        await ready();
        await page.screenshot({ path: `${out}/${theme}-glass-nature-${transparency}.png` });
        check(`${theme}: nature at ${transparency}% stays within viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.evaluate(() => {
        localStorage.setItem("nook:background-style", "ambient");
        localStorage.setItem("nook:glass", JSON.stringify({ enabled: true, transparency: 40 }));
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => localStorage.setItem("nook:glass", JSON.stringify({ enabled: false, transparency: 40 })));
    await page.reload();
    await ready();
    check("glass off preserves original scroll/layout owner", await page.locator("#sidebar-scroll").evaluate(el => getComputedStyle(el).display === "contents"));
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    await page.evaluate(() => localStorage.setItem("nook:glass", JSON.stringify({ enabled: true, transparency: 40 })));
    await page.reload();
    await ready();
    check("reduced transparency preserves original layout", await page.locator("#sidebar-scroll").evaluate(el => getComputedStyle(el).display === "contents"));
    await page.emulateMedia({ forcedColors: "active" });
    check("forced colors removes decorative glass filters", await page.locator(".sidebar").evaluate(el => getComputedStyle(el, "::after").backdropFilter === "none"));
    check("no console/runtime errors", errors.length === 0);
  }
  finally {
    await fs.writeFile(out + "/results.json", JSON.stringify({ checks, errors, states }, null, 2));
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    console.log(JSON.stringify({ checks: checks.length, errors, screenshots: out }));
  }
}
main().catch(e => { console.error(e); server?.close(); process.exitCode = 1; });
