(() => {
  "use strict";

  // Split column geometry only. Drafts and scroll mapping retain their owners.
  globalThis[Symbol.for("nook.app.modules")].register("split-resize", (app) => {
    const { api, elements } = app;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    let drag = null;
    let frame = 0;
    let bound = false;
    const panes = [
      ["primary", elements.noteContentField, elements.noteSplitResize, elements.noteContent],
      ["secondary", elements.secondaryContentField, elements.secondarySplitResize, elements.secondaryNoteContentEditor],
    ].map(([name, field, handle, source]) => {
      const key = `nook:split-ratio:${name}`;
      let ratio = 0.5;
      try {
        const raw = window.localStorage.getItem(key);
        const value = Number(raw);
        if (raw?.trim() && Number.isFinite(value)) ratio = clamp(value, 0.25, 0.75);
      } catch { /* Browser-local resizing also works without preference storage. */ }
      return { key, field, handle, source, track: handle.parentElement, ratio };
    });

    function measure(pane) {
      if (!pane.field.classList.contains("is-split") || window.matchMedia("(max-width: 820px)").matches) return null;
      const rect = pane.track.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const gap = parseFloat(getComputedStyle(pane.track).columnGap) || 0;
      const available = rect.width - gap;
      if (available <= 0) return null;
      const min = Math.min(0.5, Math.max(0.25, 220 / available));
      return { rect, gap, available, min, max: 1 - min };
    }

    function sync(pane) {
      const geometry = measure(pane);
      if (drag?.pane === pane && (!geometry || Math.abs(geometry.available - drag.geometry.available) > 1)) {
        finish(false);
        return;
      }
      const disabled = !geometry || geometry.max - geometry.min < 0.001;
      pane.handle.tabIndex = disabled ? -1 : 0;
      pane.handle.setAttribute("aria-disabled", String(disabled));
      pane.handle.title = disabled ? "More room is needed to resize Split"
        : "Drag to resize · Arrow keys adjust · Home/End set limits · Double-click or Enter resets · Escape cancels drag";
      if (!geometry) return;
      const ratio = clamp(pane.ratio, geometry.min, geometry.max);
      const width = ratio * geometry.available;
      const value = `${width}px`;
      if (pane.track.style.getPropertyValue("--split-source-width") !== value) {
        pane.track.style.setProperty("--split-source-width", value);
        pane.track.style.setProperty("--split-divider-position", `${width + geometry.gap / 2}px`);
        api.scheduleNoteEditorScrollMap(pane.source);
      }
      for (const [name, value] of [["min", geometry.min], ["max", geometry.max], ["now", ratio]]) {
        pane.handle.setAttribute(`aria-value${name}`, String(Number((value * 100).toFixed(2))));
      }
      pane.handle.setAttribute("aria-valuetext", `Markdown ${Math.round(ratio * 100)}%, Preview ${Math.round((1 - ratio) * 100)}%`);
    }

    function persist(pane) {
      try { window.localStorage.setItem(pane.key, String(pane.ratio)); }
      catch { /* Keep the chosen ratio in this tab. */ }
    }

    function applyPointer() {
      frame = 0;
      if (!drag) return;
      const { pane, geometry, clientX, startX, startRatio } = drag;
      pane.ratio = clamp(startRatio + (clientX - startX) / geometry.available, geometry.min, geometry.max);
      sync(pane);
    }

    function finish(commit, event) {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (commit) {
        if (event) drag.clientX = event.clientX;
        applyPointer();
        if (!drag) return;
      }
      const finished = drag;
      drag = null;
      if (!commit) finished.pane.ratio = finished.savedRatio;
      const { handle } = finished.pane;
      handle.classList.remove("is-active");
      elements.appShell.classList.remove("is-split-resizing");
      if (handle.hasPointerCapture(finished.pointerId)) handle.releasePointerCapture(finished.pointerId);
      if (commit) persist(finished.pane);
      sync(finished.pane);
    }

    function bindSplitResizeEvents() {
      if (bound) return;
      bound = true;
      for (const pane of panes) {
        const { handle } = pane;
        handle.addEventListener("pointerdown", (event) => {
          const geometry = measure(pane);
          if (drag || event.button !== 0 || event.isPrimary === false || api.activeModalDialog() || !geometry || geometry.max - geometry.min < 0.001) return;
          event.preventDefault();
          handle.focus({ preventScroll: true });
          drag = { pane, geometry, pointerId: event.pointerId, startX: event.clientX, clientX: event.clientX,
            savedRatio: pane.ratio, startRatio: clamp(pane.ratio, geometry.min, geometry.max) };
          handle.setPointerCapture(event.pointerId);
          handle.classList.add("is-active");
          elements.appShell.classList.add("is-split-resizing");
        });
        handle.addEventListener("pointermove", (event) => {
          if (!drag || event.pointerId !== drag.pointerId) return;
          drag.clientX = event.clientX;
          if (!frame) frame = window.requestAnimationFrame(applyPointer);
        });
        handle.addEventListener("pointerup", (event) => finish(true, event));
        handle.addEventListener("pointercancel", (event) => finish(false, event));
        handle.addEventListener("lostpointercapture", (event) => finish(false, event));
        const reset = () => {
          if (!measure(pane) || handle.getAttribute("aria-disabled") === "true") return;
          finish(false);
          pane.ratio = 0.5;
          sync(pane);
          persist(pane);
        };
        handle.addEventListener("dblclick", reset);
        handle.addEventListener("keydown", (event) => {
          const geometry = measure(pane);
          if (!geometry || handle.getAttribute("aria-disabled") === "true" || !["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          if (event.key === "Enter") { reset(); return; }
          const current = clamp(pane.ratio, geometry.min, geometry.max);
          const step = event.shiftKey ? 0.1 : 0.02;
          pane.ratio = event.key === "Home" ? geometry.min : event.key === "End" ? geometry.max
            : clamp(current + (event.key === "ArrowRight" ? step : -step), geometry.min, geometry.max);
          sync(pane);
          persist(pane);
        });
        new ResizeObserver(() => sync(pane)).observe(pane.track);
        new MutationObserver(() => sync(pane)).observe(pane.field, { attributes: true, attributeFilter: ["class"] });
        sync(pane);
      }
      document.addEventListener("keydown", (event) => {
        if (!drag || event.key !== "Escape") return;
        if (!api.activeModalDialog()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        finish(false);
      }, true);
      document.addEventListener("focusin", (event) => {
        if (drag && event.target !== drag.pane.handle) finish(false);
      });
      window.addEventListener("blur", () => finish(false));
      window.addEventListener("resize", () => panes.forEach(sync));
    }

    Object.assign(api, { bindSplitResizeEvents });
  });
})();
