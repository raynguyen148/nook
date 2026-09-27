import { useCallback, useEffect, useRef, useState } from "react"

export type OfflineUpdateStatus =
  | "disabled"
  | "registering"
  | "ready"
  | "update-available"
  | "applying"
  | "error"

export interface OfflineUpdateState {
  status: OfflineUpdateStatus
  updateAvailable: boolean
  canApplyUpdate: boolean
  message: string
  applyUpdate: () => Promise<boolean>
}

const HOSTED_PROTOCOLS = new Set(["https:", "http:"])

function supportsServiceWorker(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false
  if (!HOSTED_PROTOCOLS.has(window.location.protocol)) return false
  return window.location.protocol === "https:"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "::1"
}

/** Registers the local PWA worker and exposes an explicit, draft-safe update action. */
export function useOfflineUpdates(hasDirtyDrafts: boolean): OfflineUpdateState {
  const [status, setStatus] = useState<OfflineUpdateStatus>("registering")
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [message, setMessage] = useState("Checking offline support…")
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const hasDirtyDraftsRef = useRef(hasDirtyDrafts)
  const hadControllerRef = useRef(false)

  hasDirtyDraftsRef.current = hasDirtyDrafts

  useEffect(() => {
    if (import.meta.env.DEV) {
      setStatus("disabled")
      setMessage("Offline caching is enabled in a production build.")
      return
    }
    if (!supportsServiceWorker()) {
      setStatus("disabled")
      setMessage(window.location.protocol === "file:"
        ? "This local app works offline without a Service Worker."
        : "Offline caching requires HTTPS or localhost in this browser.")
      return
    }

    let mounted = true
    const observedWorkers = new Set<ServiceWorker>()
    let observedRegistration: ServiceWorkerRegistration | null = null
    const waitingMessage = "An app update is ready. Save active drafts before applying it."

    function publishWaitingUpdate(): void {
      if (!mounted) return
      setUpdateAvailable(true)
      setStatus("update-available")
      setMessage(hasDirtyDraftsRef.current ? waitingMessage : "An app update is ready when you choose.")
    }

    function observeWorker(worker: ServiceWorker | null): void {
      if (!worker || observedWorkers.has(worker)) return
      observedWorkers.add(worker)
      worker.addEventListener("statechange", () => {
        if (!mounted || worker.state !== "installed") return
        if (navigator.serviceWorker.controller) {
          publishWaitingUpdate()
        } else {
          setStatus("ready")
          setMessage("Offline app resources are ready for future visits.")
        }
      })
    }

    function handleServiceWorkerMessage(event: MessageEvent): void {
      if (event.data?.type === "CHECK_DIRTY_DRAFTS") {
        event.ports[0]?.postMessage({
          type: "DRAFT_STATUS",
          hasDirtyDrafts: hasDirtyDraftsRef.current,
        })
        return
      }
      if (event.data?.type === "UPDATE_ALLOWED") {
        setStatus("applying")
        setMessage("Applying the app update…")
        return
      }
      if (event.data?.type === "UPDATE_DEFERRED") {
        publishWaitingUpdate()
        setMessage("Another open tab has an unsaved draft or did not respond. Save it or close that tab, then try again.")
      }
    }

    function handleControllerChange(): void {
      if (!hadControllerRef.current) {
        hadControllerRef.current = true
        setStatus("ready")
        setMessage("Offline app resources are ready.")
        return
      }
      setUpdateAvailable(false)
      if (hasDirtyDraftsRef.current) {
        setStatus("ready")
        setMessage("The update is active. Reload after saving or preserving this draft.")
        return
      }
      window.location.reload()
    }

    function handleUpdateFound(): void {
      observeWorker(observedRegistration?.installing ?? null)
    }

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage)
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        if (!mounted) return
        registrationRef.current = registration
        observedRegistration = registration
        hadControllerRef.current = Boolean(navigator.serviceWorker.controller)
        if (registration.waiting) publishWaitingUpdate()
        else {
          setStatus("ready")
          setMessage(navigator.serviceWorker.controller
            ? "App resources are cached for offline use. Notes remain in this browser."
            : "Offline resources are being prepared for the next visit.")
        }
        observeWorker(registration.installing)
        registration.addEventListener("updatefound", handleUpdateFound)
        try {
          await registration.update()
        } catch {
          // A transient offline update check does not affect cached app assets.
        }
      })
      .catch(() => {
        if (!mounted) return
        setStatus("error")
        setMessage("Offline cache could not be prepared. Local notes still work in this browser.")
      })

    return () => {
      mounted = false
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage)
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
      observedRegistration?.removeEventListener("updatefound", handleUpdateFound)
    }
  }, [])

  useEffect(() => {
    if (updateAvailable && hasDirtyDrafts) {
      setMessage("An app update is ready. Save active drafts before applying it.")
    }
  }, [hasDirtyDrafts, updateAvailable])

  const applyUpdate = useCallback(async (): Promise<boolean> => {
    const waitingWorker = registrationRef.current?.waiting
    if (!waitingWorker || !updateAvailable) return false
    if (hasDirtyDraftsRef.current) {
      setMessage("Update deferred because this tab has an unsaved draft.")
      return false
    }
    setStatus("applying")
    setMessage("Checking open tabs before applying the update…")
    waitingWorker.postMessage({ type: "SKIP_WAITING" })
    return true
  }, [updateAvailable])

  return {
    status,
    updateAvailable,
    canApplyUpdate: updateAvailable && !hasDirtyDrafts,
    message,
    applyUpdate,
  }
}
