globalThis[Symbol.for("nook.app.modules")].register("split-selection", (app) => {
  "use strict";

  const { api, elements, ui } = app;
  const sessions = [];
  let frame = 0;
  let dragging = false;
  let revealPending = false;

  function clearMatch(session, invalidate = false) {
    session.matches.forEach((element) => element.classList.remove("is-selection-match"));
    session.matches.clear();
    session.overlay?.remove();
    session.overlay = null;
    session.mirror = null;
    session.textNode = null;
    session.rangeLayer = null;
    session.key = "";
    session.sourceLinesKey = "";
    session.leader = null;
    if (invalidate) session.index = null;
  }

  function getIndex(session) {
    if (session.index) return session.index;
    const text = session.source.value;
    const lines = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10) lines.push(i + 1);
    }
    const blocks = [...session.preview.querySelectorAll("[data-markdown-source-start]")]
      .map((element) => ({
        element,
        start: Number(element.dataset.markdownSourceStart),
        end: Number(element.dataset.markdownSourceEnd),
      }))
      .filter(({ start, end }) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && start < lines.length);
    session.index = { text, lines, blocks, byElement: new Map(blocks.map((block) => [block.element, block])), subtrees: new WeakMap() };
    return session.index;
  }

  function blocksForPreviewRange(session, range) {
    const index = getIndex(session);
    const common = range.commonAncestorContainer;
    const element = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
    const root = element.closest("[data-markdown-source-start]");
    if (!root || !index.byElement.has(root)) return index.blocks;
    if (!index.subtrees.has(root)) {
      index.subtrees.set(root, [index.byElement.get(root),
        ...[...root.querySelectorAll("[data-markdown-source-start]")]
          .map((child) => index.byElement.get(child)).filter(Boolean),
      ]);
    }
    // Most selections stay in one paragraph/list item. Do not walk the whole
    // document for each pointer movement inside that block.
    return index.subtrees.get(root);
  }

  function sourceLineForOffset(lines, offset) {
    let low = 0;
    let high = lines.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lines[middle] <= offset) low = middle;
      else high = middle;
    }
    return low;
  }

  function smallestBlocks(blocks, preview) {
    // A collapsed details element is the visible counterpart of its body.
    blocks = blocks.filter(({ element }) => !element.parentElement?.closest("details:not([open])"));
    const parents = new Set();
    blocks.forEach(({ element }) => {
      for (let parent = element.parentElement; parent && parent !== preview; parent = parent.parentElement) {
        parents.add(parent);
      }
    });
    return blocks.filter(({ element }) => !parents.has(element));
  }

  function mergeSourceRanges(blocks) {
    const ranges = [];
    blocks.map(({ start, end }) => ({ start, end }))
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .forEach((range) => {
        const previous = ranges.at(-1);
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else ranges.push(range);
      });
    return ranges;
  }

  function syncOverlayGeometry(session, resize = false) {
    if (!session.overlay) return;
    const { source, overlay, rangeLayer } = session;
    if (resize) {
      Object.assign(overlay.style, {
        left: `${source.offsetLeft + source.clientLeft}px`,
        top: `${source.offsetTop + source.clientTop}px`,
        width: `${source.clientWidth}px`,
        height: `${source.clientHeight}px`,
      });
    }
    rangeLayer.style.transform = `translate(${-source.scrollLeft}px, ${-source.scrollTop}px)`;
  }

  function mergeVisualLineRects(rects) {
    const lines = [];
    Array.from(rects).forEach((rect) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      const current = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        height: rect.height,
      };
      const previous = lines.at(-1);
      if (
        previous &&
        Math.abs(previous.top - current.top) < 0.5 &&
        current.left <= previous.right + 1
      ) {
        previous.right = Math.max(previous.right, current.right);
        previous.height = Math.max(previous.height, current.height);
        return;
      }
      lines.push(current);
    });
    return lines;
  }

  function renderSourceMatch(session, ranges) {
    const { source } = session;
    const { text, lines } = getIndex(session);
    if (!session.overlay) {
      const { mirror, textNode } = api.createNoteEditorSourceMirror(text, source);
      const overlay = document.createElement("div");
      overlay.className = "split-selection-overlay";
      overlay.setAttribute("aria-hidden", "true");
      Object.assign(mirror.style, {
        position: "relative", left: "0",
      });
      const rangeLayer = document.createElement("div");
      rangeLayer.className = "split-selection-overlay__ranges";
      // Keep paint updates outside the text mirror's formatting context.
      overlay.append(mirror, rangeLayer);
      source.parentElement.append(overlay);
      session.overlay = overlay;
      session.mirror = mirror;
      session.textNode = textNode;
      session.rangeLayer = rangeLayer;
      syncOverlayGeometry(session, true);
    }
    // Keep the full text mirror unchanged. Moving selection only measures its
    // ranges and paints small rectangles, avoiding a full-note text reflow.
    const origin = session.mirror.getBoundingClientRect();
    const fragment = document.createDocumentFragment();
    const range = document.createRange();
    ranges.forEach(({ start, end }) => {
      const from = lines[start];
      const to = lines[end] ?? text.length;
      range.setStart(session.textNode, from);
      range.setEnd(session.textNode, to);
      const rects = mergeVisualLineRects(range.getClientRects());
      rects.forEach((bounds) => {
        const mark = document.createElement("mark");
        mark.dataset.sourceStart = String(from);
        mark.dataset.sourceEnd = String(to);
        Object.assign(mark.style, {
          left: `${bounds.left - origin.left}px`,
          top: `${bounds.top - origin.top}px`,
          width: `${bounds.right - bounds.left}px`,
          height: `${bounds.height}px`,
        });
        fragment.append(mark);
      });
    });
    session.rangeLayer.replaceChildren(fragment);
  }

  function revealMatch(session) {
    const target = session.leader === session.source ? session.preview : session.source;
    const match = session.leader === session.source
      ? session.matches.values().next().value
      : session.rangeLayer?.querySelector("mark");
    if (!match) return;
    const bounds = match.getBoundingClientRect();
    const viewport = target.getBoundingClientRect();
    // Only reveal an entirely offscreen match, and only after selection ends.
    if (!bounds.height || (bounds.bottom > viewport.top && bounds.top < viewport.bottom)) return;
    api.revealNoteEditorSelection(session.leader, target, target.scrollTop + bounds.top - viewport.top - 16);
    syncOverlayGeometry(session);
  }

  function updateMatch(session, reveal) {
    if (!session.isSplit()) {
      clearMatch(session);
      return;
    }
    const { source, preview } = session;
    let leader;
    let candidates;
    let sourceLinesKey = "";
    if (document.activeElement === source) {
      if (source.selectionStart === source.selectionEnd) {
        if (session.key) clearMatch(session);
        return;
      }
      leader = source;
      const { lines, blocks } = getIndex(session);
      const start = sourceLineForOffset(lines, source.selectionStart);
      // An end at the next line's first character does not select that line.
      const end = sourceLineForOffset(lines, source.selectionEnd - 1) + 1;
      sourceLinesKey = `${start}-${end}`;
      if (session.leader === source && session.sourceLinesKey === sourceLinesKey) {
        if (reveal) revealMatch(session);
        return;
      }
      if (!source.getClientRects().length) return;
      candidates = blocks.filter((block) => block.start < end && block.end > start);
    } else {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount ||
          !preview.contains(selection.anchorNode) || !preview.contains(selection.focusNode) ||
          !preview.contains(document.activeElement)) {
        if (session.key) clearMatch(session);
        return;
      }
      const anchor = selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode : selection.anchorNode.parentElement;
      if (anchor?.closest("button, input, .markdown-footnote-backref")) {
        clearMatch(session);
        return;
      }
      leader = preview;
      if (!preview.getClientRects().length) return;
      const range = selection.getRangeAt(0);
      const contents = document.createRange();
      candidates = blocksForPreviewRange(session, range).filter(({ element }) => {
        if (!range.intersectsNode(element)) return false;
        contents.selectNodeContents(element);
        return range.compareBoundaryPoints(Range.END_TO_START, contents) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, contents) > 0;
      });
    }
    const blocks = smallestBlocks(candidates, preview);
    const ranges = mergeSourceRanges(blocks);
    const key = `${leader === source ? "source" : "preview"}:${ranges.map(({ start, end }) => `${start}-${end}`).join(",")}`;
    if (key !== session.key) {
      if (session.leader !== leader) clearMatch(session);
      session.leader = leader;
      session.key = key;
      if (leader === source) {
        const next = new Set(blocks.map(({ element }) => element));
        session.matches.forEach((element) => {
          if (!next.has(element)) element.classList.remove("is-selection-match");
        });
        next.forEach((element) => {
          if (!session.matches.has(element)) element.classList.add("is-selection-match");
        });
        session.matches = next;
      } else if (ranges.length) {
        renderSourceMatch(session, ranges);
      } else {
        clearMatch(session);
      }
    }
    session.sourceLinesKey = sourceLinesKey;
    if (reveal) revealMatch(session);
  }

  function scheduleSelection(reveal = false) {
    revealPending ||= reveal;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const shouldReveal = revealPending && !dragging;
      revealPending = false;
      sessions.forEach((session) => updateMatch(session, shouldReveal));
    });
  }

  function bindSplitSelectionEvents() {
    [
      [elements.noteContent, elements.noteContentPreview, () => ui.noteEditorMode === "split", elements.noteDialog],
      [elements.secondaryNoteContentEditor, elements.secondarySplitPreview, () => ui.dualPaneOpen && ui.secondaryNoteMode === "split", elements.secondarySurface],
    ].forEach(([source, preview, isSplit, surface]) => {
      if (!source || !preview) return;
      const session = { source, preview, isSplit, matches: new Set(), key: "", index: null };
      sessions.push(session);
      source.addEventListener("select", () => scheduleSelection());
      source.addEventListener("input", () => clearMatch(session, true));
      source.addEventListener("scroll", () => syncOverlayGeometry(session), { passive: true });
      // Rendering replaces preview children. Invalidate lazily, never parse or
      // measure again on the typing path. Observe only the renderer's root.
      new MutationObserver(() => clearMatch(session, true)).observe(preview, { childList: true });
      new MutationObserver(() => clearMatch(session)).observe(source.closest(".note-content-field"), {
        attributes: true, attributeFilter: ["class"],
      });
      if (surface) new MutationObserver(() => {
        if (surface.classList.contains("is-hidden")) clearMatch(session, true);
      }).observe(surface, { attributes: true, attributeFilter: ["class"] });
      new ResizeObserver(() => {
        if (!session.overlay) return;
        clearMatch(session);
        scheduleSelection();
      }).observe(source);
    });
    document.addEventListener("selectionchange", () => scheduleSelection());
    document.addEventListener("pointerdown", (event) => {
      dragging = sessions.some(({ source, preview, isSplit }) => isSplit() && (source === event.target || preview.contains(event.target)));
      sessions.forEach((session) => {
        if (event.target !== session.source && !session.preview.contains(event.target)) clearMatch(session);
      });
    });
    document.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      scheduleSelection(true);
    });
    document.addEventListener("pointercancel", () => { dragging = false; });
    document.addEventListener("keyup", (event) => {
      if (event.key === "Shift" || event.shiftKey) scheduleSelection(true);
    });
    document.addEventListener("focusin", () => scheduleSelection());
    new MutationObserver(() => {
      sessions.forEach((session) => clearMatch(session));
      scheduleSelection();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  Object.assign(api, { bindSplitSelectionEvents });
});
