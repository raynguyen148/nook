"use strict";

// Real IndexedDB and rendered UI with synthetic files in isolated profiles.
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
      if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some((part) => part.startsWith("."))) throw new Error();
      const content = await fs.readFile(file);
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const passed = [], errors = [], external = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.NOOK_BROWSER_CHANNEL ? { channel: process.env.NOOK_BROWSER_CHANNEL } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.route(/^https?:/, (route) => {
      if (route.request().url().startsWith(origin + "/")) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      const define = Object.defineProperty;
      Object.defineProperty = (target, key, descriptor) => {
        if (target === globalThis && key === Symbol.for("nook.app.modules") && descriptor.value?.register) {
          const registry = descriptor.value;
          descriptor = { ...descriptor, value: Object.freeze({ register(name, install) {
            registry.register(name, (app) => {
              globalThis.__qaApp = app;
              if (name === "attachments") {
                const original = app.storage;
                app.storage = { ...original,
                  async validateAttachment(file) {
                    if (globalThis.__holdImage) await new Promise((resolve) => { globalThis.__releaseImage = resolve; });
                    return original.validateAttachment(file);
                  },
                  async addAttachment(file) {
                    if (globalThis.__failImage) throw new Error("Not enough browser storage. Free some space and try again.");
                    return original.addAttachment(file);
                  },
                };
              }
              install(app);
            });
          } }) };
        }
        return define(target, key, descriptor);
      };
    });
    const page = await context.newPage();
    const observe = (target) => {
      target.on("pageerror", (error) => errors.push(error.message));
      target.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    };
    observe(page);
    const ready = (target = page) => target.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
    await page.goto(origin); await ready();

    const storageResult = await page.evaluate(async () => {
      const s = PersonalNotesStorage, checks = [];
      const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
      const rejects = async (action, label) => { let rejected = false; try { await action(); } catch { rejected = true; } check(rejected, label); };
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 320;
      canvas.getContext("2d").fillRect(0, 0, 640, 320);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const file = new File([png], "Example [image].png", { type: "image/png" });
      const image = await s.addAttachment(file);
      check((await s.addAttachment(file)).id === image.id, "Identical pasted images share binary storage");
      const data = `![Example](nook-asset:${image.id})`;
      const note = await s.saveNote({ title: "Image note", content: data, typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      await s.saveNote({ ...note, content: "Image removed", expectedRevision: note.revision });
      const exported = await s.buildExport();
      check(exported.schemaVersion === 4 && exported.data.attachments.length === 1, "Full backup includes images referenced only by history");
      check(s.inspectBackup(exported).counts.attachments === 1, "v4 image backup validates");
      await s.importBackup(exported);
      check((await s.getAttachment(image.id)).size === png.size, "Backup replace preserves image bytes and history");
      const selected = await s.buildExport({ noteIds: [note.id] });
      check(selected.data.attachments.length === 1, "Selection backup includes historical images");
      const preview = await s.inspectBackupMerge(exported);
      check(preview.counts.identical === 1, "Reimporting an image backup is idempotent");
      await s.mergeBackup(exported, { expectedMutationId: preview.mutationId });
      const changed = structuredClone(exported);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="teal"/></svg>';
      changed.data.attachments[0].mimeType = "image/svg+xml";
      changed.data.attachments[0].data = btoa(svg);
      changed.data.notes[0].content = data;
      const plan = await s.inspectBackupMerge(changed);
      await s.mergeBackup(changed, { expectedMutationId: plan.mutationId });
      const merged = await s.getSnapshot({ includeHistory: true, includeAttachments: true });
      const copy = merged.notes.find((item) => item.id !== note.id);
      check(copy && !copy.content.includes(image.id), "Merge remaps colliding image IDs in imported notes");
      check(merged.noteVersions.filter((item) => item.noteId === copy.id).every((item) => !item.content.includes(image.id)), "Merge remaps colliding image IDs in history");
      check((await s.getAttachment(image.id)).type === "image/png", "Merge keeps original image bytes intact");
      const invalid = structuredClone(exported); invalid.data.attachments[0].data = btoa("<script>bad</script>");
      await rejects(() => s.importBackup(invalid), "Invalid image backup rejects atomically");
      check((await s.getSnapshot()).notes.length === merged.notes.length, "Failed image import keeps the library intact");
      const absent = structuredClone(exported); absent.data.attachments = [];
      await rejects(() => s.importBackup(absent), "Backup with missing historical image rejects");
      for (const version of [1, 2, 3]) {
        const older = structuredClone(exported); older.schemaVersion = version;
        older.data.notes.forEach((item) => { item.content = "Legacy note"; });
        older.data.noteVersions.forEach((item) => { item.content = "Legacy history"; });
        delete older.data.attachments;
        check(s.inspectBackup(older).counts.attachments === 0, `Schema v${version} backup remains readable`);
      }
      for (const type of ["image/jpeg", "image/webp"]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
        const record = await s.addAttachment(new File([blob], "image", { type }));
        check((await s.getAttachment(record.id)).type === type, `${type} image stores natively`);
      }
      const gif = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="), (c) => c.charCodeAt(0));
      check((await s.getAttachment((await s.addAttachment(new File([gif], "small.gif"))).id)).type === "image/gif", "GIF images supported");
      const vector = await s.addAttachment(new File([svg], "diagram.svg", { type: "image/svg+xml" }));
      check((await s.getAttachment(vector.id)).type === "image/svg+xml", "Static SVG supported without rasterizing");
      const unsafe = ['<script>alert(1)</script>', '<foreignObject><div>HTML</div></foreignObject>', '<use href="https://example.test/a.svg#x"/>', '<path onclick="alert(1)"/>', '<style>@import "https://example.test/a.css";</style>', '<style>path{fill:url(https://example.test/a.svg)}</style>', '<style>path{fill:u\\72l(https://example.test/a.svg)}</style>', '<image href="data:image/svg+xml,bad"/>'];
      for (const content of unsafe) await rejects(() => s.addAttachment(new File([`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`], "unsafe.svg")), "Unsafe SVG rejects: " + content.split(/[ >]/)[0]);
      await rejects(() => s.addAttachment(new File(['<!DOCTYPE svg [<!ENTITY x "bad">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'], "entity.svg")), "SVG entities reject");
      await rejects(() => s.addAttachment(new File(["not an image"], "fake.png", { type: "image/png" })), "Fake raster MIME rejects");
      await rejects(() => s.addAttachment(new File([new Uint8Array(s.MAX_IMAGE_BYTES + 1)], "large.png")), "Oversized image rejects");

      // Advance only image leases in this isolated fixture, without changing the clock.
      async function expireLeases() {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("personal-notes"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => {
          const tx = db.transaction("attachments", "readwrite"), store = tx.objectStore("attachments");
          const request = store.openCursor(); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.update({ ...cursor.value, protectedUntil: 0 }); cursor.continue(); } };
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        }); db.close();
      }
      await expireLeases();
      let cleanup = await s.inspectUnusedAttachments();
      check(!cleanup.candidates.includes(image.id), "Cleanup protects history-only images");
      const key = "nook:editor-draft:v2:closed:primary:test";
      localStorage.setItem(key, JSON.stringify({ draft: { content: `![draft](nook-asset:${vector.id})` } }));
      cleanup = await s.inspectUnusedAttachments();
      check(!cleanup.candidates.includes(vector.id), "Cleanup protects closed-tab recovery images");
      localStorage.removeItem(key);
      cleanup = await s.inspectUnusedAttachments();
      check(cleanup.candidates.includes(vector.id), "Unused image becomes a cleanup candidate");
      localStorage.setItem(key, JSON.stringify({ draft: { content: `![new](nook-asset:${vector.id})` } }));
      await s.inspectUnusedAttachments({ candidates: cleanup.candidates, remove: true });
      check(await s.getAttachment(vector.id), "Cleanup rechecks new recovery references after preview");
      localStorage.removeItem(key);
      localStorage.setItem(key, "invalid JSON");
      await rejects(() => s.inspectUnusedAttachments({ candidates: [vector.id], remove: true }), "Unreadable recovery prevents image deletion");
      localStorage.removeItem(key);
      const quotaRecovery = __qaApp.api.createDraftRecoveryStore({ tabId: "quota-test", storage: {
        getItem: () => null, setItem() { throw new Error("quota"); }, removeItem() {}, key: () => null, length: 0,
      } });
      const quotaIdentity = { pane: "primary", sessionId: "image-draft" };
      check(quotaRecovery.write(quotaIdentity, { id: "", title: "Draft", typeId: s.FALLBACK_TYPE_ID, tagIds: [], content: `![quota](nook-asset:${vector.id})` }) === false, "Recovery write failure remains visible to callers");
      cleanup = await s.inspectUnusedAttachments();
      check(!cleanup.candidates.includes(vector.id), "IndexedDB draft pin protects image when localStorage writes fail");
      quotaRecovery.remove(quotaIdentity);
      cleanup = await s.inspectUnusedAttachments();
      check(cleanup.candidates.includes(vector.id), "Explicit draft discard releases its binary protection");
      await s.deleteNote(note.id);
      cleanup = await s.inspectUnusedAttachments();
      check(!cleanup.candidates.includes(image.id), "Cleanup protects images in Trash");
      await s.permanentlyDeleteNote(note.id);
      cleanup = await s.inspectUnusedAttachments();
      check(cleanup.candidates.includes(image.id), "Deleting note and history releases images for cleanup");
      await s.inspectUnusedAttachments({ candidates: [image.id], remove: true });
      check(!(await s.getAttachment(image.id)), "Confirmed cleanup removes unused binary data");
      const stats = await s.inspectUnusedAttachments();
      const snapshot = await s.getSnapshot({ includeAttachments: true });
      check(stats.count === snapshot.attachments.length, "Cleanup updates image storage totals");
      await s.saveNote({ title: "Source-only import", content: "![missing](nook-asset:absent-image)", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      const partial = await s.buildExport();
      check(partial.data.missingAttachments.includes("absent-image"), "Missing image references do not prevent library backup");
      await s.importBackup(partial);
      check((await s.getSnapshot()).notes.some((item) => item.content.includes("nook-asset:absent-image")), "Backup preserves explicit unavailable-image references and Markdown source");
      await s.resetLibrary();
      check((await s.getSnapshot({ includeAttachments: true })).attachments.length === 0, "Delete all data clears images");
      // Establish a library with 45 MiB of old, committed images (no paste
      // leases), then replace it with a smaller valid backup near the budget.
      const capacityNote = await s.saveNote({ title: "Capacity fixture", content: "", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      const largeSvg = (index) => '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!--' + index + "x".repeat(9 * 1024 * 1024 - 160) + '--><rect width="10" height="10"/></svg>';
      const oldImages = Array.from({ length: 5 }, (_, index) => ({ id: `capacity-old-${index}`, name: "old.svg", mimeType: "image/svg+xml", data: btoa(largeSvg(index)) }));
      const oldSource = oldImages.map((item) => `![old](nook-asset:${item.id})`).join("\n");
      const oldBackup = { format: "personal-notes-backup", schemaVersion: 4, data: {
        noteTypes: (await s.getSnapshot()).types, tags: [], notes: [{ ...capacityNote, content: oldSource }], noteVersions: [], attachments: oldImages,
      } };
      await s.importBackup(oldBackup);
      const smallBackup = { ...oldBackup, data: { ...oldBackup.data,
        notes: [{ ...capacityNote, title: "Replacement fixture", content: "![new](nook-asset:capacity-new)" }],
        attachments: [{ id: "capacity-new", name: "new.svg", mimeType: "image/svg+xml", data: btoa(largeSvg(9)) }],
      } };
      const capacityKey = "nook:editor-draft:v2:capacity:primary:fixture";
      localStorage.setItem(capacityKey, JSON.stringify({ draft: { content: oldSource } }));
      await rejects(() => s.importBackup(smallBackup), "Replacement rejects a budget exceeded by protected draft images");
      check((await s.getNote(capacityNote.id)).content === oldSource && (await s.inspectUnusedAttachments()).count === 5, "Over-budget replacement leaves notes and images intact");
      localStorage.setItem(capacityKey, JSON.stringify({ draft: { content: "![draft](nook-asset:capacity-old-0)" } }));
      const pinKey = "nook:editor-draft:v2:capacity:secondary:pin";
      const pinAt = new Date().toISOString();
      await s.protectDraftAttachments(pinKey, ["![pinned](nook-asset:capacity-old-1)"], pinAt);
      await s.importBackup(smallBackup);
      check((await s.getNote(capacityNote.id)).title === "Replacement fixture", "A 9 MiB backup replaces a near-full image library");
      check((await s.getAttachment("capacity-old-0")) && (await s.getAttachment("capacity-old-1")), "Replacement keeps localStorage recovery images and IndexedDB pins");
      check(!(await s.getAttachment("capacity-old-2")) && (await s.inspectUnusedAttachments()).count === 3, "Replacement removes obsolete images in the same transaction");
      localStorage.removeItem(capacityKey);
      await s.protectDraftAttachments(pinKey, [], pinAt);
      await s.importBackup(smallBackup);
      check((await s.inspectUnusedAttachments()).count === 1, "Replacing again reclaims released recovery images");
      await s.resetLibrary();
      const primary = await s.saveNote({ title: "Primary image test", content: "Before\n\nAfter", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      const secondary = await s.saveNote({ title: "Side image test", content: "Side", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      globalThis.__imageFile = file;
      globalThis.__svgFile = new File([svg], "diagram.svg", { type: "image/svg+xml" });
      return { checks, primary, secondary };
    });
    passed.push(...storageResult.checks);
    await page.evaluate(async ({ primary }) => { await __qaApp.api.refreshLibrary(); __qaApp.api.openNoteEditor(primary, { initialMode: "split" }); }, storageResult);
    await page.locator("#note-content").waitFor({ state: "visible" });
    async function paste(target, kind = "png") {
      await page.evaluate(({ target, kind }) => {
        const transfer = new DataTransfer();
        transfer.items.add(kind === "svg" ? __svgFile : kind === "bad" ? new File(["bad file"], "fake.png", { type: "image/png" }) : __imageFile);
        document.querySelector(target).dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
      }, { target, kind });
    }
    await page.locator("#note-content").evaluate((textarea) => { textarea.setSelectionRange(7, 7); });
    await page.evaluate(() => { __holdImage = true; });
    await paste("#note-content");
    await page.locator("#image-upload-status:not(.is-hidden)").waitFor();
    assert.equal(await page.locator("#image-upload-status .skeleton").isVisible(), true);
    assert.equal(await page.locator("#insert-image-btn").isDisabled(), true);
    await page.locator("#note-content").press("End"); await page.locator("#note-content").press("X");
    const beforeImagePaste = await page.locator("#note-content").inputValue();
    await page.evaluate(() => { __holdImage = false; __releaseImage(); });
    await page.waitForFunction(() => document.querySelector("#note-content").value.includes("nook-asset:"));
    assert.ok((await page.locator("#note-content").inputValue()).includes("X"));
    await page.waitForFunction(() => document.querySelector("#note-content-preview img")?.naturalWidth > 0);
    assert.equal(await page.locator("#image-upload-status").isHidden(), true);
    passed.push("Pasting shows skeleton/busy state and preserves typing during image processing");
    const afterImagePaste = await page.locator("#note-content").inputValue();
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
    await page.keyboard.press(`${modifier}+z`);
    assert.equal(await page.locator("#note-content").inputValue(), beforeImagePaste);
    await page.keyboard.press(`${modifier}+Shift+z`);
    assert.equal(await page.locator("#note-content").inputValue(), afterImagePaste);
    await page.waitForFunction(() => document.querySelector("#note-content-preview .image-resize-handle"));
    passed.push("Primary image paste supports native Undo and Redo without removing earlier typing");
    await page.locator("#note-content").evaluate((textarea) => { textarea.focus(); textarea.setSelectionRange(0, 6); });
    await page.keyboard.press(`${modifier}+b`);
    assert.ok((await page.locator("#note-content").inputValue()).startsWith("**Before**"));
    await page.keyboard.press(`${modifier}+z`);
    assert.equal(await page.locator("#note-content").inputValue(), afterImagePaste);
    passed.push("Shared formatting retains native Undo after image insertion");
    await page.locator("#note-content-preview .image-resize-handle").focus();
    await page.locator("#note-content-preview .image-resize-handle").press("ArrowLeft");
    await page.waitForFunction(() => /width=\d+/.test(document.querySelector("#note-content").value));
    await page.waitForFunction(() => document.activeElement.classList.contains("image-resize-handle"));
    passed.push("Keyboard image resize persists width in Markdown");
    await page.evaluate(() => __qaApp.api.setNoteEditorMode("preview"));
    await page.waitForFunction(() => document.querySelector("#quick-view-content img")?.naturalWidth > 0);
    const handle = page.locator("#quick-view-content .image-resize-handle");
    await page.locator("#quick-view-content").focus();
    const sourceBeforeDrag = await page.locator("#note-content").inputValue();
    const widthBeforeDrag = await page.locator("#quick-view-content img").evaluate((image) => image.getBoundingClientRect().width);
    await handle.hover(); const cancelBox = await handle.boundingBox();
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2); await page.mouse.down();
    await page.mouse.move(cancelBox.x - 60, cancelBox.y + cancelBox.height / 2);
    await page.keyboard.press("Escape"); await page.mouse.up();
    assert.equal(await page.locator("#note-detail-workspace").isVisible(), true);
    assert.equal(await page.locator("#note-content").inputValue(), sourceBeforeDrag);
    assert.equal(await page.locator("#quick-view-content img").evaluate((image) => image.getBoundingClientRect().width), widthBeforeDrag);
    passed.push("Escape cancels pointer resize, restores width, and keeps the note open");
    await handle.hover(); const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + box.height / 2); await page.mouse.up();
    await page.waitForFunction(() => Number(/width=(\d+)/.exec(document.querySelector("#note-content").value)?.[1]) < 500);
    await page.evaluate(() => __qaApp.api.saveNote(null, { closeAfterSave: false }));
    const saved = await page.evaluate(() => PersonalNotesStorage.getNote(__qaApp.shared.primaryEditorSession.noteId));
    assert.match(saved.content, /width=\d+/);
    passed.push("Pointer resize works in Preview and saves without changing original image bytes");
    await page.evaluate(() => __qaApp.api.setNoteEditorMode("edit"));
    await paste("#note-content", "bad");
    await page.locator("#image-upload-status.is-error").waitFor();
    assert.equal(await page.locator("#image-upload-status .skeleton").isVisible(), false);
    assert.equal(await page.locator("#insert-image-btn").isEnabled(), true);
    await page.locator("#image-upload-status button").click();
    await page.evaluate(() => { __failImage = true; });
    await paste("#note-content"); await page.locator("#image-upload-status.is-error").waitFor();
    assert.match(await page.locator("#image-upload-status").innerText(), /storage/);
    await page.evaluate(() => { __failImage = false; });
    await page.locator("#note-content").evaluate((textarea) => textarea.setSelectionRange(textarea.value.length, textarea.value.length));
    await paste("#note-content", "svg");
    await page.waitForFunction(() => document.querySelector("#image-upload-status").classList.contains("is-hidden"));
    await page.evaluate(() => __qaApp.api.setNoteEditorMode("split"));
    await page.waitForFunction(() => document.querySelectorAll("#note-content-preview img").length === 2 && [...document.querySelectorAll("#note-content-preview img")].every((image) => image.naturalWidth > 0));
    passed.push("Invalid files and storage failure show recoverable error states; SVG retry succeeds");
    await page.evaluate(async ({ secondary }) => { await __qaApp.api.openDualPane(); __qaApp.api.openSecondaryNote(secondary, "split"); }, storageResult);
    const sideBeforeImage = await page.locator("#secondary-note-content-editor").inputValue();
    await paste("#secondary-note-content-editor", "svg");
    await page.waitForFunction(() => document.querySelector("#secondary-split-preview img")?.naturalWidth > 0);
    const sideAfterImage = await page.locator("#secondary-note-content-editor").inputValue();
    await page.keyboard.press(`${modifier}+z`);
    assert.equal(await page.locator("#secondary-note-content-editor").inputValue(), sideBeforeImage);
    await page.keyboard.press(`${modifier}+Shift+z`);
    assert.equal(await page.locator("#secondary-note-content-editor").inputValue(), sideAfterImage);
    await page.waitForFunction(() => document.querySelector("#secondary-split-preview .image-resize-handle"));
    passed.push("Side-note image paste supports native Undo and Redo");
    await page.locator("#secondary-split-preview .image-resize-handle").focus();
    await page.locator("#secondary-split-preview .image-resize-handle").press("ArrowLeft");
    await page.waitForFunction(() => /width=/.test(document.querySelector("#secondary-note-content-editor").value));
    passed.push("Side note supports image paste, preview, and keyboard resize");
    await page.evaluate(async () => { await __qaApp.api.saveSecondaryNote(); await __qaApp.api.saveNote(null, { closeAfterSave: false }); });
    await page.reload(); await ready();
    const reopened = await page.evaluate(async ({ primary }) => { const note = await PersonalNotesStorage.getNote(primary.id); __qaApp.api.openNoteEditor(note, { initialMode: "preview" }); return note; }, storageResult);
    assert.match(reopened.content, /width=\d+/);
    await page.waitForFunction(() => document.querySelector("#quick-view-content img")?.naturalWidth > 0);
    passed.push("Saved images and resize survive app reload");
    if (process.env.NOOK_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true });
      await page.locator("#quick-view-content .image-resize-handle").first().hover();
      await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "images-desktop.png") });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#quick-view-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
    passed.push("Mobile preview fits images within the reading area");
    if (process.env.NOOK_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "images-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (process.env.NOOK_SCREENSHOT_DIR) { await fs.mkdir(process.env.NOOK_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.NOOK_SCREENSHOT_DIR, "images-desktop.png") }); }
    await page.evaluate(() => __qaApp.api.openOrganize("data"));
    await page.locator("#review-unused-images-btn").click();
    await page.waitForFunction(() => !document.querySelector("#review-unused-images-btn").disabled);
    assert.match(await page.locator("#image-storage-status").innerText(), /images/);
    passed.push("Settings reviews image storage without deleting referenced images");
    await page.evaluate(() => __qaApp.api.closeOrganize());
    await page.evaluate(() => __qaApp.api.openNoteEditor());
    await page.locator("#note-title").fill("New image draft");
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 80;
      canvas.getContext("2d").fillRect(0, 0, 100, 80);
      __imageFile = new File([await new Promise((resolve) => canvas.toBlob(resolve))], "new-note.png", { type: "image/png" });
    });
    await paste("#note-content");
    await page.waitForFunction(() => document.querySelector("#note-content").value.includes("nook-asset:"));
    const draftContent = await page.locator("#note-content").inputValue();
    await page.reload(); await ready();
    await page.evaluate(() => {
      const record = __qaApp.api.createDraftRecoveryStore().enumerate().find((item) => item.draft.title === "New image draft");
      if (!record) throw new Error("New-note image draft was not recoverable");
      __qaApp.api.restoreStoredNoteDraft(record);
      __qaApp.api.setNoteEditorMode("preview");
    });
    await page.waitForFunction(() => document.querySelector("#quick-view-content img")?.naturalWidth > 0);
    assert.equal(await page.locator("#note-content").inputValue(), draftContent);
    passed.push("Unsaved new-note image survives reload and explicit draft recovery");
    await page.evaluate(async () => {
      await __qaApp.api.saveNote(null, { closeAfterSave: false });
      const image = await PersonalNotesStorage.addAttachment(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="teal"/></svg>'], "focus.svg"));
      const note = await PersonalNotesStorage.saveNote({ title: "Missing-image focus", typeId: PersonalNotesStorage.FALLBACK_TYPE_ID,
        tagIds: [], content: `![Missing](nook-asset:missing-image)\n\n![Valid](nook-asset:${image.id})` });
      await __qaApp.api.refreshLibrary(); __qaApp.api.openNoteEditor(note, { initialMode: "split" });
    });
    const missingHandle = page.locator("#note-content-preview .image-resize-handle");
    await missingHandle.waitFor(); await missingHandle.focus(); await missingHandle.press("ArrowLeft");
    await page.waitForFunction(() => document.activeElement.classList.contains("image-resize-handle"));
    await missingHandle.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement.classList.contains("image-resize-handle"));
    passed.push("Repeated keyboard resize retains focus with a preceding missing image");

    const filePage = await context.newPage(); observe(filePage);
    await filePage.goto(`file://${path.join(root, "index.html")}`); await ready(filePage);
    await filePage.evaluate(async () => {
      const vector = await PersonalNotesStorage.addAttachment(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="teal"/></svg>'], "file-mode.svg"));
      const note = await PersonalNotesStorage.saveNote({ title: "File mode image", content: `![Local](nook-asset:${vector.id})`, typeId: PersonalNotesStorage.FALLBACK_TYPE_ID, tagIds: [] });
      await __qaApp.api.refreshLibrary(); __qaApp.api.openNoteEditor(note, { initialMode: "preview" });
    });
    await filePage.waitForFunction(() => document.querySelector("#quick-view-content img")?.naturalWidth === 160);
    passed.push("Static file mode displays local SVG images without a server");
    await filePage.close();

    for (const scenario of ["v1", "v2", "v3", "save", "bytes", "backup"]) {
      const isolated = await browser.newContext();
      const harness = await isolated.newPage(); observe(harness);
      await harness.goto(`${origin}/tests/browser/storage-harness.html?scenario=${scenario}`);
      await harness.waitForFunction(() => document.querySelector("#status").className);
      assert.equal(await harness.locator("#status").getAttribute("class"), "pass", await harness.locator("#results").innerText());
      passed.push(`Real IndexedDB harness: ${scenario}`);
      await isolated.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ passed, consoleErrors: errors, externalRequests: external }, null, 2));
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
