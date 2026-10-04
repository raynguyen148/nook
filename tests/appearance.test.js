"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

function appearanceHarness({ stored = null, blocked = false, supported = true } = {}) {
  const values = new Map(stored === null ? [] : [["nook:glass", stored]]);
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
  assert.deepEqual(plain(app.ui.glass), { enabled: false, transparency: 10 });
  assert.equal(document.documentElement.dataset.glass, "false");
  assert.equal(properties.get("--glass-opacity"), "85%");
  app.api.syncGlassUI();
  assert.equal(elements.glassEnabled.checked, false);
  assert.equal(elements.glassTransparency.disabled, true);
  assert.equal(elements.glassTransparencyControl.classList.values.has("is-hidden"), true);
});

test("malformed stored preferences cannot enable the effect or escape its bounds", () => {
  for (const stored of ["{", "null", "[]", '"true"', '{"enabled":"true","transparency":"20"}']) {
    const { app } = appearanceHarness({ stored });
    assert.deepEqual(plain(app.ui.glass), { enabled: false, transparency: 10 });
  }
  for (const [value, expected] of [[-100, 10], [100, 40], [0, 10], [5, 10], [10, 10], [20, 20], [40, 40], [1.5, 10], [null, 10]]) {
    const { app, properties } = appearanceHarness({ stored: JSON.stringify({ enabled: true, transparency: value }) });
    assert.deepEqual(plain(app.ui.glass), { enabled: true, transparency: expected });
    assert.equal(properties.get("--glass-opacity"), `${100 - expected * 1.5}%`);
  }
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
  assert.deepEqual(JSON.parse(values.get("nook:glass")), { enabled: true, transparency: 10 });
});

test("stacked library layers reveal scenery while reading retains a single protective film", () => {
  const { app, properties } = appearanceHarness();
  for (const [transparency, card, reading] of [[10, "85%", "90%"], [20, "70%", "80%"], [40, "40%", "60%"]]) {
    app.api.setGlass({ enabled: true, transparency });
    assert.equal(properties.get("--glass-card-opacity"), card);
    assert.equal(properties.get("--glass-reading-opacity"), reading);
    assert.equal(properties.get("--glass-sidebar-opacity"), `${100 - transparency / 2}%`);
  }
});

test("external preference updates normalize without writing back", () => {
  const { app, values, elements } = appearanceHarness();
  app.api.setGlass(app.theme.glass.parse('{"enabled":true,"transparency":100}'), { persist: false });
  assert.equal(elements.glassTransparency.value, "40");
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
