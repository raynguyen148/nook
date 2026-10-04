(() => {
  "use strict";

  // One catalogue is used before first paint and by the installed application.
  const storageKey = "nook:theme";
  const metadata = Object.freeze(Object.fromEntries(Object.entries({
    light: { label: "Light", file: "classic", color: "#9e6b02" },
    coffee: { label: "Coffee", file: "coffee", color: "#a35616" },
    forest: { label: "Forest", file: "forest", color: "#2f6b4f" },
    midnight: { label: "Midnight", file: "midnight", color: "#18263f" },
    dark: { label: "Dark", file: "dark", color: "#09090b" },
    retro: { label: "Retro", file: "retro", color: "#2f5b3e" },
    eink: { label: "Zen", file: "eink", color: "#f5f2eb" },
    auto: { label: "Auto", file: "classic", color: "#9e6b02" },
  }).map(([key, value]) => [key, Object.freeze(value)])));
  const modes = Object.freeze(Object.keys(metadata));
  /** @type {Readonly<Record<string, string>>} */
  const aliases = Object.freeze({ warm: "coffee", "midnight-blue": "midnight" });

  /** @param {string | null} value */
  function normalize(value) {
    const mode = (value && aliases[value]) || value || "light";
    return modes.includes(mode) ? mode : "light";
  }

  function readMode() {
    try { return normalize(window.localStorage.getItem(storageKey)); }
    catch { return "light"; }
  }

  /** @param {string} mode */
  function resolve(mode) {
    return mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : normalize(mode);
  }

  /** @param {string} mode */
  function describe(mode) { return metadata[normalize(mode)]; }

  // Appearance preferences share this before-paint boundary with themes.
  const glassStorageKey = "nook:glass";
  const glassMin = 10;
  const glassMax = 50;
  const glassDefault = 10;

  /** @param {unknown} value */
  function normalizeGlass(value) {
    const entry = /** @type {{ enabled?: unknown, transparency?: unknown } | null} */ (
      value && typeof value === "object" ? value : null
    );
    const transparency = typeof entry?.transparency === "number" && Number.isInteger(entry.transparency)
      ? Math.min(glassMax, Math.max(glassMin, entry.transparency))
      : glassDefault;
    return { enabled: entry?.enabled === true, transparency };
  }

  /** @param {string | null} value */
  function parseGlass(value) {
    try { return normalizeGlass(value ? JSON.parse(value) : null); }
    catch { return normalizeGlass(null); }
  }

  function readGlass() {
    try { return parseGlass(window.localStorage.getItem(glassStorageKey)); }
    catch { return normalizeGlass(null); }
  }

  /** @param {{ enabled: boolean, transparency: number }} value */
  function applyGlass(value) {
    const supported = typeof CSS !== "undefined" &&
      (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")) &&
      CSS.supports("background-color", "color-mix(in srgb, white 80%, transparent)");
    document.documentElement.dataset.glass = String(value.enabled && supported);
    // Library film and card tint stack: at 40, two 40% layers yield 64%
    // effective opacity, rather than the old nearly opaque 92% result.
    document.documentElement.style.setProperty("--glass-opacity", `${100 - value.transparency * 1.5}%`);
    document.documentElement.style.setProperty("--glass-card-opacity", `${100 - value.transparency * 1.5}%`);
    // Reading has one film; sidebar's small labels keep a stronger tint.
    document.documentElement.style.setProperty("--glass-reading-opacity", `${100 - value.transparency}%`);
    document.documentElement.style.setProperty("--glass-sidebar-opacity", `${100 - value.transparency / 2}%`);
    // Preserve the existing artwork strength at 20%; 40% doubles its visibility.
    document.documentElement.style.setProperty("--glass-reveal", String(value.transparency / 20));
  }

  const glass = Object.freeze({
    storageKey: glassStorageKey, min: glassMin, max: glassMax, defaultValue: glassDefault,
    normalize: normalizeGlass, parse: parseGlass, read: readGlass, apply: applyGlass,
  });
  applyGlass(readGlass());

  const mode = readMode();
  const resolved = resolve(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  const themeStylesheet = document.createElement("link");
  themeStylesheet.id = "nook-theme-stylesheet";
  themeStylesheet.rel = "stylesheet";
  themeStylesheet.href = `css/themes/${describe(resolved).file}.css`;
  themeStylesheet.dataset.themeStylesheet = resolved;
  document.head.append(themeStylesheet);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor instanceof HTMLMetaElement) themeColor.content = describe(resolved).color;

  /** @type {import('./contracts').ModuleRegistry} */
  const registry = Reflect.get(globalThis, Symbol.for("nook.app.modules"));
  registry.register("theme-config", (app) => {
    app.theme = Object.freeze({ storageKey, modes, normalize, readMode, resolve, describe, glass });
    app.api.getStoredTheme = readMode;
  });
})();
