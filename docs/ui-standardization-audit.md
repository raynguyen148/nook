# Nook UI standardization audit

Maintained audit, updated 2026-10-03. This pass started with a clean working
tree at `1ce31e245c81fd35f543faff7c39062ddc9605b8` on `main`. The earlier
standardization work is already committed in that base. This follow-up leaves
its own changes unstaged and uncommitted for Ray's review.

## Scope and design authority

Applied the installed Impeccable 4.5.0 Operate/refinement, audit, harden, polish,
and craft-floor guidance. The context command ran once for this session; the
manual detector ran once. Nook's existing local fonts, semantic colors, seven
palettes, shared controls, ordered styles, and native dialogs remain the design
authority. This pass improves verified interaction defects without replacing
the visual system.

Nook has one static entry point, with a library, paired note workspaces, and
dialogs rather than separate routes. The audit used actual browser captures,
source inspection, and an independent read-only reviewer. All runtime data was
fictional, in fresh browser contexts on temporary loopback origins. No personal
library, dependency installation, schema/backup change, external upload,
deployment, staging, or commit was involved.

## Findings and numbered acceptance outcomes

| # | Priority and finding | Implemented outcome | Verification |
| --- | --- | --- | --- |
| 1 | P1: delayed history reads changed shared versions before checking ownership; stale errors/focus/restore completion could affect a reopened dialog | Every opening has a generation; delayed updates and focus belong to that generation. Repeated restore is guarded. Loading is explicit; read/write failures retain recovery and retry behavior | Different-note and same-note reopen, stale failure, repeated/interrupted restore, actual synthetic restore, cancellation, failed read/write and recovery |
| 2 | P2: rebuilding pagination removed the focused Next/Previous/page button | Focus follows the corresponding enabled control, or the current page at a boundary; a removed pagination surface falls back to the library | Keyboard Next/Previous, including the last-page boundary |
| 3 | P2: chip removal, suggestion selection and tag creation removed their keyboard target in either pane | A surviving chip or Add tag receives focus. Primary focus is restored after autosave only when the same session remains active and focus has not moved to another field | Both panes; last-chip removal; suggestion selection; Enter and Add-button creation; post-autosave focus; deliberate focus movement during a delayed save |
| 4 | P2: autosave rebuilt an open type picker and disabled its focused primary option | Open menus preserve the focused type identity. Primary type controls remain usable during autosave; session comparisons protect newer selections | Both pane pickers through autosave; change type during a held primary save, then verify the newer type is committed |
| 5 | P1: composing Enter submitted unfinished tag text; composing Escape reached tag/global closing handlers | Tag actions and global navigation shortcuts ignore composition events | Composing Enter/Escape keep both panes' tag input open and create no record; normal completed Enter still creates a tag |

The independent review of the initial implementation reproduced two remaining
paths within outcome 3: primary Add focus disappeared during the following
autosave, and creation from the Add button did not capture a return target.
Those paths were corrected and added to the behavioral regression suite.
The final independent review is recorded with the handoff snapshot; absence of
additional findings is not merge or release approval.

No P0 issue was observed in the inspected states. Existing native dialogs,
labelled controls, safe Markdown, bounded pagination, local storage ownership,
and guarded pane sessions remain strengths.

## Audit health of the inspected sample

These are Impeccable's 0–4 rubric judgments, not a WCAG certification or a
performance benchmark.

| Dimension | Score | Evidence and limit |
| --- | --- | --- |
| Accessibility | 3/4 | Keyboard ownership, error recovery, focus visibility and sampled text contrast checked; native assistive technology and IME hardware not exercised |
| Performance | 3/4 | Bounded library rendering, one active local theme and no added assets/dependencies; CPU/frame profiling not performed |
| Theming | 3/4 | Seven palettes and theme persistence checked; legacy literal styling remains alongside semantic tokens |
| Responsiveness | 3/4 | Narrow/mobile/tablet/desktop samples contain content; compact metadata intentionally retains 24 px targets rather than 44 px |
| Implementation integrity | 4/4 | The selected fixes preserve component ownership, editor sessions, native controls and the incumbent design |

## Current coverage record

| Surface / component | Actual coverage this pass |
| --- | --- |
| Startup/onboarding | Empty-library capture; first-use dismissal/reload and explicit removable guide-note checks |
| Library | Three layouts; fictional demo and long labels; search/filter/sort surfaces; keyboard pagination; pin/More visuals; Trash and bulk-selection surfaces |
| Note workspace | New/existing notes; Preview/Edit/Split; long titles, mixed scripts, unbroken Markdown, wide code/tables; both pane type/tag pickers |
| Settings | Types, Tags, Display, Data and Shortcuts; pending/retry forms and catalog edits; theme/font-size/preview controls; destructive confirmation canceled |
| Workflows/data | Quick actions, templates, Daily notes, empty/populated recovery, Markdown inspection, backup merge/replace, bulk export/Trash/restore; synthetic IndexedDB/history round trips |
| Async/navigation | Delayed saves and refreshes, newer typing/type choices, dirty close/cancel, guarded switching, conflicts/recovery, repeated/interrupted history operations |
| Responsive/theme | Light, Coffee, Forest, Midnight, Dark, Retro and E-Ink; sampled widths 320–1440 px; mobile sheets/Back; reduced motion and forced colors |
| Offline | Synthetic hosted offline reopen and static file-mode startup/Daily notes; no external requests in the UI audit/probes |

The broad browser matrix completed before and after the main implementation:
150 captures per round, zero measured document overflow, console/failed-request
errors, external requests, or sampled text/placeholder contrast failures.
The independent review's subsequent tag-focus repair was verified with the
expanded interaction suite and affected regression checks; it did not change
layout or theme styling. Sample measurements exclude hidden/disabled controls
and are not proof of every possible content, color, focus or pointer state.

## Verification and evidence

Static checks are separate from runtime evidence:

- JavaScript syntax: storage, Markdown, every app module, and the new QA script.
- Shared contracts: `tsc -p jsconfig.json` with the existing TypeScript tool.
- Patch whitespace: `git diff --check`.
- Node regressions: `node --test tests/*.test.js`, 48 passed.
- Hosted cache fingerprint regenerated and covered by the Node regressions.

Browser verification uses the existing Playwright library and installed Google
Chrome in fresh contexts. Playwright's expected bundled Chromium binary was
missing; no browser or dependency was installed.

| Script | Coverage/result |
| --- | --- |
| `scripts/test-ui-standardization.cjs` | 150 captures and 10 targeted check groups per round |
| `scripts/test-ui-interactions.cjs` | 38 acceptance checks for the five selected findings and review repairs |
| `scripts/test-maintainability.cjs` | 48 checks |
| `scripts/test-workflows.cjs` | 39 checks |
| `scripts/test-note-switcher.cjs` | 31 check groups |

Fresh screenshots, raw reports and logs stay outside the repository:

- `/tmp/nook-reaudit-baseline/`: visual baseline and report.
- `/tmp/nook-reaudit-final/`: visual confirmation and report.
- `/tmp/nook-reaudit-interactions-reviewed/`: latest interaction report.
- `/tmp/nook-reaudit-*.log`: runtime/static result logs.
- `/tmp/nook-reaudit-detector.json`: manual detector output.

The detector returned 52 heuristic warnings (exit 2) on the inspected existing
HTML/CSS: rounded-border combinations, compact padding, contained overflow,
border/shadow combinations, type hierarchy and one layout transition. These
are separate from deterministic runtime findings. Existing Markdown rules,
contained editors, compact metadata, quiet dialog elevation and theme styling
were retained after inspection; no zero-warning claim is made.

Nook has no build step or configured linter. Neither was installed or claimed.

## Preserved historical evidence

The prior standardization normalized semantic text/status colors, typography,
dialog controls/icons, mobile targets, Quick actions selection, Side note
validation/save feedback, catalog pending/retry behavior, and E-Ink focus.
Its tracked evidence is preserved, with its original dates and baseline:

- [Earlier browser report](ui-audit/final-browser-report.json)
- [Earlier validation record](ui-audit/final-validation.json)
- [Earlier detector output](ui-audit/final-impeccable-detection.json)
- [Settings before](ui-audit/settings-before.png) and [after](ui-audit/final-settings-after.png)
- [Coffee library before](ui-audit/coffee-before.png) and [after](ui-audit/final-coffee-after.png)
- [320 px filters before](ui-audit/mobile-filters-before.png) and [after](ui-audit/final-mobile-filters-after.png)

No new screenshot directory, dated report, raw QA JSON, or Review Input artifact
was added to the repository in this pass.

## Remaining limits and review gates

- Chromium-based Google Chrome on this Mac was exercised. Safari/Firefox,
  physical iOS/Android, native IME candidate windows, virtual keyboards,
  VoiceOver/NVDA and OS browser zoom remain unverified.
- Viewports, reduced motion and forced colors were emulated. The composition
  tests dispatch browser KeyboardEvents; they do not prove native IME behavior.
- A very long type label can visually clip at the leading edge of the compact
  mobile Preview badge in the 375 px sample. The full label remains in the
  note/type data and picker name. This minor existing styling detail was kept
  outside the selected interaction batch for a separate visual review.
- Storage-quota exhaustion, unsupported/denied IndexedDB, denied persistence
  prompts and a real hosted-update rollout were not injected.
- Library deletion was canceled; Ray's actual library was never opened.
- Review/merge/release are separate decisions. Ray still needs to inspect the
  exact handoff diff and judge his preferred browser/device behavior before
  committing. No merge, PR, deployment or release approval is implied.

Acceptance checklist:

- [x] Five selected improvements implemented with behavioral evidence.
- [x] Previous committed work and offline storage/backup model preserved.
- [x] Independent review findings reproduced and remediated in scope.
- [x] Broad visual coverage and verification limits recorded honestly.
- [x] Evidence stays outside the repository; changes unstaged/uncommitted.
- [ ] Ray's code/product review, preferred-device checks and commit.

## Current changed-file scope

```text
docs/ui-standardization-audit.md
js/app/editor.js
js/app/events.js
js/app/history.js
js/app/library.js
js/app/note-pickers.js
scripts/test-ui-interactions.cjs
sw.js
```

The script is the only new file; the other seven are tracked modifications.
The exact final HEAD, staged/unstaged/untracked snapshot and patch fingerprints
are supplied in the chat handoff, without staging or creating a commit.

For an isolated review preview, run from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000` in a fresh browser profile. Use fictional demo data
only in that profile; an existing origin/profile can contain personal notes.
Static `index.html` opening remains supported.

Run the new focused regression suite with the installed Chrome:

```sh
NOOK_BROWSER_CHANNEL=chrome node scripts/test-ui-interactions.cjs
```
