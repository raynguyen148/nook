(() => {
  "use strict";

  // Primary preview and detail-workspace lifecycle and transitions.
  globalThis[Symbol.for("nook.app.modules")].register("workspace", (app) => {

    const { api, elements, library, ui, constants } = app;
    const { MOTION } = constants;
    let noteDetailAnimation = null;
    let noteDetailTransitionSequence = 0;
    const createElement = (...args) => api.createElement(...args);
    const typeFor = (...args) => api.typeFor(...args);
    const tagFor = (...args) => api.tagFor(...args);
    const tagLabel = (...args) => api.tagLabel(...args);
    const formatFullDate = (...args) => api.formatFullDate(...args);
    const openNoteEditor = (...args) => api.openNoteEditor(...args);
    const requestNoteEditorClose = (...args) => api.requestNoteEditorClose(...args);
    const makeTypeBadge = (...args) => api.makeTypeBadge(...args);
    const resetCopyButtonFeedback = (...args) => api.resetCopyButtonFeedback(...args);
    const cancelSecondarySurfaceAnimation = (...args) => api.cancelSecondarySurfaceAnimation(...args);
    const closeDualPane = (...args) => api.closeDualPane(...args);

    function noteForQuickView() {
      const noteId = ui.editingNoteId || ui.viewingNoteId;
      return library.notes.find(({ id }) => id === noteId) || null;
    }

    function previewNoteFromEditor() {
      const persistedNote = noteForQuickView();
      return {
        id: elements.noteId.value,
        title: elements.noteTitle.value.trim() || "Untitled note",
        typeId: elements.noteType.value,
        tagIds: [...ui.selectedNoteTagIds],
        content: elements.noteContent.value,
        createdAt: persistedNote?.createdAt || "",
        updatedAt: persistedNote?.updatedAt || "",
      };
    }

    function renderQuickView(note = previewNoteFromEditor()) {
      const type = typeFor(note.typeId);
      const tags = note.tagIds.map(tagFor).filter(Boolean);
      elements.quickViewTitle.textContent = note.title;
      elements.quickViewMeta.replaceChildren(makeTypeBadge(type));
      elements.quickViewTags.replaceChildren();
      if (tags.length) {
        const fragment = document.createDocumentFragment();
        tags.forEach((tag) => {
          fragment.append(createElement("span", {
            className: "quick-view-tag",
            text: tagLabel(tag),
            attributes: { title: tagLabel(tag) },
          }));
        });
        elements.quickViewTags.append(fragment);
      } else {
        elements.quickViewTags.append(createElement("span", { className: "quick-view-no-tags", text: "No tags" }));
      }
      globalThis.NookMarkdown.renderInto(elements.quickViewContent, note.content);
      elements.quickViewDates.replaceChildren();
      if (note.createdAt && note.updatedAt) {
        elements.quickViewDates.append(
          createElement("span", { text: `Created ${formatFullDate(note.createdAt)}` }),
          createElement("span", { text: `Last updated ${formatFullDate(note.updatedAt)}` }),
        );
      } else {
        elements.quickViewDates.append(createElement("span", { text: "Not saved yet" }));
      }
      syncNotePreviewActions();
    }

    function syncNotePreviewActions() {
      const hasContent = Boolean(elements.noteContent.value.trim());
      elements.copyNoteContent.disabled = !hasContent || ui.copyInFlight;
      if (!hasContent) {
        resetCopyButtonFeedback(elements.copyNoteContent);
      }
    }

    function isDetailWorkspaceOpen() {
      return !ui.detailClosing && !elements.noteDetailWorkspace.classList.contains("is-hidden");
    }

    function isQuickViewOpen() {
      return isNoteEditorOpen() && ui.noteEditorMode === "preview";
    }

    function isNoteEditorOpen() {
      return isDetailWorkspaceOpen() && !elements.noteDialog.classList.contains("is-hidden");
    }

    function cancelNoteDetailAnimation() {
      noteDetailTransitionSequence += 1;
      noteDetailAnimation?.cancel();
      noteDetailAnimation = null;
      ui.detailClosing = false;
      elements.noteDetailWorkspace.inert = false;
      cancelSecondarySurfaceAnimation();
    }

    function animateNoteDetailIn() {
      cancelNoteDetailAnimation();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobile = window.matchMedia("(max-width: 820px)").matches;
      elements.noteDetailWorkspace.style.willChange = "opacity, transform";
      const animation = elements.noteDetailWorkspace.animate(
        reducedMotion
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: mobile ? "translateX(32px)" : "translateY(8px)" },
              { opacity: 1, transform: "translate(0)" },
            ],
        {
          duration: reducedMotion ? MOTION.micro : MOTION.medium,
          easing: MOTION.easeOut,
        },
      );
      noteDetailAnimation = animation;
      animation.finished.catch(() => {}).finally(() => {
        elements.noteDetailWorkspace.style.willChange = "auto";
        if (noteDetailAnimation === animation) noteDetailAnimation = null;
      });
    }

    function openNoteDetail(surface, invoker = null) {
      const opensWorkspace = !isDetailWorkspaceOpen();
      if (opensWorkspace) {
        ui.detailScrollTop = window.scrollY;
        ui.viewInvoker = invoker instanceof HTMLElement ? invoker : null;
        ui.detailSourceCard?.classList.remove("is-detail-source");
        ui.detailSourceCard = ui.viewInvoker?.closest(".note-card") || null;
        ui.detailSourceCard?.classList.add("is-detail-source");
        elements.workspace.classList.add("is-note-detail-open");
        elements.noteDetailWorkspace.classList.remove("is-hidden");
        window.scrollTo(0, 0);
      }
      surface.classList.remove("is-hidden");
      api.syncNoteDetailSize();
      api.rememberMobileDetail?.();
      if (opensWorkspace) animateNoteDetailIn();
      window.requestAnimationFrame(() => {
        if (window.matchMedia("(max-width: 820px)").matches) surface.focus({ preventScroll: true });
        const scrollSurface = ui.noteEditorMode === "preview"
          ? surface.querySelector(".quick-view-content-card")
          : surface.querySelector(".dialog-body");
        if (scrollSurface) scrollSurface.scrollTop = 0;
        if (surface === elements.noteDialog) {
          elements.noteContent.scrollTop = 0;
          elements.noteContentPreview.scrollTop = 0;
        }
      });
    }

    function closeNoteDetail({ restoreFocus = true, invoker = ui.viewInvoker } = {}) {
      api.cancelNoteDetailResize();
      api.closeNoteFontSizePopover();
      resetCopyButtonFeedback(elements.copyNoteContent);
      const transitionSequence = ++noteDetailTransitionSequence;
      noteDetailAnimation?.cancel();
      ui.detailClosing = true;
      elements.noteDetailWorkspace.inert = true;

      const finishClose = () => {
        if (transitionSequence !== noteDetailTransitionSequence) return;
        elements.noteDetailWorkspace.style.willChange = "auto";
        closeAnimation.cancel();
        if (noteDetailAnimation === closeAnimation) noteDetailAnimation = null;
        ui.detailClosing = false;
        elements.noteDetailWorkspace.inert = false;
        elements.noteDialog.classList.add("is-hidden");
        elements.noteDetailWorkspace.classList.add("is-hidden");
        elements.workspace.classList.remove("is-note-detail-open");
        api.syncNoteDetailSize();
        api.releaseMobileDetail?.();
        closeDualPane({ immediate: true });
        ui.detailSourceCard?.classList.remove("is-detail-source");
        ui.detailSourceCard = null;
        window.requestAnimationFrame(() => {
          window.scrollTo(0, ui.detailScrollTop);
          if (restoreFocus) focusQuickViewFallback(invoker);
        });
      };

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.noteDetailWorkspace.style.willChange = "opacity, transform";
      const closeAnimation = elements.noteDetailWorkspace.animate(
        reducedMotion
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: "translateY(0)" },
              { opacity: 0, transform: window.matchMedia("(max-width: 820px)").matches ? "translateX(32px)" : "translateY(4px)" },
            ],
        {
          duration: reducedMotion ? MOTION.micro : MOTION.short,
          easing: MOTION.easeIn,
          fill: "forwards",
        },
      );
      noteDetailAnimation = closeAnimation;
      closeAnimation.finished.catch(() => {}).finally(finishClose);
    }

    function syncQuickViewHeight() {
      if (!isQuickViewOpen()) return;
      elements.noteDialog.style.removeProperty("height");
    }

    function scheduleQuickViewHeightSync() {
      window.requestAnimationFrame(syncQuickViewHeight);
    }

    function focusQuickViewFallback(invoker) {
      if (invoker instanceof HTMLElement && invoker.isConnected && !invoker.disabled) {
        invoker.focus();
        return;
      }
      elements.notesList.focus({ preventScroll: true });
    }

    function closeQuickView() {
      if (isQuickViewOpen()) requestNoteEditorClose();
    }

    function openQuickView(note, invoker = null) {
      openNoteEditor(note, { invoker, initialMode: "preview", focusTitle: false });
    }

    Object.assign(api, {
      noteForQuickView,
      previewNoteFromEditor,
      renderQuickView,
      syncNotePreviewActions,
      isDetailWorkspaceOpen,
      isQuickViewOpen,
      isNoteEditorOpen,
      openNoteDetail,
      closeNoteDetail,
      syncQuickViewHeight,
      scheduleQuickViewHeightSync,
      focusQuickViewFallback,
      closeQuickView,
      openQuickView,
    });
  });
})();
