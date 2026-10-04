"use strict";

const CACHE_VERSION = "nook-app-ecff79df4b4c";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/nook-192-v2.png",
  "./icons/nook-512-v2.png",
  "./css/app.css",
  "./css/appearance.css",
  "./images/nature/light.svg",
  "./images/nature/coffee.svg",
  "./images/nature/coffee-sidebar.svg",
  "./images/nature/forest.svg",
  "./images/nature/midnight.svg",
  "./images/nature/dark.svg",
  "./images/nature/retro.svg",
  "./images/nature/retro-sidebar.svg",
  "./images/nature/eink.svg",
  "./images/nature/eink-sidebar.svg",
  "./css/mobile.css",
  "./css/accessibility.css",
  "./css/base.css",
  "./css/dialogs.css",
  "./css/interactions.css",
  "./css/library.css",
  "./css/management.css",
  "./css/markdown.css",
  "./css/note-components.css",
  "./css/note-detail.css",
  "./css/note-typography.css",
  "./css/workflows.css",
  "./css/workspace-resize.css",
  "./css/note-card-actions.css",
  "./css/organize.css",
  "./css/responsive.css",
  "./css/view-mode-icons.css",
  "./css/themes/classic.css",
  "./css/themes/coffee.css",
  "./css/themes/dark.css",
  "./css/themes/forest.css",
  "./css/themes/midnight.css",
  "./css/themes/retro.css",
  "./css/themes/eink.css",
  "./fonts/geist/geist-vietnamese-wght-normal.woff2",
  "./fonts/geist/geist-latin-ext-wght-normal.woff2",
  "./fonts/geist/geist-latin-wght-normal.woff2",
  "./fonts/geist/geist-vietnamese-wght-italic.woff2",
  "./fonts/geist/geist-latin-ext-wght-italic.woff2",
  "./fonts/geist/geist-latin-wght-italic.woff2",
  "./js/storage.js",
  "./js/markdown.js",
  "./js/app/runtime.js",
  "./js/app/theme-config.js",
  "./js/app/elements.js",
  "./js/app/local-state.js",
  "./js/app/search.js",
  "./js/app/pane-controller.js",
  "./js/app/library-sidebar.js",
  "./js/app/workspace.js",
  "./js/app/workspace-resize.js",
  "./js/app/clipboard.js",
  "./js/app/side-note.js",
  "./js/app/note-pickers.js",
  "./js/app/split-scroll.js",
  "./js/app/formatting.js",
  "./js/app/onboarding.js",
  "./js/app/core.js",
  "./js/app/preferences.js",
  "./js/app/feedback.js",
  "./js/app/editor-session.js",
  "./js/app/note-actions.js",
  "./js/app/library.js",
  "./js/app/editor.js",
  "./js/app/note-switcher.js",
  "./js/app/split-selection.js",
  "./js/app/history.js",
  "./js/app/organize.js",
  "./js/app/sync.js",
  "./js/app/offline.js",
  "./js/app/events.js",
  "./js/app/mobile.js",
  "./js/app/recovery.js",
  "./js/app/data-import.js",
  "./js/app/productivity.js",
  "./js/app/bulk-actions.js",
];

self.addEventListener("install", (event) => {
  const requests = APP_ASSETS.map((asset) => new Request(
    new URL(asset, self.registration.scope),
    { cache: "reload" },
  ));
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(requests)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nook-app-") && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const scopePath = new URL(self.registration.scope).pathname;
    const appPath = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
    if (url.pathname !== appPath && url.pathname !== `${appPath}index.html`) return;
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        return (await cache.match("./index.html")) || fetch(request);
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      return cached || fetch(request);
    }),
  );
});
