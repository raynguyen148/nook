# Nook architecture

The production entry point is `app/index.html`. Vite builds a static client bundle from `app/src/main.tsx` into `dist/`. The previous vanilla entry point and its sources remain in the repository root for comparison; they are not loaded by the React entry point except for the two local, bundled domain scripts described below. There is no server API or network persistence.

## Boundaries

| Area | Owner | Contract |
| --- | --- | --- |
| `app/src/domain/contracts.ts` | Shared types | Note, type, tag, history, backup, and repository interfaces. No React or IndexedDB dependency. |
| `app/src/data/repository.ts` | Data | Typed adapter to the existing `js/storage.js` IndexedDB v3 implementation. UI code does not open transactions. |
| `app/src/data/sync.ts` | Cross-tab signals | Broadcasts mutation metadata only; a receiver reloads its own snapshot. Note content is never put in a message. |
| `app/src/app/NookContext.tsx` | App state | Initializes the repository, refreshes canonical snapshots after mutations, and stores workspace location and aggregate dirty status. |
| `app/src/features/library/` | Library | Search, derived counts, filters, sort, cards, layout, Trash, and responsive navigation. |
| `app/src/features/settings/` and `theme/` | Settings | Catalog management, inspected backup replacement, storage/install/update controls, theme and preference persistence. |
| `app/src/features/editor-session/` | Editor state | Framework-independent session machine, CAS saves, stale-result protection, conflict choices, and per-tab/pane draft recovery. |
| `app/src/features/workspace/` | Workspace | Primary and Side note panes, editing modes, shortcuts, history, exports, and dirty-draft navigation guards. |
| `app/src/features/markdown/` | Preview | React adapter to the safe DOM renderer in `js/markdown.js`. Each render owns a distinct footnote ID scope. |
| `app/src/features/offline/`, `app/public/sw.js` | Offline | Local asset caching, installation/update state, and explicit draft-safe Service Worker activation. |
| `app/src/components/ui/` | Shared primitives | shadcn/ui Base UI components. Feature components compose these primitives without changing their data contracts. |

React context and local feature state are sufficient for this app. The persisted snapshot remains the repository's responsibility. The UI derives counts and filtered lists from that snapshot; it does not maintain a second database model in React. Editor drafts and UI preferences have separate lifetimes from committed note records.

## Data and compatibility

The browser database is `personal-notes`, version **3**, with `notes`, `types`, `tags`, `noteVersions`, and `meta` object stores. The existing storage implementation is bundled into the new app behind a typed adapter because it already owns tested migration, validation, normalization, backup parsing, and atomic transactions. It does not reset the database on startup. The storage implementation remains the source of truth for limits and references; UI `maxLength` attributes are guidance only.

Notes contain `id`, `title`, `typeId`, `tagIds`, raw `content`, timestamps, `isPinned`, `deletedAt`, and a positive `revision`. A new note starts at revision 1. A semantic no-op leaves its revision and history unchanged. On a real change, the old committed state is archived and the revision increases. Compare-and-save uses `expectedRevision` inside the same read-write transaction as the note/history writes. A mismatch returns `NOTE_CONFLICT` and the latest note without writing. Pin, Trash, restore, and catalog changes that alter notes also participate in history. History keeps the newest 50 versions and at most 5 MiB of content per note.

`buildExport()` emits `personal-notes-backup` schema v3 with types, tags, notes, and versions. `inspectBackup()` validates and counts without changing data. `importBackup()` accepts v1/v2/v3, historical field names, and the supported legacy shape, then replaces the library atomically after the user confirms. Invalid input or a transaction failure leaves the previous library intact. Recovery drafts are excluded. Since browser origins are isolated, users move from the old app through export and manual import; no cross-origin data migration is attempted.

## Editor and Markdown safety

Each pane has an independent session ID, committed snapshot, current draft, base revision, and save sequence. A save captures its draft/version before awaiting IndexedDB. A late result from a disposed or superseded session cannot overwrite a newer draft. Conflicts retain the local draft and expose explicit **Keep editing**, **View latest**, and **Keep mine** choices; a deleted note can be saved as new. Navigation, restore, and app update paths check dirty drafts. Per-pane recovery records use localStorage, with a tab identity in sessionStorage, and expire after 30 days.

The Markdown renderer is the local `js/markdown.js` code, bundled with the app. It builds DOM nodes rather than injecting raw HTML. Raw HTML remains inert except the allowlisted `details`/`summary` subset; unsafe URL schemes are blocked. Image syntax renders accessible alt text instead of loading a source URL. Very long or deeply nested documents fall back to inert source text. Distinct render scopes prevent footnote IDs from colliding between panes, dialogs, or old render passes. Copy/export of `.md` uses the raw source; `.txt` uses the renderer's plain-text conversion.

## Offline runtime

`vite.config.ts` emits `nook-precache-manifest.json` with local build assets and a content-derived revision. On HTTPS or localhost, the Service Worker pre-caches those assets and serves the app shell from cache for offline navigation. IndexedDB remains the note store; the worker does not read notes or cache note content. The UI checks for updates without activating them automatically. Before `skipWaiting`, the waiting worker queries open same-origin app tabs and defers activation if a tab reports a dirty draft or does not respond. The controller avoids a forced reload while a draft is dirty.

`npm run preview` serves `dist/` for browser testing. There is no requirement to keep Node.js running once the browser has cached a valid production build, although the first load and future uncached updates need the local/HTTPS server.

## UI system and validation

Base UI is the shadcn/ui primitive base. Tailwind and the generated components own spacing, radius, borders, shadows, typography, and focus behavior. Nook CSS supplies the Library/workspace macrostructure, responsive layout, Markdown rendering, and seven semantic color palettes. Light is the initial visual baseline; Coffee, Forest, Midnight, Dark, Retro, and Auto map semantic tokens without porting the previous decorative CSS.

`npm run check` runs TypeScript, oxlint, Vitest plus retained legacy Node tests, and build. `npm run test:e2e` runs production-preview Chromium flows in fresh browser contexts using synthetic data. Tests exercise real IndexedDB transactions, backup round trips, cross-pane/tab conflicts, offline reload, responsive layout, and browser accessibility rules. Browser checks are distinct from static/unit checks; see the [feature parity matrix](refactor-feature-matrix.md) and the final handoff for exercised paths and remaining limits.
