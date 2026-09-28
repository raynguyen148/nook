"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("the page loads only one active theme between the shared and mobile layers", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  assert.equal(/@import[^;]+themes\//.test(manifest), false);
  assert.equal(/@import[^;]+mobile\.css/.test(manifest), false);

  const sharedIndex = index.indexOf('href="css/app.css"');
  const themeIndex = index.indexOf("document.head.append(themeStylesheet)");
  const mobileIndex = index.indexOf('href="css/mobile.css"');
  assert.ok(sharedIndex >= 0 && themeIndex > sharedIndex && mobileIndex > themeIndex);
  assert.equal((index.match(/id = "nook-theme-stylesheet"/g) || []).length, 1);
});

test("active CSS stays below the all-theme parse cost", () => {
  const manifest = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  const imported = [...manifest.matchAll(/@import url\("\.\/([^"\n]+)"\)/g)].map((match) => match[1]);
  const sharedBytes = imported.reduce(
    (total, file) => total + fs.statSync(path.join(root, "css", file)).size,
    fs.statSync(path.join(root, "css/app.css")).size + fs.statSync(path.join(root, "css/mobile.css")).size,
  );
  const activeThemeBytes = ["classic", "coffee", "forest", "midnight", "dark", "retro", "eink"]
    .map((theme) => fs.statSync(path.join(root, `css/themes/${theme}.css`)).size);
  const maximumActiveBytes = sharedBytes + Math.max(...activeThemeBytes);
  const allThemeBytes = activeThemeBytes.reduce((total, size) => total + size, sharedBytes);
  assert.ok(maximumActiveBytes < allThemeBytes * 0.7, `${maximumActiveBytes} should stay well below ${allThemeBytes}`);
});
