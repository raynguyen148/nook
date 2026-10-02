# Nook architecture

Nook is a dependency-free, offline-first static application. It keeps note
content in the current browser's IndexedDB and keeps UI preferences and
unfinished editor recovery records in localStorage. There is no backend,
account, sync service, analytics, CDN, hosted font, bundler, or framework.

The product boundary is intentionally local:

- `file://` remains a supported way to open the app.
- HTTPS and localhost may add a Service Worker cache for app resources, but the
  Service Worker never owns note data.
- Application modules use the frozen `globalThis.PersonalNotesStorage` API;
  normal UI code does not open IndexedDB directly.
- JSON backup is the portability and recovery boundary. Browser persistence and
  Service Worker caching are not backups.

## Bootstrap and classic-script registry

`index.html` loads the registry and theme catalogue in the head before first
paint, then loads storage, Markdown, and classic feature scripts in the body. `js/app/runtime.js` creates the temporary registry at
`Symbol.for("nook.app.modules")`. Each application file registers one named
installer; the runtime initializes installers only after all required names are
present.

The installer order is explicit and is the dependency contract:

```text
theme-config
→ elements
→ core
→ local-state
→ search
→ preferences
→ feedback
→ editor-session
→ pane-controller
→ note-actions
→ library-sidebar
→ library
→ workspace
→ clipboard
→ side-note
→ note-pickers
→ split-scroll
→ formatting
→ editor
→ note-switcher
→ split-selection
→ history
→ organize
→ sync
→ offline
→ mobile
→ recovery
→ data-import
→ productivity
→ bulk-actions
→ onboarding
→ events
```

The order of feature `<script>` tags does not replace this contract. The
runtime rejects unknown or duplicate registrations, conflicting API owners,
and reports missing modules
without touching IndexedDB. `events.js` freezes the assembled application API,
removes the temporary registry, and runs bootstrap; bootstrap then initializes
storage and refreshes the first library view before enabling the app.

This is a classic-script registry, not an ES Module graph. Keep the app
openable from a static file or server: do not introduce `type="module"`, a
bundler, a package install, or a remote runtime dependency without an explicit
product decision.

## Module ownership

| Module | Owns |
| --- | --- |
| `js/storage.js` | IndexedDB v3, validation, migrations, revisioned note CRUD, history, Trash lifecycle, and backup parsing/import/export |
| `js/markdown.js` | Safe Markdown-to-DOM rendering and plain-text conversion; no external parser or network asset loading |
| `js/app/elements.js` | Cached DOM references |
| `js/app/core.js` | Shared application state, constants, stored preferences, and pure UI helpers |
| `js/app/local-state.js` | Legacy recovery compatibility and backup health |
| `js/app/search.js` | Search indexing/highlighting, filter primitives, ordering, and query scheduling |
| `js/app/library-sidebar.js` | Sidebar filters, metadata badges, and card tag fitting |
| `js/app/workspace.js` | Primary note preview, detail workspace, and workspace transitions |
| `js/app/clipboard.js` | Raw-Markdown copy and transient copy feedback |
| `js/app/note-pickers.js` | Shared type/tag picker components and both panes’ picker rendering |
| `js/app/formatting.js` | Markdown editing operations and mobile formatting scroll cues |
| `js/app/split-scroll.js` | Split preview rendering and scroll mapping/synchronization |
| `js/app/theme-config.js` | One theme catalogue for startup, preferences, labels, assets, and legacy aliases |
| `js/app/pane-controller.js` | Shared pane session, save, conflict, and recovery lifecycle |
| `js/app/onboarding.js` | Dismissible local-data introduction and explicit ordinary guide-note creation |
| `js/app/preferences.js` | Theme, layout, sidebar, responsive controls, and preference persistence |
| `js/app/feedback.js` | Toasts, confirmation dialogs, and focus restoration |
| `js/app/editor-session.js` | DOM-independent editor state machines, save sequencing, CAS inputs, conflict state, and per-session draft recovery |
| `js/app/note-actions.js` | Pin, move-to-Trash with Undo, restore, permanent-delete, and empty-Trash mutations shared by cards and editor surfaces |
| `js/app/library.js` | Library cards, pagination, Trash presentation, and sort controls |
| `js/app/side-note.js` | Side note navigation, DOM/editor adapter, and autosave presentation |
| `js/app/note-switcher.js` | Shared note picker rendering, per-pane browsing state, cancellation, and guarded note switching |
| `js/app/editor.js` | Primary DOM/editor adapter, validation, modes, autosave, and safe draft hydration |
| `js/app/split-selection.js` | Split-mode source/preview selection mapping and highlight lifecycle |
| `js/app/history.js` | Version-history list, safe preview, restore confirmation, and history-dialog focus behavior |
| `js/app/organize.js` | Type/tag management, export UI, delete-all flow, and library refresh orchestration |
| `js/app/sync.js` | Optional same-origin `BroadcastChannel` notifications and guarded external refreshes |
| `js/app/offline.js` | Optional quota/persistence reporting and explicit hosted Service Worker update flow |
| `js/app/mobile.js` | Responsive control placement, mobile dialogs/navigation, viewport geometry, and Back-button guards |
| `js/app/recovery.js` | All-tab draft enumeration, preview/copy/export/recover/discard, source cleanup, and best-effort tab presence |
| `js/app/data-import.js` | File reading limits, Markdown batches, merge preview, and explicit backup replacement |
| `js/app/productivity.js` | Quick actions, async navigation guards, template/Daily-note UI, and shared workflow dialogs |
| `js/app/bulk-actions.js` | Selection across pages/filters, atomic batch UI, and selection export |
| `js/app/events.js` | Event binding, startup sequencing, and startup error handling |
| `sw.js` | Versioned cache of local app assets only; never reads or writes note records |

Cross-module calls are late-bound through the runtime API where necessary for
cycles. A module cannot replace an API export owned by another installer. Keep
private functions local, declare direct dependencies at the installer boundary,
and use a late-bound call only when a later installer owns the function.

`pane-controller.js` owns session replacement, draft synchronization, save
serialization, conflict choices, stale completion guards, and recovery context.
Primary and Side note adapters read their DOM and present status; they still
own validation, autosave timing, and rendering after a commit. `editor-session.js`
remains the DOM-independent state machine and storage comparison boundary.

`contracts.d.ts` defines these interfaces. `jsconfig.json` enables strict
development checking for the controller and theme catalogue only; it emits no
JavaScript and introduces no runtime tooling. Grow this checked boundary as
individual modules are changed, rather than treating the rest of the app as
already type-checked.

UI state stays separate from persisted records; after a storage
mutation, the library is refreshed instead of guessing derived counts.

## IndexedDB and stored-data contract

`js/storage.js` opens database `personal-notes` at version `3`. The stores
are:

| Store | Key/index | Purpose |
| --- | --- | --- |
| `notes` | keyPath `id` | Current note records |
| `types` | keyPath `id`, unique `by-normalized-name` | Note types |
| `tags` | keyPath `id`, unique `by-normalized-name` | Reusable tags |
| `noteVersions` | keyPath `id`, index `by-note-id` | Archived committed snapshots |
| `meta` | keyPath `key` | Bootstrap and mutation metadata |

The v3 upgrade creates `noteVersions` and normalizes every existing note with a
positive integer `revision`; old v1/v2 notes begin at revision `1`. The
migration does not clear or recreate the database. A missing history store or
index is created in the upgrade transaction.

Current note fields are:

```text
id, title, typeId, tagIds, content, createdAt, updatedAt,
isPinned, deletedAt, revision
```

`title` is limited to 160 characters, type/tag names to 48 characters, and raw
Markdown content to 50,000 characters. The storage layer owns normalization,
validation, line-ending normalization, and reference checks.

### Revisioned save and history invariants

`PersonalNotesStorage.saveNote(input)` accepts an optional
`input.expectedRevision` for an existing note. The targeted read and revision
comparison happen in the same IndexedDB read-write transaction as the note and
history writes:

1. Read the current note, selected type/tags, and that note's history.
2. Compare `expectedRevision` and optional `expectedSnapshot` editor fields when supplied.
3. Return `NOTE_CONFLICT` with `latestNote` on a mismatch; write nothing.
4. Return the current note unchanged for a semantic no-op.
5. For an actual mutation, archive the current snapshot, trim history, and
   write the next integer revision atomically.

New notes start at revision `1`. A no-op does not change revision, timestamps,
or history. Title, content, type, and tag changes use the editor-save path;
pin and Trash state changes also archive and increment when they change the
stored note. Catalog operations that reassign or remove a note's type/tag
reference archive the affected notes as well. Timestamps are metadata, not
concurrency tokens.

History records use a derived id of `<noteId>::<revision>` and retain the
committed note fields plus `archivedAt`. Retention is the newest 50 records and
at most 5 MiB of UTF-8 content per note. `listNoteVersions`,
`getNoteVersion`, and `restoreNoteVersion` expose the read/restore contract.
Restore archives the current record first, then creates a new current revision;
it never silently removes the only current copy. A historical snapshot referring
to a deleted type or tag can remain in a backup, but restore rejects it until
its references are valid again.

The UI reaches this contract only through the frozen
`globalThis.PersonalNotesStorage` object. Useful additions to that namespace
must preserve static/file mode, old callers, and the no-reset migration rule.

## Editor sessions, recovery, and conflicts

`js/app/editor-session.js` supplies the same state machine to the primary
editor and the Side note. A session has a pane identity, session id, note id,
base revision, committed snapshot, current draft, draft/save sequences, phase,
and conflict payload. Its save boundary is sequence-aware: a slow, rejected,
or stale result cannot mutate a disposed or replaced session, nor overwrite
text typed while an earlier save was in flight.

The primary and Side note sessions are independent. Each recovery record is
keyed by tab, pane, and session under the
`nook:editor-draft:v2:` localStorage prefix. One per-tab identity is kept in
sessionStorage so the primary and Side note share the tab boundary across a
reload without claiming another open tab's records. Records contain the
pane/session identity, draft fields, `baseRevision`, committed snapshot,
conflict flag, recovery-source references, and a saved timestamp;
malformed or older-than-30-day records are pruned.
Recovery is best effort when localStorage is unavailable. Disposing a session
preserves a dirty draft for recovery; explicit discard removes only that
session's record. The optional fields extend the existing v2 recovery record;
older records still parse, but a recovered existing note without a known base
snapshot requires explicit conflict resolution. Source timestamps advance
monotonically. Source cleanup compares the captured timestamp so a newer draft
in another tab is never removed by completing an older recovery.

The Recovery Center enumerates all tabs/panes, hides only unchanged source
records represented by a recovered copy, and uses local presence heartbeats
as a best-effort indication of sessions still open. Recovery opens in the
primary editor without scheduling an immediate autosave. Missing/trashed
originals become new drafts. Export retains the draft; save/explicit discard
clears only unchanged source records. Empty new editors with no title, content,
or tags do not create recovery records.

When a newer note revision arrives from another tab or a CAS save returns
`NOTE_CONFLICT`, the session keeps the local draft and exposes three explicit
paths: keep editing, view the latest committed note, or keep mine by rebasing
against the latest revision and retrying. If the saved note was deleted, the
latest view is unavailable and keeping the draft saves it as a new note.
External refreshes compare both revision and fields, including equal/lower
revisions after an import, and never replace a dirty draft. Backup replacement and delete-all flows require active dirty drafts to be
saved or closed first; recovery drafts are not included in backups.

In the detail workspace, pointer/focus determines the active pane. Mode,
formatting, and save shortcuts target the focused/active pane. Both panes have
their own autosave timer, conflict path, recovery record, and version-history
action. The history controller blocks restore while either relevant draft is
dirty, previews committed Markdown through `NookMarkdown`, and archives the
current note before confirming restore.

The shared note switcher hides a pane's reader without disposing its session.
It pauses pending autosave, keeps independent search/sort/layout/scroll state
for each picker, and excludes notes already open in either pane. Cancellation
restores the existing DOM and scroll positions, resuming a previously scheduled
autosave. Selection waits for that pane's adapter to finish a protected save
before replacing its session. Sequence and session checks prevent a canceled or
closed picker from navigating after a late save; save failures and unresolved
conflicts return to the retained draft. The other pane's session is untouched.

## Backup contract

`buildExport()` emits:

```json
{
  "format": "personal-notes-backup",
  "schemaVersion": 3,
  "exportedAt": "...",
  "data": {
    "noteTypes": [],
    "tags": [],
    "notes": [],
    "noteVersions": []
  }
}
```

The parser accepts schema versions 1, 2, and 3, the older `data.types` name,
and the legacy `interviewQuestions`/`protoblocNotes` shape. Missing revision
fields in older backups normalize to revision `1`; older backups begin with no
history. v3 history is normalized, bounded, and checked against current notes
before import.

Replacement has two boundaries:

1. `inspectBackup()` parses and validates the complete candidate and returns
   counts, including saved history versions. It does not change the library.
2. `importBackup()` replaces notes, types, tags, history, and metadata in one
   IndexedDB transaction after validation completes. A validation or transaction
   failure leaves the previous library intact.

`inspectBackupMerge()` computes additions and per-note statuses without writes.
`mergeBackup()` performs that plan inside one transaction, optionally rejecting
a stale preview using the unique library mutation ID in `meta`. Type/tag names
are matched after normalization; colliding IDs for different names are remapped.
Existing note IDs with identical fields are skipped; differing records are
either skipped or copied with a new ID and remapped history. Merge never changes
an existing note. Historical references to deleted catalogs remain missing
rather than accidentally binding to a different local record.

`inspectMarkdownFiles()` validates file names and source against the existing
title/content limits; `importMarkdownFiles()` validates all inputs and catalog
references before adding a complete batch atomically. UI file limits are
50 MB per JSON backup, or 100 Markdown files/10 MB per batch/200 KB per file.
New imports enforce the parser's 10,000-record limit on the combined library.
`buildExport({ noteIds })` filters notes/history for selection downloads while
retaining the catalog and the unchanged schema v3 envelope.

The UI confirmation describes the replacement and explicitly says recovery
drafts are not in the file. Export creates a Blob and requests a browser
download; that request is not proof that a file was written, so the user must
confirm the download before deleting local data. JSON backups are plain text and
are not encrypted.

## Templates, Daily notes, and batch changes

Custom templates are ordinary notes tagged `template`, created through
`createTemplateNote()` atomically with their tag. Template use expands local
date/time placeholders into a new draft and removes only that marker tag.
`getOrCreateDailyNote()` uses `note-daily-YYYY-MM-DD` as its stable note ID;
concurrent calls return the same note and renaming it does not change its date
identity. An existing trashed Daily note requires an explicit restore. No
IndexedDB version or backup schema changes are needed.

`updateNotesBatch()` reads every selected note/history and selected catalog in
the shared read-write transaction. It validates all captured revisions/fields
before queuing mutations, then archives changed records through the existing
history path. A stale/missing note or catalog aborts the complete batch. The UI
keeps a map of captured snapshots across filters/pages and clears selection
when changing collection. The selection UI offers JSON export, Trash, and
Restore on desktop only. At 820px and below, selection controls and its command
entry are hidden; captured selections survive resize and reappear on desktop.
Type/tag changes use the individual note editor. Selection export
does not claim a full backup.

## Markdown safety

`NookMarkdown` stores raw Markdown unchanged and renders through DOM
construction (`textContent`, created elements, and allowlisted attributes),
not `innerHTML`. Raw HTML remains inert text except for the explicit
`<details>`/`<summary>` block syntax. Images become accessible alt text
instead of loading remote assets. Links allow safe HTTP(S), `mailto`, `tel`,
and relative destinations; unsafe schemes remain text.

Rendering has explicit safety bounds:

- more than 5,000 source lines renders as an inert `<pre>` fallback;
- block or inline nesting deeper than 24 levels renders the original source in
  the same fallback;
- a parser `RangeError` also falls back rather than allowing a partial render.

Footnote definitions are collected per render call. References and back-links
are numbered within that render, and generated ids include a render-specific
scope (plus an optional caller prefix). A preview in one pane therefore cannot
link to a footnote element in another pane or an older render.

## Offline access, quota, and update semantics

`js/app/offline.js` is capability-driven. It uses
`navigator.storage.estimate()` and `navigator.storage.persisted()` when
available to report approximate usage, quota, and persistence state. It offers
`navigator.storage.persist()` as a best-effort request; a denial or unsupported
API is reported without changing notes. Persistent storage may reduce eviction
risk but is not guaranteed and is never a replacement for an external JSON
backup.

`sw.js` is registered only for HTTPS, `localhost`, or `127.0.0.1`. It
pre-caches the local app shell/assets under a content-fingerprinted cache, serves
same-origin cached assets first, and never intercepts note data as a remote
service. `node scripts/update-service-worker-cache.cjs` hashes every manifest
entry plus the normalized worker source. Installation requests use
`cache: "reload"` so an older HTTP cache cannot seed the new versioned cache;
`tests/service-worker.test.js` fails when a referenced runtime asset is missing
or the fingerprint is stale.
`file://` skips registration and continues to use the static scripts and
browser-local storage directly.

An updated worker waits until the user selects **Apply update**. The UI refuses
to activate it while either pane has a dirty draft. If activation occurs while
a draft is dirty through another path, the controller avoids an automatic
reload and tells the user to reload after saving/preserving the draft. There is
no forced reload during active editing.

## CSS ownership

`css/app.css` is the shared ordered cascade manifest. Foundations and shared
components load first; feature rules and accessibility follow. `index.html`
then loads exactly one active theme stylesheet and finally `mobile.css`, so
inactive theme selectors are not parsed or added to the live cascade.

- `base.css`: reset, tokens, shell, and primitives.
- `note-components.css`, `dialogs.css`, `management.css`, `markdown.css`:
  reusable surfaces and rendered content.
- `library.css`, `organize.css`, `note-detail.css`: feature layout.
- `interactions.css`: shared interactive states and motion.
- `responsive.css`: cross-feature responsive behavior.
- `accessibility.css`: focus, reduced-motion, and forced-colors behavior.
- `themes/*.css`: one active theme's tokens and intentional structural overrides.
- `mobile.css`: responsive geometry loaded after the active theme.
- `note-typography.css` and `workflows.css`: focused detail typography and
  theme-aware productivity surfaces, loaded after mobile geometry.

Keep selectors in their owning layer, reuse existing semantic tokens, and
preserve the manifest order when moving rules. Tag resting colors use
`--tag-chip-border/text/surface`; menu roles use `--picker-menu-border/surface/shadow`
and `--tag-menu-border/surface/shadow`. Default fallbacks stay in the component
owner. Coffee, Forest, Dark, and Midnight supply palette values rather than
repeating the same color selectors. `management.css` owns common type/color
menu geometry; the component rules retain only their differences. Retro and
E-Ink keep their intentional typography, shapes, and state overrides. This is
a focused consolidation, not a claim that every historic theme override has
been removed.

Do not mix storage, editor
session, or Service Worker behavior into CSS changes.

## Workspace and first-use UI state

Side note temporarily collapses the sidebar at 960–1200px. The automatic state
is never persisted. Closing the pane or widening the viewport restores the
saved preference; an explicit sidebar toggle while the pane is open remains
user intent. Dirty close continues through the existing guarded save flow.
The primary footer says **Save & return** and both panes use Saved, Saving,
Unsaved changes, and Save failed status wording.

On mobile, the formatting track scrolls separately from its visible More/back
controls. Overflow cues update after layout changes and disappear at either
end. Settings row Delete actions are disclosed in a More menu and keep the
existing confirmation and storage behavior.

The first-use card explains browser-local persistence and JSON portability.
Its dismissal is a localStorage preference. Existing libraries are marked as
seen; merely opening Nook creates no note. **Add a guide note** is an explicit
storage action that creates an ordinary note through PersonalNotesStorage.
It can be edited, trashed, and backed up normally.

## Validation and evidence boundaries

Static checks are separate from browser checks:

```bash
node --check js/storage.js
node --check js/markdown.js
for file in js/app/*.js; do node --check "$file"; done
node --test tests/*.test.js
git diff --check
```

The IndexedDB contract harness is
`tests/browser/storage-harness.html`. Run each scenario on a fresh isolated
localhost origin: `v1`, `v2`, `save`, `bytes`, and `backup`. It covers
migration, CAS conflict/no-op, history retention/restore, byte retention,
old-backup compatibility, v3 round-trip, and invalid-import atomicity. Its
database is separate from any user origin; do not use a production or personal
origin for write-path tests.

The EditorSession and Markdown harnesses test different boundaries. A passing
storage harness does not prove rendered application startup, two-tab behavior,
Service Worker reopen/update behavior, quota grants, or
responsive/accessibility QA. Report those as unverified until their actual
browser paths have run.

`scripts/test-workflows.cjs` is optional end-to-end QA using an existing local
Playwright installation and Node 20+. It serves the repository on localhost,
uses isolated synthetic browser contexts, and exercises the new storage APIs
through real IndexedDB plus rendered productivity flows. Set
`NOOK_PLAYWRIGHT_MODULE` for a locally installed module outside the repository.
Browser checks remain separate from the dependency-free `node:test` suite.
`node scripts/test-maintainability.cjs` uses the same optional tooling for
onboarding, aliases, sidebar restoration/manual overrides, guarded pane closes,
settings menus, metadata/pickers, and mobile formatting on all seven themes.
Optional `NOOK_SCREENSHOT_DIR` keeps local screenshots.

When changing stored data, inspect the current migration and parser first,
preserve old backups, and keep the change behind
`PersonalNotesStorage`. Never silently reset the database or log note content.
