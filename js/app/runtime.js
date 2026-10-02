(() => {
  "use strict";

  // Collect classic-script modules first, then initialize them in one explicit
  // dependency order. This keeps Nook file:// compatible without making the
  // feature-script order in index.html part of the runtime contract.
  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const MODULE_ORDER = Object.freeze([
    "theme-config",
    "elements",
    "core",
    "local-state",
    "search",
    "preferences",
    "feedback",
    "editor-session",
    "pane-controller",
    "note-actions",
    "library-sidebar",
    "library",
    "workspace",
    "workspace-resize",
    "clipboard",
    "side-note",
    "note-pickers",
    "split-scroll",
    "formatting",
    "editor",
    "note-switcher",
    "split-selection",
    "history",
    "organize",
    "sync",
    "offline",
    "mobile",
    "recovery",
    "data-import",
    "productivity",
    "bulk-actions",
    "onboarding",
    "events",
  ]);
  const installers = new Map();
  const apiOwners = new Map();
  const app = {
    api: Object.create(null),
    shared: {
      noteTypePicker: null,
      secondaryNoteTypePicker: null,
      openColorPickers: new Set(),
    },
  };
  let state = "collecting";

  function moduleError(error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "The application modules could not be initialized.";
    console.error("Nook module startup failed.", error);
    document.querySelector(".app-shell")?.classList.add("is-hidden");
    document.querySelector("#startup-error")?.classList.remove("is-hidden");
    const messageElement = document.querySelector("#startup-error-message");
    if (messageElement) messageElement.textContent = `${message} Your existing browser data was not changed.`;
  }

  function missingModuleNames() {
    return MODULE_ORDER.filter((name) => !installers.has(name));
  }

  function startWhenReady() {
    if (state !== "collecting" || missingModuleNames().length) return;
    state = "starting";
    try {
      MODULE_ORDER.forEach((name) => {
        const existing = new Map(Object.entries(app.api));
        installers.get(name)(app);
        for (const [key, value] of Object.entries(app.api)) {
          if (existing.has(key) && existing.get(key) !== value) {
            throw new Error(`The “${name}” module replaced “${key}”, owned by “${apiOwners.get(key)}”.`);
          }
          if (!existing.has(key)) apiOwners.set(key, name);
        }
      });
      state = "started";
    } catch (error) {
      state = "failed";
      delete globalThis[APP_MODULES_KEY];
      moduleError(error);
    }
  }

  function register(name, install) {
    if (state !== "collecting") throw new Error(`Cannot register the “${name}” module after startup.`);
    if (!MODULE_ORDER.includes(name)) throw new Error(`Unknown Nook application module: “${name}”.`);
    if (installers.has(name)) throw new Error(`The “${name}” application module was registered twice.`);
    if (typeof install !== "function") throw new TypeError(`The “${name}” module installer must be a function.`);
    installers.set(name, install);
    startWhenReady();
  }

  Object.defineProperty(globalThis, APP_MODULES_KEY, {
    configurable: true,
    value: Object.freeze({ register }),
  });

  window.addEventListener("load", () => {
    if (state !== "collecting") return;
    state = "failed";
    const missing = missingModuleNames();
    delete globalThis[APP_MODULES_KEY];
    moduleError(new Error(`Missing application ${missing.length === 1 ? "module" : "modules"}: ${missing.join(", ")}.`));
  }, { once: true });
})();
