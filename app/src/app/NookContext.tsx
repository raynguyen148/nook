import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibrarySnapshot, NoteRepository, WorkspaceLocation, WorkspaceMode } from '@/domain/contracts'
import { repository } from '@/data/repository'
import { announceMutation, subscribeToMutations } from '@/data/sync'

const emptySnapshot: LibrarySnapshot = { notes: [], types: [], tags: [], noteVersions: [] }

interface NookContextValue {
  repository: NoteRepository
  snapshot: LibrarySnapshot
  ready: boolean
  error: string | null
  refresh(): Promise<void>
  mutate<T>(operation: () => Promise<T>): Promise<T>
  openNote(id: string, mode?: WorkspaceMode, options?: { openSideNotePicker?: boolean }): void
  createNote(): void
  closeWorkspace(): void
  setWorkspaceMode(mode: WorkspaceMode): void
  workspace: WorkspaceLocation | null
  setDirtyDraftCount(count: number): void
  hasDirtyDrafts: boolean
}

const NookContext = createContext<NookContextValue | null>(null)

export function NookProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceLocation | null>(null)
  const [dirtyDraftCount, setDirtyDraftCount] = useState(0)
  const refreshSequence = useRef(0)

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    try {
      const next = await repository.getSnapshot()
      if (sequence !== refreshSequence.current) return
      setSnapshot(next)
      setError(null)
      setReady(true)
    } catch (cause) {
      if (sequence !== refreshSequence.current) return
      setError(cause instanceof Error ? cause.message : 'Could not read your local library.')
      setReady(true)
      throw cause
    }
  }, [])

  useEffect(() => {
    let active = true
    void repository.initialize().then(() => {
      if (active) return refresh()
    }).catch((cause: unknown) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : 'Could not open your local library.')
      setReady(true)
    })
    const unsubscribe = subscribeToMutations(() => { void refresh().catch(() => {}) })
    return () => {
      active = false
      unsubscribe()
      refreshSequence.current += 1
    }
  }, [refresh])

  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = await operation()
    await refresh()
    announceMutation()
    return result
  }, [refresh])

  const openNote = useCallback((id: string, mode: WorkspaceMode = 'preview', options: { openSideNotePicker?: boolean } = {}) => {
    setWorkspace({ noteId: id, mode, openSideNotePicker: options.openSideNotePicker })
  }, [])
  const createNote = useCallback(() => setWorkspace({ noteId: null, mode: 'edit' }), [])
  const closeWorkspace = useCallback(() => setWorkspace(null), [])
  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspace((current) => current ? { ...current, mode } : current)
  }, [])

  return <NookContext.Provider value={{
    repository, snapshot, ready, error, refresh, mutate, openNote, createNote,
    closeWorkspace, setWorkspaceMode, workspace, setDirtyDraftCount,
    hasDirtyDrafts: dirtyDraftCount > 0,
  }}>{children}</NookContext.Provider>
}

export function useNook(): NookContextValue {
  const context = useContext(NookContext)
  if (!context) throw new Error('useNook must be used inside NookProvider.')
  return context
}
