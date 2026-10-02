# Nook - repository instructions

Read [docs/agent-guide.md](docs/agent-guide.md) for the project reading order,
module ownership, implementation workflow, UI/CSS rules, and validation guidance
before making changes. Use it alongside the instructions below.

## App overview

Nook is a private personal note app. It runs entirely offline in the browser:

- UI: vanilla HTML, CSS, and JavaScript only.
- Persistence: IndexedDB in the current browser.
- Import/export: local JSON backup files; no server or external API.
- Note content: stored as raw Markdown text and rendered in Quick View.
- Organization: notes belong to one note type and can have multiple tags.
- Current entry point: `index.html` loads the CSS manifest, registry, and shared
  theme catalogue in the head, then `js/storage.js`, `js/markdown.js`, and
  registered feature modules in the body.

There is currently no `package.json`, bundler, framework, or remote runtime
dependency. Regression tests use Node's built-in `node:test`; optional browser
QA uses an already installed local Playwright. Keep the app openable as a static local website.

## Product boundaries

- Preserve the offline-first behavior. Do not add CDNs, hosted fonts, analytics,
  external APIs, authentication, or network calls without explicit approval.
- Keep note data local to the browser. Never log note content or expose it to a
  third-party service.
- Keep the existing note model and backup compatibility. Schema changes require
  an explicit IndexedDB migration and a review of import/export behavior.
- Use the existing `PersonalNotesStorage` API from the UI. Do not access
  IndexedDB directly from `js/app/` for normal feature work.
- Keep changes focused. Do not bundle unrelated redesigns, framework adoption,
  or dependency installation into a feature change.

## Source map

- `index.html`: semantic page structure, native `<dialog>` markup, accessible
  labels, buttons, and script loading order.
- `css/`: ordered style layers. Foundations and shared components load first;
  focused library, settings, note-detail, accessibility, and theme layers load
  afterward. Preserve the order in `index.html` when moving rules.
- `js/storage.js`: IndexedDB setup, validation, normalization, legacy migration,
  note/type/tag CRUD, backup export, and backup import. It exposes the frozen
  `globalThis.PersonalNotesStorage` API.
- `js/markdown.js`: dependency-free, safe Markdown-to-DOM renderer. It exposes
  the frozen `globalThis.NookMarkdown` API.
- `js/app/runtime.js`: module registration and explicit installer dependency order.
- `js/app/theme-config.js`: theme metadata, aliases, and before-paint theme setup.
- `js/app/elements.js`: cached DOM references.
- `js/app/core.js`: shared constants, application state, preferences, and pure UI helpers.
- `js/app/local-state.js`: legacy draft compatibility and backup health.
- `js/app/search.js`: search/filter primitives, ordering, indexing, and query scheduling.
- `js/app/pane-controller.js`: shared save/conflict/recovery lifecycle for pane adapters.
- `js/app/contracts.d.ts` and `jsconfig.json`: strict development checks for the pane/theme boundary.
- `js/app/preferences.js`: theme, layout, sidebar, responsive control state, and
  UI preference persistence.
- `js/app/feedback.js`: toast behavior and confirmation-dialog focus management.
- `js/app/note-actions.js`: shared pin, Trash/Undo, restore, and permanent-delete
  mutations used by cards and editor surfaces.
- `js/app/library-sidebar.js`: sidebar filters, metadata badges, and tag fitting.
- `js/app/library.js`: note cards, pagination, sort controls, and Trash rendering.
- `js/app/workspace.js`: primary preview, detail workspace, and transitions.
- `js/app/clipboard.js`: raw-Markdown copy and copy feedback.
- `js/app/side-note.js`: Side note navigation, DOM adapter, and autosave.
- `js/app/note-pickers.js`: shared type/tag picker components and pane adapters.
- `js/app/split-scroll.js`: Split preview rendering and scroll synchronization.
- `js/app/formatting.js`: Markdown editing operations and formatting scroll cues.
- `js/app/editor.js`: primary editor adapter, modes, validation, autosave, and draft safety.
- `js/app/split-selection.js`: Split-mode selection mapping and highlight lifecycle.
- `js/app/organize.js`: type/tag management, library refresh/render orchestration,
  import/export, and per-note downloads.
- `js/app/sync.js`: same-origin tab notifications and guarded external refreshes.
- `js/app/offline.js`: storage capability reporting and hosted update controls.
- `js/app/mobile.js`: responsive control placement, mobile sheets, and Back guards.
- `js/app/onboarding.js`: dismissible first-use explanation and explicit guide-note creation.
- `js/app/events.js`: event registration, startup arrangement, and bootstrap.
- `js/app/recovery.js`: all-tab Draft Recovery and safe recovery-source cleanup.
- `js/app/data-import.js`: multi-file Markdown import and backup merge/replace inspection.
- `js/app/productivity.js`: Quick actions, guarded navigation, templates, Daily notes, and workflow dialogs.
- `js/app/bulk-actions.js`: note selection across pages/filters and atomic batch actions.
- `css/workflows.css`: theme-aware workflow dialogs and bulk-selection surfaces.
- `scripts/update-service-worker-cache.cjs`: refreshes the hosted asset cache
  fingerprint; its regression test rejects missing or stale assets.
- `favicon.svg`: local app icon.

## Data and storage conventions

The storage layer owns the data contract. Current records include:

- Note: `id`, `title`, `typeId`, `tagIds`, `content`, `createdAt`, `updatedAt`.
- Type: `id`, `name`, `normalizedName`, `color`, `isFallback`, timestamps.
- Tag: `id`, `name`, `normalizedName`, timestamps.

Current limits and invariants are defined in `js/storage.js`, including title,
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

- Use strict-mode IIFEs for runtime scripts; avoid adding globals except the
  existing `PersonalNotesStorage` and `NookMarkdown` namespaces.
- Application modules register through the temporary
  `Symbol.for("nook.app.modules")` registry created by `runtime.js`. Keep cross-module
  calls late-bound, keep each API export owned by one installer, preserve script order,
  and let `events.js` remove the registry
  before bootstrap.
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
- The current renderer supports CommonMark/GFM-style headings, setext headings,
  bold, italic, strikethrough, inline code, fenced and indented code blocks,
  unordered/ordered/nested lists, task lists, blockquotes, GitHub-style alerts,
  links/reference links/autolinks, tables with alignment, footnotes, details,
  mathematical-expression text blocks, entities, hard line breaks, and
  horizontal rules. Keep unsupported syntax inert and safe.
- Images are represented by accessible alt text to keep the app offline and
  avoid loading untrusted remote assets. Raw HTML remains inert text except for
  the explicitly allowlisted `<details>`/`<summary>` rendering.
- Do not enable raw HTML or unsafe URL schemes in rendered notes without an
  explicit security review.

## Editor, dialog, and shortcut conventions

- Use native `<dialog>` with `showModal()`/`close()` and keep focus restoration
  behavior intact.
- New note and Edit note share the same editor. Hide edit-only actions, such as
  View note and Delete note, for a new note.
- Edit mode keeps raw Markdown visible. Preview/Quick View uses the same note
  detail workspace; workflow overlays use native dialogs.
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

- Keep styles in the appropriate file under `css/`; avoid inline styles except
  for existing measured runtime values such as Quick View height. Moving a rule
  between files must preserve its position in the ordered cascade.
- Use the existing BEM-like naming pattern: `.block`, `.block__element`, and
  `.block--modifier`. Use `.is-hidden` for state visibility and preserve
  existing state classes such as `.is-active`.
- Reuse `.button`, `.button-primary`, `.button-secondary`, `.button-danger`,
  `.icon-button`, and existing spacing/color conventions before creating a new
  component style.
- Keep the restrained visual system: rounded cards/dialogs, neutral borders,
  theme-specific primary accents, secondary surfaces, and thin outline icons.
- Preserve responsive breakpoints and the mobile full-screen dialog behavior.
- Respect `prefers-reduced-motion` and `forced-colors` rules when adding motion
  or visual state.

## Validation expectations

Separate static checks from runtime checks and report them separately:

- Static JavaScript syntax: `node --check js/storage.js`,
  `node --check js/markdown.js`, and `node --check` for every `js/app/*.js` file.
- Patch whitespace: `git diff --check`.
- Shared pane/theme contracts: `tsc -p jsconfig.json` when TypeScript is already available
  as a development tool; this intentionally checks only the listed boundary files.
- Optional isolated browser UI QA: `node scripts/test-maintainability.cjs` with
  Node 20+ and an existing local Playwright installation.
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
