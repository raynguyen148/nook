# Nook

Nook is a private, offline personal notes app. Notes stay in the current browser's IndexedDB. The app has no account, backend, analytics, CDN, remote font, or API call for note content.

The current app is built with Vite, React, TypeScript, Tailwind CSS, and shadcn/ui components on Base UI. The previous vanilla app remains in the repository root (`index.html`, `js/`, `css/`, `sw.js`) for comparison while the rebuild is reviewed. The untracked `prototype/` directory is separate from both apps.

## Run

Use Node.js **24.18.0** (`.nvmrc`) and npm. Dependency versions are locked in `package-lock.json`.

```bash
npm ci
npm run dev
```

Open the localhost URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

The new app needs a local or HTTPS server for its bundled assets and Service Worker. Node.js is only used for development, build, and serving the static result. After the first successful production load and Service Worker activation, the cached app can reopen offline. Notes are always read and written locally through IndexedDB, regardless of network state. Do not clear browser site data without a separate JSON backup.

Browser origins have separate IndexedDB databases. For example, `file://`, `http://localhost:8000`, and `http://127.0.0.1:4173` do not share notes. There is no automatic transfer between them.

## Move notes from the previous app

1. Open the previous Nook at its original URL or `file://` location and download a JSON backup.
2. Open the new Nook at its chosen localhost or HTTPS origin.
3. Select **Import**, choose the backup, inspect the note/type/tag/history counts, and confirm **Replace library**.
4. Verify the notes in the new library. Keep the downloaded backup separately.

The importer accepts Nook backup schema v1, v2, and v3, including older field names and the legacy shape supported by the original storage module. Import validates before replacing data and commits the replacement in one IndexedDB transaction. Draft recovery records are local to their tab and are not included in backups. JSON backups are plain text, not encrypted.

## Features

- Create and edit raw Markdown notes with one type and multiple tags. Manage types and tags in Settings.
- Search title and content; combine type, all-selected-tag, Created Today, and Updated Today filters. Sort by title or creation/update date, with pinned notes first.
- Browse in Compact, Comfortable, or Grid layout. Use the sidebar, mobile filter sheet, and Trash.
- Work in Preview, Edit Markdown, and Split modes, with an independent Side note pane. Copy raw Markdown or export `.md`/`.txt`.
- Autosave, explicit save, draft recovery, version conflict choices, and up to 50 earlier revisions per note.
- Export/import a complete JSON library backup, including saved history.
- Choose Light, Coffee, Forest, Midnight, Dark, Retro, or Auto. Settings shows browser storage and install/update options when supported.

The Markdown preview uses the existing local safe renderer. Raw HTML stays inert except its documented `details`/`summary` subset; unsafe URLs do not become links, and images are represented by accessible alt text instead of loading remote assets. See [architecture](docs/architecture.md) for the data, session, and renderer contracts.

## Development and checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run test:e2e
```

`test` runs Vitest and the retained legacy Node tests. `check` runs the quick typecheck, lint, unit/legacy test, and build gates. `test:e2e` runs Playwright against the production preview; install its Chromium browser with `npx playwright install chromium` if it is not already available, or set `NOOK_E2E_CHROME_PATH` to the executable path of a locally installed Chrome. E2E uses clean browser contexts and synthetic fixture data from `docs/sample-data/`, never a personal library.

The [feature parity matrix](docs/refactor-feature-matrix.md) links old modules, new owners, and acceptance checks. The [UI and accessibility review](docs/ui-review.md) records findings and fixes. The previous browser harnesses remain in `tests/browser/` for comparison. New visual baselines are under `docs/screenshots/react-baseline/`; older screenshots under `docs/screenshots/` show the macrostructure used as a reference, not the new styling.

## Privacy and limits

Data is stored per browser profile and origin. Export a backup before changing origin, clearing site data, or replacing the browser profile. The app cannot synchronize notes across devices by itself. Browser persistent storage can reduce eviction risk but does not replace a backup. The offline Service Worker caches only app resources and never stores note content in its cache.

Nook is distributed under the [Unlicense](LICENSE).
