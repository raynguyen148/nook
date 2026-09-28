import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Copy, Download, MoreHorizontal, Trash2, X } from 'lucide-react'
import { useNook } from '@/app/NookContext'
import { SideNoteIcon } from '@/components/NookIcons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Note, NoteDraft, NoteVersion, WorkspaceMode } from '@/domain/contracts'
import { EditorPane, WorkspaceModeSwitch, WorkspaceSaveStatus } from './EditorPane'
import {
  createDraftRecoveryStore,
  createEditorSession,
  type DraftRecoveryRecord,
  type DraftRecoveryStore,
  type EditorSession,
  type EditorSessionState,
} from '@/features/editor-session/session'
import { formatTextarea, safeFilename } from './formatting'
import { SideNotePicker, WorkspaceDialogs } from './WorkspaceDialogs'
import type { CloseIntent, FormattingCommand, HistoryDialogState, PaneId, SideNoteLayoutMode, SidePane, TrashConfirmationState } from './workspace-types'
import './workspace.css'

function createEmptyDraft(typeId: string): NoteDraft {
  return { id: '', title: '', typeId, tagIds: [], content: '' }
}

function makeSessionId(pane: PaneId): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${pane}-${suffix}`
}

function findRecoveryRecord(store: DraftRecoveryStore, pane: PaneId, noteId: string): DraftRecoveryRecord | null {
  return store.enumerate()
    .filter((record) => record.tabId === store.tabId && record.pane === pane && record.draft.id === noteId)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0] || null
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
    Boolean(target.closest('[role="combobox"], [role="listbox"]'))
  )
}

function readSideNoteLayout(): SideNoteLayoutMode {
  try {
    return window.localStorage.getItem('nook:secondary-view-mode') === 'comfortable' ? 'comfortable' : 'focus'
  } catch {
    return 'focus'
  }
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true } catch { /* Try the local selection fallback below. */ }
  }
  const fallback = document.createElement('textarea')
  try {
    fallback.value = text
    fallback.setAttribute('readonly', '')
    fallback.style.position = 'fixed'
    fallback.style.opacity = '0'
    document.body.append(fallback)
    fallback.select()
    return Boolean((document as Document & { execCommand?: (command: string) => boolean }).execCommand?.('copy'))
  } catch {
    return false
  } finally {
    fallback.remove()
  }
}

export function WorkspaceScreen() {
  const {
    repository,
    snapshot,
    mutate,
    closeWorkspace,
    setWorkspaceMode,
    setDirtyDraftCount,
    workspace,
  } = useNook()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const [recoveryStore] = useState(() => createDraftRecoveryStore())
  const [primarySession, setPrimarySession] = useState<EditorSession | null>(null)
  const [primaryState, setPrimaryState] = useState<EditorSessionState | null>(null)
  const [primaryNote, setPrimaryNote] = useState<Note | null>(null)
  const [primaryRecovery, setPrimaryRecovery] = useState<DraftRecoveryRecord | null>(null)
  const [primaryError, setPrimaryError] = useState('')
  const [sidePane, setSidePane] = useState<SidePane | null>(null)
  const [sideState, setSideState] = useState<EditorSessionState | null>(null)
  const [sideRecovery, setSideRecovery] = useState<DraftRecoveryRecord | null>(null)
  const [sideError, setSideError] = useState('')
  const [activePane, setActivePane] = useState<PaneId>('primary')
  const [sidePickerOpen, setSidePickerOpen] = useState(Boolean(workspace?.openSideNotePicker))
  const [sideClosing, setSideClosing] = useState(false)
  const [sidePickerClosing, setSidePickerClosing] = useState(false)
  const [isViewSwitching, setIsViewSwitching] = useState(false)
  const closeSideTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (closeSideTimerRef.current) window.clearTimeout(closeSideTimerRef.current)
    }
  }, [])
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [sideSearch, setSideSearch] = useState('')
  const [sideNoteLayout, setSideNoteLayout] = useState<SideNoteLayoutMode>(readSideNoteLayout)
  const [closeIntent, setCloseIntent] = useState<CloseIntent | null>(null)
  const [nextSideNoteId, setNextSideNoteId] = useState('')
  const [nextSideMode, setNextSideMode] = useState<WorkspaceMode>('preview')
  const [history, setHistory] = useState<HistoryDialogState | null>(null)
  const [restoreConfirmation, setRestoreConfirmation] = useState<NoteVersion | null>(null)
  const [trashConfirmation, setTrashConfirmation] = useState<TrashConfirmationState | null>(null)
  const [closeSaveInFlight, setCloseSaveInFlight] = useState(false)
  const [conflictPreview, setConflictPreview] = useState<{ pane: PaneId; note: Note } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const primaryTextareaRef = useRef<HTMLTextAreaElement>(null)
  const sideTextareaRef = useRef<HTMLTextAreaElement>(null)
  const primarySessionRef = useRef<EditorSession | null>(null)
  const sideSessionRef = useRef<EditorSession | null>(null)
  const historyRequestSequence = useRef(0)
  const primaryMode = workspace?.mode || 'edit'

  const startSession = useCallback(({
    note,
    pane,
    draft,
    baseRevision,
    recovery,
  }: {
    note: Note | null
    pane: PaneId
    draft?: NoteDraft
    baseRevision?: number
    recovery?: DraftRecoveryRecord | null
  }) => {
    const sessionId = recovery?.sessionId || makeSessionId(pane)
    const recoveryIdentity = recovery
      ? { tabId: recovery.tabId, pane: recovery.pane, sessionId: recovery.sessionId }
      : { tabId: recoveryStore.tabId, pane, sessionId }
    const session = createEditorSession({
      repository: { saveNote: (input) => mutate(() => repository.saveNote(input)) },
      pane,
      sessionId,
      noteId: note?.id || draft?.id || '',
      baseRevision: baseRevision ?? note?.revision ?? 0,
      committed: note,
      currentDraft: draft || (note ? {
        id: note.id, title: note.title, typeId: note.typeId, tagIds: note.tagIds, content: note.content,
      } : createEmptyDraft(repository.FALLBACK_TYPE_ID)),
      recoveryStore,
      recoveryIdentity,
    })
    return session
  }, [mutate, recoveryStore, repository])

  useEffect(() => {
    let current = true
    const requestedId = workspace?.noteId || null
    primarySessionRef.current?.dispose()
    primarySessionRef.current = null
    setPrimarySession(null)
    setPrimaryState(null)
    setPrimaryNote(null)
    setPrimaryRecovery(null)
    setPrimaryError('')
    setLoadError('')
    setLoading(true)

    const load = async () => {
      try {
        let note = requestedId
          ? snapshotRef.current.notes.find((entry) => entry.id === requestedId) || await repository.getNote(requestedId)
          : null
        if (requestedId && !note) throw new Error('This note is no longer available in your local library.')
        if (!current) return
        const recovery = findRecoveryRecord(recoveryStore, 'primary', note?.id || '')
        const session = startSession({ note, pane: 'primary' })
        if (!current) { session.dispose(); return }
        primarySessionRef.current = session
        setPrimaryNote(note)
        setPrimarySession(session)
        setPrimaryState(session.getState())
        setPrimaryRecovery(recovery)
        setLoading(false)
      } catch (cause) {
        if (!current) return
        setLoadError(cause instanceof Error ? cause.message : 'Could not open this note.')
        setLoading(false)
      }
    }
    void load()
    return () => {
      current = false
      if (primarySessionRef.current) primarySessionRef.current.dispose()
      primarySessionRef.current = null
    }
  }, [repository, recoveryStore, startSession, workspace?.noteId])

  useEffect(() => {
    if (!primarySession) return
    if (primarySession.noteId) {
      const latest = snapshot.notes.find((note) => note.id === primarySession.noteId)
      if (latest && !latest.deletedAt) {
        const result = primarySession.applyExternalSnapshot(latest)
        if (!result.ignored) setPrimaryState(result.state)
      }
    }
  }, [primarySession, snapshot.notes])

  useEffect(() => {
    if (!sidePane) return
    const latest = snapshot.notes.find((note) => note.id === sidePane.noteId)
    if (latest && !latest.deletedAt) {
      const result = sidePane.session.applyExternalSnapshot(latest)
      if (!result.ignored) setSideState(result.state)
    }
  }, [sidePane, snapshot.notes])

  useEffect(() => {
    setDirtyDraftCount(Number(Boolean(primaryState?.dirty)) + Number(Boolean(sideState?.dirty)))
  }, [primaryState?.dirty, setDirtyDraftCount, sideState?.dirty])

  useEffect(() => () => setDirtyDraftCount(0), [setDirtyDraftCount])

  useEffect(() => {
    const protectDirtyDrafts = (event: BeforeUnloadEvent) => {
      if (!primarySessionRef.current?.isDirty() && !sideSessionRef.current?.isDirty()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDirtyDrafts)
    return () => window.removeEventListener('beforeunload', protectDirtyDrafts)
  }, [])

  const syncPaneState = useCallback((pane: PaneId, session: EditorSession) => {
    const next = session.getState()
    if (pane === 'primary') setPrimaryState(next)
    else setSideState(next)
  }, [])

  const getPaneSession = useCallback((pane: PaneId) => pane === 'primary' ? primarySessionRef.current : sideSessionRef.current, [])

  const handleDraftChange = useCallback((pane: PaneId, nextDraft: NoteDraft) => {
    const session = getPaneSession(pane)
    if (!session) return
    const result = session.updateDraft(nextDraft)
    if (pane === 'primary') setPrimaryState(result.state)
    else setSideState(result.state)
    if (pane === 'primary') setPrimaryError('')
    else setSideError('')
  }, [getPaneSession])

  const createTagForPane = useCallback(async (pane: PaneId, rawName: string) => {
    const session = getPaneSession(pane)
    if (!session) throw new Error('This editor is no longer available.')
    const name = rawName.trim()
    const existing = snapshotRef.current.tags.find((tag) => tag.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    const tag = existing || await mutate(() => repository.addTag({ name }))
    if (getPaneSession(pane) !== session) return
    const next = session.updateDraft((draft) => draft.tagIds.includes(tag.id) ? draft : { ...draft, tagIds: [...draft.tagIds, tag.id] })
    if (pane === 'primary') setPrimaryState(next.state)
    else setSideState(next.state)
    setAnnouncement(existing ? `Tag “${tag.name}” selected.` : `Tag “${tag.name}” created and selected.`)
  }, [getPaneSession, mutate, repository])

  const savePane = useCallback(async (pane: PaneId, automatic = false): Promise<boolean> => {
    const session = getPaneSession(pane)
    if (!session) return false
    const current = session.currentDraft
    if (!current.title.trim()) {
      if (!automatic) {
        if (pane === 'primary') setPrimaryError('title')
        else setSideError('title')
        ;(pane === 'primary' ? primaryTextareaRef : sideTextareaRef).current?.focus({ preventScroll: true })
      }
      return false
    }
    if (current.content.length > 50000) {
      if (!automatic) {
        if (pane === 'primary') setPrimaryError('content')
        else setSideError('content')
      }
      return false
    }
    setAnnouncement(automatic ? '' : 'Saving note locally…')
    syncPaneState(pane, session)
    const result = await session.save()
    syncPaneState(pane, session)
    if (session !== getPaneSession(pane)) return false
    if (result.status === 'error') {
      setAnnouncement('The note could not be saved. Your draft is kept in this browser.')
      return false
    }
    if (result.status === 'conflict') {
      setAnnouncement('A newer saved version was found. Your draft is kept.')
      return false
    }
    if (result.status === 'stale') return false
    const saved = result.status === 'saved' && !session.isDirty()
    if (saved && !automatic) setAnnouncement('Changes saved locally.')
    return result.status === 'noop' || saved
  }, [getPaneSession, syncPaneState])

  const retryConflictWithMine = useCallback(async (pane: PaneId) => {
    const session = getPaneSession(pane)
    if (!session?.conflict) return
    syncPaneState(pane, session)
    const result = await session.keepMine()
    syncPaneState(pane, session)
    if (result.status === 'saved' && !session.isDirty()) setAnnouncement('Your draft was saved against the latest revision.')
    else if (result.status === 'error') setAnnouncement('The note could not be saved. Your draft is kept in this browser.')
    else if (result.status === 'conflict') setAnnouncement('A newer saved version was found again. Your draft is kept.')
  }, [getPaneSession, syncPaneState])

  useEffect(() => {
    if (!primarySession || !primaryState?.dirty || !primaryState.currentDraft.title.trim()) return
    const timer = window.setTimeout(() => { void savePane('primary', true) }, 1500)
    return () => window.clearTimeout(timer)
  }, [primarySession, primaryState?.dirty, primaryState?.currentDraft, savePane])

  useEffect(() => {
    if (!sidePane || !sideState?.dirty || !sideState.currentDraft.title.trim()) return
    const timer = window.setTimeout(() => { void savePane('secondary', true) }, 1500)
    return () => window.clearTimeout(timer)
  }, [sidePane, sideState?.dirty, sideState?.currentDraft, savePane])

  const closeSidePaneNow = useCallback((discardRecovery = false) => {
    if (closeSideTimerRef.current) {
      window.clearTimeout(closeSideTimerRef.current)
      closeSideTimerRef.current = null
    }
    const session = sideSessionRef.current
    session?.dispose({ discardRecovery })
    sideSessionRef.current = null
    setSidePane(null)
    setSideState(null)
    setSideRecovery(null)
    setSideError('')
    setActivePane('primary')
    setSidePickerOpen(false)
    setSideClosing(false)
    setSidePickerClosing(false)
    setDirtyDraftCount(Number(Boolean(primarySessionRef.current?.isDirty())))
  }, [setDirtyDraftCount])

  const closeSidePaneWithAnimation = useCallback((discardRecovery = false) => {
    if (sideClosing) return
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reducedMotion ? 120 : 180
    setSideClosing(true)
    if (closeSideTimerRef.current) window.clearTimeout(closeSideTimerRef.current)
    closeSideTimerRef.current = window.setTimeout(() => {
      closeSideTimerRef.current = null
      closeSidePaneNow(discardRecovery)
    }, duration)
  }, [closeSidePaneNow, sideClosing])

  const closeWorkspaceNow = useCallback((discardRecovery = false) => {
    primarySessionRef.current?.dispose({ discardRecovery })
    sideSessionRef.current?.dispose({ discardRecovery })
    primarySessionRef.current = null
    sideSessionRef.current = null
    setDirtyDraftCount(0)
    closeWorkspace()
  }, [closeWorkspace, setDirtyDraftCount])

  const beginTrash = useCallback((note: Note, pane: PaneId | null) => {
    setSidePickerOpen(false)
    setTrashConfirmation({ note, pane, error: '', busy: false })
  }, [])

  const beginTrashForPane = useCallback((pane: PaneId) => {
    const session = getPaneSession(pane)
    const note = session?.noteId ? snapshotRef.current.notes.find((entry) => entry.id === session.noteId) : null
    if (note && !note.deletedAt) beginTrash(note, pane)
  }, [beginTrash, getPaneSession])

  const moveConfirmedNoteToTrash = useCallback(async (choice: 'confirm' | 'save' | 'discard') => {
    const target = trashConfirmation
    if (!target || target.busy) return
    setTrashConfirmation((current) => current ? { ...current, busy: true, error: '' } : current)
    try {
      const session = target.pane ? getPaneSession(target.pane) : null
      if (choice === 'save' && session?.isDirty()) {
        const saved = await savePane(target.pane as PaneId)
        if (!saved || session.isDirty()) throw new Error('The draft could not be saved. Resolve the save conflict or error before moving this note to Trash.')
      }
      if (choice === 'confirm' && session?.isDirty()) throw new Error('Choose whether to save or discard the unfinished draft.')
      const latest = await repository.getNote(target.note.id)
      if (!latest || latest.deletedAt) throw new Error('This note is no longer active in the library.')
      await mutate(() => repository.deleteNote(latest.id))
      setTrashConfirmation(null)
      setAnnouncement('Note moved to Trash.')
      if (target.pane === 'primary') closeWorkspaceNow(true)
      else if (target.pane === 'secondary') closeSidePaneNow(true)
    } catch (cause) {
      setTrashConfirmation((current) => current ? {
        ...current,
        busy: false,
        error: cause instanceof Error ? cause.message : 'The note could not be moved to Trash.',
      } : current)
    }
  }, [closeSidePaneNow, closeWorkspaceNow, getPaneSession, mutate, repository, savePane, trashConfirmation])

  const changeSideNoteLayout = useCallback((mode: SideNoteLayoutMode) => {
    setSideNoteLayout(mode)
    try { window.localStorage.setItem('nook:secondary-view-mode', mode) } catch { /* Keep the current choice for this workspace. */ }
  }, [])

  const togglePinned = useCallback(async (pane: PaneId) => {
    const session = getPaneSession(pane)
    const note = session?.noteId ? snapshotRef.current.notes.find((entry) => entry.id === session.noteId) : null
    if (!session || !note || note.deletedAt || session.isDirty() || session.saving) return
    try {
      await mutate(() => repository.setNotePinned(note.id, !note.isPinned))
      setAnnouncement(note.isPinned ? 'Note unpinned.' : 'Note pinned.')
    } catch (cause) {
      setAnnouncement(cause instanceof Error ? cause.message : 'The note pin could not be changed.')
    }
  }, [getPaneSession, mutate, repository])

  const requestCloseWorkspace = useCallback(() => {
    if (primarySessionRef.current?.isDirty() || sideSessionRef.current?.isDirty()) setCloseIntent('workspace')
    else closeWorkspaceNow()
  }, [closeWorkspaceNow])
  useEffect(() => {
    window.addEventListener('nook:request-workspace-close', requestCloseWorkspace)
    return () => window.removeEventListener('nook:request-workspace-close', requestCloseWorkspace)
  }, [requestCloseWorkspace])

  const closeSidePicker = useCallback(() => {
    if (sidePickerClosing) return
    if (sidePane) {
      setIsViewSwitching(true)
      setSidePickerOpen(false)
      setSideSearch('')
      window.setTimeout(() => setIsViewSwitching(false), 200)
    } else {
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const duration = reducedMotion ? 120 : 180
      setSidePickerClosing(true)
      window.setTimeout(() => {
        setSidePickerClosing(false)
        setSidePickerOpen(false)
        setSideSearch('')
      }, duration)
    }
  }, [sidePane, sidePickerClosing])

  const requestCloseSide = useCallback(() => {
    if (!sideSessionRef.current) {
      if (sidePickerOpen) closeSidePicker()
      return
    }
    if (sideSessionRef.current.isDirty()) setCloseIntent('secondary')
    else closeSidePaneWithAnimation()
  }, [closeSidePaneWithAnimation, closeSidePicker, sidePickerOpen])

  const currentPrimaryNote = primarySession?.noteId
    ? snapshot.notes.find((note) => note.id === primarySession.noteId) || primaryNote
    : primaryNote
  const availableSideNotes = useMemo(() => {
    const query = sideSearch.trim().toLocaleLowerCase()
    return snapshot.notes
      .filter((note) => !note.deletedAt && note.id !== primarySession?.noteId)
      .filter((note) => !query || `${note.title}\n${note.content}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }, [primarySession?.noteId, sideSearch, snapshot.notes])

  const openSideNote = useCallback((note: Note, mode: WorkspaceMode = 'preview') => {
    sideSessionRef.current?.dispose({ discardRecovery: !sideSessionRef.current.isDirty() })
    const recovery = findRecoveryRecord(recoveryStore, 'secondary', note.id)
    const session = startSession({ note, pane: 'secondary' })
    sideSessionRef.current = session
    setSidePane({ noteId: note.id, session, mode })
    setSideState(session.getState())
    setSideRecovery(recovery)
    setSideError('')
    setSidePickerOpen(false)
    setSideSearch('')
    setActivePane('secondary')
  }, [recoveryStore, startSession])

  const chooseSideNote = useCallback((note: Note, mode: 'preview' | 'edit' = 'preview') => {
    if (sidePane?.noteId === note.id) {
      setSidePane((current) => current ? { ...current, mode } : current)
      setIsViewSwitching(true)
      setSidePickerOpen(false)
      window.setTimeout(() => setIsViewSwitching(false), 200)
      return
    }
    if (sideSessionRef.current?.isDirty()) {
      setNextSideNoteId(note.id)
      setNextSideMode(mode)
      setCloseIntent('switch-secondary')
      setSidePickerOpen(false)
      return
    }
    setIsViewSwitching(true)
    openSideNote(note, mode)
    window.setTimeout(() => setIsViewSwitching(false), 200)
  }, [openSideNote, sidePane?.noteId])

  const openSidePickerFromNote = useCallback(() => {
    setIsViewSwitching(true)
    setSidePickerOpen(true)
    window.setTimeout(() => setIsViewSwitching(false), 200)
  }, [])

  const discardRecovery = useCallback((pane: PaneId) => {
    const recovery = pane === 'primary' ? primaryRecovery : sideRecovery
    if (recovery) recoveryStore.remove(recovery.key)
    if (pane === 'primary') setPrimaryRecovery(null)
    else setSideRecovery(null)
    setAnnouncement('Unfinished draft recovery was discarded.')
  }, [primaryRecovery, recoveryStore, sideRecovery])

  const recoverDraft = useCallback((pane: PaneId) => {
    const recovery = pane === 'primary' ? primaryRecovery : sideRecovery
    if (!recovery) return
    const note = snapshotRef.current.notes.find((entry) => entry.id === recovery.draft.id) || null
    const session = startSession({
      note,
      pane,
      draft: recovery.draft,
      baseRevision: recovery.baseRevision,
      recovery,
    })
    if (pane === 'primary') {
      primarySessionRef.current?.dispose()
      primarySessionRef.current = session
      setPrimaryNote(note)
      setPrimarySession(session)
      setPrimaryState(session.getState())
      setPrimaryRecovery(null)
    } else {
      sideSessionRef.current?.dispose()
      sideSessionRef.current = session
      setSidePane((current) => current ? { ...current, session, noteId: note?.id || recovery.draft.id, mode: 'edit' } : current)
      setSideState(session.getState())
      setSideRecovery(null)
    }
    setAnnouncement('Unfinished draft recovered in this browser.')
  }, [primaryRecovery, sideRecovery, startSession])

  const applyFormatting = useCallback((pane: PaneId, command: FormattingCommand) => {
    const textarea = (pane === 'primary' ? primaryTextareaRef : sideTextareaRef).current
    const session = getPaneSession(pane)
    if (!textarea || !session || textarea.disabled) return
    const next = formatTextarea(textarea, command)
    handleDraftChange(pane, { ...session.currentDraft, content: next.value })
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(next.start, next.end)
    })
  }, [getPaneSession, handleDraftChange])

  const saveAndClosePane = useCallback(async (pane: PaneId) => {
    const saved = await savePane(pane)
    if (!saved) return
    if (pane === 'primary') closeWorkspaceNow()
    else closeSidePaneWithAnimation()
  }, [closeSidePaneWithAnimation, closeWorkspaceNow, savePane])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = Boolean(document.querySelector('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]'))
      if (event.key === 'Escape') {
        if (modalOpen) return
        event.preventDefault()
        if (sidePickerOpen) closeSidePicker()
        else if (activePane === 'secondary' && sidePane) requestCloseSide()
        else requestCloseWorkspace()
        return
      }
      if (modalOpen) {
        if (sidePickerOpen && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          if (event.key === '1' || event.key === '2') {
            event.preventDefault()
            changeSideNoteLayout(event.key === '1' ? 'focus' : 'comfortable')
          }
        }
        return
      }
      const pane = activePane === 'secondary' && sideSessionRef.current ? 'secondary' : 'primary'
      const textarea = (pane === 'primary' ? primaryTextareaRef : sideTextareaRef).current
      const usesCommand = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const modifier = usesCommand ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      const key = event.key.toLowerCase()
      const formatting: Record<string, FormattingCommand> = { b: 'bold', i: 'italic', e: 'code', k: 'link' }
      if (modifier && textarea && document.activeElement === textarea) {
        const command = !event.shiftKey ? formatting[key] : event.code === 'Digit7' ? 'ordered' : event.code === 'Digit8' ? 'bullet' : undefined
        if (command && !event.altKey) {
          event.preventDefault()
          if (!event.repeat && !event.isComposing) applyFormatting(pane, command)
          return
        }
      }
      if (modifier && event.shiftKey && key === 's' && !event.altKey) {
        event.preventDefault()
        if (!event.repeat && !event.isComposing) void savePane(pane)
        return
      }
      if (modifier && event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        if (!event.repeat && !event.isComposing) void saveAndClosePane(pane)
        return
      }
      if (!modifier && !event.metaKey && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing && !event.defaultPrevented && !isEditableTarget(event.target)) {
        const modes: Record<string, WorkspaceMode> = { '1': 'edit', '2': 'split', '3': 'preview' }
        const nextMode = modes[key]
        if (nextMode && (pane === 'primary' || sidePane)) {
          event.preventDefault()
          if (pane === 'primary') setWorkspaceMode(nextMode)
          else setSidePane((current) => current ? { ...current, mode: nextMode } : current)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activePane, applyFormatting, changeSideNoteLayout, requestCloseSide, requestCloseWorkspace, saveAndClosePane, savePane, setWorkspaceMode, sidePane, sidePickerOpen])

  const copyRawMarkdown = useCallback(async (pane: PaneId) => {
    const draft = pane === 'primary' ? primarySessionRef.current?.currentDraft : sideSessionRef.current?.currentDraft
    if (!draft) return
    setAnnouncement(await copyText(draft.content) ? 'Raw Markdown copied.' : 'Clipboard access is unavailable in this browser.')
  }, [])

  const copySideNote = useCallback(async (note: Note) => {
    setAnnouncement(await copyText(note.content) ? 'Raw Markdown copied.' : 'Clipboard access is unavailable in this browser.')
  }, [])

  const exportNote = useCallback(async (pane: PaneId) => {
    const draft = pane === 'primary' ? primarySessionRef.current?.currentDraft : sideSessionRef.current?.currentDraft
    if (!draft) return
    try {
      const blob = new Blob([draft.content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeFilename(draft.title)}.md`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setAnnouncement('Note exported as .md.')
    } catch {
      setAnnouncement('The note could not be exported in this browser.')
    }
  }, [])

  const openHistory = useCallback(async (pane: PaneId) => {
    const session = getPaneSession(pane)
    const id = session?.noteId
    if (!id) return
    const request = ++historyRequestSequence.current
    setHistory({ pane, noteId: id, versions: [], selectedRevision: null, loading: true, error: '' })
    try {
      const versions = await repository.listNoteVersions(id, { limit: 50 })
      if (request !== historyRequestSequence.current) return
      setHistory({ pane, noteId: id, versions, selectedRevision: versions[0]?.revision ?? null, loading: false, error: '' })
    } catch (cause) {
      if (request !== historyRequestSequence.current) return
      setHistory({ pane, noteId: id, versions: [], selectedRevision: null, loading: false, error: cause instanceof Error ? cause.message : 'Could not load note history.' })
    }
  }, [getPaneSession, repository])

  const selectedHistoryVersion = history?.versions.find((version) => version.revision === history.selectedRevision) || null

  const requestRestoreVersion = useCallback(() => {
    if (!selectedHistoryVersion || !history) return
    const matchingDirtySession = [primarySessionRef.current, sideSessionRef.current]
      .some((session) => session?.noteId === history.noteId && session.isDirty())
    if (matchingDirtySession) {
      setHistory((current) => current ? { ...current, error: 'Save or close the unfinished draft before restoring history.' } : current)
      return
    }
    setRestoreConfirmation(selectedHistoryVersion)
  }, [history, selectedHistoryVersion])

  const restoreVersion = useCallback(async () => {
    if (!history || !restoreConfirmation) return
    const current = snapshotRef.current.notes.find((note) => note.id === history.noteId)
    if (!current) {
      setHistory((state) => state ? { ...state, error: 'The current note is no longer available.' } : state)
      setRestoreConfirmation(null)
      return
    }
    try {
      const restored = await mutate(() => repository.restoreNoteVersion(current.id, restoreConfirmation.revision, { expectedRevision: current.revision }))
      primarySessionRef.current?.applyExternalSnapshot(restored)
      sideSessionRef.current?.applyExternalSnapshot(restored)
      if (primarySessionRef.current) setPrimaryState(primarySessionRef.current.getState())
      if (sideSessionRef.current) setSideState(sideSessionRef.current.getState())
      setRestoreConfirmation(null)
      setHistory(null)
      setAnnouncement('Earlier version restored. The previous current version is preserved in history.')
    } catch (cause) {
      setRestoreConfirmation(null)
      setHistory((state) => state ? { ...state, error: cause instanceof Error ? cause.message : 'Could not restore this version.' } : state)
    }
  }, [history, mutate, repository, restoreConfirmation])

  const handleSaveAndResolveClose = useCallback(async () => {
    if (!closeIntent || closeSaveInFlight) return
    const intent = closeIntent
    setCloseSaveInFlight(true)
    try {
      if (intent === 'secondary' || intent === 'switch-secondary') {
        const saved = await savePane('secondary')
        if (!saved || sideSessionRef.current?.isDirty()) return
        setCloseIntent(null)
        if (intent === 'secondary') closeSidePaneWithAnimation()
        else {
          closeSidePaneNow()
          const next = snapshotRef.current.notes.find((note) => note.id === nextSideNoteId && !note.deletedAt)
          if (next) openSideNote(next, nextSideMode)
        }
        return
      }
      const panes: PaneId[] = ['primary', ...(sideSessionRef.current ? ['secondary' as const] : [])]
      for (const pane of panes) {
        const session = getPaneSession(pane)
        if (session?.isDirty()) {
          const saved = await savePane(pane)
          if (!saved || session.isDirty()) return
        }
      }
      setCloseIntent(null)
      closeWorkspaceNow()
    } finally {
      setCloseSaveInFlight(false)
    }
  }, [closeIntent, closeSaveInFlight, closeSidePaneNow, closeSidePaneWithAnimation, closeWorkspaceNow, getPaneSession, nextSideMode, nextSideNoteId, openSideNote, savePane])

  const discardAndResolveClose = useCallback(() => {
    if (closeSaveInFlight) return
    const intent = closeIntent
    setCloseIntent(null)
    if (intent === 'secondary') closeSidePaneWithAnimation(true)
    else if (intent === 'switch-secondary') {
      closeSidePaneNow(true)
      const next = snapshotRef.current.notes.find((note) => note.id === nextSideNoteId && !note.deletedAt)
        if (next) openSideNote(next, nextSideMode)
    } else if (intent === 'workspace') closeWorkspaceNow(true)
  }, [closeIntent, closeSaveInFlight, closeSidePaneNow, closeSidePaneWithAnimation, closeWorkspaceNow, nextSideMode, nextSideNoteId, openSideNote])

  const mainModeChange = useCallback((mode: WorkspaceMode) => setWorkspaceMode(mode), [setWorkspaceMode])
  const sideModeChange = useCallback((mode: WorkspaceMode) => setSidePane((current) => current ? { ...current, mode } : current), [])

  const toggleSideNote = useCallback(() => {
    if (sideClosing || sidePickerClosing) return
    if (sidePickerOpen) {
      closeSidePicker()
    } else if (sidePane) {
      requestCloseSide()
    } else {
      setSidePickerOpen(true)
    }
  }, [closeSidePicker, requestCloseSide, sideClosing, sidePane, sidePickerClosing, sidePickerOpen])

  if (!workspace) return null
  if (loading) return <main className="workspace-loading" aria-busy="true"><p role="status">Opening note workspace…</p></main>
  if (loadError) {
    return (
      <main className="workspace-loading">
        <section role="alert" className="workspace-load-error">
          <p>{loadError}</p>
          <Button onClick={closeWorkspace}><ArrowLeft aria-hidden="true" />Back to notes</Button>
        </section>
      </main>
    )
  }
  if (!primarySession || !primaryState) return null

  const previewConflict = conflictPreview
  const conflictState = previewConflict?.pane === 'primary' ? primaryState.conflict : sideState?.conflict
  const conflictNote = previewConflict?.note || conflictState?.latestNote || null
  const hasSideSurface = Boolean(
    (sidePane && !sideClosing) ||
    sideClosing ||
    sidePickerOpen ||
    sidePickerClosing
  )

  const workspaceStateLabel = primaryMode === 'preview' ? 'Preview note' : primarySession.noteId ? 'Edit note' : 'New note'
  const sideNoteControl = <Tooltip>
    <TooltipTrigger render={
      <Button
        type="button"
        variant={hasSideSurface ? 'secondary' : 'outline'}
        size="sm"
        className="workspace-side-control"
        aria-label={hasSideSurface ? 'Close side note' : 'Open Side note'}
        aria-expanded={hasSideSurface}
        aria-controls="side-note-picker"
        onClick={toggleSideNote}
      >
        <SideNoteIcon className="size-4" /><span>{hasSideSurface ? 'Close side note' : 'Side note'}</span>
      </Button>
    } />
    <TooltipContent role="tooltip">{hasSideSurface ? 'Close side note' : 'Open side note'}</TooltipContent>
  </Tooltip>
  const returnToNotesControl = <Tooltip>
    <TooltipTrigger render={
      <Button type="button" variant="outline" size="sm" className="workspace-back-control" aria-label="Return to all notes" onClick={requestCloseWorkspace}>
        <ArrowLeft aria-hidden="true" className="size-4" /><span>All notes</span>
      </Button>
    } />
    <TooltipContent role="tooltip">
      <span className="inline-flex items-center gap-2">
        <span>Return to all notes</span>
        <kbd>Esc</kbd>
      </span>
    </TooltipContent>
  </Tooltip>

  return (
      <main className={`workspace-screen ${hasSideSurface ? 'workspace-screen--with-side' : ''}`} id="main-content" tabIndex={-1}>
      {!hasSideSurface && <header className="workspace-topbar">
        <div className="workspace-topbar__leading">
          {returnToNotesControl}
          <div className="workspace-topbar__state"><h1>{workspaceStateLabel}</h1><WorkspaceSaveStatus state={primaryState} /></div>
        </div>
        <div className="workspace-topbar__trailing">
          <WorkspaceModeSwitch mode={primaryMode} paneLabel="Note" onModeChange={mainModeChange} />
          {sideNoteControl}
          <Button type="button" variant="ghost" size="icon-sm" className="workspace-mobile-actions" aria-label="Note actions" aria-haspopup="dialog" onClick={() => setMobileActionsOpen(true)}><MoreHorizontal aria-hidden="true" /></Button>
        </div>
      </header>}

      <Sheet open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
        <SheetContent side="bottom" className="workspace-action-sheet" showCloseButton={false}>
          <div className="workspace-action-sheet__handle" aria-hidden="true" />
          <div className="workspace-action-sheet__heading"><SheetTitle>Note actions</SheetTitle><Button type="button" variant="ghost" size="icon-sm" aria-label="Close note actions" onClick={() => setMobileActionsOpen(false)}><X aria-hidden="true" /></Button></div>
          <SheetDescription className="sr-only">Actions for the current note.</SheetDescription>
          <div className="workspace-action-sheet__actions">
            {primaryState.currentDraft.id && <Button type="button" variant="ghost" onClick={() => { setMobileActionsOpen(false); void openHistory('primary') }}><Clock3 aria-hidden="true" />Version history</Button>}
            <Button type="button" variant="ghost" disabled={!primaryState.currentDraft.content} onClick={() => { setMobileActionsOpen(false); void copyRawMarkdown('primary') }}><Copy aria-hidden="true" />Copy content</Button>
            <Button type="button" variant="ghost" onClick={() => { setMobileActionsOpen(false); void exportNote('primary') }}><Download aria-hidden="true" />Export .md</Button>
            {primaryState.currentDraft.id && !currentPrimaryNote?.deletedAt && <Button type="button" variant="ghost" className="text-destructive" onClick={() => { setMobileActionsOpen(false); beginTrashForPane('primary') }}><Trash2 aria-hidden="true" />Move to Trash</Button>}
          </div>
        </SheetContent>
      </Sheet>

      <div className="workspace-pane-grid">
        <EditorPane
          showHeader={hasSideSurface}
          headerLeading={hasSideSurface ? <>
            {returnToNotesControl}
            <h1 id="workspace-heading" tabIndex={-1} className="workspace-pane__state-label">{workspaceStateLabel}</h1>
            <WorkspaceSaveStatus state={primaryState} />
          </> : undefined}
          headerTrailing={hasSideSurface ? sideNoteControl : undefined}
          pane="primary"
          mode={primaryMode}
          state={primaryState}
          note={currentPrimaryNote}
          types={snapshot.types}
          tags={snapshot.tags}
          isActive={activePane === 'primary'}
          recovery={primaryRecovery}
          error={primaryError}
          textareaRef={primaryTextareaRef}
          onModeChange={mainModeChange}
          onDraftChange={(draft) => handleDraftChange('primary', draft)}
          onActivate={() => setActivePane('primary')}
          onSave={(closeAfterSave = false) => { if (closeAfterSave) void saveAndClosePane('primary'); else void savePane('primary') }}
          onKeepMine={() => { void retryConflictWithMine('primary') }}
          onClose={requestCloseWorkspace}
          onHistory={() => { void openHistory('primary') }}
          onTogglePinned={() => { void togglePinned('primary') }}
          onMoveToTrash={() => beginTrashForPane('primary')}
          onCreateTag={(name) => createTagForPane('primary', name)}
          onCopy={() => { void copyRawMarkdown('primary') }}
          onExport={() => { void exportNote('primary') }}
          onFormat={(command) => applyFormatting('primary', command)}
          onRecover={() => recoverDraft('primary')}
          onDiscardRecovery={() => discardRecovery('primary')}
          onConflictPreview={() => {
            const conflict = primarySession.conflict
            if (conflict?.latestNote) setConflictPreview({ pane: 'primary', note: conflict.latestNote })
          }}
        />

        {sidePickerOpen ? (
          <SideNotePicker
            types={snapshot.types}
            tags={snapshot.tags}
            sideSearch={sideSearch}
            availableSideNotes={availableSideNotes}
            sideNoteLayout={sideNoteLayout}
            className={`${sidePickerClosing ? 'workspace-side--exiting' : ''} ${isViewSwitching ? 'workspace-side--view-switch' : ''}`}
            onClose={closeSidePicker}
            onSideSearchChange={setSideSearch}
            onChooseSideNote={(note, mode) => chooseSideNote(note, mode)}
            onCopySideNote={(note) => { void copySideNote(note) }}
            onTrashSideNote={(note) => beginTrash(note, sidePane?.noteId === note.id ? 'secondary' : null)}
            onSideNoteLayoutChange={changeSideNoteLayout}
          />
        ) : sidePane && sideState ? (
          <EditorPane
            pane="secondary"
            mode={sidePane.mode}
            state={sideState}
            note={snapshot.notes.find((note) => note.id === sidePane.noteId) || null}
            types={snapshot.types}
            tags={snapshot.tags}
            isActive={activePane === 'secondary'}
            className={`${sideClosing ? 'workspace-side--exiting' : ''} ${isViewSwitching ? 'workspace-side--view-switch' : ''}`}
            headerLeading={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={openSidePickerFromNote}
                  aria-label="Switch side note"
                  title="Choose another note"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  <span>Switch note</span>
                </Button>
                <WorkspaceSaveStatus state={sideState} />
              </div>
            }
            recovery={sideRecovery}
            error={sideError}
            textareaRef={sideTextareaRef}
            onModeChange={sideModeChange}
            onDraftChange={(draft) => handleDraftChange('secondary', draft)}
            onActivate={() => setActivePane('secondary')}
            onSave={(closeAfterSave = false) => { if (closeAfterSave) void saveAndClosePane('secondary'); else void savePane('secondary') }}
            onKeepMine={() => { void retryConflictWithMine('secondary') }}
            onClose={requestCloseSide}
            onHistory={() => { void openHistory('secondary') }}
            onTogglePinned={() => { void togglePinned('secondary') }}
            onMoveToTrash={() => beginTrashForPane('secondary')}
            onCreateTag={(name) => createTagForPane('secondary', name)}
            onCopy={() => { void copyRawMarkdown('secondary') }}
            onExport={() => { void exportNote('secondary') }}
            onFormat={(command) => applyFormatting('secondary', command)}
            onRecover={() => recoverDraft('secondary')}
            onDiscardRecovery={() => discardRecovery('secondary')}
            onConflictPreview={() => {
              const conflict = sidePane.session.conflict
              if (conflict?.latestNote) setConflictPreview({ pane: 'secondary', note: conflict.latestNote })
            }}
          />
        ) : sidePane ? (
          <section className={`workspace-side-empty ${sideClosing ? 'workspace-side--exiting' : ''}`} aria-label="Side note pane">
            <div className="workspace-side-empty__icon"><SideNoteIcon className="size-6" aria-hidden="true" /></div>
            <h2>Keep another note close</h2>
            <p>Open a Side note to compare or edit another note without losing this draft.</p>
            <Button type="button" variant="outline" onClick={() => setSidePickerOpen(true)}>Choose a note</Button>
          </section>
        ) : null}
      </div>

      <div className="workspace-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>

      <WorkspaceDialogs
        types={snapshot.types}
        tags={snapshot.tags}
        sidePickerOpen={false}
        sideSearch={sideSearch}
        availableSideNotes={availableSideNotes}
        sideNoteLayout={sideNoteLayout}
        closeIntent={closeIntent}
        closeBusy={closeSaveInFlight}
        history={history}
        selectedHistoryVersion={selectedHistoryVersion}
        restoreConfirmation={restoreConfirmation}
        trashConfirmation={trashConfirmation}
        trashDirty={Boolean(trashConfirmation?.pane && getPaneSession(trashConfirmation.pane)?.isDirty())}
        conflictPreview={previewConflict}
        conflictNote={conflictNote}
        onSidePickerOpenChange={setSidePickerOpen}
        onSideSearchChange={setSideSearch}
        onChooseSideNote={(note, mode) => chooseSideNote(note, mode)}
        onCopySideNote={(note) => { void copySideNote(note) }}
        onTrashSideNote={(note) => beginTrash(note, sidePane?.noteId === note.id ? 'secondary' : null)}
        onSideNoteLayoutChange={changeSideNoteLayout}
        onDismissClose={() => { if (!closeSaveInFlight) setCloseIntent(null) }}
        onSaveAndResolveClose={() => { void handleSaveAndResolveClose() }}
        onDiscardAndResolveClose={discardAndResolveClose}
        onHistoryClose={() => { historyRequestSequence.current += 1; setHistory(null) }}
        onHistorySelectRevision={(revision) => setHistory((current) => current ? { ...current, selectedRevision: revision, error: '' } : current)}
        onRequestRestoreVersion={requestRestoreVersion}
        onRestoreVersion={() => { void restoreVersion() }}
        onCancelRestore={() => setRestoreConfirmation(null)}
        onTrashConfirmationOpenChange={(open) => { if (!open && !trashConfirmation?.busy) setTrashConfirmation(null) }}
        onConfirmTrash={() => { void moveConfirmedNoteToTrash('confirm') }}
        onSaveAndTrash={() => { void moveConfirmedNoteToTrash('save') }}
        onDiscardAndTrash={() => { void moveConfirmedNoteToTrash('discard') }}
        onCloseConflictPreview={() => setConflictPreview(null)}
      />
    </main>
  )
}
