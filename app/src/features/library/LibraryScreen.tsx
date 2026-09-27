import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  FileText,
  Filter,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { BackupIcon, ComfortableLayoutIcon, CompactLayoutIcon, GridLayoutIcon, SettingsIcon, ThemeIcon } from '@/components/NookIcons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNook } from '@/app/NookContext'
import type { BackupInspection, Note } from '@/domain/contracts'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useTheme, type ThemeMode } from '@/features/theme/ThemeProvider'
import { backupStatus, FilterList, NoteCard, TypeDot } from './LibraryComponents'
import type { Filters, LayoutMode, SortMode } from './library.types'
import { sameLocalDay } from './library.utils'
import './library.css'

interface LibraryReturnState {
  filters: Filters
  sort: SortMode
  layout: LayoutMode
  collapsed: boolean
  query: string
  page: number
  scrollY: number
  focusKey: string | null
}

let libraryReturnState: LibraryReturnState | null = null

interface Confirmation {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  run: () => Promise<void>
}

const PAGE_SIZE = 30
const FILTER_STORAGE_KEY = 'nook:active-filters'
const SORT_STORAGE_KEY = 'nook:notes-sort'
const VIEW_STORAGE_KEY = 'nook:notes-view-mode'
const SIDEBAR_STORAGE_KEY = 'nook:sidebar-collapsed'
const THEME_LABELS: Record<ThemeMode, string> = {
  auto: 'Auto',
  light: 'Light',
  coffee: 'Coffee',
  forest: 'Forest',
  midnight: 'Midnight',
  dark: 'Dark',
  retro: 'Retro',
}
const SORT_LABELS: Record<SortMode, string> = {
  'created-desc': 'Newest created',
  'created-asc': 'Oldest created',
  'updated-desc': 'Newest updated',
  'updated-asc': 'Oldest updated',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
}

function readFilters(): Filters {
  const defaults: Filters = { typeId: 'all', tagIds: [], createdToday: false, updatedToday: false, trashOnly: false }
  try {
    const value = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) || 'null') as Partial<Filters> | null
    if (!value) return defaults
    return {
      typeId: typeof value.typeId === 'string' && value.typeId ? value.typeId : 'all',
      tagIds: Array.isArray(value.tagIds) ? [...new Set(value.tagIds.filter((id): id is string => typeof id === 'string'))] : [],
      createdToday: value.createdToday === true || (value as { todayOnly?: boolean }).todayOnly === true,
      updatedToday: value.updatedToday === true || (value as { updatedTodayOnly?: boolean }).updatedTodayOnly === true,
      trashOnly: value.trashOnly === true,
    }
  } catch {
    return defaults
  }
}

function readStoredSort(): SortMode {
  try {
    const value = window.localStorage.getItem(SORT_STORAGE_KEY)
    return value && Object.hasOwn(SORT_LABELS, value) ? value as SortMode : 'created-desc'
  } catch {
    return 'created-desc'
  }
}

function readLayout(): LayoutMode {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return value === 'compact' || value === 'grid' ? value : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function savePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Current-session preferences still work when local storage is blocked.
  }
}

function compareDate(left: string, right: string): number {
  const leftValue = Date.parse(left)
  const rightValue = Date.parse(right)
  if (Number.isNaN(leftValue) && Number.isNaN(rightValue)) return 0
  if (Number.isNaN(leftValue)) return 1
  if (Number.isNaN(rightValue)) return -1
  return leftValue - rightValue
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'That action could not be completed.'
}

export function LibraryScreen({ workspaceActive = false }: { workspaceActive?: boolean }) {
  const { repository, snapshot, mutate, openNote, createNote, hasDirtyDrafts } = useNook()
  const { theme, cycleTheme } = useTheme()
  const [returningFromWorkspace] = useState(() => libraryReturnState)
  const [filters, setFilters] = useState<Filters>(() => returningFromWorkspace?.filters ?? readFilters())
  const [sort, setSort] = useState<SortMode>(() => returningFromWorkspace?.sort ?? readStoredSort())
  const [layout, setLayout] = useState<LayoutMode>(() => returningFromWorkspace?.layout ?? readLayout())
  const [collapsed, setCollapsed] = useState(() => returningFromWorkspace?.collapsed ?? readSidebarCollapsed())
  const [sidebarMotion, setSidebarMotion] = useState<'idle' | 'collapsing' | 'expanding'>('idle')
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const [query, setQuery] = useState(() => returningFromWorkspace?.query ?? '')
  const [page, setPage] = useState(() => returningFromWorkspace?.page ?? 1)
  const [wideGrid, setWideGrid] = useState(() => window.matchMedia?.('(min-width: 1201px)').matches ?? false)
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [busyNotes, setBusyNotes] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState<{ message: string; undoNoteId?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [pendingBackup, setPendingBackup] = useState<{ data: unknown; inspection: BackupInspection; filename: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const noteListRef = useRef<HTMLDivElement>(null)
  const layoutAnimationReadyRef = useRef(false)
  const sidebarTargetRef = useRef(collapsed)
  const sidebarTimersRef = useRef<number[]>([])
  const clearSidebarTimers = useCallback(() => {
    sidebarTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    sidebarTimersRef.current = []
  }, [])
  const toggleSidebar = useCallback(() => {
    const nextCollapsed = !sidebarTargetRef.current
    sidebarTargetRef.current = nextCollapsed
    clearSidebarTimers()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduceMotion || window.innerWidth < 768) {
      setSidebarMotion('idle')
      setSidebarResizing(false)
      setCollapsed(nextCollapsed)
      return
    }

    if (nextCollapsed === collapsed) {
      setSidebarMotion('idle')
      setSidebarResizing(false)
      return
    }

    setSidebarMotion(nextCollapsed ? 'collapsing' : 'expanding')
    setSidebarResizing(true)
    sidebarTimersRef.current = [
      window.setTimeout(() => setCollapsed(nextCollapsed), 120),
      window.setTimeout(() => setSidebarMotion('idle'), 300),
      window.setTimeout(() => {
        setSidebarResizing(false)
        sidebarTimersRef.current = []
      }, 380),
    ]
  }, [clearSidebarTimers, collapsed])
  useEffect(() => () => clearSidebarTimers(), [clearSidebarTimers])
  const requestWorkspaceReturn = useCallback(() => {
    if (workspaceActive) window.dispatchEvent(new Event('nook:request-workspace-close'))
  }, [workspaceActive])
  const previousViewRef = useRef({ query, filters, sort, layout })
  const uiStateRef = useRef<LibraryReturnState>({ filters, sort, layout, collapsed, query, page, scrollY: 0, focusKey: null })
  uiStateRef.current = { filters, sort, layout, collapsed, query, page, scrollY: 0, focusKey: null }
  const rememberLibraryReturn = useCallback((focusKey: string | null) => {
    libraryReturnState = { ...uiStateRef.current, scrollY: window.scrollY, focusKey }
  }, [])
  const openNoteFromCard = useCallback((noteId: string, mode: 'preview' | 'edit', focusKey?: string) => {
    rememberLibraryReturn(focusKey ?? `note-${noteId}-${mode === 'edit' ? 'edit' : 'title'}`)
    openNote(noteId, mode)
  }, [openNote, rememberLibraryReturn])
  const openNoteWithSidePicker = useCallback((noteId: string) => {
    rememberLibraryReturn(`note-${noteId}-side-note`)
    openNote(noteId, 'preview', { openSideNotePicker: true })
  }, [openNote, rememberLibraryReturn])
  const startNewNote = useCallback(() => {
    rememberLibraryReturn('new-note')
    createNote()
  }, [createNote, rememberLibraryReturn])

  useEffect(() => {
    if (!returningFromWorkspace) return
    if (returningFromWorkspace.scrollY > 0 && window.scrollY !== returningFromWorkspace.scrollY) {
      window.scrollTo(0, returningFromWorkspace.scrollY)
    }
    if (returningFromWorkspace.focusKey) {
      const focusTarget = [...document.querySelectorAll<HTMLElement>('[data-library-focus-key]')]
        .find((element) => element.dataset.libraryFocusKey === returningFromWorkspace.focusKey)
      ;(focusTarget ?? document.getElementById('main-content'))?.focus({ preventScroll: true })
    }
    if (libraryReturnState === returningFromWorkspace) libraryReturnState = null
  }, [returningFromWorkspace])
  useEffect(() => {
    if (workspaceActive || !libraryReturnState) return
    const state = libraryReturnState
    requestAnimationFrame(() => {
      window.scrollTo(0, state.scrollY)
      const focusTarget = [...document.querySelectorAll<HTMLElement>('[data-library-focus-key]')]
        .find((element) => element.dataset.libraryFocusKey === state.focusKey)
      focusTarget?.focus({ preventScroll: true })
    })
    libraryReturnState = null
  }, [workspaceActive])

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        typeId: filters.typeId,
        tagIds: filters.tagIds,
        todayOnly: filters.createdToday,
        updatedTodayOnly: filters.updatedToday,
        trashOnly: filters.trashOnly,
      }))
    } catch { /* Current-session filters still work without local storage. */ }
  }, [filters])
  useEffect(() => savePreference(SORT_STORAGE_KEY, sort), [sort])
  useEffect(() => savePreference(VIEW_STORAGE_KEY, layout), [layout])
  useEffect(() => savePreference(SIDEBAR_STORAGE_KEY, String(collapsed)), [collapsed])
  useEffect(() => {
    const sync = () => {
      try {
        const value = Number(window.localStorage.getItem('nook:note-preview-lines'))
        const lines = Number.isInteger(value) && value >= 3 && value <= 10 ? value : 3
        document.documentElement.style.setProperty('--note-card-preview-lines', String(lines))
      } catch { document.documentElement.style.setProperty('--note-card-preview-lines', '3') }
    }
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useLayoutEffect(() => {
    if (!layoutAnimationReadyRef.current) {
      layoutAnimationReadyRef.current = true
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    noteListRef.current?.animate(
      [
        { transform: 'translateY(4px)', opacity: 0.68 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [layout])
  useEffect(() => {
    const reset = () => {
      setQuery('')
      setFilters({ typeId: 'all', tagIds: [], createdToday: false, updatedToday: false, trashOnly: false })
      setPage(1)
    }
    window.addEventListener('nook:library-reset', reset)
    return () => window.removeEventListener('nook:library-reset', reset)
  }, [])
  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia('(min-width: 1201px)')
    const update = () => setWideGrid(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const previous = previousViewRef.current
    previousViewRef.current = { query, filters, sort, layout }
    if (previous.query === query && previous.filters === filters && previous.sort === sort && previous.layout === layout) return
    setPage(1)
  }, [query, filters, sort, layout])
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (workspaceActive) return
      const target = event.target instanceof HTMLElement ? event.target : null
      const isEditingField = Boolean(target?.matches('input, textarea, select, [contenteditable="true"]'))
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'f' && !settingsOpen && !mobileFiltersOpen && !confirmation) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (modifier && event.key === '\\' && !settingsOpen && !mobileFiltersOpen && !confirmation) {
        event.preventDefault()
        toggleSidebar()
        return
      }
      if (modifier || event.altKey || event.shiftKey || isEditingField || settingsOpen || mobileFiltersOpen || confirmation) return
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key.toLowerCase() === 'v' && hoveredNoteId && !filters.trashOnly) {
        event.preventDefault()
        openNoteFromCard(hoveredNoteId, 'preview')
      } else if (event.key.toLowerCase() === 'c' && !filters.trashOnly) {
        event.preventDefault()
        startNewNote()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (event.key === '1') {
        setLayout('compact')
      } else if (event.key === '2') {
        setLayout('comfortable')
      } else if (event.key === '3') {
        setLayout('grid')
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [confirmation, filters.trashOnly, hoveredNoteId, mobileFiltersOpen, openNoteFromCard, settingsOpen, startNewNote, toggleSidebar, workspaceActive])

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const selectedTags = new Set(filters.tagIds)
    const notes = snapshot.notes.filter((note) => {
      if (Boolean(note.deletedAt) !== filters.trashOnly) return false
      if (filters.typeId !== 'all' && note.typeId !== filters.typeId) return false
      if (filters.createdToday && !sameLocalDay(note.createdAt)) return false
      if (filters.updatedToday && !sameLocalDay(note.updatedAt)) return false
      if ([...selectedTags].some((tagId) => !note.tagIds.includes(tagId))) return false
      if (!normalizedQuery) return true
      return `${note.title}\n${note.content}`.toLocaleLowerCase().includes(normalizedQuery)
    })
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    return notes.sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
      if (sort.startsWith('title')) {
        const comparison = collator.compare(left.title, right.title)
        if (comparison) return sort === 'title-asc' ? comparison : -comparison
      } else {
        const leftDate = sort.startsWith('updated') ? left.updatedAt : left.createdAt
        const rightDate = sort.startsWith('updated') ? right.updatedAt : right.createdAt
        const comparison = compareDate(leftDate, rightDate)
        if (comparison) return sort.endsWith('asc') ? comparison : -comparison
      }
      return compareDate(right.createdAt, left.createdAt) || collator.compare(left.id, right.id)
    })
  }, [snapshot.notes, filters, query, sort])

  const totalTrash = snapshot.notes.filter((note) => Boolean(note.deletedAt)).length
  const filtersCount = Number(filters.typeId !== 'all') + filters.tagIds.length + Number(filters.createdToday) + Number(filters.updatedToday)
  const typeById = useMemo(() => new Map(snapshot.types.map((type) => [type.id, type])), [snapshot.types])
  const tagById = useMemo(() => new Map(snapshot.tags.map((tag) => [tag.id, tag])), [snapshot.tags])
  const pageSize = layout === 'grid' && wideGrid ? 32 : PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(visibleNotes.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * pageSize
  const shownNotes = visibleNotes.slice(pageStart, pageStart + pageSize)
  const pageNumbers = [...new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1])]
    .filter((number) => number >= 1 && number <= pageCount)
    .sort((left, right) => left - right)

  function showError(cause: unknown) {
    setError(messageFrom(cause))
    setNotice(null)
  }

  async function runMutation<T>(operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
      setError(null)
      return { ok: true, value: await mutate(operation) }
    } catch (cause) {
      showError(cause)
      return { ok: false }
    }
  }

  function updateFilters(update: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...update }))
    requestWorkspaceReturn()
  }

  function selectSpace(trashOnly: boolean) {
    setQuery('')
    searchRef.current?.blur()
    setFilters({ typeId: 'all', tagIds: [], createdToday: false, updatedToday: false, trashOnly })
    setNotice(null)
    requestWorkspaceReturn()
  }

  function clearFilters() {
    setQuery('')
    updateFilters({ typeId: 'all', tagIds: [], createdToday: false, updatedToday: false })
  }

  function toggleType(id: string) {
    updateFilters({ typeId: filters.typeId === id ? 'all' : id })
  }

  function toggleTag(id: string) {
    updateFilters({ tagIds: filters.tagIds.includes(id) ? filters.tagIds.filter((item) => item !== id) : [...filters.tagIds, id] })
  }

  async function withBusyNote(noteId: string, operation: () => Promise<void>) {
    setBusyNotes((current) => new Set(current).add(noteId))
    try {
      await operation()
    } finally {
      setBusyNotes((current) => {
        const next = new Set(current)
        next.delete(noteId)
        return next
      })
    }
  }

  function moveToTrash(note: Note) {
    void withBusyNote(note.id, async () => {
      const result = await runMutation(() => repository.deleteNote(note.id))
      if (result.ok) {
        setNotice({ message: `${note.title || 'Untitled note'} moved to Trash.`, undoNoteId: note.id })
        setError(null)
      }
    })
  }

  function undoTrash() {
    if (!notice?.undoNoteId) return
    const noteId = notice.undoNoteId
    void runMutation(() => repository.restoreNote(noteId)).then((result) => {
      if (result.ok) setNotice({ message: 'Note restored.' })
    })
  }

  function askPermanentDelete(note: Note) {
    setConfirmation({
      title: 'Delete this note permanently?',
      description: `“${note.title || 'Untitled note'}” and its saved history will be removed from this browser. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      run: async () => {
        const result = await runMutation(() => repository.permanentlyDeleteNote(note.id))
        if (result.ok) setNotice({ message: 'Note permanently deleted.' })
      },
    })
  }

  function askEmptyTrash() {
    if (!totalTrash) return
    setConfirmation({
      title: 'Empty Trash?',
      description: `${totalTrash} ${totalTrash === 1 ? 'note' : 'notes'} and their saved history will be permanently removed from this browser. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      destructive: true,
      run: async () => {
        const result = await runMutation(() => repository.emptyTrash())
        if (result.ok) setNotice({ message: `${result.value} ${result.value === 1 ? 'note' : 'notes'} permanently deleted.` })
      },
    })
  }

  async function copyNote(note: Note) {
    try {
      await navigator.clipboard.writeText(note.content)
      setError(null)
    } catch {
      setError('Clipboard access is unavailable. Open the note to copy its Markdown.')
    }
  }

  async function exportBackup(): Promise<void> {
    try {
      const backup = await repository.buildExport()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `nook-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      try {
        const timestamp = new Date().toISOString()
        window.localStorage.setItem('nook:backup-health', JSON.stringify({ trackingStartedAt: timestamp, lastDownloadRequestedAt: timestamp }))
        window.dispatchEvent(new Event('nook:backup-requested'))
      } catch { /* Backup download still succeeds when preferences cannot be stored. */ }
      setNotice({ message: 'Backup download requested. Check your browser downloads before removing local data.' })
      setError(null)
    } catch (cause) {
      showError(cause)
    }
  }

  async function inspectBackupFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (hasDirtyDrafts) {
      setError('Save or close open note drafts before replacing the library.')
      return
    }
    try {
      const data: unknown = JSON.parse(await file.text())
      const inspection = repository.inspectBackup(data)
      setSettingsOpen(true)
      setError(null)
      setNotice({ message: `Backup ready: ${inspection.counts.notes} notes, ${inspection.counts.types} types, and ${inspection.counts.tags} tags. Confirm replacement in Settings.` })
      setPendingBackup({ data, inspection, filename: file.name })
    } catch (cause) {
      showError(cause)
    }
  }

  async function confirmBackupImport(): Promise<void> {
    if (!pendingBackup) return
    const result = await runMutation(() => repository.importBackup(pendingBackup.data))
    if (result.ok) {
      setPendingBackup(null)
      setNotice({ message: `Imported ${result.value.counts.notes} notes from ${pendingBackup.filename}.` })
      setError(null)
    }
  }

  function changeLayout(nextLayout: LayoutMode) {
    setLayout(nextLayout)
  }

  function removeFilter(kind: 'type' | 'created' | 'updated'): void
  function removeFilter(kind: 'tag', tagId: string): void
  function removeFilter(kind: 'type' | 'tag' | 'created' | 'updated', tagId?: string) {
    if (kind === 'type') updateFilters({ typeId: 'all' })
    if (kind === 'tag' && tagId) updateFilters({ tagIds: filters.tagIds.filter((id) => id !== tagId) })
    if (kind === 'created') updateFilters({ createdToday: false })
    if (kind === 'updated') updateFilters({ updatedToday: false })
  }

  const filterPanelProps = {
    types: snapshot.types,
    tags: snapshot.tags,
    notes: snapshot.notes,
    filters,
    onToggleType: toggleType,
    onToggleTag: toggleTag,
    onToggleCreatedToday: () => updateFilters({ createdToday: !filters.createdToday }),
    onToggleUpdatedToday: () => updateFilters({ updatedToday: !filters.updatedToday }),
    onClear: clearFilters,
    onSpace: selectSpace,
    searchActive: Boolean(query.trim()),
    collapsed,
    onToggleSidebar: toggleSidebar,
  }
  const searchShortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ F' : 'Ctrl F'

  return <div className={`nook-library-shell bg-background ${collapsed ? 'sidebar-collapsed' : ''} ${sidebarMotion !== 'idle' ? `is-sidebar-${sidebarMotion}` : ''} ${sidebarResizing ? 'is-sidebar-resizing' : ''} ${workspaceActive ? 'workspace-active' : ''}`}>
    <aside className="nook-desktop-sidebar rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm" aria-label="Library navigation"><FilterList {...filterPanelProps} /></aside>
    <main id={workspaceActive ? 'library-content' : 'main-content'} tabIndex={-1} className="nook-library-main" inert={workspaceActive} aria-hidden={workspaceActive}>
      <header className="nook-topbar">
        <div className="nook-mobile-heading">
          <Button variant="outline" size="sm" onClick={() => setMobileFiltersOpen(true)}>{filters.trashOnly ? <Trash2 aria-hidden="true" /> : <FileText aria-hidden="true" />}{filters.trashOnly ? 'Trash' : 'All notes'}</Button>
        </div>
        <div className="nook-search-wrap text-muted-foreground"><Search size={17} aria-hidden="true" /><Input ref={searchRef} name="search-notes" autoComplete="off" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search title or content…" aria-label="Search title or content" />{query && <Button variant="ghost" size="icon-xs" aria-label="Clear search" onClick={() => setQuery('')}><X /></Button>}<kbd className="rounded border border-border px-1.5 py-0.5 text-xs" aria-label={`${searchShortcut} focuses search`}>{searchShortcut}</kbd></div>
        <div className="nook-sort-wrap"><Select items={SORT_LABELS} value={sort} onValueChange={(value) => { if (value) setSort(value as SortMode) }}><SelectTrigger aria-label="Sort notes"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="nook-topbar-divider hidden sm:block" aria-hidden="true" />
        <div className="nook-topbar-actions">
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="outline" className="nook-theme-button" aria-label={`Current theme: ${THEME_LABELS[theme]}. Switch theme`} title={`Theme: ${THEME_LABELS[theme]}`} onClick={cycleTheme}>
                <ThemeIcon theme={theme} />
                <span className="nook-button-label">{THEME_LABELS[theme]}</span>
              </Button>
            } />
            <TooltipContent role="tooltip">Theme: {THEME_LABELS[theme]} · T</TooltipContent>
          </Tooltip>
          <Button variant="outline" className="nook-mobile-filter-button" aria-label={filtersCount ? `Filters, ${filtersCount} active` : 'Filters and sort'} onClick={() => setMobileFiltersOpen(true)}><Filter aria-hidden="true" /></Button>
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="outline" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
                <span className="nook-button-label">Settings</span>
              </Button>
            } />
            <TooltipContent role="tooltip">Settings · S</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="outline" aria-label="Backup" onClick={() => void exportBackup()}>
                <BackupIcon />
                <span className="nook-button-label">Backup</span>
              </Button>
            } />
            <TooltipContent role="tooltip">Export backup</TooltipContent>
          </Tooltip>
          {!filters.trashOnly && (
            <Tooltip>
              <TooltipTrigger render={
                <Button data-library-focus-key="new-note" aria-label="New note" className="nook-new-note-btn font-medium" onClick={startNewNote}>
                  <Plus className="size-4" strokeWidth={2} />
                  <span>New note</span>
                </Button>
              } />
              <TooltipContent role="tooltip">New note · C</TooltipContent>
            </Tooltip>
          )}
          {filters.trashOnly && <Button variant="destructive" disabled={!totalTrash} onClick={askEmptyTrash}><Trash2 className="size-4" /> Empty Trash</Button>}
          <input ref={fileInputRef} className="hidden" tabIndex={-1} type="file" accept="application/json,.json" aria-label="Choose a Nook backup file" onChange={(event) => { void inspectBackupFile(event) }} />
        </div>
      </header>

      <section className="nook-browse-panel min-h-svh rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="browse-title">
        <div className="nook-browse-heading border-b border-border pb-4">
          <div>
            <div className="nook-browse-title-row flex items-center gap-2.5">
              <h1 id="browse-title" className="text-lg font-semibold tracking-tight text-foreground">{filters.trashOnly ? 'Trash' : 'All notes'}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{filters.trashOnly ? 'Deleted notes stay here until you restore or permanently remove them.' : 'Browse, search, and manage your complete collection of personal notes.'}</p>
          </div>
          <div className="nook-layout-toggle" role="group" aria-label="Note layout">
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  variant={layout === 'compact' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label="Compact layout"
                  aria-pressed={layout === 'compact'}
                  onClick={() => changeLayout('compact')}
                >
                  <CompactLayoutIcon />
                </Button>
              } />
              <TooltipContent role="tooltip">Compact view · 1</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  variant={layout === 'comfortable' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label="Comfortable layout"
                  aria-pressed={layout === 'comfortable'}
                  onClick={() => changeLayout('comfortable')}
                >
                  <ComfortableLayoutIcon />
                </Button>
              } />
              <TooltipContent role="tooltip">Comfortable view · 2</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  variant={layout === 'grid' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label="Grid layout"
                  aria-pressed={layout === 'grid'}
                  onClick={() => changeLayout('grid')}
                >
                  <GridLayoutIcon />
                </Button>
              } />
              <TooltipContent role="tooltip">Grid view · 3</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {!filters.trashOnly && <div className="nook-quick-types" role="group" aria-label="Quick filter by note type"><Button size="sm" variant={filters.typeId === 'all' ? 'secondary' : 'ghost'} aria-pressed={filters.typeId === 'all'} onClick={() => updateFilters({ typeId: 'all' })}>All {snapshot.notes.filter((note) => !note.deletedAt).length}</Button>{snapshot.types.map((type) => <Button key={type.id} size="sm" variant={filters.typeId === type.id ? 'secondary' : 'ghost'} aria-pressed={filters.typeId === type.id} onClick={() => toggleType(type.id)}><TypeDot color={type.color} />{type.name} {snapshot.notes.filter((note) => !note.deletedAt && note.typeId === type.id).length}</Button>)}</div>}
        <div className="nook-active-filters" role="group" aria-label="Active filters">
          {query && <button type="button" onClick={() => setQuery('')} className="nook-filter-pill rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">Search: {query}<X size={13} aria-hidden="true" /></button>}
          {filters.typeId !== 'all' && <button type="button" onClick={() => removeFilter('type')} className="nook-filter-pill rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"><TypeDot color={typeById.get(filters.typeId)?.color ?? 'slate'} />{typeById.get(filters.typeId)?.name ?? 'Type'}<X size={13} aria-hidden="true" /></button>}
          {filters.createdToday && <button type="button" onClick={() => removeFilter('created')} className="nook-filter-pill rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">Created Today<X size={13} aria-hidden="true" /></button>}
          {filters.updatedToday && <button type="button" onClick={() => removeFilter('updated')} className="nook-filter-pill rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">Updated Today<X size={13} aria-hidden="true" /></button>}
          {filters.tagIds.map((id) => <button key={id} type="button" onClick={() => removeFilter('tag', id)} className="nook-filter-pill rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">#{tagById.get(id)?.name ?? 'tag'}<X size={13} aria-hidden="true" /></button>)}
          {filtersCount > 0 && <Button type="button" variant="secondary" size="xs" className="nook-clear-filters rounded-full border border-border px-2.5" onClick={clearFilters}>Clear all</Button>}
        </div>
        {error && <div className="nook-library-alert my-3 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive" role="alert">{error}<button className="inline-flex" type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={14} /></button></div>}
        {notice && <div className="nook-library-notice my-3 flex items-center justify-between gap-3 rounded-md border border-border bg-muted p-2 text-sm text-foreground" role="status">{notice.message}{notice.undoNoteId && <Button className="ml-auto" variant="ghost" size="sm" onClick={undoTrash}><Undo2 /> Undo</Button>}<button className="inline-flex" type="button" aria-label="Dismiss status" onClick={() => setNotice(null)}><X size={14} /></button></div>}
        {shownNotes.length ? <div ref={noteListRef} className={`nook-note-list nook-note-list--${layout}`}>
          {shownNotes.map((note) => <NoteCard
            key={note.id}
            note={note}
            type={typeById.get(note.typeId)}
            tags={note.tagIds.flatMap((id) => {
              const tag = tagById.get(id)
              return tag ? [tag] : []
            })}
            trash={filters.trashOnly}
            sort={sort}
            busy={busyNotes.has(note.id)}
            layout={layout}
            onOpen={(focusKey) => openNoteFromCard(note.id, 'preview', focusKey)}
            onOpenWithSideNote={() => openNoteWithSidePicker(note.id)}
            onEdit={() => openNoteFromCard(note.id, 'edit')}
            onPin={() => { void runMutation(() => repository.setNotePinned(note.id, !note.isPinned)) }}
            onCopy={() => { void copyNote(note) }}
            onTrash={() => moveToTrash(note)}
            onRestore={() => { void runMutation(() => repository.restoreNote(note.id)).then((result) => { if (result.ok) setNotice({ message: 'Note restored.' }) }) }}
            onPermanentlyDelete={() => askPermanentDelete(note)}
            onTag={toggleTag}
            onType={() => toggleType(note.typeId)}
            onHover={setHoveredNoteId}
          />)}
        </div> : <div className="nook-empty-state"><div className="nook-empty-icon grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">{filters.trashOnly ? <Trash2 /> : <Search />}</div><h3 className="m-0 text-base font-semibold">{filters.trashOnly ? 'Trash is empty' : query || filtersCount ? 'No matching notes' : 'Your library is ready'}</h3><p className="max-w-sm text-sm text-muted-foreground">{filters.trashOnly ? 'Notes you move to Trash will appear here.' : query || filtersCount ? 'Try changing your search or clearing some filters.' : 'Create a note to start collecting ideas, work, and learning.'}</p>{!filters.trashOnly && !query && filtersCount === 0 && <Button data-library-focus-key="new-note" onClick={startNewNote}><Plus /> New note</Button>}{(query || filtersCount > 0) && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}</div>}
        <footer className="nook-list-footer">
          <p className="nook-result-line" aria-live="polite">{visibleNotes.length
            ? `Showing ${pageStart + 1}–${pageStart + shownNotes.length} of ${visibleNotes.length} ${visibleNotes.length === 1 ? 'note' : 'notes'}`
            : 'Showing 0 notes'}</p>
          {pageCount > 1 && <nav className="nook-pagination" aria-label="Notes pagination">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
            {pageNumbers.map((number, index) => <span key={number} className="contents">
              {index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true" className="nook-pagination-ellipsis">…</span>}
              <Button variant={currentPage === number ? 'secondary' : 'outline'} size="sm" aria-label={`Page ${number}`} aria-current={currentPage === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</Button>
            </span>)}
            <Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
          </nav>}
        </footer>
      </section>
    </main>

    {!workspaceActive && <nav className="nook-mobile-nav" aria-label="Mobile navigation">
      <Button type="button" variant={!filters.trashOnly ? 'secondary' : 'ghost'} aria-label="Open all notes" aria-current={!filters.trashOnly ? 'page' : undefined} onClick={() => selectSpace(false)}><FileText aria-hidden="true" /><span>Notes</span></Button>
      <Button type="button" variant="ghost" aria-label="Search notes" onClick={() => setMobileFiltersOpen(true)}><Search aria-hidden="true" /><span>Search</span></Button>
      <Button type="button" className="nook-mobile-nav__create" aria-label="Create note" onClick={() => { if (filters.trashOnly) selectSpace(false); startNewNote() }}><Plus aria-hidden="true" /></Button>
      <Button type="button" variant={filters.trashOnly ? 'secondary' : 'ghost'} aria-label="Open Trash" aria-current={filters.trashOnly ? 'page' : undefined} onClick={() => selectSpace(true)}><Trash2 aria-hidden="true" /><span>Trash</span></Button>
      <Button type="button" variant="ghost" aria-label="Open mobile settings" onClick={() => setSettingsOpen(true)}><SettingsIcon className="size-4" aria-hidden="true" /><span>Settings</span></Button>
    </nav>}

    <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
      <SheetContent side="bottom" className="nook-mobile-filter-sheet p-0" showCloseButton={false}>
        <div className="nook-mobile-search-heading"><SheetTitle>Search &amp; filters</SheetTitle><Button type="button" variant="ghost" size="icon" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)}><X aria-hidden="true" /></Button></div>
        <SheetDescription className="sr-only">Search, sort, and filter notes in this browser.</SheetDescription>
        <div className="nook-mobile-search-controls"><Input name="mobile-search-notes" autoComplete="off" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search title or content…" aria-label="Search notes" /><Select items={SORT_LABELS} value={sort} onValueChange={(value) => { if (value) setSort(value as SortMode) }}><SelectTrigger aria-label="Sort notes in filters"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <FilterList {...filterPanelProps} onCloseMobile={() => setMobileFiltersOpen(false)} />
      </SheetContent>
    </Sheet>
    <SettingsDialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      pendingBackup={pendingBackup}
      onConfirmBackupImport={confirmBackupImport}
      onCancelBackupImport={() => setPendingBackup(null)}
      onExportBackup={() => void exportBackup()}
      onRequestImportBackup={() => fileInputRef.current?.click()}
      hasDirtyDrafts={hasDirtyDrafts}
      notice={notice?.message ?? null}
      error={error}
      clearFeedback={() => { setNotice(null); setError(null) }}
      backupLabel={backupStatus().label}
      onOpenNotes={() => { setSettingsOpen(false); selectSpace(false) }}
      onOpenSearch={() => { setSettingsOpen(false); setMobileFiltersOpen(true) }}
      onCreateNote={() => { setSettingsOpen(false); startNewNote() }}
      onOpenTrash={() => { setSettingsOpen(false); selectSpace(true) }}
    />
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(isOpen) => { if (!isOpen) setConfirmation(null) }}>
      <AlertDialogContent className="nook-confirm-dialog">
        <AlertDialogHeader className="nook-confirm-dialog-header"><AlertDialogTitle>{confirmation?.title ?? 'Confirm action'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter className="nook-confirm-dialog-footer"><AlertDialogCancel onClick={() => setConfirmation(null)}>Cancel</AlertDialogCancel><AlertDialogAction variant={confirmation?.destructive ? 'destructive' : 'default'} onClick={() => { const action = confirmation?.run; setConfirmation(null); if (action) void action() }}>{confirmation?.confirmLabel ?? 'Confirm'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
