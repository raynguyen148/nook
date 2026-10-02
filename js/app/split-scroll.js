(() => {
  "use strict";

  // Split preview rendering and source/preview scroll synchronization.
  globalThis[Symbol.for("nook.app.modules")].register("split-scroll", (app) => {

    const { api, elements, ui } = app;
    const NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS = 320;


    function clampScrollPosition(position, maximum) {
      return Math.min(Math.max(0, position), Math.max(0, maximum));
    }

    function getNoteEditorMaximumScrollTop(element) {
      return Math.max(0, element.scrollHeight - element.clientHeight);
    }

    function getNoteEditorLineStartOffsets(source) {
      const offsets = [0];
      for (let index = 0; index < source.length; index += 1) {
        if (source.charCodeAt(index) === 10) offsets.push(index + 1);
      }
      return offsets;
    }

    function createNoteEditorSourceMirror(source, textarea = elements.noteContent) {
      if (!textarea) return null;
      const styles = window.getComputedStyle(textarea);
      const mirror = document.createElement("div");
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const textProperties = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "fontVariant",
        "fontStretch",
        "fontKerning",
        "fontFeatureSettings",
        "letterSpacing",
        "wordSpacing",
        "lineHeight",
        "textTransform",
        "textIndent",
        "textAlign",
        "direction",
        "tabSize",
      ];
      mirror.setAttribute("aria-hidden", "true");
      Object.assign(mirror.style, {
        position: "fixed",
        top: "0",
        left: "-100000px",
        visibility: "hidden",
        pointerEvents: "none",
        boxSizing: "content-box",
        width: `${Math.max(1, textarea.clientWidth - horizontalPadding)}px`,
        minHeight: "0",
        margin: "0",
        paddingTop: styles.paddingTop,
        paddingRight: styles.paddingRight,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft,
        border: "0",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: styles.wordBreak === "normal" ? "break-word" : styles.wordBreak,
        overflow: "visible",
        contain: "layout style paint",
      });
      textProperties.forEach((property) => {
        mirror.style[property] = styles[property];
      });
      const textNode = document.createTextNode(source || "\u200b");
      mirror.append(textNode);
      document.body.append(mirror);
      return { mirror, textNode };
    }

    function getNoteEditorMirrorCaretTop(textNode, offset) {
      const safeOffset = Math.min(Math.max(0, offset), textNode.length);
      const range = document.createRange();
      const getRangeTop = () => {
        const rect = range.getBoundingClientRect();
        return rect.height > 0 ? rect.top : null;
      };
      range.setStart(textNode, safeOffset);
      range.collapse(true);
      let top = getRangeTop();
      if (top !== null) return top;
      if (safeOffset < textNode.length) {
        range.setEnd(textNode, safeOffset + 1);
        top = getRangeTop();
        if (top !== null) return top;
      }
      if (safeOffset > 0) {
        range.setStart(textNode, safeOffset - 1);
        range.setEnd(textNode, safeOffset);
        top = getRangeTop();
        if (top !== null) return top;
      }
      return 0;
    }

    function measureNoteEditorSourceLineOffsets(source, lineStarts, sourceLines, sourceMaximum, textarea = elements.noteContent) {
      const mirrorResult = createNoteEditorSourceMirror(source, textarea);
      if (!mirrorResult) return new Map();
      const { mirror, textNode } = mirrorResult;
      try {
        const mirrorTop = mirror.getBoundingClientRect().top;
        const origin = getNoteEditorMirrorCaretTop(textNode, 0) - mirrorTop;
        const mirrorMaximum = Math.max(0, mirror.scrollHeight - textarea.clientHeight);
        const scale = mirrorMaximum > 0 && sourceMaximum > 0 ? sourceMaximum / mirrorMaximum : 1;
        const offsets = new Map();
        sourceLines.forEach((line) => {
          const characterOffset = lineStarts[line];
          if (!Number.isInteger(characterOffset)) return;
          const measuredOffset = getNoteEditorMirrorCaretTop(textNode, characterOffset) - mirrorTop - origin;
          offsets.set(line, clampScrollPosition(measuredOffset * scale, sourceMaximum));
        });
        return offsets;
      } finally {
        mirror.remove();
      }
    }

    function getPreviewContentOffset(element, maximum, previewTop, previewScrollTop) {
      const elementBounds = element.getBoundingClientRect();
      return clampScrollPosition(
        elementBounds.top - previewTop + previewScrollTop,
        maximum,
      );
    }

    function createMonotonicScrollMap(points, fromKey, toKey, duplicateTarget = "min") {
      const sorted = points
        .map((point) => ({ from: point[fromKey], to: point[toKey] }))
        .filter((point) => Number.isFinite(point.from) && Number.isFinite(point.to))
        .sort((first, second) => first.from - second.from || first.to - second.to);
      const map = [];
      sorted.forEach((point) => {
        const previous = map.at(-1);
        if (!previous) {
          map.push(point);
          return;
        }
        if (point.from <= previous.from + 0.5) {
          previous.to = duplicateTarget === "max"
            ? Math.max(previous.to, point.to)
            : Math.min(previous.to, point.to);
          return;
        }
        map.push({ from: point.from, to: Math.max(previous.to, point.to) });
      });
      return map;
    }

    function sampleNoteEditorScrollAnchors(anchors) {
      const uniqueAnchors = [];
      const mappedSourceLines = new Set();
      anchors.forEach((anchor) => {
        if (mappedSourceLines.has(anchor.sourceLine)) return;
        mappedSourceLines.add(anchor.sourceLine);
        uniqueAnchors.push(anchor);
      });
      if (uniqueAnchors.length <= NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS) return uniqueAnchors;
      return Array.from({ length: NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS }, (_, index) => {
        const fraction = index / (NOTE_EDITOR_SCROLL_MAP_MAX_ANCHORS - 1);
        return uniqueAnchors[Math.round((uniqueAnchors.length - 1) * fraction)];
      });
    }

    function getSplitScrollSession(element) {
      if (
        (elements.secondaryNoteContentEditor && element === elements.secondaryNoteContentEditor) ||
        (elements.secondarySplitPreview && element === elements.secondarySplitPreview)
      ) {
        return {
          isSplit: ui.secondaryNoteMode === "split" && Boolean(ui.dualPaneOpen),
          source: elements.secondaryNoteContentEditor,
          preview: elements.secondarySplitPreview,
          getScrollMap: () => ui.secondaryScrollMap,
          setScrollMap: (map) => {
            ui.secondaryScrollMap = map;
          },
          getSyncTarget: () => ui.secondaryScrollSyncTarget,
          getSyncTargetTop: () => ui.secondaryScrollSyncTargetTop,
          setSyncTarget: (target, top) => {
            ui.secondaryScrollSyncTarget = target;
            ui.secondaryScrollSyncTargetTop = top;
          },
          resetSyncTarget: () => {
            ui.secondaryScrollSyncTarget = null;
            ui.secondaryScrollSyncTargetTop = 0;
            ui.secondaryScrollSyncResetFrame = 0;
          },
          cancelResetFrame: () => window.cancelAnimationFrame(ui.secondaryScrollSyncResetFrame),
          getScrollLeader: () => ui.secondaryScrollLeader,
          setScrollLeader: (source) => {
            ui.secondaryScrollLeader = source;
          },
          clearScrollLeader: () => {
            ui.secondaryScrollLeader = null;
          },
          getMapFrame: () => ui.secondaryScrollMapFrame,
          setMapFrame: (frame) => {
            ui.secondaryScrollMapFrame = frame;
          },
        };
      }

      return {
        isSplit: ui.noteEditorMode === "split",
        source: elements.noteContent,
        preview: elements.noteContentPreview,
        getScrollMap: () => ui.noteScrollMap,
        setScrollMap: (map) => {
          ui.noteScrollMap = map;
        },
        getSyncTarget: () => ui.noteScrollSyncTarget,
        getSyncTargetTop: () => ui.noteScrollSyncTargetTop,
        setSyncTarget: (target, top) => {
          ui.noteScrollSyncTarget = target;
          ui.noteScrollSyncTargetTop = top;
        },
        resetSyncTarget: () => {
          ui.noteScrollSyncTarget = null;
          ui.noteScrollSyncTargetTop = 0;
          ui.noteScrollSyncResetFrame = 0;
        },
        cancelResetFrame: () => window.cancelAnimationFrame(ui.noteScrollSyncResetFrame),
        getScrollLeader: () => ui.noteScrollLeader,
        setScrollLeader: (source) => {
          ui.noteScrollLeader = source;
        },
        clearScrollLeader: () => {
          ui.noteScrollLeader = null;
        },
        getMapFrame: () => ui.noteScrollMapFrame,
        setMapFrame: (frame) => {
          ui.noteScrollMapFrame = frame;
        },
      };
    }

    function buildSplitScrollMap(session) {
      if (!session || !session.isSplit) {
        if (session) session.setScrollMap(null);
        return null;
      }
      const { source, preview } = session;
      if (
        !source ||
        !preview ||
        preview.hidden ||
        source.clientWidth <= 0 ||
        preview.clientWidth <= 0
      ) {
        session.setScrollMap(null);
        return null;
      }

      const sourceMaximum = getNoteEditorMaximumScrollTop(source);
      const previewMaximum = getNoteEditorMaximumScrollTop(preview);
      const lineStarts = getNoteEditorLineStartOffsets(source.value);
      const renderedAnchors = [...preview.querySelectorAll("[data-markdown-source-start]")]
        .filter((element) => !element.closest(".markdown-footnotes"))
        .map((element) => ({
          element,
          sourceLine: Number.parseInt(element.dataset.markdownSourceStart, 10),
        }))
        .filter(({ sourceLine }) => Number.isInteger(sourceLine) && sourceLine >= 0 && sourceLine < lineStarts.length);
      const anchors = sampleNoteEditorScrollAnchors(renderedAnchors);
      const sourceLines = new Set(anchors.map(({ sourceLine }) => sourceLine));
      const sourceOffsets = sourceLines.size
        ? measureNoteEditorSourceLineOffsets(source.value, lineStarts, sourceLines, sourceMaximum, source)
        : new Map();
      const points = [{ source: 0, preview: 0 }];
      const previewTop = preview.getBoundingClientRect().top;
      const previewScrollTop = preview.scrollTop;
      anchors.forEach(({ element, sourceLine }) => {
        const sourceOffset = sourceOffsets.get(sourceLine);
        if (!Number.isFinite(sourceOffset) || sourceOffset <= 0.5 || sourceOffset >= sourceMaximum - 0.5) return;
        points.push({
          source: sourceOffset,
          preview: getPreviewContentOffset(element, previewMaximum, previewTop, previewScrollTop),
        });
      });
      points.push({ source: sourceMaximum, preview: previewMaximum });

      const sourceToPreview = createMonotonicScrollMap(points, "source", "preview");
      const previewToSource = createMonotonicScrollMap(sourceToPreview, "to", "from", "max");
      const scrollMap = {
        sourceToPreview,
        previewToSource,
        sourceMaximum,
        previewMaximum,
        sourceClientWidth: source.clientWidth,
        sourceClientHeight: source.clientHeight,
        previewClientWidth: preview.clientWidth,
        previewClientHeight: preview.clientHeight,
      };
      session.setScrollMap(scrollMap);
      return scrollMap;
    }

    function isNoteEditorScrollMapCurrent(scrollMap, source = elements.noteContent, preview = elements.noteContentPreview) {
      if (!scrollMap || !source || !preview) return false;
      return (
        scrollMap.sourceMaximum === getNoteEditorMaximumScrollTop(source) &&
        scrollMap.previewMaximum === getNoteEditorMaximumScrollTop(preview) &&
        scrollMap.sourceClientWidth === source.clientWidth &&
        scrollMap.sourceClientHeight === source.clientHeight &&
        scrollMap.previewClientWidth === preview.clientWidth &&
        scrollMap.previewClientHeight === preview.clientHeight
      );
    }

    function interpolateNoteEditorScrollMap(map, position) {
      if (!map.length) return 0;
      if (position <= map[0].from) return map[0].to;
      const last = map.at(-1);
      if (position >= last.from) return last.to;
      let low = 0;
      let high = map.length - 1;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (map[middle].from <= position) low = middle;
        else high = middle;
      }
      const start = map[low];
      const end = map[high];
      const distance = end.from - start.from;
      if (distance <= 0) return end.to;
      return start.to + ((position - start.from) / distance) * (end.to - start.to);
    }

    function resetNoteEditorScrollSyncTarget() {
      ui.noteScrollSyncTarget = null;
      ui.noteScrollSyncTargetTop = 0;
      ui.noteScrollSyncResetFrame = 0;
    }

    function lockNoteEditorScrollLeader(source = elements.noteContent) {
      const session = getSplitScrollSession(source);
      if (!session?.isSplit || source !== session.source) return;
      // Re-rendering preview content can emit a scroll event before its new map
      // exists. The textarea is the only user-edited surface, so it remains the
      // leader until the scheduled map has synchronized the preview.
      session.setScrollLeader(source);
    }

    function syncNoteEditorScroll(source, target) {
      if (!source || !target) return;
      const session = getSplitScrollSession(source);
      if (!session || !session.isSplit) return;
      if (session.getScrollLeader() && source !== session.getScrollLeader()) return;
      if (source === session.getSyncTarget()) {
        session.cancelResetFrame();
        if (Math.abs(source.scrollTop - session.getSyncTargetTop()) < 1) {
          session.resetSyncTarget();
          return;
        }
        session.resetSyncTarget();
      }
      const currentMap = session.getScrollMap();
      if (!isNoteEditorScrollMapCurrent(currentMap, session.source, session.preview)) {
        // Mirror/Range measurements belong to the scheduled layout pass, never
        // to a native scroll event. Keep the user's pane as the scroll leader.
        scheduleNoteEditorScrollMap(source);
        return;
      }
      const scrollMap = currentMap;
      const map = source === session.source
        ? scrollMap.sourceToPreview
        : scrollMap.previewToSource;
      const targetPosition = clampScrollPosition(
        interpolateNoteEditorScrollMap(map, source.scrollTop),
        source === session.source ? scrollMap.previewMaximum : scrollMap.sourceMaximum,
      );
      if (Math.abs(target.scrollTop - targetPosition) < 0.5) {
        // A preview re-render can still deliver a scroll event even when the
        // browser already landed on this exact position. Mark it as an echo so
        // a plateau in the reverse map cannot move the active textarea.
        session.setSyncTarget(target, target.scrollTop);
        return;
      }
      target.scrollTop = targetPosition;
      // Read back the browser-clamped position. Keep the echo guard until that
      // scroll arrives, even if delivery happens after the next animation frame.
      session.setSyncTarget(target, target.scrollTop);
    }

    function scheduleNoteEditorScrollMap(source = elements.noteContent) {
      const session = getSplitScrollSession(source);
      if (!session || !session.isSplit) return;
      window.cancelAnimationFrame(session.getMapFrame());
      session.setMapFrame(window.requestAnimationFrame(() => {
        session.setMapFrame(0);
        const liveSession = getSplitScrollSession(source);
        if (!liveSession.isSplit) return;
        const scrollLeader = liveSession.getScrollLeader();
        const leadingSource = scrollLeader || source;
        if (buildSplitScrollMap(liveSession)) {
          const other = leadingSource === liveSession.source ? liveSession.preview : liveSession.source;
          syncNoteEditorScroll(leadingSource, other);
        }
        if (liveSession.getScrollLeader() === leadingSource) liveSession.clearScrollLeader();
      }));
    }

    function revealNoteEditorSelection(leader, target, top) {
      const session = getSplitScrollSession(leader);
      if (!session.isSplit || session.getScrollLeader()) return;
      target.scrollTop = clampScrollPosition(top, getNoteEditorMaximumScrollTop(target));
      // Revealing a counterpart is a programmatic scroll, not a new scroll leader.
      session.setSyncTarget(target, target.scrollTop);
    }

    function renderNoteEditorPreview() {
      if (ui.noteEditorMode !== "split") return;
      lockNoteEditorScrollLeader(elements.noteContent);
      globalThis.NookMarkdown.renderInto(
        elements.noteContentPreview,
        elements.noteContent.value,
        "No content yet.",
        { sourceMap: true },
      );
      ui.noteScrollMap = null;
      scheduleNoteEditorScrollMap(elements.noteContent);
    }

    function scheduleNoteEditorPreview() {
      if (ui.noteEditorMode !== "split") return;
      lockNoteEditorScrollLeader(elements.noteContent);
      ui.noteScrollMap = null;
      window.cancelAnimationFrame(ui.noteEditorPreviewFrame);
      ui.noteEditorPreviewFrame = window.requestAnimationFrame(() => {
        ui.noteEditorPreviewFrame = 0;
        renderNoteEditorPreview();
      });
    }

    Object.assign(api, {
      createNoteEditorSourceMirror,
      resetNoteEditorScrollSyncTarget,
      lockNoteEditorScrollLeader,
      syncNoteEditorScroll,
      scheduleNoteEditorScrollMap,
      revealNoteEditorSelection,
      renderNoteEditorPreview,
      scheduleNoteEditorPreview,
    });
  });
})();
