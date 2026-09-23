"use strict";

const CACHE_VERSION = "nook-app-v93";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/nook-192-v2.png",
  "./icons/nook-512-v2.png",
  "./css/app.css",
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
  "./css/organize.css",
  "./css/responsive.css",
  "./css/view-mode-icons.css",
  "./css/themes/classic.css",
  "./css/themes/coffee.css",
  "./css/themes/dark.css",
  "./css/themes/forest.css",
  "./css/themes/midnight.css",
  "./css/themes/retro.css",
  "./js/storage.js",
  "./js/markdown.js",
  "./js/app/runtime.js",
  "./js/app/core.js",
  "./js/app/preferences.js",
  "./js/app/feedback.js",
  "./js/app/editor-session.js",
  "./js/app/library.js",
  "./js/app/editor.js",
  "./js/app/split-selection.js",
  "./js/app/history.js",
  "./js/app/organize.js",
  "./js/app/sync.js",
  "./js/app/offline.js",
  "./js/app/events.js",
  "./js/app/mobile.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_ASSETS)));
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
