# React rebuild contract

The new application lives in `app/`; the current root `index.html`, `js/`, `css/`, `sw.js`, tests, and the untracked `prototype/` remain intact for comparison. Vite serves `app/index.html` at `/` and builds to `dist/`. No existing production source is deleted during the rebuild.

## Ownership

- Lead: root package/config/lockfile/CI, `app/index.html`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/domain/contracts.ts`, `app/src/components/ui/`, shared style entry, feature matrix, integration/E2E, README/architecture.
- Data agent: `app/src/data/`, `app/src/features/offline/`, `app/public/` Service Worker and data assets, data tests. Keep v3 IndexedDB semantics and use the existing `js/storage.js` through a typed adapter unless parity tests justify a port.
- Library agent: `app/src/features/library/`, `app/src/features/settings/`, `app/src/features/theme/`, `app/src/styles/themes.css`, related tests. Own app shell, sidebar, toolbar, filters, cards, Trash, settings, mobile layouts.
- Workspace agent: `app/src/features/workspace/`, `app/src/features/markdown/`, `app/src/features/editor-session/`, related tests. Own edit/split/preview, side note, history, recovery, conflicts, shortcuts.

Do not edit another owner's files without coordinating with the lead. Existing files and `prototype/` are read-only references during implementation.

## Interface

All feature code imports shared types from `app/src/domain/contracts.ts`. Data exports `repository` conforming to `NoteRepository` from `app/src/data/repository.ts`. The lead exports `useNook()` from `app/src/app/NookContext.tsx`: `{ repository, snapshot, refresh, mutate, openNote, createNote, closeWorkspace, workspace }`. `mutate` runs a repository operation, refreshes the snapshot, and announces a same-origin mutation. Feature components receive this through context. `LibraryScreen` and `WorkspaceScreen` are named exports from their feature directories. Library UI calls `openNote(id, mode)` or `createNote()`; workspace calls `closeWorkspace()`.

`workspace` is `{ noteId: string | null, mode: 'preview' | 'edit' | 'split' } | null`. A null `noteId` represents a new note. The active Side note stays internal to `WorkspaceScreen`; it has an independent editor session. Feature components should not maintain their own copy of the persisted snapshot.

Repository operations are async and preserve the old storage error code `NOTE_CONFLICT` and `latestNote` shape. `getSnapshot()` returns both active and trashed notes; UI derives counts/filters. `inspectBackup()` is synchronous validation without writes; `importBackup()` replaces data atomically only after explicit UI confirmation. Draft recovery is separate from backup.

## Decisions

- Base UI primitive for shadcn/ui, aligned with the current shadcn default and the existing isolated prototype. Generated `components/ui` stays with the lead.
- Keep the proven IndexedDB v3 implementation behind a typed repository to avoid rewriting migration, atomic CAS, and backup parsing for style alone.
- Use React context and local state; no additional global state library. Persisted library data is refreshed through the repository after mutations.
- Reuse the existing safe Markdown DOM renderer through an adapter if possible. It already covers the broad syntax and offline image rule; add React lifecycle cleanup and multi-pane tests.
- Cache built, same-origin assets with a versioned Service Worker. Updates are explicit and delayed while any draft is dirty. No network is required for note reads/writes.

## File changes planned

Create root configuration and `app/` files under the ownership above; update README and `docs/architecture.md`; add CI. Do not delete files in this phase. Any later cleanup must list exact paths and receive Ray's approval under Hallmark.
