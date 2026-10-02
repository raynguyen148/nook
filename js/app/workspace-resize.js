(() => {
  "use strict";

  // Measured workspace geometry only; pane sessions and note data stay with their owners.
  globalThis[Symbol.for("nook.app.modules")].register("workspace-resize", (app) => {
    const { api, elements, ui } = app;
    const EXPANSION_KEY = "nook:note-detail-expansion";
    const RATIO_KEY = "nook:note-detail-ratio";
    const PANE_MIN_WIDTH = 400;
    const SPLIT_MIN_WIDTH = 560;
    const MIN_PANE_RATIO = 0.3;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    let expansion = readPreference(EXPANSION_KEY, 0);
    let ratio = readPreference(RATIO_KEY, 0.5);
    let drag = null;
    let layoutFrame = 0;
    let pointerFrame = 0;
    let bound = false;

    function readPreference(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        const value = Number(raw);
        return raw !== null && raw.trim() !== "" && Number.isFinite(value)
          ? clamp(value, 0, 1) : fallback;
      } catch {
        return fallback;
      }
    }

    function persistSize() {
      try {
        window.localStorage.setItem(EXPANSION_KEY, String(expansion));
        window.localStorage.setItem(RATIO_KEY, String(ratio));
      } catch {
        // Resizing remains available in this tab when preference storage is blocked.
      }
    }

    function measureLayout() {
      if (!api.isDetailWorkspaceOpen() || window.matchMedia("(max-width: 820px)").matches) return null;
      const bounds = elements.noteDetailWorkspace.getBoundingClientRect();
      const dual = elements.noteDetailWorkspace.classList.contains("is-side-by-side");
      const gap = dual ? parseFloat(getComputedStyle(elements.noteDetailWorkspace).columnGap) || 0 : 0;
      const available = Math.max(0, bounds.width - gap);
      if (!available) return null;
      // On small workspaces both panes retain their equal share. Wider workspaces
      // allow emphasis without turning a reference pane into an unusable sliver.
      let min = Math.min(available, elements.noteDetailWidthGuide.getBoundingClientRect().width);
      let max = available;
      if (dual) {
        const primaryFloor = ui.noteEditorMode === "split" ? SPLIT_MIN_WIDTH : PANE_MIN_WIDTH;
        const secondaryFloor = ui.secondaryNoteMode === "split" ? SPLIT_MIN_WIDTH : PANE_MIN_WIDTH;
        if (available >= primaryFloor + secondaryFloor) {
          min = Math.max(primaryFloor, available * MIN_PANE_RATIO);
          max = Math.min(available - secondaryFloor, available * (1 - MIN_PANE_RATIO));
        } else {
          min = max = available / 2;
        }
      }
      const width = dual ? clamp(available * ratio, min, max) : min + (max - min) * expansion;
      return { dual, bounds, available, min, max, width };
    }

    function syncHandle(handle, geometry, hidden = false) {
      const disabled = !geometry || geometry.max - geometry.min < 1 || ui.secondaryClosing;
      handle.classList.toggle("is-hidden", hidden || !geometry);
      handle.setAttribute("aria-disabled", String(disabled));
      handle.tabIndex = hidden || disabled ? -1 : 0;
      if (!geometry) return;
      const { dual, available, min, max, width } = geometry;
      handle.setAttribute("aria-label", dual ? "Primary note width" : "Note width");
      handle.setAttribute("aria-controls", dual ? "note-dialog note-secondary-surface" : "note-dialog");
      // Keep fractional values: rounded percentages can announce a false zero range.
      for (const [name, value] of [["min", min], ["max", max], ["now", width]]) {
        handle.setAttribute(`aria-value${name}`, String(Number((value / available * 100).toFixed(2))));
      }
      handle.setAttribute("aria-valuetext", dual
        ? `Primary ${Math.round(width)} pixels, side note ${Math.round(available - width)} pixels`
        : `${Math.round(width)} pixels wide`);
      handle.title = disabled
        ? "More workspace room is needed to resize"
        : "Drag to resize · Arrow keys adjust · Home/End set limits · Double-click or Enter resets";
    }

    function refreshContentGeometry() {
      api.scheduleNoteEditorHeight();
      api.scheduleQuickViewHeightSync();
      api.scheduleNoteEditorScrollMap(
        elements.noteContentPreview.contains(document.activeElement) ? elements.noteContentPreview : elements.noteContent,
      );
      if (ui.dualPaneOpen && ui.secondaryNoteMode === "split") {
        api.scheduleNoteEditorScrollMap(
          elements.secondarySplitPreview.contains(document.activeElement)
            ? elements.secondarySplitPreview : elements.secondaryNoteContentEditor,
        );
      }
      api.positionNoteFontSizePopover();
      api.syncFormattingScrollCues();
    }

    function syncNoteDetailSize() {
      const geometry = measureLayout();
      if (drag && (!geometry || geometry.dual !== drag.geometry.dual ||
          Math.abs(geometry.available - drag.geometry.available) > 1 ||
          Math.abs(geometry.min - drag.geometry.min) > 1 || Math.abs(geometry.max - drag.geometry.max) > 1)) {
        finishDrag(false);
        return;
      }
      const track = elements.noteDetailWorkspace;
      if (geometry) {
        track.style.setProperty(geometry.dual ? "--note-detail-primary-width" : "--note-detail-single-width", `${geometry.width}px`);
        if (geometry.dual) track.style.setProperty("--note-detail-divider-position", `${geometry.width + (geometry.bounds.width - geometry.available) / 2}px`);
      }
      syncHandle(elements.noteResizeStart, geometry, Boolean(geometry?.dual));
      syncHandle(elements.noteResizeEnd, geometry);
      if (geometry) refreshContentGeometry();
    }

    function scheduleNoteDetailSize() {
      if (layoutFrame) return;
      layoutFrame = window.requestAnimationFrame(() => {
        layoutFrame = 0;
        syncNoteDetailSize();
      });
    }

    function setWidth(width, geometry) {
      const bounded = clamp(width, geometry.min, geometry.max);
      if (geometry.dual) ratio = bounded / geometry.available;
      else expansion = geometry.max > geometry.min ? (bounded - geometry.min) / (geometry.max - geometry.min) : expansion;
      syncNoteDetailSize();
    }

    function applyPointerPosition() {
      pointerFrame = 0;
      if (!drag) return;
      // Single-pane cards stay centered, so each dragged edge moves half the width.
      const delta = (drag.clientX - drag.startX) * drag.direction;
      setWidth(drag.geometry.width + delta, drag.geometry);
    }

    function beginDrag(event) {
      if (drag || event.button !== 0 || event.isPrimary === false || api.activeModalDialog()) return;
      const geometry = measureLayout();
      if (!geometry || geometry.max - geometry.min < 1 || ui.secondaryClosing) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.focus({ preventScroll: true });
      drag = {
        handle, pointerId: event.pointerId, startX: event.clientX, clientX: event.clientX,
        direction: geometry.dual ? 1 : handle === elements.noteResizeStart ? -2 : 2,
        geometry, expansion, ratio,
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-active");
      elements.appShell.classList.add("is-note-resizing");
    }

    function moveDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(applyPointerPosition);
    }

    function finishDrag(commit = true, event = null) {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      if (commit) {
        if (event) drag.clientX = event.clientX;
        applyPointerPosition();
        // A simultaneous workspace change can cancel the drag during measurement.
        if (!drag) return;
      }
      const finished = drag;
      drag = null;
      if (!commit) {
        expansion = finished.expansion;
        ratio = finished.ratio;
      }
      finished.handle.classList.remove("is-active");
      elements.appShell.classList.remove("is-note-resizing");
      if (finished.handle.hasPointerCapture(finished.pointerId)) finished.handle.releasePointerCapture(finished.pointerId);
      if (commit) persistSize();
      syncNoteDetailSize();
    }

    function resetSize(event) {
      if (event?.currentTarget?.getAttribute("aria-disabled") === "true") return;
      finishDrag(false);
      const geometry = measureLayout();
      if (!geometry) return;
      if (geometry.dual) ratio = 0.5;
      else expansion = 0;
      syncNoteDetailSize();
      persistSize();
    }

    function handleResizeKey(event) {
      if (event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
      const geometry = measureLayout();
      if (!geometry || geometry.max - geometry.min < 1 || ui.secondaryClosing) return;
      const step = event.shiftKey ? 64 : 16;
      const edgeDirection = !geometry.dual && event.currentTarget === elements.noteResizeStart ? -1 : 1;
      let width;
      if (event.key === "ArrowLeft") width = geometry.width - step * edgeDirection;
      else if (event.key === "ArrowRight") width = geometry.width + step * edgeDirection;
      else if (event.key === "Home") width = geometry.min;
      else if (event.key === "End") width = geometry.max;
      else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        resetSize(event);
        return;
      } else return;
      event.preventDefault();
      event.stopPropagation();
      finishDrag(false);
      setWidth(width, geometry);
      persistSize();
    }

    function bindNoteDetailResizeEvents() {
      if (bound) return;
      bound = true;
      for (const handle of [elements.noteResizeStart, elements.noteResizeEnd]) {
        handle.addEventListener("pointerdown", beginDrag);
        handle.addEventListener("pointermove", moveDrag);
        handle.addEventListener("pointerup", (event) => finishDrag(true, event));
        handle.addEventListener("pointercancel", (event) => finishDrag(false, event));
        handle.addEventListener("lostpointercapture", (event) => finishDrag(false, event));
        handle.addEventListener("dblclick", resetSize);
        handle.addEventListener("keydown", handleResizeKey);
      }
      // Capture Escape before note-close guards; canceling a drag must keep drafts open.
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !drag) return;
        // A dialog owns Escape once it opens, including before its focus settles.
        if (api.activeModalDialog()) {
          finishDrag(false);
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        finishDrag(false);
      }, true);
      document.addEventListener("focusin", () => {
        if (drag && api.activeModalDialog()) finishDrag(false);
      });
      window.addEventListener("blur", () => finishDrag(false));
      window.addEventListener("resize", scheduleNoteDetailSize);
      if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(scheduleNoteDetailSize);
        observer.observe(elements.workspace);
        observer.observe(elements.noteDetailWidthGuide);
      }
    }

    Object.assign(api, { bindNoteDetailResizeEvents, syncNoteDetailSize, scheduleNoteDetailSize, cancelNoteDetailResize: () => finishDrag(false) });
  });
})();
