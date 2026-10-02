# Nook agent guide

This guide explains how to understand Nook and change it within its existing
design. Read it with [AGENTS.md](../AGENTS.md), which contains the repository
instructions. [Architecture](architecture.md) describes the detailed contracts;
[README](../README.md) describes the product from a user's perspective.

Quick navigation:

- [Reading order and scope](#1-start-with-the-task-and-the-working-tree)
- [Product boundary](#2-preserve-the-product-boundary)
- [Startup and module ownership](#3-understand-startup-and-ownership)
- [JavaScript conventions](#4-follow-the-javascript-conventions)
- [Data and async safety](#5-keep-data-and-async-operations-safe)
- [UI and CSS](#6-preserve-ui-behavior-and-visual-design)
- [Validation](#7-validate-the-affected-contract)
- [Handoff](#8-finish-with-a-reviewable-handoff)

## 1. Start with the task and the working tree

Before editing:

1. Read the current request and `AGENTS.md`. Identify the intended behavior,
   scope, and any explicit exclusions.
2. Run `git status --short --branch`. Read the relevant committed, staged,
   unstaged, and untracked files. Existing local changes are part of the current
   implementation; preserve work outside your task.
3. Read the relevant README flow and architecture section. Historical plans,
   including `reliability-offline-implementation-plan.md`, provide context;
   they do not automatically authorize new work.
4. Trace one affected action through its event, owning module, data operation,
   refresh, and rendered state. Use `rg` to find callers, exports, selectors,
   and existing tests before introducing another helper.
5. State the smallest change that fixes the whole affected flow and the checks
   that will demonstrate it.

Current code and test results establish what exists. The task and repository
instructions establish what is intended. If implementation and a documented
contract disagree, investigate the difference; do not silently redefine the
contract around a bug. Ask only when a missing product decision blocks the
change, and continue independent work where possible.

For initial onboarding, read in this order:

```text
AGENTS.md → README.md → docs/architecture.md
→ index.html + js/app/runtime.js + css/app.css
→ the affected module and its callers/tests
```

Read `js/storage.js` before changing persisted data, `editor-session.js` and
`pane-controller.js` before changing save/recovery behavior, and
`theme-config.js` before changing themes.

## 2. Preserve the product boundary

Nook is a private, offline-first static website using vanilla HTML, CSS, and
JavaScript. It has no build step, `package.json`, framework, backend, account,
cloud sync, or remote runtime dependency. Both a local static server and
opening `index.html` through `file://` are supported.

Keep these boundaries unless the user explicitly changes the product scope:

- No CDN, hosted font, analytics, authentication, external API, or new network
  service. Fonts, icons, scripts, and styles are local assets.
- Canonical notes, types, tags, and saved history belong in IndexedDB through
  `PersonalNotesStorage`. Preferences and draft recovery use localStorage;
  sessionStorage holds the per-tab recovery identity.
- UI code must not open IndexedDB directly. The Service Worker caches app
  resources and never owns note records.
- Never log note content or send it to another service. Use synthetic data for
  demonstrations, screenshots, and tests.
- JSON backups carry the library and saved history. Recovery drafts are not
  included. Browser persistence and an offline app cache are not backups.
- Copy and per-note `.md` downloads preserve Markdown source. `.txt` export
  was removed; do not reintroduce it incidentally.
- Different origins, ports, browsers, and profiles have separate local data.
  Do not imply that opening another instance transfers a library.

## 3. Understand startup and ownership

The head of [index.html](../index.html) loads the classic-script registry and
theme catalogue before paint. The body loads storage, Markdown, and feature
registrations. [runtime.js](../js/app/runtime.js) collects installers under
`Symbol.for("nook.app.modules")` and initializes them in its explicit
`MODULE_ORDER`. Script-tag order alone is not the installer dependency order.

[events.js](../js/app/events.js) runs last, freezes the assembled API, removes
the temporary registry, and bootstraps storage, the first library snapshot,
controls, and listeners before enabling the app. Registration must not write
notes or perform a second bootstrap. Theme setup is the intentional early
presentation step.

Choose an owner by responsibility:

| Change | Read or edit first |
| --- | --- |
| Database, validation, migration, CRUD, history records, backup contract | [storage.js](../js/storage.js) |
| Markdown parsing, safe rendered DOM | [markdown.js](../js/markdown.js) |
| Static markup or cached controls | [index.html](../index.html), [elements.js](../js/app/elements.js) |
| Shared state/constants/pure UI helpers | [core.js](../js/app/core.js) |
| Legacy recovery compatibility or backup health | [local-state.js](../js/app/local-state.js) |
| Search, filtering, ordering, highlighting | [search.js](../js/app/search.js) |
| Sidebar filters, badges, card tag fitting | [library-sidebar.js](../js/app/library-sidebar.js) |
| Cards, pagination, sort controls, Trash presentation | [library.js](../js/app/library.js) |
| Pin, Trash/Undo, restore, permanent delete | [note-actions.js](../js/app/note-actions.js) |
| Primary preview/detail workspace and transitions | [workspace.js](../js/app/workspace.js) |
| Shared pane save, conflict, disposal, recovery lifecycle | [pane-controller.js](../js/app/pane-controller.js), [editor-session.js](../js/app/editor-session.js) |
| Primary or Side note DOM, validation, autosave timing | [editor.js](../js/app/editor.js), [side-note.js](../js/app/side-note.js) |
| Shared in-pane note picker, cancellation, and switching | [note-switcher.js](../js/app/note-switcher.js) |
| Type/tag pickers, Markdown formatting, raw copy | [note-pickers.js](../js/app/note-pickers.js), [formatting.js](../js/app/formatting.js), [clipboard.js](../js/app/clipboard.js) |
| Split rendering/scrolling or selection mapping | [split-scroll.js](../js/app/split-scroll.js), [split-selection.js](../js/app/split-selection.js) |
| History dialog and restore workflow | [history.js](../js/app/history.js) |
| Catalog management, export UI, library refresh | [organize.js](../js/app/organize.js) |
| Markdown imports or JSON merge/replacement UI | [data-import.js](../js/app/data-import.js) |
| Quick actions, guarded workflows, templates, Daily notes | [productivity.js](../js/app/productivity.js) |
| Cross-page selection and batch actions | [bulk-actions.js](../js/app/bulk-actions.js) |
| Draft Recovery Center and recovery-source cleanup | [recovery.js](../js/app/recovery.js) |
| Theme metadata/aliases or preference presentation | [theme-config.js](../js/app/theme-config.js), [preferences.js](../js/app/preferences.js) |
| Tab notifications or storage/offline/update controls | [sync.js](../js/app/sync.js), [offline.js](../js/app/offline.js) |
| Mobile control placement, sheets, viewport/Back guards | [mobile.js](../js/app/mobile.js) |
| First-use explanation and explicit guide-note creation | [onboarding.js](../js/app/onboarding.js) |
| Event wiring and startup | [events.js](../js/app/events.js) |

Keep feature policy in its owner. Do not turn `core.js`, `events.js`, or a new
generic utilities file into a collection of unrelated behavior. Extract a
module when it has a coherent responsibility and a useful boundary, rather
than splitting files merely to reduce their line counts.

## 4. Follow the JavaScript conventions

- Use strict-mode IIFEs for new runtime files, `const`/`let`, two-space
  indentation, double quotes, semicolons, and the surrounding code's layout.
  Do not reformat unrelated functions.
- Prefer small named functions, early returns, and explicit inputs/results.
  Explain a non-obvious invariant or ordering requirement in comments; avoid
  comments that merely repeat the code.
- Keep private helpers private. Export only cross-module operations through
  `app.api`, with one installer owning each name. The runtime rejects replacing
  another installer's export.
- Declare already installed dependencies at the installer boundary. For an
  operation owned by a later installer, call `api.operation()` when used or
  use the existing late-bound wrapper pattern. Capturing that function during
  installation can capture `undefined` permanently.
- Keep `elements`, `library`, `ui`, and `shared` in their existing roles.
  `library` is the loaded data snapshot; `ui` is presentation state. Shared
  pane-session references coordinate modules; they are not permission to
  mutate session internals.
- Cache stable controls in `elements.js`. Put application event wiring in
  `bindEvents()` or an existing feature binding function invoked at startup.
  Listeners on generated controls may stay with the control's owner. Avoid
  duplicate bindings after a render or refresh.
- Construct DOM with the existing `createElement()` helper, `textContent`,
  `createTextNode`, `append()`, and `replaceChildren()`. Do not put user input
  into `innerHTML`.
- Reuse `showToast`, `showError`, and `requestConfirmation`; do not create a
  parallel notification/dialog system. Surface operation failures and preserve
  recoverable input.

A new module follows this registration shape; `feature-name` is a placeholder,
not an existing installer:

```js
(() => {
  "use strict";

  globalThis[Symbol.for("nook.app.modules")].register("feature-name", (app) => {
    const { api } = app;

    function featureOperation() {
      // Keep the feature's implementation here.
    }

    Object.assign(api, { featureOperation });
  });
})();
```

Before adding a module, prefer extending an existing owner. If a new owner is
needed, add its name at the correct dependency position in `MODULE_ORDER`, its
classic script in `index.html`, its asset in `sw.js`, and its ownership in the
architecture documentation. Regenerate the cache fingerprint afterward. Do
not silently switch to ES Modules or add a bundler to simplify registration.

[contracts.d.ts](../js/app/contracts.d.ts) and [jsconfig.json](../jsconfig.json)
check the pane controller and theme catalogue with strict JSDoc-based types.
They emit no JavaScript. Keep changed interfaces consistent; extend this
checked boundary deliberately when useful. Do not claim that the whole app
has TypeScript coverage.

## 5. Keep data and async operations safe

An ordinary mutation follows this path:

```text
event → owning feature/controller → PersonalNotesStorage
→ refreshLibrary({ broadcast: true }) → derived UI rendering
```

Use the existing operation's orchestration, including guarded external
refreshes. Do not optimistically guess catalog counts or mutate a cached note
as a substitute for reading the committed snapshot.

### Stored records and backups

The current database/backup contracts are described in
[architecture.md](architecture.md#indexeddb-and-stored-data-contract).
Inspect the actual validators, migrations, and parser in `storage.js` before
editing them. Reuse storage validation rather than creating competing limits
or normalization rules in the UI.

Preserve these invariants:

- Existing-note saves compare captured revision/snapshot inputs within the
  write transaction. Timestamps are not concurrency tokens. Conflicts write
  nothing; semantic no-ops do not increment revision or create history.
- Actual note changes archive the previous committed snapshot and write the
  new revision atomically. Restore creates a new current revision.
- Imports validate before committing. Replacement and batch mutations must
  remain atomic; a failed validation or stale preview must not leave a partial
  library. Merge preserves existing local notes.
- Old backups and migrations remain supported. A schema change needs an
  explicit upgrade path and import/export compatibility review. Never solve a
  migration problem by silently clearing or recreating the database.
- Preview and confirmation are distinct from committing a write. Preserve the
  merge mutation token and captured batch revisions between those steps.
- A requested browser download does not prove that a backup file was saved.
  Selection export is not a full backup; JSON files are not encrypted.

Templates remain ordinary notes with the `template` marker tag, so editing,
Trash, and backups use the normal note contract. Daily notes use a stable local
calendar-date ID, not a title search; renaming one must not create a duplicate,
and a trashed Daily note requires explicit restoration.

### Editors and recovery

`editor-session.js` owns DOM-independent draft/save sequencing;
`pane-controller.js` owns common lifecycle, conflict choices, and stale-result
guards. Primary and Side note adapters own DOM reads, validation, autosave
timers, save-status presentation, and post-save rendering.

Use the controller/session APIs instead of adding another save state machine.
Preserve `noteSaveInFlight`, `noteEditorSession`, and
`isCurrentNoteEditorSession()` guards where the adapters use them. After each
asynchronous boundary, verify that the captured operation still belongs to the
active session before updating its DOM, status, or navigation.

Specifically, a slow save must not overwrite newer typing, update a replaced
pane, or close a different note. Dirty drafts survive conflicts, failed saves,
external refreshes, and recoverable closes. Explicit discard removes only the
intended recovery records. Recovery-source cleanup compares captured source
timestamps so completing an older recovery cannot delete a newer draft.

Closing, Return, Escape, Back, opening another note, and destructive library
actions must use the existing dirty-draft guards. Exporting a recovery draft
keeps it; opening a recovered draft must not immediately autosave over the
original. Test both panes and a second tab when touching these paths.

## 6. Preserve UI behavior and visual design

Nook uses restrained surfaces, clear hierarchy, local typography, thin outline
SVG icons, and theme-specific accents. Reuse `.button`, `.button-primary`,
`.button-secondary`, `.button-danger`, and `.icon-button` before inventing
another control style. Primary color comes from the active theme; Light's warm
accent is not a universal blue/indigo palette.

Before changing a shared control, inspect its full flow: primary/Side note,
Preview/Edit Markdown/Split, new/existing/trashed note, desktop/mobile, and
resting/hover/focus/selected/disabled states as relevant. Find the shared owner
and make the smallest fix there. A screenshot of one state is insufficient
evidence for a paired workspace change.

Existing behavior to retain:

- New and existing notes share the editor; edit-only actions stay hidden for a
  new note. Preview renders the source, while Edit Markdown edits raw text.
- Copy uses raw Markdown. Rendering goes through `NookMarkdown.renderInto()`;
  raw HTML stays inert except the allowlisted details/summary syntax, unsafe
  links stay inert, and images do not fetch remote resources.
- Preserve source whitespace and Markdown syntax. Do not trim or rewrite the
  stored source to improve a preview or import; storage owns line-ending
  normalization, and imported front matter remains literal content.
- Save and formatting shortcuts use Cmd on macOS and Ctrl elsewhere. Quick
  Save keeps the editor open; Save & return closes after a safe save. The active
  pane determines the target. Update tooltips/help together with a shortcut.
- Both pane statuses describe actual state: Saved, Saving, Unsaved changes,
  or Save failed. A conflict retains the draft and offers explicit choices.
- Native modal dialogs use `showModal()`/`close()` and restore focus. The note
  detail workspace has its own navigation; do not turn every surface into a
  modal or bypass existing close guards.
- Preserve semantic controls, icon names, focus indicators, reduced-motion,
  and forced-colors behavior when modifying existing components.
- Mobile placement moves existing cached control nodes. Cloning controls
  breaks references/listeners and can create duplicate IDs.
- Side note temporarily collapses the sidebar at 960–1200px without persisting
  that automatic state. Closing it or widening restores the user's preference;
  an explicit toggle remains user intent. Below 960px, preserve guarded Side
  note closure. The mobile editor boundary is 820px; keep Split restrictions.
- Detail text size applies only to editor/preview content, including Side note.
  Keep the shared preference bounds and controls synchronized; do not let its
  selectors change library cards, settings, or unrelated dialogs.
- Formatting overflow cues reflect the scroll position. Settings More menus
  remain usable for the last row of long lists and on touch screens.
- Opening an empty library creates no note automatically. Add a guide note is
  an explicit action creating an ordinary editable/exportable note.
- Bulk selection is desktop-only. At 820px and below, hide its trigger, card
  checkboxes, toolbar, and Actions entry; retain snapshots for desktop resumption.

### CSS ownership and cascade

[css/app.css](../css/app.css) is an ordered import manifest, not a place for
new selectors. The live cascade is:

```text
app.css ordered layers → one active theme
→ mobile.css → note-typography.css → workflows.css
```

| Layer | Responsibility |
| --- | --- |
| `base.css` | Reset, local fonts, semantic tokens, shell, primitives |
| `note-components.css`, `dialogs.css`, `management.css`, `markdown.css` | Shared components and rendered Markdown |
| `library.css`, `organize.css`, `note-detail.css`, `workflows.css` | Feature-owned layout and surfaces |
| `interactions.css` | Shared interaction states and motion |
| `responsive.css`, `mobile.css` | Cross-feature responsiveness and final mobile geometry |
| `accessibility.css` | Existing focus, reduced-motion, forced-colors rules |
| `themes/*.css` | Palette tokens and intentional theme-specific structure |
| `note-typography.css` | Detail-only typography preference |

Use BEM-like names (`.block`, `.block__element`, `.block--modifier`) and existing
state classes such as `.is-hidden` and `.is-active`. Reuse semantic roles such
as `--surface-panel`, `--text-default`, `--border-subtle`, `--selected-surface`,
and `--danger-text` rather than repeating literal colors.

Shared tag/picker/menu colors use role tokens (`--tag-chip-*`, `--tag-option-*`,
`--empty-tag-*`, `--picker-menu-*`, `--tag-menu-*`). Component owners provide
fallbacks; themes supply their palettes. Common type/color menu geometry
belongs in `management.css`. Retro and E-Ink have intentional typography,
shape, and state differences; preserve them when consolidating other themes.

Search all definitions of a selector/property before moving or overriding it.
Preserve cascade order. Fix the owning rule rather than appending a competing
override or escalating specificity/`!important` for convenience. Keep inline
styles limited to existing measured geometry and presentation custom properties.
Theme labels, assets, Auto resolution, and legacy aliases belong in
`theme-config.js`, not another hardcoded theme list.

## 7. Validate the affected contract

Choose checks for the change's risk. A documentation edit does not require
browser QA; a data or editor change does. Add a regression test for a meaningful
behavioral failure when useful, rather than a test that copies implementation
details. Update existing source-location checks when moving their owner.

Static checks for application changes:

```bash
node --check js/storage.js
node --check js/markdown.js
for file in js/app/*.js; do node --check "$file"; done
node --test tests/*.test.js
git diff --check
```

If TypeScript is already available, run `tsc -p jsconfig.json` for changes to
its checked files or contracts. Do not install development tooling or introduce
a package setup as an incidental task.

When changing hosted HTML, CSS, JavaScript, fonts, icons, manifest assets, or
worker behavior, verify the `APP_ASSETS` entries in [sw.js](../sw.js), add any
new runtime asset, and run:

```bash
node scripts/update-service-worker-cache.cjs
node --test tests/service-worker.test.js
```

The updater recalculates the fingerprint; it does not discover new manifest
entries. Documentation outside the hosted asset manifest needs no cache update.

| Change | Runtime evidence to collect |
| --- | --- |
| Editor/controller/navigation | New/existing note, both panes, newer typing during save, dirty close, failure/conflict, reload recovery, relevant two-tab path |
| Storage/import/export/history | Real IndexedDB save/no-op/conflict, invalid-write atomicity, migration, old backup, round trip, relevant Trash/restore/history/batch path |
| CSS/components/preferences | Relevant modes and states, all affected themes, wide/narrow widths, paired pane geometry, long labels/content, overflow and menu edges |
| Markdown | Supported syntax, literal unsafe HTML/URLs, bounds/fallback, independent render scopes, source preservation |
| Startup/module/assets/offline | Complete startup, console errors, `file://`, hosted cache/reopen/update behavior, dirty update guard |
| Documentation | Referenced paths/APIs/commands, relative links, agreement with current owners and instructions, whitespace |

Serve only on localhost for runtime work. Use a fresh browser context/profile
and isolated origin with synthetic data. Do not clear, replace, or seed the
user's real library to test a change.

Available browser evidence sources:

- [Storage harness](../tests/browser/storage-harness.html): run `?scenario=v1`,
  `v2`, `save`, `bytes`, and `backup` on an isolated localhost origin.
- [Editor session harness](../tests/browser/editor-session-harness.html),
  [Markdown harness](../tests/browser/markdown-harness.html), and
  [Split selection harness](../tests/browser/split-selection-harness.html):
  exercise their own boundaries.
- [test-workflows.cjs](../scripts/test-workflows.cjs): optional isolated Chromium
  storage/productivity/offline/file-mode checks.
- [test-maintainability.cjs](../scripts/test-maintainability.cjs): optional
  Chromium onboarding/theme/sidebar/menu/mobile checks.
- [test-note-switcher.cjs](../scripts/test-note-switcher.cjs): optional Chromium
  checks for both pane pickers, cancellation, save failures, conflicts, and
  responsive layouts.

The optional scripts require Node 20+ and an existing local Playwright;
`NOOK_PLAYWRIGHT_MODULE` can select its module path. `NOOK_SCREENSHOT_DIR`
retains maintainability screenshots in a temporary directory. These are
development tools, not browser runtime dependencies.

Report evidence at its actual level. Syntax checks and Node tests do not prove
real IndexedDB or rendered UI. A storage harness does not prove the entire
app. Chromium viewport emulation does not prove Safari, Firefox, real hardware,
quota grants, or production behavior. Mark paths not exercised as unverified.

## 8. Finish with a reviewable handoff

Read the final diff against the initial working-tree scope. Confirm that the
change has one clear owner, no duplicate implementation, no unintended data or
UI behavior changes, and no unrelated formatting or generated files.

Update README for changed user behavior and architecture/AGENTS for changed
ownership or contracts. Keep repository documentation and UI copy in English;
conversation with Ray may be Vietnamese. Do not copy temporary pass counts,
machine-specific paths, or a current cache fingerprint into permanent guidance.

The handoff should state:

- What changed and why, with links to the affected files.
- Checks actually run and their results, separating static and runtime evidence.
- Material limitations or remaining work.
- Whether a commit was created.

Do not commit, push, reset data, or publish external artifacts unless requested.
When a product decision is needed, present the concrete choice and its effect;
do not add an approval step to routine, authorized edits.
