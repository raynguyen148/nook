# Note detail workspace: discovery and contracts

## Goal

Replace the modal Quick View and note editor with one expanded-note workspace inside the library. Opening a note carries the selected card to the top of the library and expands it; the remaining list stays visible below, and returning restores the library context. The detail surface retains the current View, Edit, Split Preview, copy, export, save, auto-save, tag, type, delete, keyboard, draft-recovery, and confirmation behaviour.

## Current implementation findings

- `index.html` owns separate `#quick-view-dialog` and `#note-dialog` native dialogs. The latter contains the shared new/edit form and Markdown view modes.
- `app.js` tracks Quick View through `ui.viewingNoteId` / `ui.viewInvoker` and editor safety through `ui.noteEditorSession`, `noteSaveInFlight`, `noteEditorSnapshot`, and `isCurrentNoteEditorSession()`.
- `openQuickView()` renders via `NookMarkdown.renderInto()` and `openNoteEditor()` initializes the existing form. Quick View's Edit action currently closes one modal before opening the other.
- `requestNoteEditorClose()` protects a dirty draft with the existing confirmation dialog. Existing-notes auto-save after five seconds; draft recovery uses localStorage and must remain unchanged.
- Mobile presently makes dialogs full screen, which becomes the visual baseline for the new detail workspace.

## Product and interaction contract

1. A note card's title and View action open the detail workspace in reading mode. Edit actions open it in editing mode. New note opens a blank editing workspace.
2. The library panel is hidden while a detail is active. The workspace has an explicit Back to notes control. It restores the previously focused card and the library's scroll position.
3. View and Edit are modes of the same active detail surface. View-to-Edit preserves the selected note and does not create a nested surface.
4. Existing editor content and layout are reused. No IndexedDB schema, backup format, Markdown rendering, or storage API change is allowed.
5. Back/Escape from a dirty editor goes through the current discard confirmation. Saved edits return to the library only when Save & close was selected; Quick Save and auto-save keep the workspace open.
6. The transition is decorative only. It must honor `prefers-reduced-motion`, and focus moves deterministically to the detail heading (View) or title field (Edit).
7. Confirmation and Organize remain native modal dialogs.

## Scope boundary

The implementation may change `index.html`, `app.js`, and `styles.css`. It must not alter `storage.js` or `markdown.js` unless new evidence demonstrates a correctness blocker.
