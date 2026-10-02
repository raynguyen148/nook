"use strict";

// Optional browser QA: provide Playwright locally; it is not an app dependency.
// Every scenario runs against synthetic data in an isolated browser context.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.NOOK_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };

async function main() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(root + path.sep) || pathname.split("/").some((part) => part.startsWith("."))) {
        response.writeHead(403); response.end(); return;
      }
      const content = await fs.readFile(file);
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  const passed = [];
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    function observe(target) {
      target.on("pageerror", (error) => errors.push(error.message));
      target.on("console", (message) => { if (message.type() === "error") errors.push({ message: message.text(), location: message.location() }); });
      target.on("requestfailed", (request) => errors.push({ request: request.url(), failure: request.failure() }));
    }
    observe(page);
    async function ready(target = page) {
      await target.waitForFunction(() => document.querySelector(".app-shell")?.getAttribute("aria-busy") === "false");
    }
    async function reload() { await page.reload(); await ready(); }
    async function commands(query, title, target = page) {
      const mac = await target.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform));
      await target.keyboard.press(`${mac ? "Meta" : "Control"}+Shift+P`);
      await target.locator("#command-search").fill(query);
      await target.locator("#command-results .command-result").filter({ has: target.locator("span", { hasText: title }) }).first().click();
    }
    await page.goto(origin);
    await ready();

    const storageChecks = await page.evaluate(async () => {
      const s = PersonalNotesStorage;
      const checks = [];
      const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
      async function rejected(action, label) { let failed = false; try { await action(); } catch { failed = true; } check(failed, label); }
      const original = await s.saveNote({ title: "Existing", content: "original", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      const sources = [{ name: "Alpha.md", content: "  # Alpha\n\n**raw**  \n" }, { name: "Beta.markdown", content: "<script>alert(1)</script>\n" }];
      const imported = await s.importMarkdownFiles(sources);
      check(imported.length === 2 && imported[0].title === "Alpha" && imported[0].content === sources[0].content, "Markdown multiple-file raw-source import");
      let before = (await s.getSnapshot()).notes.length;
      await rejected(() => s.importMarkdownFiles([{ name: "Good.md", content: "ok" }, { name: "Bad.md", content: "x".repeat(50001) }]), "Invalid Markdown batch rejects");
      check((await s.getSnapshot()).notes.length === before, "Invalid Markdown batch is atomic");
      const backup = await s.buildExport();
      const variant = JSON.parse(JSON.stringify(backup));
      variant.data.notes[0].content = "different incoming content";
      let preview = await s.inspectBackupMerge(variant);
      check(preview.counts.copied === 1 && preview.counts.identical === 2, "Merge preview counts conflicts and identical notes");
      await s.mergeBackup(variant, { expectedMutationId: preview.mutationId });
      check((await s.getSnapshot()).notes.length === before + 1, "Merge copies conflicting note");
      check((await s.getNote(original.id)).content === "original", "Merge never overwrites local note");
      preview = await s.inspectBackupMerge(variant, { conflictPolicy: "skip" });
      before = (await s.getSnapshot()).notes.length;
      await s.mergeBackup(variant, { conflictPolicy: "skip", expectedMutationId: preview.mutationId });
      check((await s.getSnapshot()).notes.length === before, "Keep-local merge skips conflicts");
      preview = await s.inspectBackupMerge(backup);
      await s.saveNote({ title: "Changed during preview", content: "", typeId: s.FALLBACK_TYPE_ID, tagIds: [] });
      await rejected(() => s.mergeBackup(backup, { expectedMutationId: preview.mutationId }), "Merge rejects a stale preview");
      const tag = await s.addTag({ name: "Batch tag" });
      const selection = imported.map((note) => ({ id: note.id, expectedRevision: note.revision }));
      await s.updateNotesBatch(selection, { action: "add-tag", tagId: tag.id });
      check((await s.getNote(imported[0].id)).tagIds.includes(tag.id), "Batch adds tags");
      await rejected(() => s.updateNotesBatch(selection, { action: "trash" }), "Batch rejects stale revisions");
      check(!(await s.getNote(imported[0].id)).deletedAt && !(await s.getNote(imported[1].id)).deletedAt, "Stale batch rolls back every note");
      let notes = await Promise.all(imported.map((note) => s.getNote(note.id)));
      const select = () => notes.map((note) => ({ id: note.id, expectedRevision: note.revision }));
      await s.updateNotesBatch(select(), { action: "remove-tag", tagId: tag.id });
      notes = await Promise.all(imported.map((note) => s.getNote(note.id)));
      await s.updateNotesBatch(select(), { action: "type", typeId: "type-learning" });
      notes = await Promise.all(imported.map((note) => s.getNote(note.id)));
      check(notes.every((note) => note.typeId === "type-learning"), "Batch changes type");
      await s.updateNotesBatch(select(), { action: "trash" });
      notes = await Promise.all(imported.map((note) => s.getNote(note.id)));
      check(notes.every((note) => note.deletedAt), "Batch moves notes to Trash");
      await s.updateNotesBatch(select(), { action: "restore" });
      check(!(await s.getNote(imported[0].id)).deletedAt, "Batch restores notes");
      const subset = await s.buildExport({ noteIds: [imported[0].id] });
      check(subset.data.notes.length === 1 && subset.data.noteVersions.every((version) => version.noteId === imported[0].id), "Selection export retains only selected history");
      s.inspectBackup(subset);
      const template = await s.createTemplateNote({ title: "Custom · {{date}}", content: "Work at {{time}}", typeId: s.FALLBACK_TYPE_ID, tagIds: [tag.id] });
      const templateTag = (await s.getSnapshot()).tags.find((item) => item.normalizedName === "template");
      check(template.tagIds.includes(templateTag.id), "Templates use ordinary backup-compatible notes");
      const daily = await Promise.all([s.getOrCreateDailyNote("2026-10-02"), s.getOrCreateDailyNote("2026-10-02")]);
      check(daily[0].id === daily[1].id, "Concurrent Daily note opens create exactly one note");
      await s.saveNote({ ...daily[0], title: "Renamed daily note", expectedRevision: daily[0].revision });
      check((await s.getOrCreateDailyNote("2026-10-02")).id === daily[0].id, "Renaming a Daily note keeps its date identity");
      await rejected(() => s.getOrCreateDailyNote("2026-02-30"), "Daily note validates calendar dates");
      const roundTrip = await s.buildExport();
      s.inspectBackup(roundTrip);
      await s.importBackup(roundTrip);
      check((await s.buildExport()).data.notes.length === roundTrip.data.notes.length, "New features survive backup round trip");
      check((await s.getOrCreateDailyNote("2026-10-02")).id === daily[0].id, "Daily date identity survives backup restore");
      const snapshot = await s.getSnapshot();
      const foreign = { ...original, id: "foreign-note", title: "Foreign note", typeId: "type-learning", tagIds: [tag.id], revision: 2 };
      const foreignBackup = { format: "personal-notes-backup", schemaVersion: 3, data: {
        noteTypes: [snapshot.types.find((type) => type.id === s.FALLBACK_TYPE_ID), { ...snapshot.types.find((type) => type.id === "type-learning"), name: "Imported type" }],
        tags: [{ ...tag, name: "Imported tag" }], notes: [foreign],
        noteVersions: [{ ...foreign, noteId: foreign.id, id: "ignored", revision: 1, content: "Old foreign content", typeId: "deleted-type", tagIds: ["deleted-tag"], archivedAt: foreign.updatedAt }],
      } };
      await s.mergeBackup(foreignBackup);
      const foreignSaved = await s.getNote(foreign.id);
      check(foreignSaved.typeId !== "type-learning" && foreignSaved.tagIds[0] !== tag.id, "Merge remaps colliding catalog IDs without changing local names");
      foreignBackup.data.notes[0].content = "Conflicting foreign content";
      await s.mergeBackup(foreignBackup);
      const foreignCopy = (await s.getSnapshot()).notes.find((note) => note.content === "Conflicting foreign content");
      const history = await s.listNoteVersions(foreignCopy.id);
      check(foreignCopy.id !== foreign.id && history.length === 1 && history[0].noteId === foreignCopy.id, "Copied conflicts retain remapped version history");
      s.inspectBackup(await s.buildExport());
      for (const schemaVersion of [1, 2]) {
        const older = { ...foreignBackup, schemaVersion };
        check((await s.inspectBackupMerge(older, { conflictPolicy: "skip" })).counts.skipped === 1, `Merge accepts schema v${schemaVersion}`);
      }
      // Same revision, different content: even without a refresh, storage must reject the old editor snapshot.
      const latest = await s.getNote(original.id);
      const replaced = await s.buildExport();
      replaced.data.notes.find((note) => note.id === original.id).content = "replaced in another tab";
      await s.importBackup(replaced);
      await rejected(() => s.saveNote({ ...latest, title: "My edit", expectedRevision: latest.revision, expectedSnapshot: latest }), "Equal-revision replacement cannot silently overwrite imported content");
      await s.resetLibrary();
      return checks;
    });
    passed.push(...storageChecks);
    await reload();

    await page.locator("#markdown-import-input").setInputFiles([
      { name: "UI Alpha.md", mimeType: "text/markdown", buffer: Buffer.from("# Alpha\n\n**Kept raw**\n") },
      { name: "UI Beta.md", mimeType: "text/markdown", buffer: Buffer.from("# Beta\n") },
    ]);
    await page.locator("#confirm-import-btn").waitFor({ state: "visible" });
    assert.match(await page.locator("#import-result-summary").innerText(), /2 notes/);
    await page.locator("#confirm-import-btn").click();
    await page.locator("#import-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#notes-list .note-card").count(), 2);
    passed.push("Markdown UI preview and commit");

    await commands("UI Alpha", "UI Alpha");
    await page.waitForFunction(() => document.querySelector("#note-title").value === "UI Alpha");
    assert.equal(await page.locator("#note-title").inputValue(), "UI Alpha");
    await page.locator('[data-note-editor-mode="edit"]').click();
    // Keep the draft untitled so it is not autosaved while navigation is tested.
    await page.locator("#note-title").fill("");
    await page.locator("#note-content").fill("Unfinished primary draft");
    await commands("UI Beta", "UI Beta");
    await page.locator("#cancel-confirmation-btn").click();
    assert.equal(await page.locator("#note-content").inputValue(), "Unfinished primary draft");
    passed.push("Command navigation respects dirty-draft cancellation");
    await page.locator("#note-title").fill("UI Alpha");
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#note-dialog").waitFor({ state: "hidden" });

    const uiBackup = await page.evaluate(() => PersonalNotesStorage.buildExport());
    const localAlpha = uiBackup.data.notes.find((note) => note.title === "UI Alpha");
    localAlpha.title = "Imported copy";
    localAlpha.content = "Incoming copy from JSON";
    await page.locator("#import-input").setInputFiles({ name: "merge-test.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(uiBackup)) });
    await page.waitForFunction(() => !document.querySelector("#confirm-import-btn").disabled);
    assert.match(await page.locator("#import-result-summary").innerText(), /1 conflicting copies/);
    await page.locator("#import-mode").selectOption("replace");
    await page.locator("#confirm-import-btn").click();
    await page.keyboard.press("Escape");
    await page.locator("#confirmation-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#import-dialog").isVisible(), true);
    assert.equal((await page.evaluate(() => PersonalNotesStorage.getSnapshot())).notes.length, 2);
    await page.locator("#import-mode").selectOption("merge");
    await page.locator("#confirm-import-btn").click();
    await page.locator("#import-dialog").waitFor({ state: "hidden" });
    assert.equal((await page.evaluate(() => PersonalNotesStorage.getSnapshot())).notes.length, 3);
    passed.push("Backup merge UI and cancelable replacement confirmation");

    await commands("Templates", "Templates");
    const builtIn = page.locator("#template-list .workflow-row").filter({ hasText: "Meeting" }).first();
    await builtIn.getByRole("button", { name: "Use template", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#note-title").value.startsWith("Meeting ·"));
    assert.match(await page.locator("#note-title").inputValue(), /^Meeting · \d{4}-\d{2}-\d{2}$/);
    assert.match(await page.locator("#note-content").inputValue(), /## Action items/);
    await commands("Save current note as template", "Save current note as template");
    await page.locator("#template-dialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("#template-list .workflow-row").filter({ hasText: "Your template" }).count(), 1);
    await page.locator('#template-dialog [data-close-workflow]').first().click();
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    await commands("Templates", "Templates");
    await page.locator("#new-template-btn").click();
    await page.locator("#note-dialog").waitFor({ state: "visible" });
    assert.match(await page.locator("#selected-note-tags").innerText(), /template/);
    await page.locator("#note-title").fill("My template · {{date}}");
    await page.locator("#note-content").fill("## Journal\n\nAt {{time}}\n");
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    await commands("Templates", "Templates");
    await page.locator("#template-list .workflow-row").filter({ hasText: "My template" }).getByRole("button", { name: "Use template", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#note-title").value.startsWith("My template ·") && !document.querySelector("#note-title").value.includes("{{"));
    assert.doesNotMatch(await page.locator("#note-content").inputValue(), /\{\{/);
    assert.doesNotMatch(await page.locator("#selected-note-tags").innerText(), /template/);
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    passed.push("Built-in/custom templates, placeholders, and backup tag convention");

    await commands("Daily note", "Open today's Daily note");
    await page.waitForFunction(() => document.querySelector("#note-title").value.startsWith("Daily ·") && document.querySelector("#note-id").value);
    const dailyId = await page.locator("#note-id").inputValue();
    await commands("Daily note", "Open today's Daily note");
    assert.equal(await page.locator("#note-id").inputValue(), dailyId);
    await page.locator("#close-note-dialog-btn").click();
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    passed.push("Daily note UI reopens today's existing note");

    await page.locator("#search-input").fill("UI ");
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 2);
    await page.locator("#select-notes-btn").click();
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Select all (2)");
    await page.locator("#bulk-select-results-btn").click();
    assert.match(await page.locator("#bulk-selection-count").innerText(), /^2 selected/);
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Deselect all");
    await page.locator("#bulk-select-results-btn").click();
    assert.equal(await page.locator("#bulk-selection-count").innerText(), "0 selected");
    assert.equal(await page.locator("#bulk-export-btn").isDisabled(), true);
    assert.equal(await page.locator("#bulk-trash-btn").isDisabled(), true);
    await page.getByRole("checkbox", { name: "Select UI Alpha", exact: true }).check();
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Select all (2)");
    await page.locator("#bulk-select-results-btn").click();
    await page.locator("#search-input").fill("UI Alpha");
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 1);
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Deselect all");
    await page.locator("#bulk-select-results-btn").click();
    assert.equal(await page.locator("#bulk-selection-count").innerText(), "1 selected");
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Select all (1)");
    await page.locator("#search-input").fill("no matching synthetic results");
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 0);
    assert.equal(await page.locator("#bulk-select-results-label").innerText(), "Select all (0)");
    assert.equal(await page.locator("#bulk-select-results-btn").isDisabled(), true);
    await page.locator("#search-input").fill("UI ");
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 2);
    assert.equal(await page.getByRole("checkbox", { name: "Select UI Beta", exact: true }).isChecked(), true);
    await page.locator("#bulk-select-results-btn").click();
    passed.push("Select all toggles Deselect all, handles partial/empty results, and preserves selections outside filters");
    assert.equal(await page.locator("#bulk-edit-btn, #bulk-edit-dialog").count(), 0);
    const selectedDownload = page.waitForEvent("download");
    await page.locator("#bulk-export-btn").click();
    const download = await selectedDownload;
    const subset = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(subset.data.notes.length, 2);
    const selectedNotes = (await page.evaluate(() => PersonalNotesStorage.getSnapshot())).notes.filter((note) => note.title.startsWith("UI "));
    assert.deepEqual(subset.data.notes.map((note) => ({ id: note.id, typeId: note.typeId, tagIds: note.tagIds })).sort((a, b) => a.id.localeCompare(b.id)),
      selectedNotes.map((note) => ({ id: note.id, typeId: note.typeId, tagIds: note.tagIds })).sort((a, b) => a.id.localeCompare(b.id)));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForFunction(() => !document.querySelector(".note-selection"));
    assert.equal(await page.locator("#select-notes-btn").isVisible(), false);
    assert.equal(await page.locator("#bulk-actions-bar").isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#bulk-actions-bar").waitFor({ state: "visible" });
    assert.match(await page.locator("#bulk-selection-count").innerText(), /^2 selected/);
    await page.locator("#bulk-trash-btn").click();
    await page.locator("#confirm-action-btn").click();
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 0);
    await page.locator("#trash-space").click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForFunction(() => !document.querySelector(".note-selection"));
    assert.equal(await page.locator("#bulk-actions-bar").isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#bulk-actions-bar").waitFor({ state: "visible" });
    await page.locator("#bulk-select-results-btn").click();
    await page.locator("#bulk-trash-btn").click();
    await page.locator("#confirm-action-btn").click();
    await page.waitForFunction(() => document.querySelectorAll("#notes-list .note-card").length === 0);
    passed.push("Selection has no batch editor; JSON export preserves note fields; Trash and restore still work");

    // A closed tab's untitled draft must be discoverable from a new tab.
    const writer = await context.newPage(); observe(writer);
    await writer.goto(origin); await ready(writer);
    await writer.locator("#all-notes-space").click();
    await writer.locator("#new-note-btn").click();
    await writer.locator("#note-content").fill("Draft from a closed tab");
    await commands("Draft Recovery", "Draft Recovery");
    const liveDraft = page.locator("#recovery-list .workflow-row").filter({ hasText: "Draft from a closed tab" });
    assert.equal(await liveDraft.getByRole("button", { name: "Recover draft", exact: true }).isDisabled(), true);
    assert.equal(await liveDraft.getByRole("button", { name: "Discard", exact: true }).isDisabled(), true);
    await page.locator('#recovery-dialog [data-close-workflow]').first().click();
    await writer.close();
    await reload();
    await page.locator("#all-notes-space").click();
    await commands("Draft Recovery", "Draft Recovery");
    const closedDraft = page.locator("#recovery-list .workflow-row").filter({ hasText: "Draft from a closed tab" });
    const draftDownload = page.waitForEvent("download");
    await closedDraft.getByRole("button", { name: "Export .md", exact: true }).click();
    const draftFile = await draftDownload;
    assert.equal(await fs.readFile(await draftFile.path(), "utf8"), "Draft from a closed tab\n");
    await closedDraft.getByRole("button", { name: "Recover draft", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#note-content").value === "Draft from a closed tab");
    assert.equal(await page.locator("#note-content").inputValue(), "Draft from a closed tab");
    const kept = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("nook:editor-draft:v2:")).length);
    assert.ok(kept >= 2, "original draft stays until save");
    await page.locator("#note-title").fill("Recovered closed-tab note");
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("nook:editor-draft:v2:")).length), 0);
    passed.push("Closed-tab draft discovery, Markdown export, recovery, and delayed source cleanup");

    const recoveryNotes = await page.evaluate(async () => {
      const s = PersonalNotesStorage;
      return Promise.all(["Recovery primary", "Recovery side", "Conflict recovery"].map((title) => s.saveNote({ title, content: "Original", typeId: s.FALLBACK_TYPE_ID, tagIds: [] })));
    });
    const sideWriter = await context.newPage(); observe(sideWriter);
    await sideWriter.goto(origin); await ready(sideWriter);
    await sideWriter.getByRole("button", { name: "Open note: Recovery primary", exact: true }).click();
    await sideWriter.locator("#toggle-dual-pane-btn").click();
    await sideWriter.locator("#secondary-notes-list").getByRole("button", { name: "Open note: Recovery side", exact: true }).click();
    await sideWriter.locator('[data-secondary-editor-mode="edit"]').click();
    await sideWriter.locator("#secondary-note-content-editor").fill("Unsaved side draft for deleted note");
    await sideWriter.close();
    await page.evaluate((id) => PersonalNotesStorage.deleteNote(id), recoveryNotes[1].id);
    await reload();
    await commands("Draft Recovery", "Draft Recovery");
    const removedSide = page.locator("#recovery-list .workflow-row").filter({ hasText: "Unsaved side draft for deleted note" });
    await removedSide.getByRole("button", { name: "Discard", exact: true }).click();
    await page.locator("#cancel-confirmation-btn").click();
    assert.equal(await removedSide.count(), 1, "cancel discard preserves the draft");
    await removedSide.getByRole("button", { name: "Save as new", exact: true }).click();
    await removedSide.waitFor({ state: "hidden" });
    const sideResult = await page.evaluate((id) => PersonalNotesStorage.getSnapshot().then((snapshot) => ({
      originalTrashed: Boolean(snapshot.notes.find((note) => note.id === id)?.deletedAt),
      copied: snapshot.notes.some((note) => note.id !== id && note.content === "Unsaved side draft for deleted note" && !note.deletedAt),
    })), recoveryNotes[1].id);
    assert.deepEqual(sideResult, { originalTrashed: true, copied: true });
    await page.locator('#recovery-dialog [data-close-workflow]').first().click();
    passed.push("Side-note draft survives original deletion; canceled discard and Save as new are safe");

    await page.getByRole("button", { name: "Open note: Conflict recovery", exact: true }).click();
    await page.locator('[data-note-editor-mode="edit"]').click();
    await page.locator("#note-title").fill("");
    await page.locator("#note-content").fill("My conflicting recovered draft");
    const peer = await context.newPage(); observe(peer);
    await peer.goto(origin); await ready(peer);
    await peer.evaluate(async (id) => {
      const note = await PersonalNotesStorage.getNote(id);
      await PersonalNotesStorage.saveNote({ ...note, content: "Saved by another tab", expectedRevision: note.revision });
      const channel = new BroadcastChannel("nook:library"); channel.postMessage({ type: "library-mutated" }); channel.close();
    }, recoveryNotes[2].id);
    await page.waitForFunction(() => document.querySelector("#note-save-status-label").textContent === "Newer version found");
    await reload();
    await commands("Draft Recovery", "Draft Recovery");
    await page.locator("#recovery-list .workflow-row").filter({ hasText: "My conflicting recovered draft" }).getByRole("button", { name: "Recover draft", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#note-content").value === "My conflicting recovered draft");
    await page.locator("#note-title").fill("Conflict recovery");
    await page.locator("#note-form").evaluate((form) => form.requestSubmit());
    await page.locator("#conflict-dialog").waitFor({ state: "visible" });
    assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), recoveryNotes[2].id)).content, "Saved by another tab");
    await page.locator("#conflict-keep-mine-btn").click();
    await page.locator("#note-dialog").waitFor({ state: "hidden" });
    assert.equal((await page.evaluate((id) => PersonalNotesStorage.getNote(id), recoveryNotes[2].id)).content, "My conflicting recovered draft");
    await peer.close();
    passed.push("Two-tab conflict survives reload/recovery and requires Keep mine before overwrite");

    // Preview widths and theme surfaces use synthetic content only.
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await commands("Templates", "Templates");
      const overflow = await page.evaluate(() => {
        const dialog = document.querySelector("#template-dialog");
        return dialog.scrollWidth > dialog.clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      assert.equal(overflow, false, `workflow overflow at ${width}px`);
      await page.locator('#template-dialog [data-close-workflow]').first().click();
    }
    for (const theme of ["light", "coffee", "forest", "midnight", "dark", "retro", "eink"]) {
      await page.evaluate((value) => { localStorage.setItem("nook:theme", value); }, theme);
      await reload();
      await commands("Draft Recovery", "Draft Recovery");
      assert.equal(await page.locator("#recovery-dialog").isVisible(), true);
      await page.locator('#recovery-dialog [data-close-workflow]').first().click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "/tmp/nook-workflows-library.png", fullPage: true });
    await commands("Templates", "Templates");
    await page.screenshot({ path: "/tmp/nook-workflows-templates.png", fullPage: true });
    passed.push("Responsive 320–1440px and seven themes");
    await page.locator('#template-dialog [data-close-workflow]').first().click();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await context.setOffline(true);
    await reload();
    await commands("Templates", "Templates");
    assert.equal(await page.locator("#template-dialog").isVisible(), true);
    await context.setOffline(false);
    passed.push("New workflow assets reopen with the hosted app offline");
    const fileContext = await browser.newContext();
    const filePage = await fileContext.newPage(); observe(filePage);
    await filePage.goto(`file://${root}/index.html`);
    await ready(filePage);
    await commands("Daily note", "Open today's Daily note", filePage);
    await filePage.waitForFunction(() => document.querySelector("#note-id").value.startsWith("note-daily-"));
    assert.equal((await filePage.evaluate(() => PersonalNotesStorage.getSnapshot())).notes.length, 1);
    await fileContext.close();
    passed.push("Static file mode starts and creates Daily notes without a server");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: passed.length, checks: passed, consoleErrors: errors }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
