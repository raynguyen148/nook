# Nook architecture

Nook stays a dependency-free, offline-first application that can run directly
from `file://` or from a static localhost server. The architecture favors
explicit manifests and small classic-script modules over a bundler or framework.

## Application modules

`js/app/runtime.js` is the only application script that must load first. The
other files register named installers and can appear in any order in
`index.html`. Once every required module is present, the runtime initializes
them in this explicit dependency order:

```text
core → preferences → feedback → library → editor → organize → sync → events
```

- `core` creates shared state, cached DOM references, constants, filters, and pure helpers.
- `preferences` owns theme, layout, sidebar, responsive controls, and UI preference persistence.
- `feedback` owns toast behavior and confirmation-dialog focus management.
- `library` owns navigation, cards, Quick View, pagination, and Trash actions.
- `editor` owns note editing, pickers, validation, autosave, and draft safety.
- `organize` owns type/tag management, library refresh, import, and export.
- `sync` owns same-origin tab notifications and guarded external refreshes.
- `events` binds handlers and starts the application after every API is ready.

The runtime rejects unknown and duplicate module names. If a required script is
missing, startup fails visibly without changing IndexedDB. `events` freezes the
assembled API and removes the temporary registry before bootstrap completes.

When adding or splitting a module:

1. Give it one cohesive product responsibility.
2. Add its name and initialization position to `MODULE_ORDER` in `runtime.js`.
3. Register exactly one installer and add its script to `index.html`.
4. Keep UI persistence behind `PersonalNotesStorage`; do not access IndexedDB
   directly from an application module.
5. Use late-bound `api` calls only for genuine cross-module cycles. Prefer a
   dependency that points toward an earlier module when practical.

## CSS cascade

`css/app.css` is the only stylesheet linked by `index.html`. It is the cascade
manifest: foundations load first, feature refinements follow, accessibility is
late, and theme overrides remain last. Individual selectors stay in their
owning stylesheet.

Use these ownership rules:

- `base.css`: tokens, reset, page shell, and global primitives.
- `note-components.css`, `dialogs.css`, `management.css`, `markdown.css`:
  reusable components and content rendering.
- `library.css`, `organize.css`, `note-detail.css`: feature-owned layout and UI.
- `interactions.css`: shared interactive states and motion.
- `responsive.css`: cross-feature responsive behavior only; feature-specific
  media rules should remain next to their owning feature.
- `accessibility.css`: focus, reduced-motion, and forced-colors behavior.
- `themes/*.css`: theme tokens first; selector overrides only when a token
  cannot express the difference.

Note-card surfaces, text, metadata, and action colors use semantic theme tokens.
Theme selectors remain for genuine structural or interaction differences such
as Warm card elevation and Dark hover behavior.

Before adding an override, search for the existing selector and edit its owner
when possible. Avoid raising specificity or adding `!important` as a default
fix. A deliberate cross-layer override should include a short comment explaining
which earlier rule it supersedes. Reordering `app.css` imports requires desktop,
mobile, light, warm, and dark visual checks.

## Validation

Run syntax and whitespace checks after structural changes:

```bash
node --check js/storage.js
node --check js/markdown.js
for file in js/app/*.js; do node --check "$file"; done
git diff --check
```

Then exercise startup, note CRUD, editor modes, dirty-draft protection,
cross-tab refresh, import/export entry points, responsive layout, and all themes
on an isolated browser origin.
