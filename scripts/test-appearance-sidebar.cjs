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
      check(`${theme}: stationary shell covers full viewport pane`, top.shellScroll === 0 && top.contentHeight === top.shellHeight && Math.abs(top.filmHeight - top.shellHeight) < 2 && top.filter === "blur(12px)");
      await page.screenshot({ path: `${out}/${theme}-top.png` });
      const blank = async () => { const hidden = await page.addStyleTag({ content: "#sidebar-scroll,#sidebar-scroll *{visibility:hidden!important}" }); const r = await page.locator(".sidebar").boundingBox(); const image = await page.screenshot({ clip: { x: r.x + 2, y: r.y + 2, width: r.width - 20, height: r.height - 4 } }); await hidden.evaluate(el => el.remove()); return image; };
      const first = await blank();
      await page.locator("#sidebar-scroll").evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(100);
      const bottom = await record();
      states.push({ theme, top, bottom });
      check(`${theme}: only content scrolls, full-height film stays fixed`, bottom.scrollTop > 0 && bottom.shellScroll === 0 && bottom.contentHeight === bottom.shellHeight && bottom.filmHeight === top.filmHeight && !bottom.overflow);
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
      await page.locator("#sidebar-toggle-btn").click();
      await ready();
      check(`${theme}: collapse keeps header usable`, await page.locator("#sidebar-toggle-btn").isVisible());
      await page.locator("#sidebar-toggle-btn").click();
      await ready();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await ready();
    await page.locator("#mobile-open-filters").click();
    check("mobile filter sheet remains usable", await page.locator("#mobile-filter-dialog").evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.locator("#mobile-filters-done").click();
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
