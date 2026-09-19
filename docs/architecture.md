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

`index.html` loads the storage and Markdown namespaces first, then loads
classic scripts. `js/app/runtime.js` creates the temporary registry at
`Symbol.for("nook.app.modules")`. Each application file registers one named
installer; the runtime initializes installers only after all required names are
present.

The installer order is explicit and is the dependency contract:

```text
core
→ preferences
→ feedback
→ editor-session
→ library
→ editor
→ history
→ organize
→ sync
→ offline
→ events
```

The order of feature `<script>` tags does not replace this contract. The
runtime rejects unknown or duplicate registrations and reports missing modules
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
| `js/app/core.js` | Cached DOM references, shared state, constants, filters, search helpers, and pure UI helpers |
| `js/app/preferences.js` | Theme, layout, sidebar, responsive controls, and preference persistence |
| `js/app/feedback.js` | Toasts, confirmation dialogs, and focus restoration |
| `js/app/editor-session.js` | DOM-independent editor state machines, save sequencing, CAS inputs, conflict state, and per-session draft recovery |
| `js/app/library.js` | Library/sidebar rendering, note detail workspace, Side note pane, pagination, Quick View, clipboard, pin, Trash, and session reconciliation |
| `js/app/editor.js` | Primary editor controls, Markdown modes, tag/type pickers, autosave, recovery prompts, and primary conflict handling |
| `js/app/history.js` | Version-history list, safe preview, restore confirmation, and history-dialog focus behavior |
| `js/app/organize.js` | Type/tag management, import/export UI, delete-all flow, and library refresh orchestration |
| `js/app/sync.js` | Optional same-origin `BroadcastChannel` notifications and guarded external refreshes |
| `js/app/offline.js` | Optional quota/persistence reporting and explicit hosted Service Worker update flow |
| `js/app/events.js` | Event binding, startup sequencing, and startup error handling |
| `sw.js` | Versioned cache of local app assets only; never reads or writes note records |

Cross-module calls are late-bound through the runtime API where necessary for
cycles. UI state stays separate from persisted records; after a storage
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
2. Compare `expectedRevision` when supplied.
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
pane/session identity, draft fields, `baseRevision`, and a saved timestamp;
malformed or older-than-30-day records are pruned.
Recovery is best effort when localStorage is unavailable. Disposing a session
preserves a dirty draft for recovery; explicit discard removes only that
session's record.

When a newer note revision arrives from another tab or a CAS save returns
`NOTE_CONFLICT`, the session keeps the local draft and exposes three explicit
paths: keep editing, view the latest committed note, or keep mine by rebasing
against the latest revision and retrying. If the saved note was deleted, the
latest view is unavailable and keeping the draft saves it as a new note.
External refreshes never replace a dirty draft. Import and delete-all flows require active dirty drafts to be
saved or closed first; recovery drafts are not included in backups.

In the detail workspace, pointer/focus determines the active pane. Mode,
formatting, and save shortcuts target the focused/active pane. Both panes have
their own autosave timer, conflict path, recovery record, and version-history
action. The history controller blocks restore while either relevant draft is
dirty, previews committed Markdown through `NookMarkdown`, and archives the
current note before confirming restore.

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

Import has two boundaries:

1. `inspectBackup()` parses and validates the complete candidate and returns
   counts, including saved history versions. It does not change the library.
2. `importBackup()` replaces notes, types, tags, history, and metadata in one
   IndexedDB transaction after validation completes. A validation or transaction
   failure leaves the previous library intact.

The UI confirmation describes the replacement and explicitly says recovery
drafts are not in the file. Export creates a Blob and requests a browser
download; that request is not proof that a file was written, so the user must
confirm the download before deleting local data. JSON backups are plain text and
are not encrypted.

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
pre-caches the local app shell/assets under a versioned cache, serves same-origin
cached assets first, and never intercepts note data as a remote service.
`file://` skips registration and continues to use the static scripts and
browser-local storage directly.

An updated worker waits until the user selects **Apply update**. The UI refuses
to activate it while either pane has a dirty draft. If activation occurs while
a draft is dirty through another path, the controller avoids an automatic
reload and tells the user to reload after saving/preserving the draft. There is
no forced reload during active editing.

## CSS ownership

`css/app.css` is the ordered cascade manifest. Foundations and shared
components load first; feature rules follow; accessibility and theme layers
remain late in the cascade.

- `base.css`: reset, tokens, shell, and primitives.
- `note-components.css`, `dialogs.css`, `management.css`, `markdown.css`:
  reusable surfaces and rendered content.
- `library.css`, `organize.css`, `note-detail.css`: feature layout.
- `interactions.css`: shared interactive states and motion.
- `responsive.css`: cross-feature responsive behavior.
- `accessibility.css`: focus, reduced-motion, and forced-colors behavior.
- `themes/*.css`: theme tokens and narrowly scoped structural overrides.

Keep selectors in their owning layer, reuse existing semantic tokens, and
preserve the manifest order when moving rules. Do not mix storage, editor
session, or Service Worker behavior into CSS changes.

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

When changing stored data, inspect the current migration and parser first,
preserve old backups, and keep the change behind
`PersonalNotesStorage`. Never silently reset the database or log note content.
