# Nook React rebuild: feature parity matrix

`Verified` means the new implementation and the listed automated checks passed on the production build. Browser tests use synthetic data and fresh profiles. The retained vanilla app stays available for comparison.

| Existing capability | Existing owner | New owner | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| IndexedDB v3 migration, validation, limits | `js/storage.js` | `data/repository` | v2 fake IndexedDB upgrade; browser v1 upgrade; retained storage tests | Verified |
| Atomic CAS, semantic no-op, revisions/history retention | `js/storage.js` | `data/repository` | repository transaction/no-op/conflict/restore tests; two-tab E2E | Verified |
| Backup v1/v2/v3 inspect, atomic import, v3 export | `js/storage.js`, `organize.js` | `data/repository`, `settings` | v1/v2 fake IndexedDB imports; legacy browser import; real v3 export/import in separate profile; invalid replacement test | Verified |
| Create/edit note, type, tags, raw Markdown | `editor.js`, `storage.js` | `workspace`, `data/repository` | create/edit/save/reload and offline E2E | Verified |
| Type and tag add/rename/recolor/delete | `organize.js`, `storage.js` | `settings`, `data/repository` | Settings RTL and browser create/rename/recolor/delete flow | Verified |
| Search title/content, filter type/all tags/today | `core.js`, `library.js` | `library` | filter RTL and combined-tag/search browser flow | Verified |
| Clear individual/all filters and persist preferences | `core.js`, `library.js` | `library` | Library RTL, filter browser flow, preference reload | Verified |
| Sort by created/updated/title; pinned first | `core.js`, `library.js` | `library` | sort/pin implementation review and Library RTL/browser controls | Verified |
| Compact/Comfortable/Grid, pagination, sidebar collapse | `library.js`, `preferences.js` | `library` | grid 32-per-page navigation/return E2E; layout and responsive checks | Verified |
| Note card preview lines (3–10), preference persistence | `preferences.js` | `settings`, `library` | range control updates card clamp and survives reload E2E | Verified |
| Backup reminder and confirmed Delete all data | `core.js`, `organize.js` | `library`, `settings` | backup status UI; typed DELETE guard and synthetic-library reset E2E | Verified |
| Mobile filters, spaces, card actions | `mobile.js`, `library.js` | `library` | 320/375/414/768 browser checks and visual baselines | Verified |
| Preview/Edit/Split and library return/focus | `library.js`, `editor.js` | `workspace` | mode browser flow; scroll/return E2E | Verified |
| Side note picker, independent pane sessions | `library.js`, `editor-session.js` | `workspace`, `editor-session` | Side note and two-pane E2E; session tests | Verified |
| Safe Markdown, footnotes, images as alt text | `js/markdown.js` | `markdown` | retained parser tests; safety, footnote-scope, plain-text tests | Verified |
| Formatting shortcuts, scroll/selection in Split | `editor.js`, `split-selection.js` | `workspace` | retained split tests; focused-pane shortcut E2E | Verified |
| Autosave, Quick Save, Save & Close | `editor.js`, `editor-session.js` | `workspace`, `editor-session` | session race tests; create/save and history browser flows | Verified |
| Dirty draft guard, recovery, CAS conflict choices | `editor.js`, `editor-session.js` | `workspace`, `editor-session` | stale-save/recovery unit tests; reload and two-tab conflict E2E | Verified |
| Revision preview/restore with dirty guard | `history.js`, `storage.js` | `workspace`, `data/repository` | repository restore test; history browser flow | Verified |
| Copy raw source, export `.md`/`.txt` | `library.js`, `organize.js` | `workspace` | browser clipboard and downloaded file content E2E | Verified |
| Pin, Trash, undo/restore/permanent/empty | `library.js`, `storage.js` | `library`, `data/repository` | lifecycle unit/browser flows and retained storage tests | Verified |
| Seven themes and Auto, persistence/tab sync | `preferences.js`, `sync.js` | `theme`, `data/sync` | theme and sync tests; reload E2E; axe across all seven modes | Verified |
| Storage health, persistent storage, install PWA | `offline.js` | `offline`, `settings` | capability and Settings implementation review; browser Settings flow | Verified where browser supports capability |
| SW offline and controlled updates with dirty draft | `sw.js`, `offline.js` | `app/public/sw.js`, `offline` | offline reload/write E2E; waiting update deferred by another dirty tab E2E | Verified |
| Keyboard scope and dialog focus/return | `events.js`, `feedback.js` | `library`, `workspace`, `settings` | retained keyboard tests; RTL; axe Library/Settings/workspace and focused-pane E2E | Verified |

## Error and older-data cases

- Tested: v1 and v2 database upgrades, v1/v2/v3 backup import, old field alias, invalid type reference, atomic rejection, CAS mismatch, delayed save, deleted-note conflict, expired or malformed recovery record, offline reload/write, and dirty tab blocking a waiting Service Worker.
- The retained storage and Markdown suites cover additional validators, parser failures, content limits, history limits, and legacy shapes. The data layer remains the existing implementation behind a typed adapter.
- Browser permission prompts for persistent storage and PWA installation depend on the browser and operating system. Automated tests verify the conditional UI, not a platform permission grant or installed-app shell.

## Mobile acceptance

- Chromium production build at 320, 375, 414, and 768 px: Library and workspace have no horizontal document overflow; Settings remains inside the viewport.
- The 375 px visual baseline includes Library, Settings, scrollable filter sheet, workspace Preview/Edit, and note actions. A separate browser flow verifies Library scroll position and workspace top on navigation.
- Native device virtual-keyboard behavior was not exercised; this remains a physical-device QA item.
