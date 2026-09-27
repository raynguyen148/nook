# UI and accessibility review

The deployed [pre-refactor Nook](https://nook-weld.vercel.app/) and the retained local app were inspected at desktop and mobile sizes. The deployed tab contains personal notes; its content was not copied into the repository. Screenshots in `docs/screenshots/react-baseline/` use only synthetic notes. The review used Hallmark and the current [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), with Ray's original layout and shadcn/Tailwind direction as product constraints.

## Findings addressed

| Finding | Change and evidence |
| --- | --- |
| Library accent, pinned cards, logo and sidebar width differed | `app/src/styles/themes.css`, `app/src/features/library/library.css`, `LibraryComponents.tsx`: restored the original local logo asset, Light gold semantic colors, pale pinned cards, and the old region spacing. Desktop synthetic screenshot reviewed. |
| Top result line, Show more and sort labels differed | `LibraryScreen.tsx`: result count and page controls now sit below cards; Grid uses 32 notes at four columns, other layouts use the old 30-note base; created/updated sort labels match. Pagination browser test passes. |
| Backup status was a generic device label | `LibraryComponents.tsx`, `LibraryScreen.tsx`: restored the local backup reminder and updated it after export. No note content enters that preference. |
| Workspace source used a monospaced font and gray canvas | `workspace.css`: restored the white writing surface and sans-serif source text. Desktop/mobile screenshots reviewed. |
| Mobile note menu exposed controls absent from the reference | `WorkspaceScreen.tsx`: shadcn Sheet now presents Version history, Copy content, two exports and Trash for saved notes. Browser test opens history from the sheet. Split and Side note remain on desktop. |
| Settings had invented Display controls, no preview-line control, and sparse type/tag rows | `SettingsDialog.tsx`, `settings.css`: Display now has Theme and the 3–10 preview-lines control; types/tags use contiguous rows and a shared search/create row. Preference persists after reload. |
| Mobile Settings opened tabs directly and the dialog was off-screen | `SettingsDialog.tsx`, `settings.css`: restored the Settings overview and back path; corrected Base UI's mobile translate. Browser checks cover Settings bounds at 320, 375, 414 and 768 px. |
| Data lacked the old Delete all data path | `SettingsDialog.tsx`: restored the Data row with backup action and exact DELETE confirmation. A fresh browser test verifies the guard and reset using synthetic notes. |

## Parity pass — September 27, 2026

- The desktop Settings dialog now matches the deployed 560 × 720 px bounds. Type and tag panels keep their description and count on one line, matching the deployed hierarchy.
- Sidebar tag filters render as text chips with a keyboard-focus ring. Active filter chips now have space before note cards; the empty state fills the remaining library panel height. Selected layout and editor modes use the existing accent colors.
- In the single-note workspace, the header, title, type/tag row, formatting bar, and footer match the deployed vertical positions at a 1440 × 900 viewport. In Split, formatting spans both columns and the source and preview reach the footer together.
- `Done` saves and closes, as in the retained pre-refactor handler. `Close` keeps the dirty-draft confirmation. The footer again exposes note shortcut and Markdown help.
- Manual localhost checks used a synthetic note at desktop and 375 px mobile, with no horizontal document overflow or browser console errors. The production Chrome E2E run passed 21 of 22 tests; the remaining tag-chip test passed after changing its locator to click the visible label. The full suite was not rerun after that test-only change.
- Current synthetic screenshots for Library, Settings, Split, and two mobile views are in `docs/screenshots/parity-2026-09-27/`.

## Checks and limits

- `npm run check`: TypeScript, lint, Vitest, retained Node tests, and build.
- `npm run test:e2e`: production Chromium with fresh contexts, synthetic data, import/export, offline reload, conflicts, theme and responsive flows. Automated axe checks cover Library and Settings across seven modes plus the workspace.
- Browser geometry assertions cover Library/workspace overflow and Settings viewport bounds at 320, 375, 414 and 768 px. Screenshot baselines compare region hierarchy; they are not pixel thresholds or accessibility proof.
- Physical-device virtual-keyboard behavior and platform install/persistent-storage permission prompts were not exercised. Full accessibility-tree inspection of the live Vercel tab was blocked by automatic privacy review because it could reveal personal notes; local UI/code and synthetic browser tests were used for the accessibility review.
