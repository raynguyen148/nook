import { describe, expect, it } from 'vitest'
import type { Note, NoteDraft } from '@/domain/contracts'
import { createDraftRecoveryStore, createEditorSession } from './session'

function makeNote(content: string, revision: number, overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Test note',
    typeId: 'type-1',
    tagIds: ['tag-1'],
    content,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    isPinned: false,
    deletedAt: null,
    revision,
    ...overrides,
  }
}

function makeDraft(content: string, overrides: Partial<NoteDraft> = {}): NoteDraft {
  return { id: 'note-1', title: 'Test note', typeId: 'type-1', tagIds: ['tag-1'], content, ...overrides }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(String(key), String(value)) }
}

describe('editor session', () => {
  it('marks a late save stale after the pane session is disposed', async () => {
    const request = deferred<Note>()
    const session = createEditorSession({
      repository: { saveNote: () => request.promise },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('local'),
    })

    const pending = session.save()
    session.dispose()
    request.resolve(makeNote('local', 2))

    expect((await pending).status).toBe('stale')
    expect(session.phase).toBe('disposed')
    expect(session.currentDraft.content).toBe('local')
  })

  it('keeps typing during a save and serializes the next save against the new revision', async () => {
    const requests: Array<{ input: Parameters<Parameters<typeof createEditorSession>[0]['repository']['saveNote']>[0]; deferred: ReturnType<typeof deferred<Note>> }> = []
    const session = createEditorSession({
      repository: {
        saveNote(input) {
          const pending = deferred<Note>()
          requests.push({ input, deferred: pending })
          return pending.promise
        },
      },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('first'),
    })

    const firstSave = session.save()
    session.updateDraft(makeDraft('second'))
    const secondSave = session.save()
    expect(requests).toHaveLength(1)
    requests[0].deferred.resolve(makeNote('first', 2))
    expect((await firstSave).status).toBe('saved')
    await Promise.resolve()

    expect(requests).toHaveLength(2)
    expect(requests[1].input).toMatchObject({ id: 'note-1', content: 'second', expectedRevision: 2 })
    requests[1].deferred.resolve(makeNote('second', 3))
    expect((await secondSave).status).toBe('saved')
    expect(session.currentDraft.content).toBe('second')
    expect(session.phase).toBe('saved')
  })

  it('adopts a new note id even when typing continues during its first save', async () => {
    const requests: Array<{ input: { id: string; content: string; expectedRevision?: number }; deferred: ReturnType<typeof deferred<Note>> }> = []
    const session = createEditorSession({
      repository: {
        saveNote(input) {
          const pending = deferred<Note>()
          requests.push({ input, deferred: pending })
          return pending.promise
        },
      },
      currentDraft: { id: '', title: 'New note', typeId: 'type-1', tagIds: [], content: 'first' },
    })

    const firstSave = session.save()
    session.updateDraft({ ...session.currentDraft, content: 'continued typing' })
    const secondSave = session.save()
    requests[0].deferred.resolve(makeNote('first', 1, { id: 'created-1', tagIds: [] }))
    await firstSave
    await Promise.resolve()

    expect(requests[1].input).toMatchObject({ id: 'created-1', content: 'continued typing', expectedRevision: 1 })
    requests[1].deferred.resolve(makeNote('continued typing', 2, { id: 'created-1', tagIds: [] }))
    expect((await secondSave).status).toBe('saved')
    expect(session.noteId).toBe('created-1')
  })

  it('keeps the local draft on CAS conflict and retries Keep mine at the latest revision', async () => {
    const inputs: Array<{ id: string; content: string; expectedRevision?: number }> = []
    const session = createEditorSession({
      repository: {
        async saveNote(input) {
          inputs.push(input)
          if (inputs.length === 1) {
            const conflict = new Error('A newer note was saved.') as Error & { code: string; latestNote: Note }
            conflict.code = 'NOTE_CONFLICT'
            conflict.latestNote = makeNote('newer', 2)
            throw conflict
          }
          return makeNote(input.content, 3)
        },
      },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('mine'),
    })

    expect((await session.save()).status).toBe('conflict')
    expect(session.currentDraft.content).toBe('mine')
    expect(session.conflict?.latest.content).toBe('newer')
    expect((await session.keepMine()).status).toBe('saved')
    expect(inputs[1]).toMatchObject({ content: 'mine', expectedRevision: 2 })
  })

  it('turns a deleted-note conflict into a new-note save when Keep mine is chosen', async () => {
    const inputs: Array<{ id: string; expectedRevision?: number }> = []
    const session = createEditorSession({
      repository: {
        async saveNote(input) {
          inputs.push(input)
          if (inputs.length === 1) {
            const conflict = new Error('The note was removed.') as Error & { code: string; latestNote: null }
            conflict.code = 'NOTE_CONFLICT'
            conflict.latestNote = null
            throw conflict
          }
          return makeNote(input.content, 1, { id: 'saved-as-new' })
        },
      },
      committed: makeNote('before', 4),
      currentDraft: makeDraft('mine'),
    })

    const conflict = await session.save()
    expect(conflict).toMatchObject({ status: 'conflict', deleted: true })
    expect((await session.keepMine()).status).toBe('saved')
    expect(inputs[1]).toEqual({ id: '', title: 'Test note', typeId: 'type-1', tagIds: ['tag-1'], content: 'mine' })
    expect(session.noteId).toBe('saved-as-new')
  })

  it('keeps recovery records separate by tab and pane and prunes expired data', () => {
    const localStorage = new MemoryStorage()
    const sessionStorage = new MemoryStorage()
    let now = Date.parse('2026-09-27T00:00:00.000Z')
    const recovery = createDraftRecoveryStore({
      storage: localStorage,
      sessionStorage,
      tabId: 'tab-a',
      now: () => now,
      maxAgeMs: 1000,
    })
    const primary = { tabId: 'tab-a', pane: 'primary' as const, sessionId: 'primary-a' }
    const secondary = { tabId: 'tab-a', pane: 'secondary' as const, sessionId: 'secondary-a' }
    const otherTab = { tabId: 'tab-b', pane: 'primary' as const, sessionId: 'primary-b' }

    recovery.write(primary, makeDraft('primary'), { baseRevision: 3 })
    recovery.write(secondary, makeDraft('side'), { baseRevision: 4 })
    recovery.write(otherTab, makeDraft('other tab'), { baseRevision: 5 })
    expect(recovery.read(primary)?.draft.content).toBe('primary')
    expect(recovery.read(secondary)?.draft.content).toBe('side')
    expect(recovery.enumerate()).toHaveLength(3)

    now += 1001
    expect(recovery.enumerate()).toHaveLength(0)
    expect(localStorage.length).toBe(0)
  })

  it('promotes a newer external revision to a conflict when the draft is dirty', () => {
    const session = createEditorSession({
      repository: { saveNote: async () => makeNote('unused', 3) },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('mine'),
    })

    expect(session.applyExternalSnapshot(makeNote('theirs', 2)).conflict).toBe(true)
    expect(session.currentDraft.content).toBe('mine')
    expect(session.conflict?.latest.content).toBe('theirs')
    expect(session.baseRevision).toBe(2)
  })

  it('does not treat the save result as a conflict when mutate refreshes its own write first', async () => {
    const request = deferred<Note>()
    const session = createEditorSession({
      repository: { saveNote: () => request.promise },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('mine'),
    })

    const pending = session.save()
    const refresh = session.applyExternalSnapshot(makeNote('mine', 2))
    expect(refresh.applied).toBe(true)
    expect(session.conflict).toBeNull()
    request.resolve(makeNote('mine', 2))

    expect((await pending).status).toBe('saved')
    expect(session.baseRevision).toBe(2)
    expect(session.phase).toBe('saved')
  })

  it('keeps a newer external conflict when an older in-flight save resolves afterwards', async () => {
    const request = deferred<Note>()
    const session = createEditorSession({
      repository: { saveNote: () => request.promise },
      committed: makeNote('before', 1),
      currentDraft: makeDraft('mine'),
    })

    const pending = session.save()
    expect(session.applyExternalSnapshot(makeNote('theirs', 3)).conflict).toBe(true)
    request.resolve(makeNote('mine', 2))

    expect((await pending).status).toBe('conflict')
    expect(session.baseRevision).toBe(3)
    expect(session.conflict?.latest.content).toBe('theirs')
    expect(session.currentDraft.content).toBe('mine')
    expect(session.phase).toBe('conflict')
  })
})
