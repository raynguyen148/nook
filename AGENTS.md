# Nook - repository instructions

## App overview

Nook is a private personal note app. It runs entirely offline in the browser:

- UI: vanilla HTML, CSS, and JavaScript only.
- Persistence: IndexedDB in the current browser.
- Import/export: local JSON backup files; no server or external API.
- Note content: stored as raw Markdown text and rendered in Quick View.
- Organization: notes belong to one note type and can have multiple tags.
- Current entry point: `index.html` loads `storage.js`, `markdown.js`, then `app.js`.

There is currently no `package.json`, bundler, framework, test runner, or remote
runtime dependency. Keep the app openable as a static local website.

## Product boundaries

- Preserve the offline-first behavior. Do not add CDNs, hosted fonts, analytics,
  external APIs, authentication, or network calls without explicit approval.
- Keep note data local to the browser. Never log note content or expose it to a
  third-party service.
- Keep the existing note model and backup compatibility. Schema changes require
  an explicit IndexedDB migration and a review of import/export behavior.
- Use the existing `PersonalNotesStorage` API from the UI. Do not access
  IndexedDB directly from `app.js` for normal feature work.
- Keep changes focused. Do not bundle unrelated redesigns, framework adoption,
  or dependency installation into a feature change.

## Source map

- `index.html`: semantic page structure, native `<dialog>` markup, accessible
  labels, buttons, and script loading order.
- `styles.css`: all visual styling, responsive layout, component states, and
  reduced-motion/forced-colors handling.
- `storage.js`: IndexedDB setup, validation, normalization, legacy migration,
  note/type/tag CRUD, backup export, and backup import. It exposes the frozen
  `globalThis.PersonalNotesStorage` API.
- `markdown.js`: dependency-free, safe Markdown-to-DOM renderer. It exposes
  the frozen `globalThis.NookMarkdown` API.
- `app.js`: UI state, rendering, event binding, dialogs, filtering, note
  editing, keyboard shortcuts, and calls to storage/Markdown services.
- `favicon.svg`: local app icon.

## Data and storage conventions

The storage layer owns the data contract. Current records include:

- Note: `id`, `title`, `typeId`, `tagIds`, `content`, `createdAt`, `updatedAt`.
- Type: `id`, `name`, `normalizedName`, `color`, `isFallback`, timestamps.
- Tag: `id`, `name`, `normalizedName`, timestamps.

Current limits and invariants are defined in `storage.js`, including title,
name, content, and import-record limits. Reuse its normalization and validation
helpers instead of duplicating them in the UI.

When changing stored data:

1. Inspect the current IndexedDB version, stores, validators, legacy migration,
   and backup parser first.
2. Decide whether the change needs a database version/migration.
3. Preserve old backups and legacy data whenever practical.
4. Test both normal save and import/export round trips.

Do not silently reset the database, delete user data, or change backup format.

## JavaScript conventions

- Use strict-mode IIFEs for the two main scripts; avoid adding globals except
  the existing `PersonalNotesStorage` and `NookMarkdown` namespaces.
- Prefer `const`/`let`, early returns, small named functions, and the existing
  `elements`, `library`, and `ui` state objects.
- Cache DOM references in the `elements` object. Put event registration in
  `bindEvents()` unless the listener is intentionally local to a generated UI
  element.
- Use the existing `createElement()` helper and DOM APIs such as
  `textContent`, `createTextNode`, `replaceChildren`, and `append()`.
- Do not use `innerHTML` with note content or any other untrusted input.
  Markdown must be rendered through safe DOM construction; raw HTML in a note
  should remain inert text.
- Treat `noteSaveInFlight`, `noteEditorSession`, and
  `isCurrentNoteEditorSession()` as part of the async safety contract. Keep
  stale async operations from mutating a closed or replaced editor.
- Keep UI state separate from persisted data. Refresh `library` through the
  storage API after mutations rather than manually guessing derived counts.
- Use existing helpers for toast/error/confirmation behavior instead of adding
  another notification or modal mechanism.

## Markdown behavior

- Store the source Markdown unchanged in `note.content`.
- Edit mode shows the raw Markdown in `#note-content`.
- Quick View renders it through `NookMarkdown.renderInto()`.
- Copy content copies the raw Markdown source, not rendered HTML.
- The current renderer supports headings, bold, italic, strikethrough, inline
  code, fenced code blocks, unordered/ordered lists, blockquotes, links, and
  horizontal rules. Keep unsupported syntax inert and safe.
- Do not enable raw HTML or unsafe URL schemes in rendered notes without an
  explicit security review.

## Editor, dialog, and shortcut conventions

- Use native `<dialog>` with `showModal()`/`close()` and keep focus restoration
  behavior intact.
- New note and Edit note share the same editor. Hide edit-only actions, such as
  View note and Delete note, for a new note.
- Edit mode keeps raw Markdown visible. View mode is the separate Quick View
  dialog.
- Closing, canceling, Escape, and switching from Edit to View must respect the
  unsaved-change confirmation. Never silently discard a dirty draft.
- Existing formatting shortcuts are platform-aware:
  - macOS: `Cmd+B`, `Cmd+I`, `Cmd+K`.
  - Windows/Linux: `Ctrl+B`, `Ctrl+I`, `Ctrl+K`.
- Existing save shortcuts are platform-aware:
  - Quick Save: `Cmd/Ctrl+Shift+S`, keeps the editor open.
  - Save and close: `Cmd/Ctrl+Enter`.
- Keep shortcut/help tooltips synchronized with the platform modifier and
  accessible by both hover and keyboard focus.

## HTML and accessibility conventions

- Prefer semantic elements: `main`, `aside`, `nav`, `section`, `article`,
  `label`, `button`, and native dialogs.
- Every icon-only button needs an accessible name via `aria-label`; use a
  `title` when it helps discoverability.
- Keep visible focus styles. Do not remove `:focus-visible` outlines without a
  clearly equivalent replacement.
- Use `aria-live` only for status/result regions that need announcements.
- Keep dialog labels/descriptions and focus restoration working when adding or
  moving controls.
- Use inline SVG for interface icons and keep the existing thin-stroke visual
  language. Do not introduce a new icon library for a small feature.

## CSS and visual conventions

- Keep styles in `styles.css`; avoid inline styles except for existing measured
  runtime values such as Quick View height.
- Use the existing BEM-like naming pattern: `.block`, `.block__element`, and
  `.block--modifier`. Use `.is-hidden` for state visibility and preserve
  existing state classes such as `.is-active`.
- Reuse `.button`, `.button-primary`, `.button-secondary`, `.button-danger`,
  `.icon-button`, and existing spacing/color conventions before creating a new
  component style.
- Keep the light, restrained visual system: rounded cards/dialogs, neutral
  borders, indigo primary actions, gray secondary actions, thin outline icons.
- Preserve responsive breakpoints and the mobile full-screen dialog behavior.
- Respect `prefers-reduced-motion` and `forced-colors` rules when adding motion
  or visual state.

## Validation expectations

Separate static checks from runtime checks and report them separately:

- Static JavaScript syntax: `node --check app.js` and `node --check markdown.js`.
- Patch whitespace: `git diff --check`.
- Runtime: serve only on localhost when needed, open the app in a browser, and
  test the affected flow with no console errors.
- For dialog changes, test new note, existing note, dirty draft, keyboard
  focus, and responsive/mobile behavior as applicable.
- For storage changes, test save, delete, import, export, validation, and
  backward-compatibility paths as applicable.

Do not claim browser, database, import/export, or external-service validation
unless that path was actually exercised.

## Git and change safety

- Check `git status --short --branch` before editing.
- Preserve unrelated user changes in the working tree.
- Use `apply_patch` for source edits and keep diffs reviewable.
- Do not run destructive commands, reset the database, commit, push, or create
  external artifacts unless the user explicitly asks for that action.
- Before handoff, report changed files, checks run, runtime evidence, known
  limitations, and whether a commit was created.
