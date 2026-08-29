# Note detail workspace: implementation and verification

## Implementation order

1. Move the existing Quick View markup and editor form into a hidden `#note-detail-workspace` inside the main workspace. Preserve IDs so established bindings and controls continue to work.
2. Add UI state for active detail mode, its invoking element, and the library scroll position. Replace dialog-open checks in editor session safety with a detail-active predicate.
3. Replace modal open/close operations with `openNoteDetail()` / `requestNoteDetailClose()`. Keep the existing dirty-state confirmation and save flows, but return to the library only for an intentional close.
4. Render the detail as an expanded note at the top of the existing library, with explicit back navigation, selected-card state, a visible remaining list, and a reversible entry/exit animation. Reuse the library card and panel language instead of dialog styling. Use a simple opacity/translate treatment when reduced motion is requested.
5. Adapt desktop and mobile layout: details fill the current content container; mobile remains a full reading/editing surface. Do not alter card-grid breakpoints or sidebar behaviour.
6. Remove the now-unused Quick View and note-editor modal-specific event paths and CSS only after the replacement is exercised.

## Acceptance checks

- Existing note: title/View opens reading detail; Edit opens editing detail; switching modes preserves the same note.
- New note: opens blank editor detail and Back/Cancel respects dirty confirmation.
- Existing note: edit, Quick Save, auto-save, Save & close, delete, tag creation, type selection, formatting shortcuts, editor mode buttons, copy, and both exports keep their present behaviour.
- Recovery: a stored draft restores into editing detail; discard clears it; successful save clears it.
- Navigation: Back and Escape restore the original card and list scroll after a clean detail. A dirty detail does not silently close.
- Accessibility: visible focus, meaningful Back label, focus target on entry/return, keyboard-only operation, reduced motion, dark theme, and mobile layout.
- Static: `node --check app.js`, `node --check markdown.js`, and `git diff --check`.
- Runtime: localhost browser verification with no console errors for desktop and mobile flows.
