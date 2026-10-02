(() => {
  "use strict";

  // Markdown source editing operations and formatting scroll cues.
  globalThis[Symbol.for("nook.app.modules")].register("formatting", (app) => {

    const { api, elements } = app;


    function replaceNoteContentSelection(replacement, selectionStart, selectionEnd, nextSelectionStart, nextSelectionEnd, targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (!textarea) return;
      textarea.focus();
      textarea.setRangeText(replacement, selectionStart, selectionEnd, "preserve");
      textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function toggleNoteContentWrapper(marker, targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (!textarea) return;
      const value = textarea.value;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const selectedText = value.slice(selectionStart, selectionEnd);
      const hasWrapper =
        selectionStart >= marker.length &&
        value.slice(selectionStart - marker.length, selectionStart) === marker &&
        value.slice(selectionEnd, selectionEnd + marker.length) === marker;

      if (hasWrapper) {
        replaceNoteContentSelection(
          selectedText,
          selectionStart - marker.length,
          selectionEnd + marker.length,
          selectionStart - marker.length,
          selectionEnd - marker.length,
          textarea,
        );
        return;
      }

      replaceNoteContentSelection(
        `${marker}${selectedText}${marker}`,
        selectionStart,
        selectionEnd,
        selectionStart + marker.length,
        selectionEnd + marker.length,
        textarea,
      );
    }

    function insertNoteLink(targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (!textarea) return;
      const value = textarea.value;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const selectedText = value.slice(selectionStart, selectionEnd) || "link text";
      const urlPlaceholder = "https://";
      const urlStart = selectionStart + selectedText.length + 3;
      replaceNoteContentSelection(
        `[${selectedText}](${urlPlaceholder})`,
        selectionStart,
        selectionEnd,
        urlStart,
        urlStart + urlPlaceholder.length,
        textarea,
      );
    }

    function applyNoteFormattingShortcut(formatting, targetTextarea = elements.noteContent) {
      if (formatting === "link") return insertNoteLink(targetTextarea);
      applyNoteFormatting(formatting, targetTextarea);
    }

    function selectedNoteContentLineRange(targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      const value = textarea ? textarea.value : "";
      const selectionStart = textarea ? textarea.selectionStart : 0;
      const selectionEnd = textarea ? textarea.selectionEnd : 0;
      const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
      const nextLineBreak = value.indexOf("\n", selectionEnd);
      const end = nextLineBreak === -1 ? value.length : nextLineBreak;
      return { start, end, text: value.slice(start, end) };
    }

    function toggleNoteContentLinePrefix(prefix, expression, targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      const { start, end, text } = selectedNoteContentLineRange(textarea);
      const lines = text.split("\n");
      const removePrefix = lines.every((line) => expression.test(line));
      const replacement = lines
        .map((line) => removePrefix ? line.replace(expression, "") : `${prefix}${line}`)
        .join("\n");
      replaceNoteContentSelection(replacement, start, end, start, start + replacement.length, textarea);
    }

    function toggleNoteContentOrderedList(targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      const { start, end, text } = selectedNoteContentLineRange(textarea);
      const lines = text.split("\n");
      const expression = /^\d+\.\s+/;
      const removePrefix = lines.every((line) => expression.test(line));
      const replacement = lines
        .map((line, index) => removePrefix ? line.replace(expression, "") : `${index + 1}. ${line}`)
        .join("\n");
      replaceNoteContentSelection(replacement, start, end, start, start + replacement.length, textarea);
    }

    function insertNoteContentTemplate(template, selectionOffset, selectionLength = () => 0, targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (!textarea) return;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const selectedText = textarea.value.slice(selectionStart, selectionEnd);
      const replacement = template(selectedText);
      const nextSelectionStart = selectionStart + selectionOffset(selectedText, replacement);
      replaceNoteContentSelection(
        replacement,
        selectionStart,
        selectionEnd,
        nextSelectionStart,
        nextSelectionStart + selectionLength(selectedText, replacement),
        textarea,
      );
    }

    function nextFootnoteNumber(targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (!textarea) return 1;
      const references = [...textarea.value.matchAll(/\[\^(\d+)\]/g)]
        .map((match) => Number.parseInt(match[1], 10))
        .filter(Number.isFinite);
      return references.length ? Math.max(...references) + 1 : 1;
    }

    function applyNoteFormatting(formatting, targetTextarea = elements.noteContent) {
      const textarea = targetTextarea || elements.noteContent;
      if (formatting === "bold") return toggleNoteContentWrapper("**", textarea);
      if (formatting === "italic") return toggleNoteContentWrapper("*", textarea);
      if (formatting === "strikethrough") return toggleNoteContentWrapper("~~", textarea);
      if (formatting === "inline-code") return toggleNoteContentWrapper("`", textarea);
      if (formatting === "heading") return toggleNoteContentLinePrefix("## ", /^#{1,6}\s+/, textarea);
      if (formatting === "bullet-list") return toggleNoteContentLinePrefix("- ", /^[-*+]\s+/, textarea);
      if (formatting === "task-list") return toggleNoteContentLinePrefix("- [ ] ", /^-\s\[[ xX]\]\s+/, textarea);
      if (formatting === "ordered-list") return toggleNoteContentOrderedList(textarea);
      if (formatting === "code-block") {
        return insertNoteContentTemplate(
          (selectedText) => `\`\`\`\n${selectedText}\n\`\`\``,
          () => 4,
          (selectedText) => selectedText.length,
          textarea,
        );
      }
      if (formatting === "table") {
        return insertNoteContentTemplate(
          () => "| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |",
          () => 2,
          () => "Column 1".length,
          textarea,
        );
      }
      if (formatting === "alert") {
        return insertNoteContentTemplate(
          (selectedText) => `> [!NOTE]\n> ${selectedText || "Add a note"}`,
          () => 12,
          (selectedText) => (selectedText || "Add a note").length,
          textarea,
        );
      }
      if (formatting === "footnote") {
        const number = nextFootnoteNumber(textarea);
        return insertNoteContentTemplate(
          (selectedText) => `${selectedText}[^${number}]\n\n[^${number}]: `,
          (selectedText, replacement) => replacement.length,
          () => 0,
          textarea,
        );
      }
    }

    function syncFormattingScrollCues() {
      document.querySelectorAll(".note-formatting-toolbar").forEach((toolbar) => {
        const track = toolbar.querySelector(".formatting-scroll-track");
        if (!track) return;
        const mobile = window.matchMedia("(max-width: 820px)").matches;
        const before = toolbar.querySelector('[data-formatting-scroll="before"]');
        const after = toolbar.querySelector('[data-formatting-scroll="after"]');
        before.hidden = !mobile || track.scrollLeft <= 1;
        after.hidden = !mobile || track.scrollWidth - track.clientWidth - track.scrollLeft <= 1;
      });
    }

    function bindFormattingScrollCues() {
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(syncFormattingScrollCues) : null;
      document.querySelectorAll(".note-formatting-toolbar").forEach((toolbar) => {
        const track = api.createElement("div", { className: "formatting-scroll-track" });
        track.append(...toolbar.childNodes);
        const before = api.createElement("button", { type: "button", className: "formatting-scroll-button", text: "←",
          dataset: { formattingScroll: "before" }, attributes: { "aria-label": "Earlier formatting tools" } });
        const after = api.createElement("button", { type: "button", className: "formatting-scroll-button", text: "More →",
          dataset: { formattingScroll: "after" }, attributes: { "aria-label": "More formatting tools" } });
        toolbar.append(before, track, after);
        [before, after].forEach((button) => button.addEventListener("click", () => {
          track.scrollBy({ left: (button === before ? -1 : 1) * Math.max(120, track.clientWidth * 0.7),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }));
        track.addEventListener("scroll", syncFormattingScrollCues, { passive: true });
        observer?.observe(toolbar); observer?.observe(track);
      });
      window.addEventListener("resize", syncFormattingScrollCues);
      syncFormattingScrollCues();
    }

    Object.assign(api, {
      bindFormattingScrollCues,
      syncFormattingScrollCues,
      replaceNoteContentSelection,
      toggleNoteContentWrapper,
      insertNoteLink,
      applyNoteFormattingShortcut,
      selectedNoteContentLineRange,
      toggleNoteContentLinePrefix,
      toggleNoteContentOrderedList,
      insertNoteContentTemplate,
      nextFootnoteNumber,
      applyNoteFormatting,
    });
  });
})();
