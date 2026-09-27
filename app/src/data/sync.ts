const CHANNEL_NAME = "nook:library"
const STORAGE_KEY = "nook:library-mutation-v1"

interface MutationMessage {
  type: "library-mutated"
  source: string
  mutationId: string
}

type MutationListener = () => void

const listeners = new Set<MutationListener>()
let channel: BroadcastChannel | null = null
let storageListenerAttached = false

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const sourceId = createId()

function isMutationMessage(value: unknown): value is MutationMessage {
  if (!value || typeof value !== "object") return false
  const message = value as Partial<MutationMessage>
  return message.type === "library-mutated"
    && typeof message.source === "string"
    && message.source !== sourceId
    && typeof message.mutationId === "string"
}

function deliverMutation(value: unknown): void {
  if (!isMutationMessage(value)) return
  listeners.forEach((listener) => listener())
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return
  try {
    deliverMutation(JSON.parse(event.newValue) as unknown)
  } catch {
    // A malformed cross-tab signal is ignored; it never contains note data.
  }
}

function startListening(): void {
  if (channel || typeof BroadcastChannel !== "function") return
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    deliverMutation(event.data)
  })
}

function stopListening(): void {
  channel?.close()
  channel = null
  if (storageListenerAttached && typeof window !== "undefined") {
    window.removeEventListener("storage", handleStorageEvent)
    storageListenerAttached = false
  }
}

/** Subscribe to metadata-only mutations announced by another same-origin tab. */
export function subscribeToMutations(listener: MutationListener): () => void {
  listeners.add(listener)
  startListening()
  if (!storageListenerAttached && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent)
    storageListenerAttached = true
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopListening()
  }
}

/** Announce a local write without ever sending note content or record fields. */
export function announceMutation(): void {
  const message: MutationMessage = {
    type: "library-mutated",
    source: sourceId,
    mutationId: createId(),
  }

  if (channel) {
    channel.postMessage(message)
  } else if (typeof BroadcastChannel === "function") {
    const sender = new BroadcastChannel(CHANNEL_NAME)
    sender.postMessage(message)
    sender.close()
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
    } catch {
      // BroadcastChannel remains the preferred path when storage is unavailable.
    }
  }
}
