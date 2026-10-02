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
    eink: { label: "E-Ink", file: "eink", color: "#efece4" },
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
    app.theme = Object.freeze({ storageKey, modes, normalize, readMode, resolve, describe });
    app.api.getStoredTheme = readMode;
  });
})();
