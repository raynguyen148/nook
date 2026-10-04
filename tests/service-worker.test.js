"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  assetFilePath,
  calculateCacheVersion,
  parseServiceWorker,
} = require("../scripts/update-service-worker-cache.cjs");

const root = path.resolve(__dirname, "..");
const serviceWorkerSource = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const { cacheVersion, assets } = parseServiceWorker(serviceWorkerSource);
const assetSet = new Set(assets);

function cachedPath(relativePath) {
  const normalized = path.posix.normalize(relativePath).replace(/^\.\//, "");
  return `./${normalized}`;
}

function localHtmlReferences(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"#]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:[a-z]+:|\/\/|data:)/i.test(value));
}

function localCssReferences(asset, css) {
  const directory = path.posix.dirname(asset.slice(2));
  return [...css.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)]
    .map((match) => match[1].trim())
    .filter((value) => !/^(?:data:|[a-z]+:|\/\/|#)/i.test(value))
    .map((value) => cachedPath(path.posix.join(directory, value)));
}

test("Service Worker asset manifest is complete and fingerprinted", () => {
  assert.equal(assets.length, assetSet.size, "asset manifest must not contain duplicates");
  for (const asset of assets) assert.ok(fs.existsSync(assetFilePath(root, asset)), `${asset} must exist`);
  assert.equal(cacheVersion, calculateCacheVersion(root, assets, serviceWorkerSource));

  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const reference of localHtmlReferences(index)) {
    assert.ok(assetSet.has(cachedPath(reference)), `${reference} from index.html must be cached`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons || []) {
    assert.ok(assetSet.has(cachedPath(icon.src)), `${icon.src} from the manifest must be cached`);
  }

  const catalogue = fs.readFileSync(path.join(root, "js/app/theme-config.js"), "utf8");
  const themeFiles = new Set([...catalogue.matchAll(/file: "([^"\n]+)"/g)].map((match) => match[1]));
  assert.ok(themeFiles.size > 0, "theme catalogue must expose its stylesheet files");
  for (const file of themeFiles) {
    assert.ok(assetSet.has(`./css/themes/${file}.css`), `${file} theme must be cached`);
  }

  for (const asset of assets.filter((value) => value.endsWith(".css"))) {
    const css = fs.readFileSync(assetFilePath(root, asset), "utf8");
    for (const reference of localCssReferences(asset, css)) {
      assert.ok(assetSet.has(reference), `${reference} referenced by ${asset} must be cached`);
    }
  }
});

test("Service Worker caches an update without activating until explicitly requested", async () => {
  const listeners = new Map();
  const added = [];
  const deleted = [];
  let claimed = false;
  let skipWaitingCalls = 0;
  const context = {
    URL,
    Request,
    fetch: async () => ({ ok: true }),
    caches: {
      async open(name) {
        assert.equal(name, cacheVersion);
        return {
          async addAll(entries) { added.push(...entries); },
          async match() { return null; },
        };
      },
      async keys() { return ["nook-app-old", cacheVersion, "unrelated-cache"]; },
      async delete(name) { deleted.push(name); return true; },
    },
    self: {
      location: { origin: "https://nook.test" },
      registration: { scope: "https://nook.test/" },
      clients: { async claim() { claimed = true; } },
      addEventListener(name, listener) { listeners.set(name, listener); },
      skipWaiting() { skipWaitingCalls += 1; },
    },
  };
  vm.runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  let installPromise;
  listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.deepEqual(
    added.map((request) => new URL(request.url).pathname),
    assets.map((asset) => new URL(asset, "https://nook.test/").pathname),
  );
  assert.ok(added.every((request) => request.cache === "reload"));
  assert.equal(skipWaitingCalls, 0, "installation must leave an update waiting");
  assert.deepEqual(deleted, [], "installation must preserve the active worker's cache");
  assert.equal(claimed, false, "installation must not take over open tabs");

  listeners.get("message")({ data: { type: "UNRELATED" } });
  assert.equal(skipWaitingCalls, 0, "unrelated messages must not activate an update");
  listeners.get("message")({ data: { type: "SKIP_WAITING" } });
  assert.equal(skipWaitingCalls, 1, "explicit update requests must activate the waiting worker");

  let activatePromise;
  listeners.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.deepEqual(deleted, ["nook-app-old"]);
  assert.equal(claimed, true);
});
