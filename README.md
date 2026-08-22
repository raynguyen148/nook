# Nook

Nook is a private, offline-first personal notes workspace. It runs as a static
web app in the browser and stores the note library locally in IndexedDB. There
is no account, backend, sync service, analytics, CDN, or runtime dependency.

Use it for keeping work notes, learning material, research, project context,
interview practice, and personal ideas in one searchable local library.

## Highlights

- Create and edit notes with a title, one note type, optional tags, and raw Markdown content.
- Preview Markdown while editing or open a note in Quick View.
- Search note titles and content without sending data anywhere.
- Filter by note type, multiple tags, Created Today, or Updated Today.
- Combine filters; selected tags use an “all selected tags” match.
- Sort by created date, updated date, or title.
- Pin important notes so they stay at the top of the results.
- Move notes to Trash, restore them, undo a move, or permanently empty Trash.
- Copy raw Markdown or export an individual note as `.md` or `.txt`.
- Export and import a complete JSON backup of the local library.
- Manage note types and tags from the Organize notes dialog.
- Switch between light and dark themes and Focus, Comfortable, and Compact layouts.
- Keep the library usable across multiple open tabs when the browser supports `BroadcastChannel`.

## Quick start

Nook has no build step and no package installation. Serve the repository with
any static web server, then open it in a modern browser:

```bash
cd nook
python3 -m http.server 8000
```

Open <http://localhost:8000>.

Serving through `localhost` is recommended because browser behavior for
`file://` pages varies, especially around IndexedDB, downloads, and clipboard
access. JavaScript is required.

## Using Nook

### Create and edit a note

1. Select **New note**.
2. Enter a title and choose a note type.
3. Add existing tags or type a new tag and press Enter.
4. Write Markdown in the content editor.
5. Select **Save & close**, or use Quick save to save while keeping the editor open.

Existing notes with a title and ID are autosaved after a short pause while you
edit. A new untitled draft is not persisted until its first explicit save.
Closing or cancelling a dirty editor asks for confirmation before discarding
changes.

The split-view button shows the raw Markdown editor beside a rendered preview.
The editor always preserves the source Markdown; Quick View renders that source
for reading.

### Find and organize notes

- Use the search field to match a note title or content.
- Choose a type from the sidebar or from a note card's type badge.
- Select one or more tags. Nook shows notes containing every selected tag.
- Use **Created Today** or **Updated Today** for date-based review.
- Remove individual filters from the active-filter pills or select **Clear**.
- Choose a sort order from the toolbar. Pinned notes remain above unpinned notes.
- Use the Focus, Comfortable, and Compact buttons to change the card layout.

The **Organize notes** dialog lets you add, rename, recolor, and delete note
types and tags. Every note belongs to one type. The built-in **General** type
cannot be deleted; notes from a deleted custom type move to General. Tags are
optional and can be shared by many notes.

### Quick View and note actions

From a note card, open **View** to read the rendered note. Quick View provides:

- **Copy** — copies the raw Markdown source.
- **Export `.md`** — downloads the original Markdown.
- **Export `.txt`** — downloads a plain-text rendering.
- **Edit** — opens the editor.
- **Close** — returns to the library.

The pin control is available on each card. In Trash, a note can be restored or
permanently deleted. Moving a note to Trash is recoverable until it is
permanently deleted or Trash is emptied.

### Keyboard shortcuts

The modifier is `Command` on macOS and `Control` on Windows/Linux.

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + F` | Focus search when no modal dialog is open |
| `/` | Focus search when not already editing a field |
| `⌘/Ctrl + B` | Toggle bold around the selected editor text |
| `⌘/Ctrl + I` | Toggle italic around the selected editor text |
| `⌘/Ctrl + K` | Insert a link around the selected editor text |
| `⌘/Ctrl + Shift + S` | Quick save and keep the editor open |
| `⌘/Ctrl + Enter` | Save and close the editor |

The editor footer includes an accessible shortcut and Markdown guide.

## Markdown support

Nook includes a dependency-free Markdown-to-DOM renderer. It supports a broad
CommonMark/GFM-style subset, including:

- ATX and setext headings
- Bold, italic, strikethrough, inline code, entities, and hard line breaks
- Fenced and indented code blocks, including an optional language label
- Unordered, ordered, nested, and task lists
- Blockquotes and GitHub-style alerts: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`
- Inline links, reference links, autolinks, and safe `http`, `https`, `mailto`, and `tel` destinations
- Tables with alignment
- Footnotes
- Allowlisted `<details>` and `<summary>` blocks
- Mathematical-expression text blocks and inline expressions
- Horizontal rules

This is not a claim of complete GitHub renderer parity. Math is displayed as
text rather than typeset. Remote images are represented by accessible alt text
so Nook does not load untrusted image assets. Raw HTML remains inert except for
the explicitly supported details/summary syntax, and unsafe URL schemes are
not rendered as links.

## Local data and privacy

Nook keeps the note library in the current browser profile:

- IndexedDB database: `personal-notes`
- Current database version: `2`
- Object stores: `notes`, `types`, `tags`, and `meta`
- UI preferences such as theme, layout, sort order, and active filters use `localStorage`

The app does not send note content to a server and does not call external APIs.
However, browser site data is not a backup: clearing site data, changing browser
profiles, or using another browser can make the local library unavailable. Export
a JSON backup regularly and keep it somewhere safe. Backups are plain JSON and
are not encrypted by Nook.

### Note data model

Each note contains:

| Field | Description |
| --- | --- |
| `id` | Stable local note identifier |
| `title` | Required title, up to 160 characters |
| `typeId` | Required reference to one note type |
| `tagIds` | Zero or more tag references |
| `content` | Raw Markdown, up to 50,000 characters |
| `createdAt` | ISO timestamp |
| `updatedAt` | ISO timestamp |
| `isPinned` | Whether the note is pinned |
| `deletedAt` | ISO timestamp when in Trash, otherwise `null` |

Titles, type names, and tag names are normalized and validated by the storage
layer. Note content is trimmed and line endings are normalized before saving;
the Markdown syntax itself is preserved.

## Backup and restore

### Full library backup

Select **Export** to download a file named like
`personal-notes-backup-YYYY-MM-DD.json`. The current format is:

```json
{
  "format": "personal-notes-backup",
  "schemaVersion": 2,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "data": {
    "noteTypes": [],
    "tags": [],
    "notes": []
  }
}
```

Select **Import** to validate a JSON file before replacing the current library.
Import is a full replacement, not a merge. The confirmation dialog shows the
number of notes, types, and tags that will be imported.

Nook accepts current schema versions `1` and `2`, older `types` naming in place
of `noteTypes`, and the legacy library shape containing
`interviewQuestions` and `protoblocNotes`. Legacy data is upgraded into the
current note/type/tag model.

## Project structure

| File | Responsibility |
| --- | --- |
| [`index.html`](index.html) | Semantic page structure, dialogs, labels, controls, and script order |
| [`styles.css`](styles.css) | Layout, responsive behavior, themes, component states, and accessibility styling |
| [`storage.js`](storage.js) | IndexedDB setup, validation, migration, CRUD, Trash lifecycle, and backup import/export |
| [`markdown.js`](markdown.js) | Safe dependency-free Markdown parser and DOM renderer |
| [`app.js`](app.js) | UI state, filtering, rendering, dialogs, editor behavior, shortcuts, and storage calls |
| [`favicon.svg`](favicon.svg) | Local application icon |
| [`LICENSE`](LICENSE) | Unlicense / public-domain dedication |

The entry point loads scripts in this order:

```text
storage.js → markdown.js → app.js
```

`storage.js` exposes the frozen `PersonalNotesStorage` API and
`markdown.js` exposes the frozen `NookMarkdown` API. The UI should use these
interfaces rather than accessing IndexedDB directly.

## Development and validation

There is currently no `package.json`, bundler, framework, test runner, or
remote runtime dependency. Useful static checks are:

```bash
node --check storage.js
node --check markdown.js
node --check app.js
git diff --check
```

When changing behavior, manually exercise the affected flow through a local
server. For editor or dialog changes, check new notes, existing notes, dirty
draft confirmation, keyboard focus, and a narrow mobile viewport. For storage
changes, check save, delete/restore, permanent deletion, import/export, and
backward-compatible data handling.

Keep changes focused and preserve the offline-only boundary. Do not add hosted
fonts, CDNs, analytics, authentication, external APIs, or a framework without
an explicit product decision.

## License

Nook is released under the [Unlicense](LICENSE). It is provided without
warranty; see the full license text for details.
