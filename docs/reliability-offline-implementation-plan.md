# Nook reliability, history, and offline implementation plan

Status: implementation complete; final evidence recorded below

Last updated: 2026-09-19

## Product contract

- Keep Nook dependency-free, local-only, and openable from `file://`.
- Never replace a dirty editor draft during library refresh.
- Treat the primary editor and Side note as two independent editor sessions.
- Commit note changes with an atomic revision check in IndexedDB.
- Preserve old IndexedDB data and schema v1/v2 backups.
- Use synthetic data and an isolated localhost origin for write-path QA.
- Do not commit, push, deploy, or reset the user's active database.

## Shared interfaces

### Stored note

Schema v3 adds `revision`, a positive integer. New notes start at revision 1.
Every committed edit of editor-owned fields increments the revision. A no-op
save returns the current record without creating history or changing revision.

### Atomic save

`PersonalNotesStorage.saveNote(input)` accepts `expectedRevision` for an
existing note. IndexedDB reads the current note and compares the revision in
the same read-write transaction that writes the replacement. A mismatch throws
an error with `code === "NOTE_CONFLICT"` and the latest stored note attached.

The save transaction validates the referenced type and tags, archives the
previous committed version, writes the new note, trims history, and records the
library mutation. It does not read the complete notes store.

### History

The `noteVersions` store records recoverable committed snapshots. Default
retention is the newest 50 versions and at most 5 MiB of content per note.
Restore archives the current note first, then creates a new current revision;
it never silently replaces the only copy of the current state.

### Editor session

`js/app/editor-session.js` owns the DOM-independent state machine used by both
panes:

- identity: pane, session id, note id, and base revision;
- state: committed snapshot, current draft, draft sequence, save sequence,
  phase, and conflict payload;
- safety: a save result may update only the session and draft sequence it
  captured;
- recovery: each open session uses its own localStorage record; removing one
  record never removes another pane or tab's record;
- conflict: keep the local draft and expose explicit "keep mine" and "view
  latest" paths.

DOM controllers remain responsible for validation, focus, rendering, and user
messages. Library list rendering must not open, close, or replace a session.

### Backup v3

Backups remain `format: "personal-notes-backup"` and move to
`schemaVersion: 3`. They contain note types, tags, notes, and note history.
Recovery drafts stay transient and are explicitly reported as not included.
Import fully parses and validates before one atomic replacement transaction.

### Offline update

`sw.js` pre-caches only local app resources under a versioned cache. The active
worker serves one coherent asset generation. A waiting worker is surfaced in
the UI; it is activated only after the user requests an update and no dirty
draft is open. `file://` skips registration and continues to work unchanged.

## Phases and ownership

### Phase 0 - inspection and contracts

- [x] Read repository instructions and current architecture.
- [x] Confirm clean initial working tree.
- [x] Recheck storage, draft, editor, Side note, refresh, Markdown, CSS, and
  bootstrap paths.
- [x] Check locally available Node/browser tooling.
- [x] Review all read-only sub-agent reports.
- [x] Freeze the shared contracts above before implementation delegation.

### Phase 1 - storage and regression foundations

- [x] Add schema v3 migration, note revision, and `noteVersions` store.
- [x] Add targeted atomic save with stale-write detection and no-op handling.
- [x] Add history list/restore and retention.
- [x] Add backup v3 inspect/import/export with v1/v2 compatibility.
- [x] Add isolated storage/migration/import-export browser harness.
- [x] Add DOM-independent EditorSession and `node:test` regression tests for
  slow save, typing during save, rejected save, stale session, multiple drafts,
  and conflicts.

Gate: storage and session tests pass before either pane is integrated.

### Phase 2 - primary and Side note integration

- [x] Integrate the shared session into the primary editor.
- [x] Integrate the same session into Side note.
- [x] Remove Side note lifecycle resets from list rendering.
- [x] Keep dirty drafts across library refresh and external refresh.
- [x] Add conflict UI without discarding either local or latest content.
- [x] Make close/switch await a successful save or preserve recovery.
- [x] Scope shortcuts to the active pane and topmost popup/dialog.
- [x] Fix `makeTypeBadge` dependency and focus restoration.

Gate: both panes pass the same slow/failing/conflicting save scenarios.

### Phase 3 - rendering, performance, and desktop interaction

- [x] Namespace Markdown footnote IDs per render container.
- [x] Bound Markdown nesting/work and provide a safe fallback.
- [x] Render previews only when visible.
- [x] Reuse the shared library search index in Side note and limit results.
- [x] Remove bootstrap DOM relocation and render final markup in place.
- [x] Fix side-by-side clipping and horizontal overflow.
- [x] Verify Escape ordering and formatting/save shortcut routing.

Gate: no console errors and important controls remain reachable at measured
1024, 1280, and 1440 px widths, near 600 px height, and 125% zoom when the
browser surface supports it.

### Phase 4 - component system, themes, and accessibility

- [x] Consolidate semantic surface/text/muted/border/focus/selected/danger,
  spacing, radius, and motion tokens.
- [x] Establish one owner for button, icon button, segmented control, fields,
  picker, card, save status, toolbar, and footer contracts.
- [x] Replace theme selector duplication with token overrides where safe.
- [x] Reduce only overrides made obsolete by the component pass.
- [x] Add static component preview for default, hover, focus, active, disabled,
  loading, error, and success states.
- [x] Verify every current theme in browser; statically verify reduced-motion
  and forced-colors fallbacks.

Gate: component preview and real flows match across themes without focus loss
or layout shift.

### Phase 5 - history, backup UX, storage health, and offline app

- [x] Add version history list, preview, and restore UI.
- [x] Show import inspection details before replacement.
- [x] Describe backup contents and transient draft exclusion accurately.
- [x] Report quota/usage and persistent-storage state with unsupported fallback.
- [x] Add manifest and versioned Service Worker update flow.
- [x] Verify hosted offline reopen and update activation does not reload another
  tab that has a dirty draft.
- [x] Keep the `file://` path free of Service Worker and module requirements;
  direct browser navigation was blocked by the QA browser URL policy.

Gate: history restore, old-backup import, v3 round trip, migration, offline
reopen, and update deferral all have executed evidence.

### Phase 6 - final integration and documentation

- [x] Run syntax checks for every JavaScript file.
- [x] Run `node:test` regression suite.
- [x] Run IndexedDB and import/export browser harness.
- [x] Run desktop, theme, focus, and offline browser QA; reduced motion and
  forced colors were inspected statically because media emulation was unavailable.
- [x] Run `git diff --check` and review the complete diff for scope.
- [x] Update `README.md` and `docs/architecture.md` to the final behavior.
- [x] Record limitations and synthetic-data cleanup state.

## Acceptance evidence log

This section is updated as checks execute. A check is not marked passed from
static inspection alone.

| Area | Evidence | Status |
| --- | --- | --- |
| Initial worktree | `git status --short --branch` showed clean `main` | passed |
| Static syntax | `node --check` for storage, Markdown, every app module, Service Worker, and browser harness; `git diff --check` | passed |
| EditorSession regressions | `node --test tests/editor-session.test.js`: 11/11, including slow/stale save, typing during save, failure, conflict, deleted conflict, and draft isolation | passed |
| EditorSession browser harness | Five synthetic scenarios: conflict/Keep mine, slow save, stale session, failure recovery, multi-tab/pane recovery | passed |
| IndexedDB migration/save/history | Isolated `storage-harness.html`: v1, v2, save/history/restore, byte retention | passed |
| Backup v1/v2/v3 | Isolated storage harness: old formats, v3 round trip, invalid-import atomicity | passed |
| Markdown | Six browser contract checks including scoped footnotes and bounded fallback | passed |
| Desktop interaction | Actual 1024-ish by 600 viewport at 125% zoom: no horizontal overflow; controls visible; type, Escape, shortcut, focus, Side close-save and two-tab conflict flows passed. Default wide surface measured 2046 by 989; exact 1280/1440 emulation was unavailable. | partial |
| Themes/accessibility | Seven modes including Auto resolved correctly with no overflow; component preview rendered six palettes and all requested states. Focus paths passed; forced colors/reduced motion inspected statically. | partial |
| History | Browser preview and restore passed; restore increased archived-version count from 4 to 5 | passed |
| Storage health | Browser reported usage/quota and persistence availability; no permission request was granted during QA | passed |
| Offline/update | v4 cached reopen passed with server stopped; v5 waiting/apply passed; applying in a clean tab did not reload or replace a dirty draft in another tab | passed |
| `file://` | Static/classic-script path preserved; direct navigation rejected by browser security policy | blocked |
| Test data | Synthetic localhost origins only; no personal origin/database read, reset, or modified. Synthetic origins intentionally remain in the QA browser profile. | passed |

## Non-goals

- No backend, account, sync service, analytics, hosted font, CDN, framework, or
  runtime dependency.
- No mobile visual redesign; only regression preservation.
- No bulk CSS rewrite or arbitrary line-count reduction.
- No automatic reload during active editing.
- No commit, push, deployment, or production-data operation.
