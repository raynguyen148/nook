"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function motionHarness(glass) {
  const app = { api: {}, elements: {}, library: {}, ui: {}, constants: { MOTION: {} } };
  const context = vm.createContext({
    document: { documentElement: { dataset: { glass: String(glass) } } },
    [Symbol.for("nook.app.modules")]: { register(name, install) { install(app); } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/app/workspace.js"), "utf8"), context);
  return app.api.animateNoteSurface;
}

test("glass note transitions never introduce an opacity backdrop root", () => {
  const animate = motionHarness(true);
  for (const frames of [
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translate(0)" }],
    [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(12px)" }],
    [{ opacity: 0 }, { opacity: 1 }],
  ]) {
    const source = JSON.stringify(frames);
    const surface = { style: {}, animate(keyframes, options) {
      assert.ok(keyframes.every(frame => !("opacity" in frame)));
      assert.ok(!this.style.willChange.includes("opacity"));
      assert.equal(options.duration, 240);
      return "animation";
    } };
    assert.equal(animate(surface, frames, { duration: 240 }), "animation");
    assert.equal(JSON.stringify(frames), source);
  }
});

test("opaque note surfaces retain the existing fade transition", () => {
  const animate = motionHarness(false);
  const frames = [{ opacity: 0 }, { opacity: 1 }];
  const surface = { style: {}, animate(keyframes) {
    assert.equal(keyframes, frames);
    assert.ok(this.style.willChange.includes("opacity"));
  } };
  animate(surface, frames, { duration: 240 });
});
