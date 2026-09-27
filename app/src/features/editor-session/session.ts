import type { Note, NoteDraft, NoteRepository, SaveNoteInput } from '@/domain/contracts'

export type EditorPaneId = 'primary' | 'secondary'
export type EditorSessionPhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'disposed'

const DRAFT_RECOVERY_PREFIX = 'nook:editor-draft:v2:'
const DRAFT_RECOVERY_VERSION = 2
const DRAFT_TAB_SESSION_KEY = 'nook:editor-tab:v1'
const DEFAULT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface DraftRecoveryIdentity {
  tabId: string
  pane: EditorPaneId
  sessionId: string
}

export interface DraftRecoveryRecord extends DraftRecoveryIdentity {
  key: string
  version: 2
  savedAt: string
  baseRevision: number
  draft: NoteDraft
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>

export interface DraftRecoveryStore {
  readonly prefix: string
  readonly version: 2
  readonly tabId: string
  keyFor(identity: DraftRecoveryIdentity): string
  read(identity: DraftRecoveryIdentity): DraftRecoveryRecord | null
  write(identity: DraftRecoveryIdentity, draft: NoteDraft, options?: { baseRevision?: number; savedAt?: string }): boolean
  remove(identityOrKey: DraftRecoveryIdentity | string): boolean
  enumerate(options?: { prune?: boolean }): DraftRecoveryRecord[]
  prune(): boolean
}

export interface CreateDraftRecoveryStoreOptions {
  storage?: StorageLike | null
  sessionStorage?: StorageLike | null
  now?: () => number
  maxAgeMs?: number
  tabId?: string
}

export interface EditorConflictState {
  code: 'NOTE_CONFLICT'
  deleted: boolean
  latest: NoteDraft
  latestNote: Note | null
  latestRevision: number
  draft: NoteDraft
  attemptedDraft: NoteDraft
  expectedRevision?: number
  saveSequence: number
}

export interface EditorSessionState {
  pane: EditorPaneId
  sessionId: string
  noteId: string
  baseRevision: number
  committedSnapshot: NoteDraft | null
  currentDraft: NoteDraft
  draftVersion: number
  saveSequence: number
  phase: EditorSessionPhase
  status: EditorSessionPhase
  dirty: boolean
  saving: boolean
  conflict: EditorConflictState | null
  error: Error | null
}

export type EditorSaveResult =
  | { status: 'saved'; savedNote: Note; currentMatchesCapture: boolean; sequence: number; dirty: boolean }
  | { status: 'conflict'; latest: NoteDraft; latestNote: Note | null; latestRevision: number; deleted: boolean; sequence: number; dirty: boolean; error?: Error }
  | { status: 'error'; error: Error; sequence: number; dirty: boolean }
  | { status: 'noop'; sequence: number | null; dirty: boolean }
  | { status: 'stale'; sequence: number | null; dirty: boolean; ignored: true }
  | { status: 'keep-editing'; deleted?: boolean; sequence: number | null; dirty: boolean }
  | { status: 'view-latest'; sequence: null; dirty: boolean }

export interface EditorSession {
  readonly pane: EditorPaneId
  readonly sessionId: string
  readonly noteId: string
  readonly baseRevision: number
  readonly currentDraft: NoteDraft
  readonly committedSnapshot: NoteDraft | null
  readonly draftVersion: number
  readonly saveSequence: number
  readonly phase: EditorSessionPhase
  readonly status: EditorSessionPhase
  readonly dirty: boolean
  readonly saving: boolean
  readonly conflict: EditorConflictState | null
  getState(): EditorSessionState
  isDirty(): boolean
  hasUnsavedChanges(): boolean
  captureDraft(): NoteDraft
  updateDraft(nextDraft: NoteDraft | ((draft: NoteDraft) => NoteDraft)): { changed?: boolean; ignored?: boolean; state: EditorSessionState }
  setDraft(nextDraft: NoteDraft | ((draft: NoteDraft) => NoteDraft)): { changed?: boolean; ignored?: boolean; state: EditorSessionState }
  save(options?: { force?: boolean; expectedRevision?: number }): Promise<EditorSaveResult>
  keepMine(): Promise<EditorSaveResult>
  retryKeepMine(): Promise<EditorSaveResult>
  keepEditing(): EditorSaveResult
  viewLatest(): EditorSaveResult
  applyExternalSnapshot(note: Note): { applied?: boolean; conflict?: boolean; ignored?: boolean; state: EditorSessionState }
  dispose(options?: { discardRecovery?: boolean }): void
}

export interface CreateEditorSessionOptions {
  repository: Pick<NoteRepository, 'saveNote'>
  pane?: EditorPaneId
  sessionId?: string
  noteId?: string
  baseRevision?: number
  committed?: Note | NoteDraft | null
  currentDraft?: NoteDraft | null
  recoveryStore?: DraftRecoveryStore | null
  recoveryIdentity?: DraftRecoveryIdentity
}

let nextSessionNumber = 0

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneDraft(value: NoteDraft, label = 'Editor draft'): NoteDraft {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object.`)
  const fields = ['id', 'title', 'typeId', 'content'] as const
  fields.forEach((field) => {
    if (typeof value[field] !== 'string') throw new TypeError(`${label}.${field} must be a string.`)
  })
  if (!Array.isArray(value.tagIds) || value.tagIds.some((id) => typeof id !== 'string')) {
    throw new TypeError(`${label}.tagIds must be an array of strings.`)
  }
  return {
    id: value.id as string,
    title: value.title as string,
    typeId: value.typeId as string,
    tagIds: [...new Set(value.tagIds.map((id) => id.trim()).filter(Boolean))],
    content: value.content as string,
  }
}

function draftFromNote(note: Note | NoteDraft, label = 'Note'): NoteDraft {
  return cloneDraft({
    id: typeof note.id === 'string' ? note.id : '',
    title: note.title,
    typeId: note.typeId,
    tagIds: note.tagIds,
    content: note.content,
  }, `${label} draft`)
}

function draftKey(draft: NoteDraft): string {
  return JSON.stringify(cloneDraft(draft))
}

function draftsEqual(left: NoteDraft | null, right: NoteDraft | null): boolean {
  return left === right || Boolean(left && right && draftKey(left) === draftKey(right))
}

function validRevision(value: unknown, allowZero = true): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (allowZero ? 0 : 1)
}

function storageFor(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window[kind]
  } catch {
    return null
  }
}

function makeId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}${crypto.randomUUID()}`
  } catch {
    // Storage remains usable in browsers where crypto is unavailable.
  }
  nextSessionNumber += 1
  return `${prefix}${Date.now().toString(36)}-${nextSessionNumber.toString(36)}-${Math.random().toString(36).slice(2)}`
}

function resolveTabId(sessionStorage: StorageLike | null): string {
  try {
    const existing = sessionStorage?.getItem(DRAFT_TAB_SESSION_KEY)
    if (existing?.trim()) return existing
    const created = makeId('tab-')
    sessionStorage?.setItem(DRAFT_TAB_SESSION_KEY, created)
    return created
  } catch {
    return makeId('tab-')
  }
}

export function createDraftRecoveryStore({
  storage = storageFor('localStorage'),
  sessionStorage = storageFor('sessionStorage'),
  now = () => Date.now(),
  maxAgeMs = DEFAULT_DRAFT_MAX_AGE_MS,
  tabId = '',
}: CreateDraftRecoveryStoreOptions = {}): DraftRecoveryStore {
  const resolvedTabId = tabId || resolveTabId(sessionStorage)
  const maxAge = Number.isFinite(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : DEFAULT_DRAFT_MAX_AGE_MS
  const clock = () => {
    const value = now()
    return Number.isFinite(value) ? value : Date.now()
  }

  const keyFor = (identity: DraftRecoveryIdentity) => [identity.tabId, identity.pane, identity.sessionId]
    .map((part) => encodeURIComponent(String(part).trim())).join(':')
    .replace(/^/, DRAFT_RECOVERY_PREFIX)

  const normalizeRecord = (value: unknown, key = '', checkAge = false): DraftRecoveryRecord | null => {
    if (!isPlainObject(value) || value.version !== DRAFT_RECOVERY_VERSION) return null
    if (
      typeof value.tabId !== 'string' || !value.tabId.trim() ||
      (value.pane !== 'primary' && value.pane !== 'secondary') ||
      typeof value.sessionId !== 'string' || !value.sessionId.trim() ||
      typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt)) ||
      !validRevision(value.baseRevision)
    ) return null
    let draft: NoteDraft
    try {
      draft = cloneDraft(value.draft as NoteDraft, 'Recovery draft')
    } catch {
      return null
    }
    const identity: DraftRecoveryIdentity = { tabId: value.tabId, pane: value.pane, sessionId: value.sessionId }
    const expectedKey = keyFor(identity)
    if (key && key !== expectedKey) return null
    if (checkAge && clock() - Date.parse(value.savedAt) > maxAge) return null
    return {
      ...identity,
      key: expectedKey,
      version: DRAFT_RECOVERY_VERSION,
      savedAt: value.savedAt,
      baseRevision: value.baseRevision,
      draft,
    }
  }

  const removeKey = (key: string) => {
    if (!key.startsWith(DRAFT_RECOVERY_PREFIX)) return false
    try {
      storage?.removeItem(key)
      return Boolean(storage)
    } catch {
      return false
    }
  }

  const store: DraftRecoveryStore = {
    prefix: DRAFT_RECOVERY_PREFIX,
    version: DRAFT_RECOVERY_VERSION,
    tabId: resolvedTabId,
    keyFor,
    read(identity) {
      const key = keyFor(identity)
      let raw: string | null = null
      try { raw = storage?.getItem(key) ?? null } catch { return null }
      if (!raw) return null
      try {
        const record = normalizeRecord(JSON.parse(raw), key, true)
        if (!record) removeKey(key)
        return record
      } catch {
        removeKey(key)
        return null
      }
    },
    write(identity, draft, { baseRevision = 0, savedAt = '' } = {}) {
      if (!storage || !validRevision(baseRevision)) return false
      try {
        const normalizedDraft = cloneDraft(draft)
        const timestamp = savedAt || new Date(clock()).toISOString()
        if (Number.isNaN(Date.parse(timestamp))) return false
        const record = {
          version: DRAFT_RECOVERY_VERSION,
          tabId: identity.tabId,
          pane: identity.pane,
          sessionId: identity.sessionId,
          savedAt: timestamp,
          baseRevision,
          draft: normalizedDraft,
        }
        storage.setItem(keyFor(identity), JSON.stringify(record))
        return true
      } catch {
        return false
      }
    },
    remove(identityOrKey) {
      return removeKey(typeof identityOrKey === 'string' ? identityOrKey : keyFor(identityOrKey))
    },
    enumerate({ prune = true } = {}) {
      const records: DraftRecoveryRecord[] = []
      if (!storage || typeof storage.key !== 'function') return records
      let keys: string[] = []
      try {
        const length = storage.length
        if (typeof length !== 'number') return records
        keys = Array.from({ length }, (_, index) => storage.key?.(index) ?? '')
          .filter((key) => key.startsWith(DRAFT_RECOVERY_PREFIX))
      } catch {
        return records
      }
      keys.forEach((key) => {
        try {
          const raw = storage.getItem(key)
          const record = raw ? normalizeRecord(JSON.parse(raw), key, true) : null
          if (record) records.push(record)
          else if (prune) removeKey(key)
        } catch {
          if (prune) removeKey(key)
        }
      })
      return records
    },
    prune() {
      store.enumerate({ prune: true })
      return true
    },
  }
  return Object.freeze(store)
}

interface SaveIntent {
  sequence: number
  token: symbol
  draft: NoteDraft
  draftVersion: number
  expectedRevision?: number
}

interface PendingSave {
  waiters: Array<(result: EditorSaveResult) => void>
}

function errorWithCode(error: unknown): Error & { code?: string; latestNote?: Note | null; latestRevision?: number } {
  const source = error instanceof Error || isPlainObject(error) ? error as Record<string, unknown> : {}
  const normalized = error instanceof Error ? error : new Error(String(source.message || error || 'Save failed.'))
  if (typeof source.code === 'string') Object.assign(normalized, { code: source.code })
  if ('latestNote' in source) Object.assign(normalized, { latestNote: source.latestNote })
  if ('latestRevision' in source) Object.assign(normalized, { latestRevision: source.latestRevision })
  return normalized as Error & { code?: string; latestNote?: Note | null; latestRevision?: number }
}

export function createEditorSession({
  repository,
  pane = 'primary',
  sessionId = makeId(`${pane}-`),
  noteId = '',
  baseRevision = 0,
  committed = null,
  currentDraft = null,
  recoveryStore = null,
  recoveryIdentity,
}: CreateEditorSessionOptions): EditorSession {
  let token = Symbol(sessionId)
  let disposed = false
  let revision = validRevision(baseRevision) ? baseRevision : 0
  let committedDraft = committed ? draftFromNote(committed, 'Committed note') : null
  let draft = currentDraft ? cloneDraft(currentDraft, 'Current draft') : committedDraft ? cloneDraft(committedDraft) : {
    id: '', title: '', typeId: '', tagIds: [], content: '',
  }
  if (revision === 0 && committed && validRevision((committed as Note).revision, false)) revision = (committed as Note).revision
  let noteKey = noteId || committedDraft?.id || draft.id || ''
  let draftVersion = 0
  let saveSequence = 0
  let phase: EditorSessionPhase = committedDraft ? (draftsEqual(draft, committedDraft) ? 'saved' : 'dirty') : 'idle'
  let lastError: Error | null = null
  let conflict: EditorConflictState | null = null
  let active = false
  let activeIntent: SaveIntent | null = null
  let pending: PendingSave | null = null
  const identity = recoveryIdentity || { tabId: recoveryStore?.tabId || 'tab-unavailable', pane, sessionId }

  const isDirty = () => committedDraft
    ? !draftsEqual(draft, committedDraft)
    : Boolean(draft.id || draft.title.trim() || draft.tagIds.length || draft.content)

  const syncRecovery = () => {
    if (!recoveryStore) return
    if (isDirty()) recoveryStore.write(identity, draft, { baseRevision: revision })
    else recoveryStore.remove(identity)
  }

  const markPhase = () => {
    if (disposed) phase = 'disposed'
    else if (conflict) phase = 'conflict'
    else if (active) phase = 'saving'
    else if (isDirty()) phase = 'dirty'
    else phase = committedDraft ? 'saved' : 'idle'
  }

  const state = (): EditorSessionState => ({
    pane,
    sessionId,
    noteId: noteKey,
    baseRevision: revision,
    committedSnapshot: committedDraft ? cloneDraft(committedDraft) : null,
    currentDraft: cloneDraft(draft),
    draftVersion,
    saveSequence,
    phase,
    status: phase,
    dirty: isDirty(),
    saving: active,
    conflict: conflict ? {
      ...conflict,
      latest: cloneDraft(conflict.latest),
      latestNote: conflict.latestNote ? { ...conflict.latestNote, tagIds: [...conflict.latestNote.tagIds] } : null,
      draft: cloneDraft(conflict.draft),
      attemptedDraft: cloneDraft(conflict.attemptedDraft),
    } : null,
    error: lastError,
  })

  const result = (status: EditorSaveResult['status'], sequence: number | null, extra: Record<string, unknown> = {}): EditorSaveResult => ({
    status,
    sequence,
    dirty: isDirty(),
    ...extra,
  } as EditorSaveResult)

  const updateDraft = (next: NoteDraft | ((current: NoteDraft) => NoteDraft)) => {
    if (disposed) return { ignored: true, state: state() }
    const candidate = typeof next === 'function' ? next(cloneDraft(draft)) : next
    const normalized = cloneDraft(candidate, 'Current draft')
    const changed = !draftsEqual(normalized, draft)
    if (changed) {
      draft = normalized
      draftVersion += 1
      lastError = null
      markPhase()
      syncRecovery()
    }
    return { changed, state: state() }
  }

  const captureIntent = (options: { expectedRevision?: number } = {}): SaveIntent => {
    const sequence = ++saveSequence
    const captured = cloneDraft(draft)
    const expected = validRevision(options.expectedRevision) ? options.expectedRevision : (captured.id ? revision : undefined)
    return { sequence, token, draft: captured, draftVersion, expectedRevision: expected }
  }

  const resolvePending = (waiters: PendingSave['waiters'], value: EditorSaveResult) => waiters.splice(0).forEach((resolve) => resolve(value))

  const runSave = async (intent: SaveIntent, waiters: PendingSave['waiters'] = []): Promise<EditorSaveResult> => {
    if (disposed || intent.token !== token) {
      const stale = result('stale', intent.sequence, { ignored: true })
      resolvePending(waiters, stale)
      return stale
    }
    active = true
    activeIntent = intent
    lastError = null
    markPhase()
    let saveResult: EditorSaveResult
    const input: SaveNoteInput = { ...cloneDraft(intent.draft) }
    if (intent.expectedRevision !== undefined && input.id) input.expectedRevision = intent.expectedRevision
    try {
      const savedNote = await repository.saveNote(input)
      if (disposed || intent.token !== token) {
        active = false
        activeIntent = null
        const stale = result('stale', intent.sequence, { ignored: true })
        resolvePending(waiters, stale)
        return stale
      }
      const savedDraft = draftFromNote(savedNote, 'Saved note')
      const matches = draftVersion === intent.draftVersion && draftsEqual(draft, intent.draft)
      const newerRevisionObserved = validRevision(savedNote.revision, false) && savedNote.revision < revision
      active = false
      activeIntent = null
      if (conflict && conflict.latestRevision >= (savedNote.revision || 0)) {
        markPhase()
        syncRecovery()
        saveResult = result('conflict', intent.sequence, {
          latest: cloneDraft(conflict.latest),
          latestNote: conflict.latestNote,
          latestRevision: conflict.latestRevision,
          deleted: conflict.deleted,
          error: lastError || undefined,
        })
        resolvePending(waiters, saveResult)
      } else {
      noteKey = savedDraft.id
      if (!newerRevisionObserved) {
        revision = validRevision(savedNote.revision, false) ? savedNote.revision : Math.max(1, revision + 1)
        committedDraft = savedDraft
      }
      conflict = null
      lastError = null
      if (matches) draft = cloneDraft(savedDraft)
      else if (!draft.id && intent.draft.id === '') draft = { ...draft, id: savedDraft.id }
      markPhase()
      syncRecovery()
      saveResult = result('saved', intent.sequence, { savedNote: { ...savedNote, ...savedDraft, revision }, currentMatchesCapture: matches })
      resolvePending(waiters, saveResult)
      }
    } catch (cause) {
      if (disposed || intent.token !== token) {
        active = false
        activeIntent = null
        const stale = result('stale', intent.sequence, { ignored: true })
        resolvePending(waiters, stale)
        return stale
      }
      active = false
      activeIntent = null
      const error = errorWithCode(cause)
      lastError = error
      if (error.code === 'NOTE_CONFLICT') {
        const latestNote = error.latestNote || null
        const latest = latestNote ? draftFromNote(latestNote, 'Conflict latest note') : committedDraft ? cloneDraft(committedDraft) : cloneDraft(intent.draft)
        const latestRevision = latestNote && validRevision(latestNote.revision, false)
          ? latestNote.revision
          : validRevision(error.latestRevision, false) ? error.latestRevision : revision
        const deleted = !latestNote
        committedDraft = latestNote ? cloneDraft(latest) : null
        revision = latestRevision
        if (latest.id) noteKey = latest.id
        conflict = {
          code: 'NOTE_CONFLICT', deleted, latest, latestNote: latestNote ? { ...latestNote } : null,
          latestRevision, draft: cloneDraft(draft), attemptedDraft: cloneDraft(intent.draft),
          expectedRevision: intent.expectedRevision, saveSequence: intent.sequence,
        }
        markPhase()
        syncRecovery()
        saveResult = result('conflict', intent.sequence, { latest, latestNote: conflict.latestNote, latestRevision, deleted, error })
      } else {
        conflict = null
        phase = 'error'
        syncRecovery()
        saveResult = result('error', intent.sequence, { error })
      }
      resolvePending(waiters, saveResult)
    }

    if (pending) {
      const queued = pending
      pending = null
      if (saveResult.status === 'saved' && !disposed && !conflict) {
        const nextIntent = captureIntent()
        void runSave(nextIntent, queued.waiters)
      } else {
        resolvePending(queued.waiters, saveResult)
      }
    }
    return saveResult
  }

  const save = (options: { force?: boolean; expectedRevision?: number } = {}): Promise<EditorSaveResult> => {
    if (disposed) return Promise.resolve(result('stale', null, { ignored: true }))
    if (conflict && !options.force) {
      return Promise.resolve(result('conflict', null, {
        error: lastError, latest: cloneDraft(conflict.latest), latestNote: conflict.latestNote,
        latestRevision: conflict.latestRevision, deleted: conflict.deleted,
      }))
    }
    if (!options.force && !isDirty() && !active) {
      markPhase()
      return Promise.resolve(result('noop', null))
    }
    const intent = captureIntent(options)
    if (active) {
      if (!pending) pending = { waiters: [] }
      return new Promise((resolve) => pending?.waiters.push(resolve))
    }
    return runSave(intent)
  }

  const keepEditing = () => result('keep-editing', conflict?.saveSequence ?? null, { deleted: conflict?.deleted })

  const viewLatest = (): EditorSaveResult => {
    if (!conflict) return result('noop', null)
    if (conflict.deleted) return keepEditing()
    draft = cloneDraft(conflict.latest)
    committedDraft = cloneDraft(conflict.latest)
    revision = conflict.latestRevision
    noteKey = draft.id
    draftVersion += 1
    conflict = null
    lastError = null
    markPhase()
    syncRecovery()
    return result('view-latest', null)
  }

  const keepMine = (): Promise<EditorSaveResult> => {
    if (!conflict) return Promise.resolve(result('noop', null))
    if (conflict.deleted) {
      noteKey = ''
      revision = 0
      committedDraft = null
      draft = { ...cloneDraft(draft), id: '' }
      draftVersion += 1
      conflict = null
      lastError = null
      markPhase()
      syncRecovery()
      return save({ force: true })
    }
    committedDraft = cloneDraft(conflict.latest)
    revision = conflict.latestRevision
    noteKey = committedDraft.id
    conflict = null
    lastError = null
    markPhase()
    syncRecovery()
    return save({ force: true })
  }

  const applyExternalSnapshot = (note: Note) => {
    if (disposed) return { ignored: true, state: state() }
    const latest = draftFromNote(note, 'External note')
    const latestRevision = validRevision(note.revision, false) ? note.revision : revision
    if (latestRevision <= revision) return { ignored: true, state: state() }
    const inFlightDraft = activeIntent?.draft
    const matchesInFlightSave = Boolean(active && inFlightDraft && draftsEqual({ ...inFlightDraft, id: latest.id }, latest))
    if (matchesInFlightSave) {
      committedDraft = cloneDraft(latest)
      revision = latestRevision
      noteKey = latest.id
      if (!draft.id && !inFlightDraft?.id) draft = { ...draft, id: latest.id }
      conflict = null
      lastError = null
      markPhase()
      syncRecovery()
      return { applied: true, state: state() }
    }
    if (isDirty() || active) {
      conflict = {
        code: 'NOTE_CONFLICT', deleted: false, latest, latestNote: { ...note }, latestRevision,
        draft: cloneDraft(draft), attemptedDraft: cloneDraft(draft), expectedRevision: revision, saveSequence,
      }
      committedDraft = cloneDraft(latest)
      revision = latestRevision
      noteKey = latest.id
      markPhase()
      syncRecovery()
      return { conflict: true, state: state() }
    }
    committedDraft = cloneDraft(latest)
    draft = cloneDraft(latest)
    revision = latestRevision
    noteKey = latest.id
    draftVersion += 1
    conflict = null
    lastError = null
    markPhase()
    syncRecovery()
    return { applied: true, state: state() }
  }

  const dispose = ({ discardRecovery = false }: { discardRecovery?: boolean } = {}) => {
    if (disposed) return
    if (isDirty()) syncRecovery()
    disposed = true
    active = false
    activeIntent = null
    token = Symbol(`${sessionId}:disposed`)
    phase = 'disposed'
    if (discardRecovery) recoveryStore?.remove(identity)
    if (pending) {
      resolvePending(pending.waiters, result('stale', null, { ignored: true }))
      pending = null
    }
  }

  const session: EditorSession = {
    get pane() { return pane },
    get sessionId() { return sessionId },
    get noteId() { return noteKey },
    get baseRevision() { return revision },
    get currentDraft() { return cloneDraft(draft) },
    get committedSnapshot() { return committedDraft ? cloneDraft(committedDraft) : null },
    get draftVersion() { return draftVersion },
    get saveSequence() { return saveSequence },
    get phase() { return phase },
    get status() { return phase },
    get dirty() { return isDirty() },
    get saving() { return active },
    get conflict() { return state().conflict },
    getState: state,
    isDirty,
    hasUnsavedChanges: isDirty,
    captureDraft: () => cloneDraft(draft),
    updateDraft,
    setDraft: updateDraft,
    save,
    keepMine,
    retryKeepMine: keepMine,
    keepEditing,
    viewLatest,
    applyExternalSnapshot,
    dispose,
  }
  syncRecovery()
  return Object.freeze(session)
}
