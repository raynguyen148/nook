"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const serviceWorkerPath = path.join(projectRoot, "sw.js");

function parseServiceWorker(source) {
  const versionMatch = source.match(/const CACHE_VERSION = "([^"]+)";/);
  const assetsMatch = source.match(/const APP_ASSETS = \[([\s\S]*?)\n\];/);
  if (!versionMatch || !assetsMatch) throw new Error("Could not read the Service Worker cache contract.");
  const assets = [...assetsMatch[1].matchAll(/"([^"\n]+)"/g)].map((match) => match[1]);
  if (!assets.length) throw new Error("The Service Worker asset manifest is empty.");
  return { cacheVersion: versionMatch[1], assets };
}

function assetFilePath(root, asset) {
  if (asset === "./") return path.join(root, "index.html");
  if (!asset.startsWith("./") || asset.includes("?") || asset.includes("#")) {
    throw new Error(`Unsupported Service Worker asset path: ${asset}`);
  }
  const resolved = path.resolve(root, asset.slice(2));
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Service Worker asset escapes the project root: ${asset}`);
  }
  return resolved;
}

function normalizeServiceWorkerSource(source) {
  return source.replace(
    /const CACHE_VERSION = "[^"]+";/,
    'const CACHE_VERSION = "nook-app-fingerprint";',
  );
}

function calculateCacheVersion(root, assets, serviceWorkerSource = "") {
  const hash = crypto.createHash("sha256");
  hash.update(normalizeServiceWorkerSource(serviceWorkerSource));
  hash.update("\0");
  for (const asset of assets) {
    const filePath = assetFilePath(root, asset);
    hash.update(asset);
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return `nook-app-${hash.digest("hex").slice(0, 12)}`;
}

function updateCacheVersion({ root = projectRoot, swPath = serviceWorkerPath } = {}) {
  const source = fs.readFileSync(swPath, "utf8");
  const { cacheVersion, assets } = parseServiceWorker(source);
  const nextVersion = calculateCacheVersion(root, assets, source);
  if (cacheVersion === nextVersion) return { changed: false, cacheVersion };
  const nextSource = source.replace(
    /const CACHE_VERSION = "[^"]+";/,
    `const CACHE_VERSION = "${nextVersion}";`,
  );
  fs.writeFileSync(swPath, nextSource);
  return { changed: true, cacheVersion: nextVersion };
}

if (require.main === module) {
  const result = updateCacheVersion();
  process.stdout.write(`${result.changed ? "Updated" : "Verified"} ${result.cacheVersion}\n`);
}

module.exports = {
  assetFilePath,
  calculateCacheVersion,
  normalizeServiceWorkerSource,
  parseServiceWorker,
  updateCacheVersion,
};
