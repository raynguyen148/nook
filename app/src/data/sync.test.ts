import { afterEach, describe, expect, it, vi } from "vitest"

class TestBroadcastChannel {
  static channels: TestBroadcastChannel[] = []
  private readonly listeners = new Set<(event: MessageEvent) => void>()
  readonly sent: unknown[] = []
  readonly received: unknown[] = []

  constructor(readonly name: string) {
    TestBroadcastChannel.channels.push(this)
  }

  addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener)
  }

  postMessage(data: unknown): void {
    this.sent.push(data)
    TestBroadcastChannel.channels
      .filter((channel) => channel !== this && channel.name === this.name)
      .forEach((channel) => channel.dispatch(data))
  }

  close(): void {
    TestBroadcastChannel.channels = TestBroadcastChannel.channels.filter((channel) => channel !== this)
  }

  dispatch(data: unknown): void {
    this.received.push(data)
    const event = { data } as MessageEvent
    this.listeners.forEach((listener) => listener(event))
  }
}

describe("same-origin mutation announcements", () => {
  afterEach(() => {
    TestBroadcastChannel.channels.forEach((channel) => channel.close())
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("notifies other-tab listeners with metadata only and supports unsubscribe", async () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel)
    const { announceMutation, subscribeToMutations } = await import("./sync")
    const listener = vi.fn()
    const unsubscribe = subscribeToMutations(listener)
    const externalTab = new TestBroadcastChannel("nook:library")

    externalTab.postMessage({
      type: "library-mutated",
      source: "another-tab",
      mutationId: "external-mutation",
    })
    expect(listener).toHaveBeenCalledTimes(1)

    announceMutation()
    const signal = externalTab.received.at(-1)
    expect(signal).toEqual(expect.objectContaining({ type: "library-mutated" }))
    expect(Object.keys(signal as object).sort()).toEqual(["mutationId", "source", "type"])

    unsubscribe()
    externalTab.postMessage({
      type: "library-mutated",
      source: "another-tab",
      mutationId: "after-unsubscribe",
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
