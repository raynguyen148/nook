(() => {
  "use strict";

  globalThis[Symbol.for("nook.app.modules")].register("attachments", (app) => {
    const { api, storage, elements, shared, ui, library } = app;
    const previews = new Map();
    const images = new Map();
    const inserting = new WeakSet();
    const pendingImages = new WeakMap();
    let activeImageResize = null;
    let requestedImageFocus = null;
    let reviewing = false;

    function previewTextarea(container) {
      if (container === elements.quickViewContent || container === elements.noteContentPreview) return elements.noteContent;
      if (container === elements.secondaryNoteContent || container === elements.secondarySplitPreview) return elements.secondaryNoteContentEditor;
      return null;
    }

    function renderPendingImage(container) {
      container.querySelector("[data-image-insertion-pending]")?.remove();
      const textarea = previewTextarea(container);
      const pending = textarea && pendingImages.get(textarea);
      const primary = textarea === elements.noteContent;
      const mode = primary ? ui.noteEditorMode : ui.secondaryNoteMode;
      const activePreview = mode === "split"
        ? container === (primary ? elements.noteContentPreview : elements.secondarySplitPreview)
        : mode === "preview" && container === (primary ? elements.quickViewContent : elements.secondaryNoteContent);
      const show = pending && paneSession(textarea) === pending.session && activePreview;
      container.querySelector(".markdown-empty")?.classList.toggle("is-hidden", Boolean(show));
      if (!show) return;

      // This is a transient preview node. Drafts, autosave, history, and backups
      // retain only real Markdown; a failed insertion cannot leave a fake asset.
      const placeholder = document.createElement("span");
      placeholder.className = "markdown-local-image image-pending-preview";
      placeholder.dataset.imageInsertionPending = "true";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", "Image being added");
      placeholder.setAttribute("aria-busy", "true");
      const surface = document.createElement("span");
      surface.className = "skeleton image-pending-preview__surface";
      surface.setAttribute("aria-hidden", "true");
      const caption = document.createElement("span");
      caption.className = "image-pending-preview__caption";
      caption.textContent = "Adding image…";
      placeholder.append(surface, caption);

      const line = textarea.value.slice(0, pending.position()).split("\n").length - 1;
      const blocks = [...container.children].filter((block) => block.hasAttribute("data-markdown-source-start"));
      const current = blocks.find((block) => Number(block.dataset.markdownSourceStart) <= line && Number(block.dataset.markdownSourceEnd) > line);
      const next = blocks.find((block) => Number(block.dataset.markdownSourceStart) > line);
      if (current) current.after(placeholder);
      else if (next) next.before(placeholder);
      else container.append(placeholder);
      api.scheduleNoteEditorScrollMap?.(container, { synchronize: false });
    }

    function updatePendingImagePreviews(textarea) {
      const containers = textarea === elements.noteContent
        ? [elements.noteContentPreview, elements.quickViewContent]
        : [elements.secondarySplitPreview, elements.secondaryNoteContent];
      containers.forEach((container) => {
        renderPendingImage(container);
        api.scheduleNoteEditorScrollMap?.(container, { synchronize: false });
      });
    }

    function resetImageUploadStatus(textarea) {
      pendingImages.delete(textarea);
      updatePendingImagePreviews(textarea);
      uploadStatus(textarea, "");
    }

    function uploadStatus(textarea, message, failed = false) {
      const status = textarea === elements.noteContent ? elements.imageUploadStatus : elements.secondaryImageUploadStatus;
      status.classList.toggle("is-hidden", !message);
      status.classList.toggle("is-error", failed);
      status.querySelector("[data-image-upload-title]").textContent = message ? (failed ? "Image not added" : "Adding image…") : "";
      status.querySelector("[data-image-upload-label]").textContent = message;
      status.querySelector(".skeleton").classList.toggle("is-hidden", failed);
      const button = textarea === elements.noteContent ? elements.insertImage : elements.secondaryInsertImage;
      button.disabled = Boolean(message && !failed);
      button.setAttribute("aria-busy", String(Boolean(message && !failed)));
      return status;
    }

    function resizeImage(placeholder, image, container, source) {
      const textarea = previewTextarea(container);
      const session = textarea && paneSession(textarea);
      if (!session || library.notes.find((note) => note.id === session.noteId)?.deletedAt) return;
      const handle = document.createElement("button");
      handle.className = "image-resize-handle";
      handle.type = "button";
      handle.setAttribute("aria-label", "Resize image. Drag or use left and right arrow keys. Home resets size.");
      handle.title = "Drag to resize · arrow keys to adjust · Home to reset · Escape cancels drag";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "m7 7 10 10M7 11V7h4M13 17h4v-4");
      icon.append(path); handle.append(icon); placeholder.append(handle);
      if (requestedImageFocus?.container === container && requestedImageFocus.session === session &&
          container.querySelectorAll("[data-nook-asset-id]")[requestedImageFocus.index] === placeholder) {
        if (document.activeElement === document.body) handle.focus({ preventScroll: true });
        requestedImageFocus = null;
      }

      function commit(width) {
        if (paneSession(textarea) !== session || textarea.value !== source) {
          api.showToast("The note changed while resizing. Try again.", "error");
          return false;
        }
        const block = placeholder.closest("[data-markdown-source-start]");
        if (!block) return false;
        const lines = source.split("\n");
        const startLine = Number(block.dataset.markdownSourceStart);
        const endLine = Number(block.dataset.markdownSourceEnd);
        const start = lines.slice(0, startLine).join("\n").length + (startLine ? 1 : 0);
        const section = lines.slice(startLine, endLine).join("\n");
        const raw = placeholder.dataset.nookImageSource;
        const matches = [...section.matchAll(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
        const peers = [...block.querySelectorAll("[data-nook-image-source]")].filter((item) => item.dataset.nookImageSource === raw);
        const occurrence = peers.indexOf(placeholder);
        if (matches.length !== peers.length || occurrence < 0 || !matches[occurrence]) {
          api.showToast("This image reference is ambiguous. Put it on its own Markdown line and try again.", "error");
          return false;
        }
        const offset = start + matches[occurrence].index;
        const label = placeholder.dataset.nookImageLabel;
        const replacement = `![${label}](nook-asset:${placeholder.dataset.nookAssetId} "width=${width}")`;
        if (source.length - raw.length + replacement.length > storage.MAX_CONTENT_LENGTH) {
          api.showToast("Shorten this note before saving an image size.", "error"); return false;
        }
        const cursorStart = textarea.selectionStart;
        const cursorEnd = textarea.selectionEnd;
        const moveCursor = (position) => position <= offset ? position : position >= offset + raw.length
          ? position + replacement.length - raw.length : offset + Math.min(position - offset, replacement.length);
        textarea.setRangeText(replacement, offset, offset + raw.length, "preserve");
        textarea.setSelectionRange(moveCursor(cursorStart), moveCursor(cursorEnd));
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        api.syncEditorDraftRecovery();
        api.scheduleNoteEditorScrollMap?.(container, { synchronize: false });
        return true;
      }

      let drag = null;
      const clamp = (width) => Math.round(Math.max(80, Math.min(4096, width)));
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        activeImageResize?.();
        handle.focus({ preventScroll: true });
        drag = { x: event.clientX, pointerId: event.pointerId, width: image.getBoundingClientRect().width, original: image.getAttribute("width") };
        activeImageResize = cancelDrag;
        handle.setPointerCapture(event.pointerId);
        placeholder.classList.add("is-resizing");
      });
      handle.addEventListener("pointermove", (event) => {
        if (!drag) return;
        image.width = clamp(Math.min(container.clientWidth, drag.width + event.clientX - drag.x));
      });
      function finish(event, save) {
        if (!drag) return;
        const { original, pointerId } = drag;
        const width = clamp(image.getBoundingClientRect().width);
        drag = null;
        if (activeImageResize === cancelDrag) activeImageResize = null;
        placeholder.classList.remove("is-resizing");
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        if (!save || !commit(width)) {
          if (original) image.setAttribute("width", original); else image.removeAttribute("width");
        }
      }
      function cancelDrag() { finish(null, false); }
      handle.addEventListener("pointerup", (event) => finish(event, true));
      handle.addEventListener("pointercancel", (event) => finish(event, false));
      handle.addEventListener("lostpointercapture", (event) => finish(event, false));
      handle.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") { finish(event, false); return; }
        const width = event.key === "Home" ? Math.min(image.naturalWidth, 4096) : image.getBoundingClientRect().width + (event.key === "ArrowRight" ? 24 : -24);
        const index = [...container.querySelectorAll("[data-nook-asset-id]")].indexOf(placeholder);
        // The same placeholder index is used after rendering, including missing
        // images. Restore focus only when this image's new control has loaded.
        requestedImageFocus = { container, index, session };
        if (!commit(clamp(width))) requestedImageFocus = null;
      });
    }

    function releaseImage(id, owner) {
      const image = images.get(id);
      if (!image) return;
      image.owners.delete(owner);
      if (image.owners.size) return;
      if (image.url) URL.revokeObjectURL(image.url);
      images.delete(id);
    }

    function releaseMarkdownImages(container) {
      const preview = previews.get(container);
      if (!preview) return;
      if (requestedImageFocus?.container === container) requestedImageFocus = null;
      preview.ids.forEach((id) => releaseImage(id, container));
      previews.delete(container);
    }

    function acquireImage(id, owner) {
      let image = images.get(id);
      if (!image) {
        image = { owners: new Set(), url: null, promise: null };
        images.set(id, image);
        image.promise = storage.getAttachment(id).then((blob) => {
          if (!blob || !image.owners.size) {
            if (images.get(id) === image) images.delete(id);
            return null;
          }
          image.url = URL.createObjectURL(blob);
          return image.url;
        }).catch((error) => {
          if (images.get(id) === image) images.delete(id);
          throw error;
        });
      }
      image.owners.add(owner);
      return image.promise;
    }

    function renderMarkdown(container, source, emptyText, options) {
      globalThis.NookMarkdown.renderInto(container, source, emptyText, { ...options, sourceMap: true });
      const placeholders = [...container.querySelectorAll("[data-nook-asset-id]")];
      const previous = previews.get(container);
      const preview = { ids: new Set(placeholders.map((item) => item.dataset.nookAssetId)) };
      previews.set(container, preview);
      previous?.ids.forEach((id) => { if (!preview.ids.has(id)) releaseImage(id, container); });
      placeholders.forEach((placeholder) => {
        const id = placeholder.dataset.nookAssetId;
        const label = placeholder.textContent;
        placeholder.classList.add("is-loading", "skeleton");
        placeholder.setAttribute("aria-busy", "true");
        const unavailable = () => {
          if (previews.get(container) !== preview) return;
          placeholder.classList.remove("is-loading", "skeleton");
          placeholder.removeAttribute("aria-busy");
          placeholder.textContent = `Image unavailable: ${label}. Restore its backup or remove its Markdown reference.`;
          if (requestedImageFocus?.container === container &&
              container.querySelectorAll("[data-nook-asset-id]")[requestedImageFocus.index] === placeholder) requestedImageFocus = null;
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "button button-secondary button-compact";
          retry.textContent = "Retry image";
          retry.addEventListener("click", () => renderMarkdown(container, source, emptyText, options));
          placeholder.append(retry);
        };
        void acquireImage(id, container).then((url) => {
          if (previews.get(container) !== preview || !container.contains(placeholder)) return;
          if (!url) { unavailable(); return; }
          const image = document.createElement("img");
          image.alt = label;
          image.decoding = "async";
          image.loading = "lazy";
          if (placeholder.dataset.nookImageWidth) image.width = Number(placeholder.dataset.nookImageWidth);
          image.addEventListener("load", () => {
            if (previews.get(container) !== preview) return;
            placeholder.classList.remove("is-loading", "skeleton");
            placeholder.removeAttribute("aria-busy");
            resizeImage(placeholder, image, container, source);
            api.scheduleNoteEditorScrollMap?.(container, { synchronize: false });
          }, { once: true });
          image.addEventListener("error", unavailable, { once: true });
          image.src = url;
          placeholder.removeAttribute("role");
          placeholder.removeAttribute("aria-label");
          placeholder.replaceChildren(image);
        }).catch(unavailable);
      });
      renderPendingImage(container);
    }

    function paneSession(textarea) {
      if (textarea === elements.noteContent) return api.isNoteEditorOpen() ? shared.primaryEditorSession : null;
      return ui.dualPaneOpen ? shared.secondaryEditorSession : null;
    }

    async function validateImage(file) {
      if (file.size <= 0 || file.size > storage.MAX_IMAGE_BYTES) throw new Error("Each image must be nonempty and 10 MB or smaller.");
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth * image.naturalHeight > 24 * 1000 * 1000) throw new Error("Choose an image with at most 24 million pixels.");
      } catch (error) {
        throw new Error(error.message === "Choose an image with at most 24 million pixels." ? error.message : "This image could not be opened. Choose a valid PNG, JPEG, GIF, WebP, or static SVG file.");
      } finally { URL.revokeObjectURL(url); }
    }

    async function insertImage(file, textarea) {
      const session = paneSession(textarea);
      if (!session || textarea.disabled || textarea.readOnly) return;
      if (inserting.has(textarea)) { api.showToast("An image is still being inserted. Please wait.", "error"); return; }
      inserting.add(textarea);
      let start = textarea.selectionStart;
      let end = textarea.selectionEnd;
      let value = textarea.value;
      const pending = { session, position: () => start };
      pendingImages.set(textarea, pending);
      // Follow edits made while decoding/persisting without replacing newer
      // typing or inserting into a different editor session.
      function followTyping() {
        const next = textarea.value;
        let left = 0;
        while (left < value.length && left < next.length && value[left] === next[left]) left += 1;
        let oldEnd = value.length;
        let newEnd = next.length;
        while (oldEnd > left && newEnd > left && value[oldEnd - 1] === next[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
        const delta = newEnd - oldEnd;
        if (oldEnd <= start) { start += delta; end += delta; }
        else if (left < end) { start = newEnd; end = newEnd; }
        value = next;
      }
      textarea.addEventListener("input", followTyping);
      uploadStatus(textarea, "Opening image…");
      updatePendingImagePreviews(textarea);
      try {
        const blob = await storage.validateAttachment(file);
        await validateImage(blob);
        if (paneSession(textarea) !== session) return;
        uploadStatus(textarea, "Saving image locally…");
        const image = await storage.addAttachment(file);
        if (paneSession(textarea) !== session) return;
        const label = image.name.replace(/[\\\[\]\r\n]/g, " ").trim() || "Image";
        const markdown = `![${label}](nook-asset:${image.id})`;
        if (textarea.value.length - (end - start) + markdown.length > storage.MAX_CONTENT_LENGTH) throw new Error("This note has no room for another image reference. Shorten its content and try again.");
        textarea.removeEventListener("input", followTyping);
        pendingImages.delete(textarea);
        updatePendingImagePreviews(textarea);
        api.replaceNoteContentSelection(markdown, start, end, start + markdown.length, start + markdown.length, textarea);
        api.syncEditorDraftRecovery();
        uploadStatus(textarea, "");
        api.showToast("Image added.");
      } catch (error) {
        if (paneSession(textarea) === session) {
          const message = file.size > storage.MAX_IMAGE_BYTES ? "Choose an image up to 10 MB."
            : file.size === 0 ? "This file is empty. Choose another image."
              : error.message || "Choose another image and try again.";
          const status = uploadStatus(textarea, message, true);
          // Use one visible error surface. Preview can hide the source field
          // while an insertion is pending, so retain the toast in that case.
          if (!status.getClientRects().length) api.showError(error, "The image could not be inserted.");
        }
      } finally {
        if (pendingImages.get(textarea) === pending) pendingImages.delete(textarea);
        updatePendingImagePreviews(textarea);
        textarea.removeEventListener("input", followTyping);
        inserting.delete(textarea);
        if (paneSession(textarea) !== session) uploadStatus(textarea, "");
      }
    }

    function protectedContents() {
      return [shared.primaryEditorSession, shared.secondaryEditorSession].filter(Boolean)
        .flatMap((session) => [session.currentDraft.content, session.committedSnapshot?.content || ""])
        .concat([api.isNoteEditorOpen() ? elements.noteContent.value : "",
          ui.dualPaneOpen ? elements.secondaryNoteContentEditor.value : ""]);
    }

    async function reviewUnusedImages() {
      if (reviewing) return;
      reviewing = true;
      elements.reviewUnusedImages.disabled = true;
      elements.imageStorageStatus.textContent = "Checking notes, Trash, history, and drafts…";
      try {
        api.syncEditorDraftRecovery();
        const inspection = await storage.inspectUnusedAttachments({ protectedContents });
        elements.imageStorageStatus.textContent = `${inspection.count} images · ${api.formatBytes(inspection.bytes)}. ${inspection.unusedCount} unused · ${api.formatBytes(inspection.unusedBytes)} can be removed. Images inserted in the last five minutes are kept.`;
        if (!inspection.unusedCount) return;
        const confirmed = await api.requestConfirmation({ title: `Remove ${inspection.unusedCount} unused ${inspection.unusedCount === 1 ? "image" : "images"}?`,
          description: `Free up to ${api.formatBytes(inspection.unusedBytes)}. Images used by notes, Trash, saved history, or recovery drafts are kept. References are checked again before removal.`,
          confirmLabel: "Remove unused images", cancelLabel: "Keep images" });
        if (!confirmed) return;
        const result = await storage.inspectUnusedAttachments({ protectedContents, candidates: inspection.candidates, remove: true });
        elements.imageStorageStatus.textContent = `Removed ${result.unusedCount} images · ${api.formatBytes(result.unusedBytes)} freed. ${result.count - result.unusedCount} images remain.`;
        await api.refreshStorageHealth();
        api.showToast(`Removed ${result.unusedCount} unused images.`);
      } catch (error) {
        elements.imageStorageStatus.textContent = error.message || "Images could not be checked. Try again.";
        api.showError(error);
      } finally { reviewing = false; elements.reviewUnusedImages.disabled = false; }
    }

    function bindAttachmentEvents() {
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !activeImageResize) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        activeImageResize();
      }, true);
      window.addEventListener("blur", () => activeImageResize?.());
      [elements.noteContent, elements.secondaryNoteContentEditor].forEach((textarea) => {
        textarea.addEventListener("paste", (event) => {
          const files = [...(event.clipboardData?.files || [])];
          if (!files.length) return;
          event.preventDefault();
          if (files.length > 1) { api.showToast("Paste one image at a time.", "error"); return; }
          void insertImage(files[0], textarea);
        });
      });
      [[elements.insertImage, elements.imageInput, elements.noteContent],
        [elements.secondaryInsertImage, elements.secondaryImageInput, elements.secondaryNoteContentEditor]].forEach(([button, input, textarea]) => {
        button.addEventListener("click", () => input.click());
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          input.value = "";
          if (file) void insertImage(file, textarea);
        });
      });
      elements.reviewUnusedImages.addEventListener("click", () => void reviewUnusedImages());
      [elements.imageUploadStatus, elements.secondaryImageUploadStatus].forEach((status) => {
        status.querySelector("button").addEventListener("click", () => {
          const restoreFocus = status.contains(document.activeElement);
          status.classList.add("is-hidden");
          if (restoreFocus) (status === elements.imageUploadStatus ? elements.noteContent : elements.secondaryNoteContentEditor).focus({ preventScroll: true });
        });
      });
      window.addEventListener("pagehide", () => [...previews.keys()].forEach(releaseMarkdownImages));
    }

    Object.assign(api, { renderMarkdown, releaseMarkdownImages, bindAttachmentEvents, resetImageUploadStatus });
  });
})();
