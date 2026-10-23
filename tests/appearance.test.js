"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

function appearanceHarness({ stored = null, storedStyle = null, blocked = false, supported = true } = {}) {
  const values = new Map([
    ...(stored === null ? [] : [["nook:glass", stored]]),
    ...(storedStyle === null ? [] : [["nook:background-style", storedStyle]]),
  ]);
  const properties = new Map();
  const installers = new Map();
  const controls = () => ({
    value: "", checked: false, disabled: false, textContent: "", attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    classList: { values: new Set(), toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); } },
  });
  class MetaElement {}
  const elements = {
    glassEnabled: controls(), glassTransparency: controls(),
    glassTransparencyControl: controls(), glassTransparencyValue: controls(),
    glassStyleSelect: controls(),
    glassFrostControl: controls(),
    glassFrostInputs: ["clear", "soft", "frosted"].map(value => ({ ...controls(), value })),
  };
  const document = {
    documentElement: { dataset: {}, style: { setProperty(name, value) { properties.set(name, value); } } },
    createElement() { return { dataset: {} }; },
    head: { append() {} },
    querySelector() { return new MetaElement(); },
  };
  const sandbox = {
    document, HTMLMetaElement: MetaElement,
    CSS: { supports() { return supported; } },
    window: {
      matchMedia() { return { matches: false, addEventListener() {} }; },
      localStorage: {
        getItem(key) { if (blocked) throw new Error("Storage blocked"); return values.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw new Error("Storage blocked"); values.set(key, value); },
      },
    },
    [Symbol.for("nook.app.modules")]: { register(name, install) { installers.set(name, install); } },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/app/theme-config.js"), "utf8"), context);
  const app = { api: {}, elements };
  installers.get("theme-config")(app);
  app.constants = { THEMES: app.theme.modes };
  app.ui = { glass: app.theme.glass.read() };
  vm.runInContext(fs.readFileSync(path.join(root, "js/app/preferences.js"), "utf8"), context);
  installers.get("preferences")(app);
  return { app, document, properties, values, elements };
}

test("nature/glass defaults off before paint and in Settings", () => {
  const { app, document, properties, elements } = appearanceHarness();
  assert.deepEqual(plain(app.ui.glass), { enabled: false, transparency: 10, frost: "soft" });
  assert.equal(document.documentElement.dataset.glass, "false");
  assert.equal(document.documentElement.dataset.backgroundStyle, "ambient");
  assert.equal(properties.get("--glass-opacity"), "64%");
  app.api.syncGlassUI();
  assert.equal(elements.glassEnabled.checked, false);
  assert.equal(elements.glassTransparency.disabled, true);
  assert.equal(elements.glassStyleSelect.disabled, true);
  assert.equal(elements.glassStyleSelect.value, "ambient");
  assert.equal(elements.glassTransparencyControl.classList.values.has("is-hidden"), true);
  assert.equal(document.documentElement.dataset.glassFrost, "soft");
  assert.equal(elements.glassFrostControl.disabled, true);
  assert.deepEqual(elements.glassFrostInputs.map(input => input.checked), [false, true, false]);
});

test("dual-mode background style switches between ambient and nature with persistence", () => {
  const { app, document, values, elements } = appearanceHarness();
  assert.equal(document.documentElement.dataset.backgroundStyle, "ambient");
  app.api.setBackgroundStyle("nature");
  assert.equal(document.documentElement.dataset.backgroundStyle, "nature");
  assert.equal(values.get("nook:background-style"), "nature");
  assert.equal(elements.glassStyleSelect.value, "nature");

  app.api.setBackgroundStyle("ambient");
  assert.equal(document.documentElement.dataset.backgroundStyle, "ambient");
  assert.equal(values.get("nook:background-style"), "ambient");
  assert.equal(elements.glassStyleSelect.value, "ambient");

  // Invalid values normalize to ambient
  app.api.setBackgroundStyle("unknown");
  assert.equal(document.documentElement.dataset.backgroundStyle, "ambient");

  // Read pre-stored style
  const restored = appearanceHarness({ storedStyle: "nature" });
  assert.equal(restored.document.documentElement.dataset.backgroundStyle, "nature");
  restored.app.api.syncGlassUI();
  assert.equal(restored.elements.glassStyleSelect.value, "nature");
});

test("malformed stored preferences cannot enable the effect or escape its bounds", () => {
  for (const stored of ["{", "null", "[]", '"true"', '{"enabled":"true","transparency":"20"}']) {
    const { app } = appearanceHarness({ stored });
    assert.deepEqual(plain(app.ui.glass), { enabled: false, transparency: 10, frost: "soft" });
  }
  for (const [value, expected] of [[-100, 10], [100, 50], [0, 10], [5, 10], [10, 10], [20, 20], [40, 40], [50, 50], [1.5, 10], [null, 10]]) {
    const { app, properties } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency: value }) });
    assert.deepEqual(plain(app.ui.glass), { enabled: true, transparency: expected, frost: "soft" });
    assert.equal(properties.get("--glass-opacity"), `${Math.round((64 - (expected - 10) * 0.8) * 10) / 10}%`);
  }
});

test("transparency eases every film from its default to its readability floor", () => {
  const films = ["--glass-opacity", "--glass-card-opacity", "--glass-reading-opacity", "--glass-mobile-card-opacity", "--glass-sidebar-opacity"];
  const at = transparency => {
    const { properties } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency }) });
    return films.map(name => parseFloat(properties.get(name)));
  };
  // Minimum keeps the long-standing default tints.
  assert.deepEqual(at(10), [64, 66, 90, 90, 95]);
  // Maximum lands exactly on the CSS floors (library, card, reading, mobile card).
  assert.deepEqual(at(50), [32, 53, 84, 72, 75]);
  // Every film keeps moving through the upper half of the slider.
  const upper = at(40);
  at(30).forEach((value, index) => assert.ok(value > upper[index], films[index] + " still changes above 30%"));
  upper.forEach((value, index) => assert.ok(value > at(50)[index], films[index] + " still changes above 40%"));
});

test("runtime changes remain usable when preference reads and writes are blocked", () => {
  const { app, document, properties, elements } = appearanceHarness({ blocked: true });
  app.api.setGlass({ enabled: true, transparency: 40 });
  assert.equal(document.documentElement.dataset.glass, "true");
  assert.equal(properties.get("--glass-opacity"), "40%");
  assert.equal(properties.get("--glass-reveal"), "2");
  assert.equal(properties.get("--glass-sidebar-opacity"), "80%");
  assert.equal(elements.glassTransparency.disabled, false);
  assert.equal(elements.glassTransparencyValue.textContent, "40%");
  app.api.syncGlassUI();
  assert.equal(elements.glassEnabled.checked, true);
  app.api.setGlass({ ...app.ui.glass, enabled: false });
  assert.equal(document.documentElement.dataset.glass, "false");
  assert.equal(elements.glassTransparency.value, "40");
});

test("unsupported rendering retains the user's preference with the normal appearance", () => {
  const { app, document, values } = appearanceHarness({ supported: false });
  app.api.setGlass({ enabled: true, transparency: 0 });
  assert.equal(document.documentElement.dataset.glass, "false");
  assert.deepEqual(JSON.parse(values.get("nook:glass")), { enabled: true, transparency: 10, frost: "soft" });
});

test("stacked library layers reveal scenery while reading retains a single protective film", () => {
  const { app, properties } = appearanceHarness();
  for (const [transparency, card, reading] of [[10, "66%", "90%"], [20, "62.8%", "88.5%"], [40, "56.3%", "85.5%"], [50, "53%", "84%"]]) {
    app.api.setGlass({ enabled: true, transparency });
    assert.equal(properties.get("--glass-card-opacity"), card);
    assert.equal(properties.get("--glass-reading-opacity"), reading);
    assert.equal(properties.get("--glass-sidebar-opacity"), `${100 - transparency / 2}%`);
  }
});

test("external preference updates normalize without writing back", () => {
  const { app, values, elements } = appearanceHarness();
  app.api.setGlass(app.theme.glass.parse('{"enabled":true,"transparency":100}'), { persist: false });
  assert.equal(elements.glassTransparency.value, "50");
  assert.equal(values.has("nook:glass"), false);
  app.api.setGlass(app.theme.glass.parse(null), { persist: false });
  assert.equal(elements.glassEnabled.checked, false);
});

test("every resolved theme has its own file-mode artwork matching the local source", () => {
  const css = fs.readFileSync(path.join(root, "css/appearance.css"), "utf8");
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const themes = appearanceHarness().app.theme.modes.filter((theme) => theme !== "auto");
  const scenes = new Set();
  let bytes = 0;
  for (const name of themes) {
    const scope = name === "light" ? ":root" : `html[data-theme="${name}"]`;
    const block = css.slice(css.indexOf(`${scope} {`)).split("}")[0];
    assert.ok(block.includes(`--nature-scene: var(--nature-${name});`), `${name} needs its own scene`);
    const svg = fs.readFileSync(path.join(root, `images/nature/${name}.svg`), "utf8");
    const embedded = css.match(new RegExp(`--nature-${name}: url\\("data:image/svg\\+xml,([^"\\n]+)"\\)`));
    assert.ok(embedded, `${name} needs a file-mode mask`);
    assert.equal(decodeURIComponent(embedded[1]), svg);
    assert.ok(worker.includes(`"./images/nature/${name}.svg"`), `${name} needs an offline cache entry`);
    assert.equal(/<(?:script|foreignObject|image|animate|filter)\b|\b(?:href|on\w+)\s*=/i.test(svg), false);
    assert.match(svg, /viewBox="0 0 1600 900"/);
    scenes.add(svg);
    bytes += Buffer.byteLength(svg);
  }
  assert.equal(scenes.size, themes.length);
  for (const name of ["landscape", "woodland"]) {
    assert.equal(fs.existsSync(path.join(root, `images/nature/${name}.svg`)), false);
  }
  assert.ok(bytes <= 30 * 1024, `Artwork uses ${bytes} bytes`);
});

test("Coffee, Retro, and E-Ink have separate simple local sidebar silhouettes", () => {
  const css = fs.readFileSync(path.join(root, "css/appearance.css"), "utf8");
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  let bytes = 0;
  for (const name of ["coffee", "retro", "eink"]) {
    const svg = fs.readFileSync(path.join(root, `images/nature/${name}-sidebar.svg`), "utf8");
    const embedded = css.match(new RegExp(`--nature-${name}-sidebar: url\\("data:image/svg\\+xml,([^"\\n]+)"\\)`));
    assert.ok(embedded, `${name} sidebar must work through file://`);
    assert.equal(decodeURIComponent(embedded[1]), svg);
    assert.ok(worker.includes(`"./images/nature/${name}-sidebar.svg"`));
    assert.match(svg, /viewBox="0 0 240 240"/);
    assert.equal(/<(?:script|foreignObject|image|animate|filter|linearGradient|radialGradient)\b|\b(?:href|on\w+|stroke|opacity)\s*=/i.test(svg), false);
    assert.deepEqual([...new Set([...svg.matchAll(/fill="(#[0-9a-f]+)"/gi)].map((match) => match[1]))], ["#000"]);
    assert.notEqual(svg, fs.readFileSync(path.join(root, `images/nature/${name}.svg`), "utf8"));
    assert.equal(fs.existsSync(path.join(root, `images/nature/${name}.png`)), false);
    bytes += Buffer.byteLength(svg);
  }
  assert.ok(bytes <= 5 * 1024, `Sidebar artwork uses ${bytes} bytes`);
});

test("frost level defaults to soft and unknown stored values cannot escape the allowlist", () => {
  const { app, document } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency: 20 }) });
  assert.equal(app.ui.glass.frost, "soft");
  assert.equal(document.documentElement.dataset.glassFrost, "soft");
  assert.deepEqual(plain(app.theme.glass.frostLevels), ["clear", "soft", "frosted"]);
  for (const frost of ["Clear", "FROSTED", "", "heavy", 2, null, true, ["clear"], { value: "clear" }]) {
    const { app: current } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency: 20, frost }) });
    assert.equal(current.ui.glass.frost, "soft", JSON.stringify(frost));
  }
  for (const frost of ["clear", "soft", "frosted"]) {
    const { app: current, document: doc } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency: 20, frost }) });
    assert.equal(current.ui.glass.frost, frost);
    assert.equal(doc.documentElement.dataset.glassFrost, frost);
  }
});

test("changing frost updates the page, the radios, and the stored preference without touching transparency", () => {
  const { app, document, values, elements } = appearanceHarness();
  app.api.setGlass({ ...app.ui.glass, enabled: true, transparency: 30 });
  assert.equal(elements.glassFrostControl.disabled, false);
  app.api.setGlass({ ...app.ui.glass, frost: "frosted" });
  assert.equal(document.documentElement.dataset.glassFrost, "frosted");
  assert.deepEqual(elements.glassFrostInputs.map(input => input.checked), [false, false, true]);
  assert.deepEqual(JSON.parse(values.get("nook:glass")), { enabled: true, transparency: 30, frost: "frosted" });
  app.api.setGlass({ ...app.ui.glass, frost: "clear" });
  assert.deepEqual(elements.glassFrostInputs.map(input => input.checked), [true, false, false]);
  assert.equal(elements.glassTransparency.value, "30");
  app.api.setGlass({ ...app.ui.glass, frost: "bogus" });
  assert.equal(app.ui.glass.frost, "soft");
  app.api.setGlass({ ...app.ui.glass, enabled: false });
  assert.equal(elements.glassFrostControl.disabled, true);
  assert.equal(app.ui.glass.frost, "soft");
});

test("external frost updates normalize without writing back", () => {
  const { app, document, values } = appearanceHarness();
  app.api.setGlass(app.theme.glass.parse('{"enabled":true,"transparency":20,"frost":"frosted"}'), { persist: false });
  assert.equal(document.documentElement.dataset.glassFrost, "frosted");
  assert.equal(values.has("nook:glass"), false);
  app.api.setGlass(app.theme.glass.parse(null), { persist: false });
  assert.equal(document.documentElement.dataset.glassFrost, "soft");
});
