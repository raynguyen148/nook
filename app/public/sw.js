"use strict"

const CACHE_PREFIX = "nook-app-"
const CONTROL_CACHE_NAME = "nook-control"
const PRECACHE_MANIFEST = new URL("nook-precache-manifest.json", self.registration.scope).href
const DRAFT_CHECK_TIMEOUT_MS = 1500
const ACTIVE_CACHE_MARKER = new URL(".nook-active-cache", self.registration.scope).href
const STAGED_CACHE_MARKER = new URL(".nook-staged-cache", self.registration.scope).href

async function loadPrecacheManifest() {
  const response = await fetch(PRECACHE_MANIFEST, { cache: "no-store" })
  if (!response.ok) throw new Error("The offline asset manifest is unavailable.")
  const manifest = await response.json()
  if (!manifest || typeof manifest.revision !== "string" || !Array.isArray(manifest.assets)) {
    throw new Error("The offline asset manifest is invalid.")
  }

  const scopeUrl = new URL(self.registration.scope)
  const assets = manifest.assets.map((asset) => new URL(asset, scopeUrl))
  if (assets.some((asset) => asset.origin !== self.location.origin || !asset.pathname.startsWith(scopeUrl.pathname))) {
    throw new Error("The offline asset manifest contains an out-of-scope asset.")
  }
  return {
    cacheName: `${CACHE_PREFIX}${manifest.revision.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    assets: assets.map((asset) => asset.href),
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const { cacheName, assets } = await loadPrecacheManifest()
    const cache = await caches.open(cacheName)
    await cache.addAll(assets)
    const controlCache = await caches.open(CONTROL_CACHE_NAME)
    await controlCache.put(STAGED_CACHE_MARKER, new Response(cacheName))
  })())
})

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const controlCache = await caches.open(CONTROL_CACHE_NAME)
    const stagedCache = await controlCache.match(STAGED_CACHE_MARKER)
    const cacheName = stagedCache
      ? await stagedCache.text()
      : (await loadPrecacheManifest()).cacheName
    await controlCache.put(ACTIVE_CACHE_MARKER, new Response(cacheName))
    await controlCache.delete(STAGED_CACHE_MARKER)
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

function isAppWindow(client, scopeUrl) {
  if (client.type !== "window") return false
  const clientUrl = new URL(client.url)
  return clientUrl.origin === scopeUrl.origin && clientUrl.pathname.startsWith(scopeUrl.pathname)
}

function askClientAboutDrafts(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const timeoutId = setTimeout(() => finish(false), DRAFT_CHECK_TIMEOUT_MS)

    function finish(isClean) {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      channel.port1.close()
      resolve(isClean)
    }

    channel.port1.onmessage = (event) => {
      const response = event.data
      finish(response?.type === "DRAFT_STATUS" && response.hasDirtyDrafts === false)
    }
    channel.port1.start?.()
    try {
      client.postMessage({ type: "CHECK_DIRTY_DRAFTS" }, [channel.port2])
    } catch {
      finish(false)
    }
  })
}

async function requestCleanDrafts() {
  const scopeUrl = new URL(self.registration.scope)
  const clients = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter((client) => isAppWindow(client, scopeUrl))
  const results = await Promise.all(clients.map(askClientAboutDrafts))
  return results.every(Boolean)
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    const requester = event.source
    event.waitUntil((async () => {
      const areAllDraftsClean = await requestCleanDrafts()
      if (!areAllDraftsClean) {
        requester?.postMessage({ type: "UPDATE_DEFERRED" })
        return
      }
      requester?.postMessage({ type: "UPDATE_ALLOWED" })
      await self.skipWaiting()
    })())
    return
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith((async () => {
    const controlCache = await caches.open(CONTROL_CACHE_NAME)
    const activeCacheMarker = await controlCache.match(ACTIVE_CACHE_MARKER)
    const activeCacheName = activeCacheMarker ? await activeCacheMarker.text() : ""
    const cache = activeCacheName ? await caches.open(activeCacheName) : null

    if (request.mode === "navigate") {
      const scopeUrl = new URL(self.registration.scope)
      const shellUrl = new URL("index.html", scopeUrl).href
      return (await cache?.match(shellUrl, { ignoreVary: true })) || fetch(request)
    }

    // Vite preview may serve local assets with `Vary: Origin`. The worker's
    // precache request and a page's module/style request then have different
    // Origin headers even though both resolve to the same validated local URL.
    const cached = await cache?.match(request, { ignoreVary: true })
    return cached || fetch(request)
  })())
})
