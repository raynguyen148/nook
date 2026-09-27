# Nook Light UI prototype

An isolated Vite + React + Tailwind CSS + shadcn/ui prototype of Nook's Home, Edit, and Preview screens. The palette and main layout follow the existing Light theme and screenshots in `../docs/screenshots/`.

## Run locally

Use Node.js 22.12 or newer:

```sh
cd prototype
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` checks TypeScript and creates a production bundle; `npm run lint` checks source style.

## Prototype scope

- Sample notes live in React memory. Changes reset when the page reloads.
- Search, type/Pinned filters, layout and sort controls, note navigation, Markdown editing, preview, and temporary save are interactive.
- The prototype does not read or write Nook's IndexedDB. It has no import/export flow, service worker, or production data migration.
- All runtime packages are bundled locally by Vite. There is no CDN, hosted font, analytics, or external API. Markdown images render as alt text instead of making image requests.
- Settings and Trash actions are visual placeholders.

The original Nook app at `../index.html` remains separate.
