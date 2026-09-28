# Nook codebase audit — 2026-09-28

## 1. Phạm vi và kết luận

Báo cáo này đánh giá trạng thái hiện tại của nhánh `refactor/react-rebuild`, bao gồm cả các thay đổi chưa commit trong working tree tại thời điểm audit. Phạm vi gồm cấu trúc dự án, ranh giới module, dữ liệu offline, khả năng bảo trì, kiểm thử, accessibility, bundle và các đường nóng hiệu năng. Không có implementation nào được thay đổi trong phiên audit này. Working tree có thay đổi đồng thời trong lúc audit; kết luận cuối được làm mới theo snapshot cuối cùng đã kiểm tra, và lịch sử kiểm tra được ghi rõ ở phần 8.

### Kết luận ngắn

Nền tảng mới có hướng kiến trúc đúng: React UI được tách khỏi IndexedDB qua repository, dữ liệu vẫn local-first, cơ chế revision/conflict và draft recovery cẩn thận, Markdown renderer an toàn, Service Worker không đụng vào nội dung note. Đây là những phần khó và hiện được thiết kế tốt.

Tuy nhiên, codebase hiện chưa ở trạng thái release-ready:

1. Unit suite còn 2 lỗi do test contract của Side note và tooltip không khớp UI hiện tại.
2. Production E2E gần nhất còn 2 lỗi: một lỗi tương phản màu và một visual test lệch contract UI hiện tại.
3. Trong lượt kiểm tra đầu, `WorkspaceScreen` vi phạm Rules of Hooks. Lỗi này đã được một thay đổi đồng thời đưa Hook lên trước conditional return, nhưng lint vẫn không có rule để ngăn lỗi tái diễn.
4. Bundle đang là một chunk JavaScript 736.12 kB minified, 223.62 kB gzip; chưa có code splitting hoặc performance budget.
5. Mỗi mutation và mỗi thông báo đa tab đều đọc lại toàn bộ notes/types/tags; search quét toàn bộ title/content trên main thread. Cách này đơn giản và hợp lý ở quy mô nhỏ, nhưng không phải thiết kế tối ưu nhất ở ngưỡng tối đa 10.000 notes.
6. Các component điều phối chính đã quá lớn, làm tăng phạm vi ảnh hưởng (*blast radius*) và khiến những thay đổi UI nhỏ dễ tạo regression ngoài ý muốn.

Đánh giá tổng thể: kiến trúc nền tảng tốt, nhưng lớp presentation/orchestration và quality gates cần một vòng ổn định hóa trước khi tiếp tục polish UI hoặc thêm khả năng mới.

## 2. Scorecard

Điểm dưới đây mang tính định hướng, dựa trên code và kiểm thử hiện tại, không phải benchmark sản phẩm tuyệt đối.

| Hạng mục | Điểm | Nhận định |
| --- | ---: | --- |
| Data integrity và offline contract | 8.5/10 | IndexedDB v3, atomic import, revision/CAS, history và draft recovery được tổ chức tốt. |
| Security và privacy | 8.5/10 | Không có API/analytics/CDN; Markdown dùng DOM an toàn; cross-tab chỉ gửi metadata. |
| Kiến trúc module | 7/10 | Phân lớp đúng hướng nhưng có coupling chéo giữa feature và nhiều file điều phối quá lớn. |
| Khả năng bảo trì | 5.5/10 | Các “god component” 600–1.000 dòng và legacy/new source cùng tồn tại làm tăng chi phí thay đổi. |
| Quality gates | 6/10 | Test breadth tốt, CI có unit + E2E; nhưng lint bỏ lọt Rules of Hooks và test TS chưa được typecheck riêng. |
| Accessibility | 7/10 | Có semantic UI, keyboard/focus và Axe E2E; trạng thái hiện tại vẫn fail contrast. |
| Hiệu năng hiện tại | 6/10 | Có pagination và memo hóa một số derivation; bundle đơn khối, full refresh và synchronous Markdown/search chưa có benchmark. |
| Mức sẵn sàng phát hành | 5/10 | Lỗi Hook đã biến mất ở snapshot cuối, nhưng unit/E2E gate vẫn đỏ. |

## 3. Những phần đang làm tốt

### 3.1 Ranh giới dữ liệu rõ ràng

- `app/src/data/repository.ts` là adapter typed duy nhất tới `js/storage.js`; UI không mở IndexedDB transaction trực tiếp.
- `js/storage.js` giữ validation, migration, import/export, history retention và atomic mutation trong cùng một nơi.
- `expectedRevision` được kiểm tra trong cùng transaction với ghi note/history, giảm nguy cơ silent overwrite.
- `getSnapshot()` mặc định không tải history; history chỉ được đọc theo note khi người dùng mở dialog.

Khuyến nghị: tiếp tục giữ `PersonalNotesStorage` là storage boundary. Không port toàn bộ sang TypeScript chỉ để “đồng nhất công nghệ” nếu chưa có lợi ích đo được.

### 3.2 Editor session có tư duy chịu lỗi tốt

- `app/src/features/editor-session/session.ts` có stale-result protection, serialized save intent, conflict handling và per-pane recovery.
- Primary note và Side note có session độc lập.
- Update Service Worker được chặn khi còn dirty draft ở bất kỳ tab nào phản hồi.

Đây là phần có giá trị cao nhất của codebase. Khi chia nhỏ file, phải giữ nguyên state-machine contract và test hiện có.

### 3.3 Privacy và Markdown safety phù hợp sản phẩm

- Không tìm thấy network call từ app tới dịch vụ ngoài; `fetch()` chỉ nằm trong Service Worker cho local app assets.
- Cross-tab sync chỉ phát mutation metadata, không gửi nội dung note.
- Markdown renderer xây DOM và chặn unsafe URL/raw HTML ngoài allowlist.
- Backup là thao tác chủ động; note content không được đưa vào Cache Storage.

### 3.4 Test coverage theo luồng quan trọng khá rộng

E2E đã đi qua IndexedDB thật và nhiều luồng rủi ro: backup v1/v3, import/export, offline reload, conflict đa tab, draft recovery, version history, Side note, responsive layout và Axe accessibility. Đây là coverage theo hành vi (*behavioral coverage*) tốt hơn nhiều so với chỉ snapshot component.

## 4. Findings và đề xuất ưu tiên

### P0 — Sửa trước mọi release

#### P0.1 Khôi phục toàn bộ release gate về trạng thái xanh

**Bằng chứng**

- Snapshot cuối: 34/36 Vitest pass. Hai test workspace còn fail vì test tìm `Open Side note picker` trong khi UI expose `Open Side note`, và test kỳ vọng tooltip `Toggle bold · Ctrl+B` trong khi UI render `BoldCtrl+B`.
- Lượt chạy trước đó phát hiện `toggleSideNote = useCallback(...)` nằm sau các conditional return và gây Hook-order error. Một thay đổi đồng thời đã chuyển Hook lên trước return; lỗi này không còn xuất hiện trong lượt chạy cuối.
- Production E2E trên snapshot cuối đạt 21/23; hai lỗi được mô tả ở P1.5.

**Ảnh hưởng**

Test đỏ làm mất tín hiệu tin cậy của CI: team không thể phân biệt regression thật với expectation cũ. Lỗi Hook ban đầu cũng cho thấy lint gate hiện chưa bảo vệ một invariant cốt lõi của React.

**Đề xuất**

- Chốt accessible name và tooltip copy nào là contract sản phẩm, rồi cập nhật implementation hoặc test theo đúng quyết định đó; không đổi test chỉ để “cho xanh”.
- Thêm rule `react-hooks/rules-of-hooks` vào lint gate để lỗi dừng ngay tại lint.
- Thêm test chuyển trạng thái `loading -> ready -> workspace replaced` thay vì chỉ render trạng thái cuối.

**Acceptance**

- Không còn React Hook-order warning.
- Toàn bộ `WorkspaceScreen.test.tsx` và production E2E pass.
- `npm run check` pass từ clean checkout.

### P1 — Ổn định kiến trúc và quality gate

#### P1.1 Lint gate chưa bảo vệ React Hooks

`npm run lint` pass dù code hiện tại vi phạm Rules of Hooks. Không có cấu hình Oxlint React/React Hooks riêng trong repository.

**Đề xuất**

- Bật React và React Hooks lint rules, tối thiểu `rules-of-hooks` và `exhaustive-deps`.
- Không phụ thuộc vào React development runtime để phát hiện lỗi cấu trúc Hook.
- Cấu hình lint thành file versioned thay vì chỉ dùng mặc định CLI, để rule set có thể review và không thay đổi ngầm theo version tool.

#### P1.2 Component điều phối quá lớn

Các file lớn nhất hiện tại:

| File | Dòng | Trách nhiệm đang trộn |
| --- | ---: | --- |
| `WorkspaceScreen.tsx` | 1.011 | session lifecycle, autosave, conflicts, history, shortcuts, Side note, animation, dialog orchestration, layout |
| `LibraryScreen.tsx` | 808 | persisted preferences, responsive state, filtering/sorting, CRUD, backup, shell, pagination, shortcuts |
| `SettingsDialog.tsx` | 712 | mobile navigation, catalog CRUD, storage, theme, shortcuts, backup UI |
| `EditorPane.tsx` | 640 | header, metadata, type/tag pickers, toolbar, editor, preview, footer actions |
| `LibraryComponents.tsx` | 627 | backup status, filters, badges, card variants và card actions |
| `session.ts` | 710 | recovery persistence và editor save/conflict state machine |

**Ảnh hưởng**

- Hook dependencies khó kiểm tra và dễ tạo lỗi thứ tự như P0.1.
- Một thay đổi UI có thể rerender hoặc làm hỏng logic không liên quan.
- Test phải mock quá nhiều trạng thái trong cùng component.

**Đề xuất cấu trúc**, không thay đổi behavior:

```text
features/workspace/
  WorkspaceScreen.tsx          # composition only
  hooks/
    useWorkspaceController.ts  # primary/side session orchestration
    useWorkspaceShortcuts.ts
    useWorkspaceHistory.ts
    useSideNoteController.ts
  components/
    WorkspaceTopbar.tsx
    WorkspacePaneGrid.tsx
    SideNoteSurface.tsx

features/library/
  LibraryScreen.tsx            # composition only
  hooks/
    useLibraryPreferences.ts
    useLibraryQuery.ts
    useLibraryActions.ts
  components/
    LibraryToolbar.tsx
    LibrarySidebar.tsx
    NoteList.tsx

features/settings/
  SettingsDialog.tsx           # dialog shell only
  panels/
    TypesPanel.tsx
    TagsPanel.tsx
    DisplayPanel.tsx
    DataPanel.tsx
    ShortcutsPanel.tsx

features/editor-session/
  session.ts                   # state machine only
  recovery-store.ts            # local/session storage only
```

Mục tiêu hợp lý: screen-level component dưới khoảng 250–350 dòng; controller hook dưới khoảng 300–400 dòng. Không nên ép mọi file dưới một con số nếu việc tách làm mất tính liền mạch của state machine.

#### P1.3 Dependency direction chưa sạch

- `workspace/EditorPane.tsx` và `workspace/WorkspaceDialogs.tsx` import `TypeDot`/`NoteCard` từ `features/library/LibraryComponents.tsx`.
- `components/NookIcons.tsx` import `ThemeMode` từ `features/theme/ThemeProvider.tsx`.
- Settings import recovery-store từ toàn bộ `editor-session/session.ts`.

**Đề xuất**

- Chuyển `NoteCard`, `NoteTypeBadge`, `TypeDot` thành shared product components, ví dụ `components/note/`.
- Đưa `ThemeMode` vào `domain/preferences.ts` hoặc `features/theme/types.ts`; shared component không nên phụ thuộc ngược vào feature provider.
- Tách recovery-store như đề xuất ở P1.2 để Settings chỉ phụ thuộc đúng contract nó dùng.
- Thêm rule import boundary hoặc một test dependency graph nhẹ để ngăn shared -> feature và feature A -> feature B ngoài public API.

#### P1.4 Test TypeScript chưa có typecheck riêng

`tsconfig.app.json` loại `app/src/**/*.test.ts(x)`; `tsconfig.node.json` chỉ include config và `app/e2e`. Vitest transpile được test nhưng không thay thế TypeScript checking.

**Đề xuất**

- Thêm `tsconfig.test.json` hoặc include test sources trong một project reference riêng.
- Cho `npm run typecheck` kiểm tra app, tests và E2E.
- Giữ production app config tách biệt để test globals không lọt vào source.

#### P1.5 Production E2E hiện còn đỏ

Kết quả: 21/23 pass.

- Accessibility test fail tại Settings/Light theme: `output` hiển thị `3 lines` chỉ đạt contrast 4.16:1, thấp hơn mức 4.5:1 được Axe yêu cầu cho text cỡ nhỏ.
- Visual baseline test timeout vì vẫn tìm button `Open Side note picker`, trong khi accessible contract hiện tại đã đổi.

**Đề xuất**

- Sửa semantic token hoặc text color của output; không hard-code riêng một màu chỉ để pass test.
- Quyết định accessible name chuẩn cho Side note, sau đó cập nhật component và test cùng một contract.
- Tách visual capture khỏi functional E2E nếu mục tiêu của test chỉ là tạo artifact; visual generation không nên làm mờ tín hiệu regression chức năng.

#### P1.6 Service Worker đang gắn cứng root path

Vite dùng `base: './'`, nhưng `useOfflineUpdates.ts` đăng ký `'/sw.js'` với scope `'/'`. Cấu hình này hoạt động khi deploy ở domain root như hiện tại, nhưng không tương thích với subpath deployment.

**Đề xuất**

- Tạo registration URL và scope từ `import.meta.env.BASE_URL` hoặc URL của document.
- Thêm một E2E build chạy dưới subpath nếu subpath là deployment được hỗ trợ.
- Nếu sản phẩm chỉ hỗ trợ domain root, ghi rõ constraint trong architecture/README và test nó; không để `base: './'` tạo kỳ vọng sai.

#### P1.7 Quản lý input modality mới đang quá rộng

Snapshot cuối có `app/src/lib/modality.ts` và các global selector trong `app/src/styles/index.css` để chỉ hiện focus ring sau phím Tab. Ý định tránh ring khi click chuột là hợp lý, nhưng implementation hiện tại có rủi ro accessibility:

- `html:not([data-input-modality="keyboard"]) *:focus`, `*:focus-visible` và `*:focus-within` xóa cả `outline` lẫn `box-shadow` bằng `!important` cho toàn app.
- Modality chỉ chuyển sang keyboard khi `event.key === 'Tab'`. Shortcut `/`, `Cmd/Ctrl+F`, arrow-key navigation, programmatic focus sau một keyboard action, switch device hoặc công nghệ hỗ trợ có thể đưa focus tới control trong khi document vẫn mang modality `pointer`.
- Rule toàn cục có thể xóa box-shadow mang ý nghĩa state khác, không chỉ focus ring, và làm primitive của Base UI/Tailwind khó dự đoán.

**Đề xuất**

- Ưu tiên native `:focus-visible`; browser đã phân biệt pointer và keyboard modality cho đa số control.
- Nếu vẫn cần tracker, chuyển sang keyboard khi có bất kỳ phím điều hướng hợp lệ nào, không chỉ Tab, và không dùng selector `*` với `!important`.
- Scope override vào component có vấn đề thay vì triệt tiêu focus toàn app.
- Thêm E2E cho Tab, shortcut focus search, dialog focus restoration, arrow navigation trong Select/Menu và `forced-colors`.

### P1 — Hiệu năng

#### P1.8 Bundle JavaScript là một chunk lớn

Production build hiện tại:

| Asset | Minified | Gzip |
| --- | ---: | ---: |
| JavaScript | 736.12 kB | 223.62 kB |
| CSS | 183.16 kB | 29.97 kB |

Vite cảnh báo chunk vượt 500 kB. `App.tsx` import tĩnh Library, Workspace và toàn bộ dialog/settings path, nên người dùng tải code editor, Markdown, Settings và history ngay ở library landing screen.

**Đề xuất**

- Lazy-load `WorkspaceScreen` và `SettingsDialog`; giữ Library shell trong initial chunk.
- Tách các dialog hiếm dùng như history/conflict/data management nếu bundle analysis cho thấy có lợi.
- Không chia nhỏ từng component; mục tiêu là 2–4 route/feature chunks ổn định, tất cả vẫn được Service Worker precache.
- Dùng bundle report trong CI và đặt budget ban đầu dựa trên baseline. Mục tiêu đề xuất: initial JS gzip không vượt 200 kB, sau đó hạ dần nếu code splitting cho phép; CSS gzip giữ dưới 35 kB.

#### P1.9 Full snapshot refresh sau mọi mutation

`NookContext.mutate()` chạy operation rồi `getSnapshot()`. Cross-tab mutation cũng gọi `getSnapshot()`. Storage dùng `getAll()` cho toàn bộ notes, types và tags. Với import limit 10.000 notes và content tối đa 50.000 ký tự/note, chi phí clone/normalize/toàn bộ context update có thể lớn.

**Ảnh hưởng**

- Mỗi save, pin, trash, tag/type CRUD đều có thể đọc lại toàn bộ library.
- Context value mới làm mọi consumer của `useNook()` render lại.
- Cách làm này ưu tiên tính đúng đắn và hiện vẫn phù hợp với library nhỏ, nhưng không phải hiệu năng tốt nhất ở quy mô lớn.

**Đề xuất theo hai bước**

1. Đo trước: benchmark 100, 1.000 và 10.000 notes; ghi thời gian save-to-settled, search và render.
2. Chỉ khi vượt budget:
   - tách `NookContext` thành data context, navigation context và stable action context;
   - cho repository trả mutation result đủ để patch snapshot cục bộ;
   - vẫn revalidate full snapshot cho import/reset và cross-tab signal;
   - cân nhắc metadata-only list query, chỉ tải full content khi mở note.

Không nên thêm Redux/Zustand chỉ để giải quyết vấn đề này. Vấn đề nằm ở granularity của dữ liệu và invalidation, không nằm ở tên state library.

#### P1.10 Search và counts đang quét toàn bộ dữ liệu trên main thread

- Library search lower-case và nối `title + content` cho mọi note mỗi khi query đổi.
- Side-note search làm cùng việc.
- Quick type counts dùng `snapshot.notes.filter(...)` lặp lại cho từng type trong render.
- Settings tạo `activeNotes` mới ở mỗi render, khiến dependency của hai `useMemo` luôn đổi và memoization mất tác dụng.

**Đề xuất**

- Trước mắt: tạo một derived index trong một `useMemo` theo `snapshot.notes`, gồm normalized search text, type count, tag count, active/trash count.
- Dùng `useDeferredValue` cho query để typing không bị chặn bởi list derivation; debounce chỉ nên dùng nếu UX chấp nhận kết quả trễ.
- Với 10.000 notes và content lớn, cân nhắc Web Worker hoặc IndexedDB-backed search index sau khi benchmark xác nhận main-thread jank.
- Pagination 30/32 cards hiện đủ để giới hạn DOM; chưa cần virtualization cho list đang phân trang.

#### P1.11 Markdown split preview render đồng bộ trên mỗi ký tự

`MarkdownPreview` gọi renderer đồng bộ trong `useLayoutEffect`, và Split mode truyền trực tiếp `draft.content`. Với note gần 50.000 ký tự, mỗi keystroke có thể parse lại và thay toàn bộ preview DOM trước paint.

**Đề xuất**

- Dùng deferred source hoặc scheduling 50–100 ms cho preview, nhưng textarea state vẫn cập nhật ngay.
- Hủy render cũ khi draft mới đến; không để stale preview thắng render mới.
- Đo `input -> next paint` ở tài liệu 5 kB, 25 kB và 50 kB.
- Chỉ cân nhắc worker khi renderer có thể tách parsing khỏi DOM construction; worker không thể tự xây DOM.

### P2 — Dọn tổ chức và giảm nợ kỹ thuật

#### P2.1 Repository vẫn mang cấu trúc chuyển tiếp

Root còn toàn bộ vanilla app (`index.html`, `css/`, phần lớn `js/`, `sw.js`) bên cạnh React app. React chỉ cần `js/storage.js` và `js/markdown.js`, nhưng người mới vào dự án phải phân biệt hai entry point, hai UI implementation và hai nhóm test.

**Đề xuất sau khi parity được chấp nhận**

- Giữ `js/storage.js` và `js/markdown.js` như legacy-compatible core hoặc chuyển chúng vào thư mục rõ nghĩa như `app/src/legacy-core/` mà không đổi behavior.
- Chuyển UI cũ sang tag/branch/archive thay vì để song song trong production tree.
- Xóa các browser harness cũ chỉ sau khi coverage tương ứng đã nằm trong Vitest/Playwright.
- Thực hiện cleanup thành PR riêng, có backup và danh sách file chính xác; không trộn với bug fix UI.

#### P2.2 `prototype/` và tài liệu đang lệch trạng thái

README và `docs/refactor-contract.md` gọi `prototype/` là “untracked”, nhưng Git hiện track 25 file trong thư mục này. `prototype/` còn có package/lockfile riêng và local `node_modules` khoảng 251 MB dù `node_modules` đã được ignore.

**Đề xuất**

- Chọn một nguồn sự thật: archive prototype ra ngoài repo, hoặc giữ có chủ đích dưới `examples/prototype/` và ghi rõ không thuộc build/test production.
- Sửa README/architecture sau khi quyết định.
- Bổ sung hygiene check cho `.DS_Store` và generated artifacts; hiện global ignore đang che phần này thay vì repo tự mô tả đầy đủ.

#### P2.3 CSS ownership vẫn quá rộng

`workspace.css` có 836 dòng, `library.css` 456 dòng và nhiều Tailwind utility nằm xen với BEM CSS. Điều này không sai, nhưng khó biết token/layout/state nào là source of truth.

**Đề xuất**

- Giữ theme tokens ở `styles/themes.css`.
- Shared primitives giữ style trong `components/ui`.
- Feature CSS chỉ giữ macro layout, responsive behavior và state animation khó biểu diễn bằng utility.
- Khi tách component, tách CSS theo cùng ownership; không tạo thêm một global “overrides.css”.
- Thêm Stylelint chỉ khi có rule set rõ và giá trị thực; không thêm tool chỉ để format.

#### P2.4 Chưa có performance baseline hoặc regression budget

Hiện có functional/visual/accessibility tests nhưng không có benchmark cho startup, search, editor typing, Markdown rendering, snapshot refresh hay bundle budget.

**Đề xuất metric**

| Luồng | Dataset | Budget ban đầu đề xuất |
| --- | --- | ---: |
| Search update p95 | 1.000 notes | < 50 ms |
| Search update p95 | 10.000 notes | < 150 ms hoặc chuyển worker/index |
| Save-to-settled p95 | 10.000 notes | < 150 ms |
| Split preview input-to-paint p95 | 25 kB Markdown | < 50 ms |
| Interaction to Next Paint | desktop reference device | < 200 ms |
| Initial JS gzip | production build | <= 200 kB sau code splitting |

Các budget cần được đo trên một reference device cố định và synthetic notes, không dùng dữ liệu cá nhân.

## 5. Target architecture đề xuất

```text
app/src/
  app/                    # providers, route/surface composition
  domain/                 # pure contracts, preference types, invariants
  data/                   # repository adapter, sync metadata
  components/
    ui/                   # shadcn/Base UI primitives
    note/                 # NoteCard, badges, type dot, note actions
  features/
    library/              # library composition + controllers
    workspace/            # workspace composition + controllers
    editor-session/       # framework-independent state machine
    markdown/             # safe renderer adapter
    settings/             # dialog shell + panels
    offline/              # Service Worker lifecycle
    theme/                # theme provider and catalog
  styles/                 # global reset and semantic theme tokens only
```

Dependency direction:

```text
domain <- data
domain <- shared components
domain/data/shared components <- features
features <- app composition
```

Không cho `components/` import từ `features/`. Feature-to-feature reuse đi qua shared component hoặc public contract nhỏ, không import một file “components” khổng lồ của feature khác.

## 6. Roadmap thực hiện

### Phase 0 — Release blockers, 0.5–1 ngày

1. Chốt và đồng bộ Side note accessible name cùng tooltip contract giữa UI và test.
2. Bật lint rule cho React Hooks để giữ fix Hook-order vừa được áp dụng.
3. Sửa contrast Settings và thu hẹp global focus-modality override.
4. Chạy lại `npm run check` và toàn bộ E2E trên một snapshot không còn thay đổi đồng thời.

### Phase 1 — Baseline và guardrails, 1–2 ngày

1. Thêm typecheck project cho tests.
2. Thêm bundle-size report/budget.
3. Tạo synthetic performance fixture 100/1.000/10.000 notes.
4. Ghi baseline search, save, workspace open và split preview.
5. Xác nhận deployment chỉ ở root hay hỗ trợ subpath.

### Phase 2 — Refactor không đổi behavior, 3–5 ngày

1. Tách shared note components khỏi Library feature.
2. Tách Settings panels.
3. Tách workspace controller/hooks và recovery store.
4. Giữ nguyên public contracts và chạy test sau từng extraction.

Nên chia thành nhiều PR nhỏ; không refactor đồng thời với thay đổi UI lớn.

### Phase 3 — Tối ưu theo số đo, 2–5 ngày

1. Code split Workspace và Settings.
2. Tạo derived search/count index.
3. Deferred Markdown preview.
4. Nếu benchmark vẫn vượt budget, thiết kế incremental snapshot hoặc metadata-only list query.

### Phase 4 — Cleanup migration, chỉ sau sign-off

1. Quyết định số phận vanilla UI và prototype.
2. Cập nhật README/architecture theo trạng thái thật.
3. Xóa/di chuyển artifact cũ trong PR riêng sau khi Ray duyệt danh sách.

## 7. Những thay đổi không nên làm

- Không thêm backend, cloud sync, analytics hoặc authentication để “chuẩn hóa kiến trúc”. Chúng đi ngược product boundary hiện tại.
- Không thay IndexedDB bằng localStorage; note/history/backup cần transaction và dung lượng của IndexedDB.
- Không port `js/storage.js` hoặc `js/markdown.js` chỉ vì chúng là JavaScript. Hai module này đang có contract và coverage tốt.
- Không thêm Redux/Zustand trước khi chứng minh context granularity là bottleneck thực tế.
- Không dùng virtualization khi list đã phân trang 30/32 cards, trừ khi benchmark DOM chứng minh cần thiết.
- Không chạy một “big-bang refactor” cho Workspace, Library và Settings cùng lúc.
- Không tối ưu bằng cách bỏ history, conflict checking, recovery hoặc draft-safe update; đây là các safety contract quan trọng hơn vài mili-giây.

## 8. Kết quả kiểm tra trong phiên audit

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript (`tsc -b`) | Pass |
| Oxlint | Pass, nhưng bỏ lọt Rules of Hooks |
| Vitest, lượt đầu | Fail: 5 test workspace fail vì Hook-order; 31 test khác pass |
| Vitest, snapshot cuối | Fail: 2 test workspace lệch UI contract; 34 test khác pass; Hook-order error không còn |
| Legacy Node tests | Pass: 27/27 |
| Production build | Pass, có cảnh báo chunk > 500 kB |
| Playwright E2E, snapshot cuối | 21/23 pass; fail contrast và stale Side note locator |
| `git diff --check` | Pass trên snapshot cuối |

Playwright lần đầu không khởi động được localhost trong sandbox (`EPERM`); các lần chạy được cấp quyền localhost hoàn tất. Trong lúc audit, working tree được cập nhật ngoài phiên này: Hook-order được sửa, đồng thời `App.tsx`, focus-modality CSS và `app/src/lib/modality.ts` xuất hiện. Tôi đã chạy lại build và E2E sau các thay đổi đó; kết quả cuối là build pass và E2E 21/23.

## 9. Definition of done đề xuất

Codebase có thể coi là ổn định sau refactor khi:

- `npm run check` pass từ clean checkout.
- E2E pass 100% trên Chromium CI.
- Không có Hook-order warning hoặc uncaught console error.
- Axe không có WCAG A/AA violation trong toàn bộ theme được hỗ trợ.
- Bundle và performance benchmark nằm trong budget đã thống nhất.
- Workspace/Library/Settings không còn screen component gánh đồng thời UI, persistence orchestration, keyboard và dialog state.
- README, architecture và cấu trúc repository phản ánh đúng entry point và status của legacy/prototype.
- Backup v1/v2/v3, IndexedDB migration, conflict, recovery, offline update và Side note tiếp tục pass sau mọi extraction.

## 10. Thứ tự quyết định khuyến nghị

1. Chốt và xử lý P0/P1 quality failures trước.
2. Đo performance bằng synthetic dataset.
3. Tách component/controller để giảm rủi ro thay đổi.
4. Tối ưu bundle, search, preview theo kết quả đo.
5. Cuối cùng mới cleanup legacy/prototype.

Theo thứ tự này, Nook giữ được các safety contract đang tốt, giảm regression ngay lập tức và tránh đầu tư vào tối ưu chưa được chứng minh.
