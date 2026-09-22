(async () => {
  "use strict";
  const elements = {
    noteContent: document.querySelector("#note-content"),
    noteContentPreview: document.querySelector("#note-content-preview"),
    secondaryNoteContentEditor: document.querySelector("#secondary-note-content-editor"),
    secondarySplitPreview: document.querySelector("#secondary-split-preview"),
    noteDialog: document.querySelector("#fixture"),
  };
  const app = {
    api: { createDraftRecoveryStore: () => ({}) }, elements,
    ui: { noteEditorMode: "split", secondaryNoteMode: "split", dualPaneOpen: true },
    constants: {}, shared: {},
  };
  const key = Symbol.for("nook.app.modules");
  globalThis[key] = { register: (_name, install) => install(app) };
  for (const name of ["editor", "split-selection"]) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `../../js/app/${name}.js`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  delete globalThis[key];
  app.api.bindSplitSelectionEvents();
  const source = elements.noteContent;
  const preview = elements.noteContentPreview;
  const sample = "# Heading\n\nFirst **bold** paragraph.\n\n- first item\n- second item\n\n| A | B |\n|---|---|\n| one | two |\n| three | four |\n\nLast paragraph.";
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const markedText = (element) => element.closest(".note-editor-pane").querySelector("textarea").value
    .slice(Number(element.dataset.sourceStart), Number(element.dataset.sourceEnd));
  const marks = () => [...document.querySelectorAll(".split-selection-overlay mark")].map(markedText);
  const matches = () => [...preview.querySelectorAll(".is-selection-match")];
  async function render(text = sample, target = source, output = preview) {
    target.value = text;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    NookMarkdown.renderInto(output, text, "", { sourceMap: true });
    await settle();
  }
  async function selectSource(start, end, target = source) {
    document.getSelection().removeAllRanges();
    target.focus({ preventScroll: true });
    target.setSelectionRange(start, end);
    await settle();
  }
  async function selectPreview(node, output = preview) {
    output.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    await settle();
  }
  let failures = 0;
  let count = 0;
  async function check(name, action) {
    count += 1;
    const item = document.createElement("li");
    try {
      await render();
      await action();
      item.textContent = `PASS ${name}`;
      item.dataset.status = "pass";
    } catch (error) {
      failures += 1;
      item.textContent = `FAIL ${name}: ${error.message}`;
      item.dataset.status = "fail";
    }
    document.querySelector("#results").append(item);
  }
  await check("source selection maps inline Markdown to its paragraph without moving caret", async () => {
    await selectSource(11, 35);
    assert(matches().length === 1 && matches()[0].tagName === "P", "wrong block");
    assert(source.selectionStart === 11 && source.selectionEnd === 35 && document.activeElement === source, "caret/focus changed");
  });
  await check("preview selection mirrors raw source while preserving native selection and focus", async () => {
    await selectPreview(preview.querySelector("p"));
    assert(marks()[0] === "First **bold** paragraph.\n", "wrong source range");
    assert(document.getSelection().toString() === "First bold paragraph." && document.activeElement === preview, "native selection lost");
  });
  await check("selection ending at the next line excludes that next line", async () => {
    await selectSource(sample.indexOf("- first"), sample.indexOf("- second"));
    assert(matches().length === 1 && matches()[0].textContent === "first item", "next list item included");
  });
  await check("table selection maps to a row instead of the entire table", async () => {
    await selectPreview(preview.querySelector("tbody tr"));
    assert(marks()[0] === "| one | two |\n", "table row mapping failed");
    await selectSource(sample.indexOf("| three"), sample.indexOf("| three") + 4);
    assert(matches().length === 1 && matches()[0].tagName === "TR", `wrong table match: ${matches().map((e) => `${e.tagName}:${e.dataset.markdownSourceStart}-${e.dataset.markdownSourceEnd}`).join(",")}`);
  });
  await check("multi-block selection highlights all matching blocks", async () => {
    await selectSource(11, sample.indexOf("| A"));
    assert(matches().length === 3, "paragraph and two list items expected");
  });
  await check("nested list and quote ranges end before following unrelated blocks", async () => {
    const text = "- outer\n  - nested\n\n> quote\n\nAfter blocks";
    await render(text);
    await selectPreview(preview.querySelector("li li p"));
    assert(marks()[0] === "  - nested\n", `nested range leaked: ${marks()[0]}`);
    await selectSource(text.indexOf("After"), text.length);
    assert(matches().length === 1 && matches()[0].textContent === "After blocks", "earlier blocks included");
  });
  await check("collapsed selections clear counterparts", async () => {
    await selectPreview(preview.querySelector("p"));
    document.getSelection().collapseToEnd();
    await settle();
    assert(marks().length === 0, "stale overlay");
    await selectSource(11, 20);
    await selectSource(20, 20);
    assert(matches().length === 0, "stale block highlight");
  });
  await check("typing and preview replacement clear stale state", async () => {
    await selectPreview(preview.querySelector("p"));
    await render("Replacement note");
    assert(marks().length === 0 && matches().length === 0, "stale selection");
    await selectSource(0, 5);
    assert(matches()[0]?.textContent === "Replacement note", "stale source index");
  });
  await check("side editor highlights are isolated from primary", async () => {
    const secondary = elements.secondaryNoteContentEditor;
    const output = elements.secondarySplitPreview;
    await render("# Side\n\nSide **content**", secondary, output);
    await selectSource(8, 12, secondary);
    assert(output.querySelectorAll(".is-selection-match").length === 1 && matches().length === 0, "wrong editor highlighted");
    await selectPreview(output.querySelector("p"), output);
    assert(marks()[0] === "Side **content**", "wrong side source");
  });
  await check("leaving split clears overlays", async () => {
    await selectPreview(preview.querySelector("p"));
    source.closest(".note-content-field").classList.remove("is-split");
    app.ui.noteEditorMode = "edit";
    await settle();
    assert(!marks().length, "overlay remained");
    app.ui.noteEditorMode = "split";
    source.closest(".note-content-field").classList.add("is-split");
  });
  await check("closed details body maps to its visible container", async () => {
    const text = "<details>\n<summary>Summary</summary>\n\nHidden body\n\n</details>";
    await render(text);
    await selectSource(text.indexOf("Hidden"), text.indexOf("Hidden") + 6);
    assert(matches().length === 1 && matches()[0].tagName === "DETAILS", "invisible child highlighted");
  });
  await check("selection updates reuse the source-map index", async () => {
    let scans = 0;
    const query = preview.querySelectorAll;
    preview.querySelectorAll = function (selector) {
      if (selector === "[data-markdown-source-start]") scans += 1;
      return query.call(this, selector);
    };
    try {
      await selectSource(11, 15);
      for (let i = 16; i < 23; i += 1) await selectSource(11, i);
      assert(scans === 1, `index rebuilt ${scans} times`);
    } finally { preview.querySelectorAll = query; }
  });
  await check("collapsed caret events perform no selection layout measurements", async () => {
    await selectSource(1, 1);
    let reads = 0;
    const getRects = source.getClientRects;
    source.getClientRects = function () { reads += 1; return getRects.call(this); };
    try {
      for (let i = 0; i < 100; i += 1) document.dispatchEvent(new Event("selectionchange"));
      await settle();
      assert(reads === 0, `${reads} unnecessary geometry reads`);
    } finally { source.getClientRects = getRects; }
  });
  await check("selection bursts are coalesced to a single frame", async () => {
    await selectSource(1, 1);
    let reads = 0;
    const getRects = source.getClientRects;
    source.getClientRects = function () { reads += 1; return getRects.call(this); };
    try {
      source.setSelectionRange(11, 20);
      for (let i = 0; i < 100; i += 1) document.dispatchEvent(new Event("selectionchange"));
      await settle();
      assert(reads === 1, `${reads} updates for one event burst`);
    } finally { source.getClientRects = getRects; }
  });
  await check("moving inside the same source lines does no extra layout work", async () => {
    await selectSource(11, 20);
    let reads = 0;
    const getRects = source.getClientRects;
    source.getClientRects = function () { reads += 1; return getRects.call(this); };
    try {
      await selectSource(12, 21);
      await selectSource(13, 22);
      assert(reads === 0, `repeated ${reads} geometry reads`);
    } finally { source.getClientRects = getRects; }
  });
  await check("wrapped long-note overlay follows scroll without replacing text", async () => {
    const text = Array.from({ length: 120 }, (_, i) => `Paragraph ${i}: ${"wrapped text ".repeat(20)}`).join("\n\n");
    await render(text);
    await selectPreview(preview.querySelectorAll("p")[60]);
    const overlay = source.parentElement.querySelector(".split-selection-overlay");
    const mark = overlay.querySelector("mark");
    assert(markedText(mark).startsWith("Paragraph 60:"), "wrong long-note mapping");
    const marks = [...overlay.querySelectorAll("mark")];
    const visualRows = new Set(marks.map((element) => Math.round(element.getBoundingClientRect().top)));
    assert(marks.length === visualRows.size, "source highlight left fragmented rectangles on a visual line");
    const before = mark.getBoundingClientRect().top;
    source.scrollTop = 150;
    await settle();
    assert(mark === overlay.querySelector("mark"), "scroll rebuilt mirror");
    assert(Math.abs(mark.getBoundingClientRect().top - before + 150) < 1, "overlay drifted during scroll");
    assert(document.activeElement === preview, "source stole focus");
  });
  await check("offscreen reveal waits for pointer release and guards its scroll echo", async () => {
    const text = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}`).join("\n\n");
    await render(text);
    source.scrollTop = 0;
    const node = preview.querySelectorAll("p")[60];
    preview.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await selectPreview(node);
    assert(source.scrollTop === 0, "scrolled during drag");
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await settle();
    assert(source.scrollTop > 0, "counterpart was not revealed");
    const before = preview.scrollTop;
    app.api.syncNoteEditorScroll(source, preview);
    assert(preview.scrollTop === before, "reveal echoed back into selected pane");
  });
  await check("every theme keeps rich preview surfaces and counterpart text readable", async () => {
    const text = "```js\nconst readable = true;\n```";
    const themes = ["light", "coffee", "forest", "midnight", "dark", "retro"];
    await render(text);
    for (const theme of themes) {
      document.documentElement.dataset.theme = theme;
      await settle();
      const code = preview.querySelector("pre");
      const before = getComputedStyle(code);
      const colors = { background: before.backgroundColor, text: before.color };
      await selectSource(0, text.length);
      const after = getComputedStyle(code);
      assert(after.backgroundColor === colors.background, `${theme} code background was replaced`);
      assert(after.color === colors.text, `${theme} code text color was replaced`);
      assert(after.backgroundImage !== "none", `${theme} preview tint is missing`);
      await selectPreview(code);
      const mark = source.parentElement.querySelector(".split-selection-overlay mark");
      assert(mark, `${theme} source counterpart is missing`);
      assert(getComputedStyle(mark).backgroundColor !== "rgba(0, 0, 0, 0)", `${theme} source tint is transparent`);
    }
    document.documentElement.dataset.theme = "light";
  });
  const status = document.querySelector("#status");
  status.dataset.status = failures ? "fail" : "pass";
  status.textContent = `${count - failures}/${count} passed`;
})().catch((error) => {
  const status = document.querySelector("#status");
  status.dataset.status = "fail";
  status.textContent = error.stack || String(error);
});
