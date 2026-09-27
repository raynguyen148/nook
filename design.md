# Nook design system

This is the locked visual contract for the migrated app. It preserves the previous Nook product rather than introducing a new brand or feature set.

## Structural fingerprint

- Genre: modern minimal.
- Macrostructure: Workbench.
- Primary regions: persistent library navigation, compact command bar, card library, focused editor workspace, native-feeling modal utilities.
- Density: compact desktop controls with full-screen mobile dialogs and sheets.
- Surfaces: quiet neutral paper, hairline borders, restrained shadows, rounded cards and dialogs.
- Accent: the active theme's semantic `--primary`; never a component-level hard-coded brand color.

## Typography and iconography

- Use the local system sans stack for body and headings to preserve the old app and offline contract.
- Use system monospace only for keyboard shortcuts and code-like content.
- Keep the existing thin-stroke Nook SVG language. Do not mix in decorative illustration or a second icon style.

## Layout and interaction

- Keep the library sidebar, command bar, note grid, editor panes, and Settings information architecture unchanged.
- Settings uses a 560 × 720 px desktop dialog, a full-width five-part segmented tab row, scrollable panels, and a full-screen mobile navigation flow.
- Animate only color, background, border, shadow, opacity, and small press transforms. Use `--dur-micro`, `--dur-short`, and `--ease-out`.
- Every motion path must honor `prefers-reduced-motion`.
- Preserve visible keyboard focus, native dialog focus restoration, and minimum mobile touch targets.

## Tokens

The runtime source of truth is [`app/tokens.css`](app/tokens.css). Theme palettes continue to live in `app/src/styles/themes.css` and feed the semantic shadcn variables.

### Tailwind v4 export

```css
@theme inline {
  --font-display: ui-sans-serif, system-ui, sans-serif;
  --font-body: ui-sans-serif, system-ui, sans-serif;
  --font-outlier: ui-monospace, "SFMono-Regular", Consolas, monospace;
  --color-paper: var(--background);
  --color-paper-2: var(--card);
  --color-paper-3: var(--muted);
  --color-ink: var(--foreground);
  --color-ink-2: var(--card-foreground);
  --color-rule: var(--border);
  --color-rule-2: var(--input);
  --color-neutral: var(--muted-foreground);
  --color-focus: var(--ring);
  --radius-card: var(--radius-lg);
  --radius-pill: 999px;
  --radius-input: var(--radius-md);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-extra-short: 100ms;
  --dur-micro: 120ms;
  --dur-short: 180ms;
  --dur-medium: 260ms;
  --dur-long: 360ms;
}
```

### shadcn/ui export

```css
:root {
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --primary: #9e6b02;
  --primary-foreground: #ffffff;
  --muted: #f1f5f9;
  --muted-foreground: #5b6475;
  --border: #e2e8f0;
  --input: #d9e2ec;
  --ring: #9e6b02;
}
```

The application already supplies these concrete values per theme in `themes.css`; the export documents the mapping and is not a second runtime palette.

### DTCG export

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "{semantic.background}", "$type": "color" },
    "ink": { "$value": "{semantic.foreground}", "$type": "color" },
    "rule": { "$value": "{semantic.border}", "$type": "color" },
    "focus": { "$value": "{semantic.ring}", "$type": "color" }
  },
  "duration": {
    "extraShort": { "$value": "100ms", "$type": "duration" },
    "micro": { "$value": "120ms", "$type": "duration" },
    "short": { "$value": "180ms", "$type": "duration" },
    "medium": { "$value": "260ms", "$type": "duration" },
    "long": { "$value": "360ms", "$type": "duration" }
  },
  "radius": {
    "pill": { "$value": "999px", "$type": "dimension" }
  }
}
```

## Boundaries

- No network dependency, hosted font, analytics, account system, or remote asset.
- No new product capability or navigation destination.
- Keep IndexedDB, backup compatibility, Markdown behavior, and application state contracts outside the visual layer unchanged.
