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
    aurora: { label: "Aurora", file: "aurora", color: "#17142c" },
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
  // Frost is the material's blur and haze, independent of how much art shows.
  const glassFrostLevels = Object.freeze(["clear", "soft", "frosted"]);
  const glassFrostDefault = "soft";

  /** @param {unknown} value */
  function normalizeGlass(value) {
    const entry = /** @type {{ enabled?: unknown, transparency?: unknown, frost?: unknown } | null} */ (
      value && typeof value === "object" ? value : null
    );
    const transparency = typeof entry?.transparency === "number" && Number.isInteger(entry.transparency)
      ? Math.min(glassMax, Math.max(glassMin, entry.transparency))
      : glassDefault;
    const frost = glassFrostLevels.find(level => level === entry?.frost) || glassFrostDefault;
    return { enabled: entry?.enabled === true, transparency, frost };
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

  /** @param {{ enabled: boolean, transparency: number, frost: string }} value */
  function applyGlass(value) {
    const supported = typeof CSS !== "undefined" &&
      (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")) &&
      CSS.supports("background-color", "color-mix(in srgb, white 80%, transparent)");
    document.documentElement.dataset.glass = String(value.enabled && supported);
    document.documentElement.dataset.glassFrost = normalizeGlass(value).frost;
    // Each film eases linearly from its default tint at the minimum setting to
    // its CSS readability floor at the maximum, so every step of the slider
    // changes something. Reading areas stop at their 84% floor.
    const span = glassMax - glassMin;
    const progress = Math.min(1, Math.max(0, (value.transparency - glassMin) / span));
    /** @param {number} from @param {number} to */
    const film = (from, to) => `${Math.round((from + (to - from) * progress) * 10) / 10}%`;
    const style = document.documentElement.style;
    style.setProperty("--glass-opacity", film(64, 32));
    style.setProperty("--glass-card-opacity", film(66, 53));
    style.setProperty("--glass-reading-opacity", film(90, 84));
    // Mobile cards sit directly on the backdrop with a lower 72% floor.
    style.setProperty("--glass-mobile-card-opacity", film(90, 72));
    // Sidebar's small labels keep a stronger tint.
    style.setProperty("--glass-sidebar-opacity", film(95, 75));
    // Preserve the existing artwork strength at 20%; 40% doubles its visibility.
    style.setProperty("--glass-reveal", String(value.transparency / 20));
  }

  const glass = Object.freeze({
    storageKey: glassStorageKey, min: glassMin, max: glassMax, defaultValue: glassDefault,
    frostLevels: glassFrostLevels, frostDefault: glassFrostDefault,
    normalize: normalizeGlass, parse: parseGlass, read: readGlass, apply: applyGlass,
  });
  applyGlass(readGlass());

  // Artwork style preference (Ambient Studio Glow vs. Nature Scenery)
  const backgroundStyleStorageKey = "nook:background-style";
  const backgroundStyleDefault = "ambient";
  const backgroundStyles = Object.freeze(["ambient", "nature"]);

  /** @param {unknown} value */
  function normalizeBackgroundStyle(value) {
    return value === "nature" ? "nature" : "ambient";
  }

  function readBackgroundStyle() {
    try { return normalizeBackgroundStyle(window.localStorage.getItem(backgroundStyleStorageKey)); }
    catch { return backgroundStyleDefault; }
  }

  /** @param {string} value */
  function applyBackgroundStyle(value) {
    const style = normalizeBackgroundStyle(value);
    document.documentElement.dataset.backgroundStyle = style;
  }

  const backgroundStyle = Object.freeze({
    storageKey: backgroundStyleStorageKey, defaultValue: backgroundStyleDefault, styles: backgroundStyles,
    normalize: normalizeBackgroundStyle, read: readBackgroundStyle, apply: applyBackgroundStyle,
  });
  applyBackgroundStyle(readBackgroundStyle());

  const mode = readMode();
  const resolved = resolve(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  const themeStylesheet = document.createElement("link");
  themeStylesheet.id = "nook-theme-stylesheet";
  themeStylesheet.rel = "stylesheet";
  themeStylesheet.href = `css/themes/${describe(resolved).file}.css`;
  themeStylesheet.dataset.themeStylesheet = resolved;
  // Script-inserted stylesheets do not block painting by default; without this
  // the first frame can render before the palette arrives.
  Reflect.set(themeStylesheet, "blocking", "render");
  document.head.append(themeStylesheet);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor instanceof HTMLMetaElement) themeColor.content = describe(resolved).color;

  /** @type {import('./contracts').ModuleRegistry} */
  const registry = Reflect.get(globalThis, Symbol.for("nook.app.modules"));
  registry.register("theme-config", (app) => {
    app.theme = Object.freeze({ storageKey, modes, normalize, readMode, resolve, describe, glass, backgroundStyle });
    app.api.getStoredTheme = readMode;
  });
})();
