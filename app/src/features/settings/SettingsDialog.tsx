import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Archive, ArrowLeft, Check, ChevronRight, Download, FileText, HardDrive, Plus, RotateCcw, Search, Settings2, Trash2, X } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNook } from '@/app/NookContext'
import { useOfflineStatus } from '@/app/OfflineContext'
import type { BackupInspection, NoteType } from '@/domain/contracts'
import { THEME_MODES, useTheme, type ThemeMode } from '@/features/theme/ThemeProvider'
import { createDraftRecoveryStore } from '@/features/editor-session/session'
import './settings.css'

type SettingsTab = 'types' | 'tags' | 'display' | 'data' | 'shortcuts'

interface PendingBackup {
  data: unknown
  inspection: BackupInspection
  filename: string
}

interface Props {
  open: boolean
  onClose: () => void
  pendingBackup: PendingBackup | null
  onConfirmBackupImport: () => Promise<void>
  onCancelBackupImport: () => void
  onExportBackup: () => void
  onRequestImportBackup: () => void
  hasDirtyDrafts: boolean
  notice: string | null
  error: string | null
  clearFeedback: () => void
  backupLabel: string
  onOpenNotes: () => void
  onOpenSearch: () => void
  onCreateNote: () => void
  onOpenTrash: () => void
}

interface PromptInstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface ConfirmAction {
  title: string
  description: string
  label: string
  destructive?: boolean
  run: () => Promise<void>
}

const THEME_LABELS: Record<ThemeMode, string> = {
  auto: 'Auto',
  light: 'Light',
  coffee: 'Coffee',
  forest: 'Forest',
  midnight: 'Midnight',
  dark: 'Dark',
  retro: 'Retro',
}

const THEME_PICKER_MODES: ThemeMode[] = ['auto', ...THEME_MODES.filter((mode) => mode !== 'auto')]

function humanError(error: unknown): string {
  return error instanceof Error ? error.message : 'That change could not be saved.'
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = value / 1024
  let unit = units[0]
  for (let index = 1; amount >= 1024 && index < units.length; index += 1) {
    amount /= 1024
    unit = units[index]
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`
}

function TypeColorDot({ color }: { color: string }) {
  return <span className="nook-settings-type-dot rounded-full" data-type-color={color} aria-hidden="true" />
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  return <span className="nook-theme-preview" data-theme-preview={mode} aria-hidden="true" />
}

function TypeColorSelect({
  value,
  colors,
  onValueChange,
  ariaLabel,
  id,
  className,
}: {
  value: string
  colors: readonly string[]
  onValueChange(value: string): void
  ariaLabel: string
  id?: string
  className?: string
}) {
  return <Select value={value} onValueChange={(next) => { if (next) onValueChange(next) }}>
    <SelectTrigger id={id} className={`nook-color-select-trigger ${className ?? ''}`} aria-label={ariaLabel}>
      <TypeColorDot color={value} />
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="nook-color-select-menu" align="start" alignItemWithTrigger={false}>
      {colors.map((color) => <SelectItem key={color} value={color} className="nook-color-select-option"><TypeColorDot color={color} /><span>{color}</span></SelectItem>)}
    </SelectContent>
  </Select>
}

export function SettingsDialog({
  open,
  onClose,
  pendingBackup,
  onConfirmBackupImport,
  onCancelBackupImport,
  onExportBackup,
  onRequestImportBackup,
  hasDirtyDrafts,
  notice,
  error,
  clearFeedback,
  backupLabel,
  onOpenNotes,
  onOpenSearch,
  onCreateNote,
  onOpenTrash,
}: Props) {
  const { snapshot, repository, mutate } = useNook()
  const { status: updateStatus, updateAvailable, canApplyUpdate, message: updateMessage, applyUpdate } = useOfflineStatus()
  const { theme, setTheme } = useTheme()
  const [previewLines, setPreviewLines] = useState(() => {
    try {
      const value = Number(window.localStorage.getItem('nook:note-preview-lines'))
      return Number.isInteger(value) && value >= 3 && value <= 10 ? value : 3
    } catch { return 3 }
  })
  const [activeTab, setActiveTab] = useState<SettingsTab>('types')
  const [mobileHome, setMobileHome] = useState(false)
  const mobileBackRef = useRef<HTMLButtonElement>(null)
  const mobileBackupRef = useRef<HTMLButtonElement>(null)
  const [typeQuery, setTypeQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [newTypeOpen, setNewTypeOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState('indigo')
  const [newTagOpen, setNewTagOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [editingType, setEditingType] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('indigo')
  const [working, setWorking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deletePhrase, setDeletePhrase] = useState('')
  const [storageInfo, setStorageInfo] = useState<{ usage?: number; quota?: number; persisted?: boolean; message: string }>({ message: 'Storage usage has not been checked yet.' })
  const [storageBusy, setStorageBusy] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<PromptInstallEvent | null>(null)
  const [installStatus, setInstallStatus] = useState('Open Nook from HTTPS or localhost to check whether this browser can install it.')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (open) {
      setActiveTab(pendingBackup ? 'data' : 'types')
      setMobileHome(Boolean(window.matchMedia?.('(max-width: 700px)').matches) && !pendingBackup)
      setLocalError(null)
      setLocalMessage(null)
    }
  }, [open, pendingBackup?.filename])

  function openMobileTab(tab: SettingsTab) {
    setActiveTab(tab)
    setMobileHome(false)
    requestAnimationFrame(() => mobileBackRef.current?.focus())
  }

  function showMobileHome() {
    setMobileHome(true)
    requestAnimationFrame(() => mobileBackupRef.current?.focus())
  }

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as PromptInstallEvent)
      setInstallStatus('Nook is ready to install from this browser.')
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setInstallStatus('Nook has been installed in this browser.')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      setInstallStatus('Nook is running as an installed app.')
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!open || activeTab !== 'data') return
    let active = true
    async function readStorageInfo() {
      const storage = navigator.storage
      if (!storage?.estimate) {
        if (active) setStorageInfo({ message: 'This browser does not report local storage usage.' })
        return
      }
      try {
        const estimate = await storage.estimate()
        const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : undefined
        if (active) setStorageInfo({ usage: estimate.usage, quota: estimate.quota, persisted, message: 'Usage and quota are approximate browser estimates.' })
      } catch {
        if (active) setStorageInfo({ message: 'Storage usage is unavailable in this browser.' })
      }
    }
    void readStorageInfo()
    return () => { active = false }
  }, [activeTab, open])

  useEffect(() => {
    const sync = () => {
      try {
        const value = Number(window.localStorage.getItem('nook:note-preview-lines'))
        setPreviewLines(Number.isInteger(value) && value >= 3 && value <= 10 ? value : 3)
      } catch { setPreviewLines(3) }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function changePreviewLines(value: number) {
    const next = Math.max(3, Math.min(10, Math.round(value)))
    setPreviewLines(next)
    document.documentElement.style.setProperty('--note-card-preview-lines', String(next))
    try {
      if (next === 3) window.localStorage.removeItem('nook:note-preview-lines')
      else window.localStorage.setItem('nook:note-preview-lines', String(next))
    } catch { /* The current setting remains usable for this session. */ }
  }

  const activeNotes = snapshot.notes.filter((note) => !note.deletedAt)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    activeNotes.forEach((note) => counts.set(note.typeId, (counts.get(note.typeId) ?? 0) + 1))
    return counts
  }, [activeNotes])
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    activeNotes.forEach((note) => note.tagIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)))
    return counts
  }, [activeNotes])
  const typeUsage = useMemo(() => {
    const counts = new Map<string, { total: number; active: number }>()
    snapshot.notes.forEach((note) => {
      const current = counts.get(note.typeId) ?? { total: 0, active: 0 }
      counts.set(note.typeId, { total: current.total + 1, active: current.active + (note.deletedAt ? 0 : 1) })
    })
    return counts
  }, [snapshot.notes])
  const tagUsage = useMemo(() => {
    const counts = new Map<string, { total: number; active: number }>()
    snapshot.notes.forEach((note) => note.tagIds.forEach((id) => {
      const current = counts.get(id) ?? { total: 0, active: 0 }
      counts.set(id, { total: current.total + 1, active: current.active + (note.deletedAt ? 0 : 1) })
    }))
    return counts
  }, [snapshot.notes])
  const filteredTypes = snapshot.types.filter((type) => type.name.toLocaleLowerCase().includes(typeQuery.trim().toLocaleLowerCase()))
  const filteredTags = snapshot.tags.filter((tag) => tag.name.toLocaleLowerCase().includes(tagQuery.trim().toLocaleLowerCase()))
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'types', label: 'Note Types' },
    { id: 'tags', label: 'Tags' },
    { id: 'display', label: 'Display' },
    { id: 'data', label: 'Data' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ]

  async function runOperation<T>(operation: () => Promise<T>, message: string): Promise<T | undefined> {
    setWorking(true)
    setLocalError(null)
    setLocalMessage(null)
    try {
      const result = await mutate(operation)
      setLocalMessage(message)
      return result
    } catch (cause) {
      setLocalError(humanError(cause))
      return undefined
    } finally {
      setWorking(false)
    }
  }

  async function submitNewType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newTypeName.trim()
    if (!name) return
    const result = await runOperation(() => repository.addType({ name, color: newTypeColor }), `Added note type “${name}”.`)
    if (result) {
      setNewTypeName('')
      setNewTypeOpen(false)
    }
  }

  async function submitNewTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newTagName.trim()
    if (!name) return
    const result = await runOperation(() => repository.addTag({ name }), `Added tag “${name}”.`)
    if (result) {
      setNewTagName('')
      setNewTagOpen(false)
    }
  }

  function startEditType(type: NoteType) {
    setEditingType(type.id)
    setEditingTag(null)
    setEditName(type.name)
    setEditColor(type.color)
    setLocalError(null)
  }

  async function saveType(event: FormEvent<HTMLFormElement>, type: NoteType) {
    event.preventDefault()
    const name = editName.trim()
    if (!name) return
    const result = await runOperation(() => repository.updateType(type.id, { name, color: editColor }), `Updated note type “${name}”.`)
    if (result) setEditingType(null)
  }

  async function saveTag(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    const name = editName.trim()
    if (!name) return
    const result = await runOperation(() => repository.updateTag(id, { name }), `Updated tag “${name}”.`)
    if (result) setEditingTag(null)
  }

  function askDeleteType(type: NoteType) {
    const count = typeCounts.get(type.id) ?? 0
    const fallbackName = snapshot.types.find((item) => item.isFallback)?.name ?? 'General'
    setConfirmAction({
      title: `Delete “${type.name}”?`,
      description: type.isFallback
        ? 'The default note type cannot be deleted.'
        : `${count} ${count === 1 ? 'note will' : 'notes will'} move to ${fallbackName}. The change also updates the affected notes’ saved history.`,
      label: 'Delete type',
      destructive: true,
      run: async () => {
        if (type.isFallback) return
        const result = await runOperation(() => repository.deleteType(type.id), `Deleted “${type.name}”; ${count} ${count === 1 ? 'note moved' : 'notes moved'} to ${fallbackName}.`)
        if (result !== undefined) setConfirmAction(null)
      },
    })
  }

  function askDeleteTag(tag: { id: string; name: string }) {
    const count = tagCounts.get(tag.id) ?? 0
    setConfirmAction({
      title: `Delete tag “${tag.name}”?`,
      description: `${count} ${count === 1 ? 'note will have' : 'notes will have'} this tag removed. The change also updates the affected notes’ saved history.`,
      label: 'Delete tag',
      destructive: true,
      run: async () => {
        const result = await runOperation(() => repository.deleteTag(tag.id), `Deleted “${tag.name}”; removed it from ${count} ${count === 1 ? 'note' : 'notes'}.`)
        if (result !== undefined) setConfirmAction(null)
      },
    })
  }

  async function requestPersistence() {
    const storage = navigator.storage
    if (!storage?.persist) {
      setStorageInfo((current) => ({ ...current, message: 'Persistent storage is not available in this browser.' }))
      return
    }
    setStorageBusy(true)
    try {
      const persisted = await storage.persist()
      const estimate = await storage.estimate?.()
      setStorageInfo({ usage: estimate?.usage, quota: estimate?.quota, persisted, message: persisted
        ? 'The browser granted persistent storage for this origin. Keep a separate backup.'
        : 'The browser did not grant persistent storage. Your notes remain available in this browser, but may be evicted.' })
    } catch {
      setStorageInfo((current) => ({ ...current, message: 'The browser could not complete the persistence request.' }))
    } finally {
      setStorageBusy(false)
    }
  }

  async function installApp() {
    if (!installPrompt) return
    setInstalling(true)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallStatus(choice.outcome === 'accepted' ? 'Nook installation was accepted by the browser.' : 'Installation was dismissed. You can use the browser’s install option later.')
    } catch {
      setInstallStatus('The browser could not open its install prompt.')
    } finally {
      setInstallPrompt(null)
      setInstalling(false)
    }
  }

  async function deleteAllData() {
    setWorking(true)
    setLocalError(null)
    try {
      await mutate(() => repository.resetLibrary())
      const recovery = createDraftRecoveryStore()
      recovery.enumerate({ prune: false }).forEach((record) => recovery.remove(record.key))
      window.dispatchEvent(new Event('nook:library-reset'))
      setLocalMessage('All local note data was deleted.')
      setDeletePhrase('')
    } catch (cause) {
      setLocalError(humanError(cause))
    } finally {
      setWorking(false)
    }
  }

  const chosenCount = pendingBackup?.inspection.counts
  const storageHasPersisted = storageInfo.persisted === true
  const storageApi = typeof navigator !== 'undefined' ? navigator.storage : undefined
  const usagePercent = storageInfo.usage !== undefined && storageInfo.quota
    ? Math.min(100, Math.round(storageInfo.usage / storageInfo.quota * 100))
    : null
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const shortcutGroups = [
    { title: 'Library', shortcuts: [
      ['Search notes', `${modifier}+F or /`], ['New note', 'C'], ['Settings', 'S'],
      ['Switch theme', 'T'], ['Collapse sidebar', `${modifier}+\\`],
      ['Compact / Comfortable / Grid', '1 / 2 / 3'], ['Preview hovered note', 'V'],
    ] },
    { title: 'Workspace', shortcuts: [
      ['Quick save', `${modifier}+Shift+S`], ['Save and close', `${modifier}+Enter`],
      ['Edit / Split / Preview', '1 / 2 / 3'], ['Close or go back', 'Esc'],
      ['Bold / Italic / Link', `${modifier}+B / I / K`], ['Inline code', `${modifier}+E`],
      ['Numbered / Bullet list', `${modifier}+Shift+7 / 8`],
    ] },
  ] as const

  return <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { clearFeedback(); onClose() } }}>
    <DialogContent className={`nook-settings-dialog nook-settings-dialog--main p-0 ${mobileHome ? 'is-mobile-settings-home' : ''}`} showCloseButton={false}>
      <DialogHeader className="nook-settings-header flex-row items-start justify-between border-b border-border px-5 py-4">
        <div>
          <p className="nook-settings-eyebrow text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Library settings</p>
          <DialogTitle className="nook-settings-title text-xl font-bold tracking-tight text-foreground">Settings</DialogTitle>
          <DialogDescription className="sr-only">Organize note types and tags, choose appearance, manage local backups, and view keyboard shortcuts.</DialogDescription>
        </div>
        <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:text-foreground" aria-label="Close settings" onClick={() => { clearFeedback(); onClose() }}><X className="size-4" aria-hidden="true" /></Button>
      </DialogHeader>
      <section className="nook-mobile-settings-home" aria-label="Settings overview">
        <div className="nook-mobile-storage-summary rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Stored on this device</h3>
          <p className="text-sm font-medium">{backupLabel}</p>
          <p className="text-xs text-muted-foreground">Your notes stay in this browser. Keep a JSON backup somewhere safe.</p>
          <Button ref={mobileBackupRef} type="button" variant="secondary" onClick={() => openMobileTab('data')}>Backup &amp; storage</Button>
        </div>
        <div className="nook-mobile-settings-links rounded-xl border border-border bg-card">
          <button type="button" onClick={() => openMobileTab('display')}><span><strong>Appearance</strong><small>{THEME_LABELS[theme]}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" onClick={() => openMobileTab('types')}><span><strong>Note types</strong><small>{snapshot.types.length} types</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" onClick={() => openMobileTab('tags')}><span><strong>Tags</strong><small>{snapshot.tags.length} tags</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" onClick={onOpenTrash}><span><strong>Trash</strong><small>{snapshot.notes.filter((note) => note.deletedAt).length} notes</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" onClick={() => openMobileTab('shortcuts')}><span><strong>Keyboard shortcuts</strong><small>For a connected keyboard</small></span><ChevronRight aria-hidden="true" /></button>
        </div>
      </section>
      <Button ref={mobileBackRef} type="button" variant="ghost" className="nook-mobile-settings-back" onClick={showMobileHome}><ArrowLeft aria-hidden="true" /> All settings</Button>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} orientation="horizontal" className="nook-settings-layout">
        <TabsList className="nook-settings-nav" aria-label="Library settings">
          {tabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id}><span>{tab.label}</span></TabsTrigger>)}
        </TabsList>
        <div className="nook-settings-content">
          <TabsContent value="types" className="nook-settings-panel nook-catalog-panel">
            <div className="nook-settings-panel-heading flex items-center justify-between text-xs text-muted-foreground mb-1">
              <div>
                <h3 className="sr-only">Note types</h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Each note has one type. Deleting a type moves its notes to {snapshot.types.find((type) => type.isFallback)?.name || 'General'}.
                </p>
              </div>
              <span className="nook-settings-total font-medium shrink-0 ml-4">{snapshot.types.length} types</span>
            </div>
            <div className="nook-settings-search flex items-center gap-2 mb-3">
              <Input
                value={typeQuery}
                onChange={(event) => setTypeQuery(event.currentTarget.value)}
                name="settings-type-search"
                autoComplete="off"
                aria-label="Search note types"
                placeholder="Search note types…"
                className="h-9 rounded-lg"
              />
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-lg px-4 text-xs font-semibold"
                onClick={() => { setNewTypeOpen((value) => !value); setNewTypeName(''); setNewTypeColor(repository.TYPE_COLORS[0] ?? 'indigo') }}
              >
                <Plus className="size-3.5" aria-hidden="true" /> New type
              </Button>
            </div>
            {newTypeOpen && (
              <form className="nook-catalog-create flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/40 p-3 mb-2" onSubmit={(event) => { void submitNewType(event) }}>
                <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-muted-foreground">Name<Input value={newTypeName} onChange={(event) => setNewTypeName(event.currentTarget.value)} maxLength={48} required placeholder="Type name" className="h-8 rounded-md" /></label>
                <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">Color<TypeColorSelect value={newTypeColor} colors={repository.TYPE_COLORS} onValueChange={setNewTypeColor} ariaLabel="Type color" className="h-8 rounded-md" /></label>
                <Button size="sm" type="submit" className="h-8" disabled={working || !newTypeName.trim()}>Add type</Button>
                <Button size="sm" type="button" variant="outline" className="h-8" onClick={() => setNewTypeOpen(false)}>Cancel</Button>
              </form>
            )}
            <div className="nook-catalog-list rounded-xl border border-border bg-card overflow-hidden divide-y divide-border" role="list" aria-label="Note types">
              {filteredTypes.map((type) => (
                <div className="nook-catalog-row flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors" role="listitem" key={type.id}>
                  {editingType === type.id ? (
                    <form className="nook-catalog-edit flex w-full items-center justify-between gap-2" onSubmit={(event) => { void saveType(event, type) }}>
                      <div className="nook-catalog-edit-fields flex min-w-0 flex-1 items-center gap-2">
                        <label className="sr-only" htmlFor={`edit-type-name-${type.id}`}>Type name</label>
                        <Input id={`edit-type-name-${type.id}`} value={editName} onChange={(event) => setEditName(event.currentTarget.value)} maxLength={48} required className="h-8 rounded-md" />
                        <label className="sr-only" htmlFor={`edit-type-color-${type.id}`}>Type color</label>
                        <TypeColorSelect value={editColor} colors={repository.TYPE_COLORS} onValueChange={setEditColor} id={`edit-type-color-${type.id}`} ariaLabel={`Type color for ${type.name}`} className="h-8 w-28 rounded-md" />
                      </div>
                      <div className="nook-catalog-row-actions flex items-center gap-1 shrink-0">
                        <Button size="sm" className="h-8 px-2.5 text-xs" type="submit" disabled={working || !editName.trim()}><Check className="size-3.5" aria-hidden="true" /> Save</Button>
                        <Button size="sm" className="h-8 px-2.5 text-xs" type="button" variant="outline" onClick={() => setEditingType(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="nook-catalog-main flex min-w-0 items-center gap-2.5">
                        <TypeColorDot color={type.color} />
                        <strong className="truncate text-sm font-medium text-foreground">{type.name}</strong>
                        {type.isFallback && <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0.5 rounded-full">Default</Badge>}
                        <span className="nook-catalog-metadata">
                          <span>{typeUsage.get(type.id)?.active ?? 0} {(typeUsage.get(type.id)?.active ?? 0) === 1 ? 'note' : 'notes'}</span>
                          {(typeUsage.get(type.id)?.total ?? 0) > (typeUsage.get(type.id)?.active ?? 0) && <span className="nook-catalog-trash-usage" title={`${(typeUsage.get(type.id)?.total ?? 0) - (typeUsage.get(type.id)?.active ?? 0)} notes in Trash`}><Trash2 aria-hidden="true" />{(typeUsage.get(type.id)?.total ?? 0) - (typeUsage.get(type.id)?.active ?? 0)}<span className="sr-only">in Trash</span></span>}
                        </span>
                      </div>
                      <div className="nook-catalog-row-actions flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="nook-catalog-action" aria-label={`Rename type ${type.name}`} onClick={() => startEditType(type)}>Edit</Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className={`nook-catalog-action ${type.isFallback ? 'sr-only' : ''}`}
                          aria-label={`Delete type ${type.name}`}
                          disabled={type.isFallback}
                          onClick={() => askDeleteType(type)}
                        >Delete</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!filteredTypes.length && <p className="nook-settings-empty p-6 text-center text-sm text-muted-foreground">No note types match this search.</p>}
            </div>
          </TabsContent>

          <TabsContent value="tags" className="nook-settings-panel nook-catalog-panel">
            <div className="nook-settings-panel-heading flex items-center justify-between text-xs text-muted-foreground mb-1">
              <div>
                <h3 className="sr-only">Tags</h3>
                <p className="text-xs text-muted-foreground leading-normal">Tags can be shared by many notes. Deleting one removes that tag from its notes.</p>
              </div>
              <span className="nook-settings-total font-medium shrink-0 ml-4">{snapshot.tags.length} tags</span>
            </div>
            <div className="nook-settings-search flex items-center gap-2 mb-3">
              <Input
                value={tagQuery}
                onChange={(event) => setTagQuery(event.currentTarget.value)}
                name="settings-tag-search"
                autoComplete="off"
                aria-label="Search tags"
                placeholder="Search tags…"
                className="h-9 rounded-lg"
              />
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-lg px-4 text-xs font-semibold"
                onClick={() => { setNewTagOpen((value) => !value); setNewTagName('') }}
              >
                <Plus className="size-3.5" aria-hidden="true" /> New tag
              </Button>
            </div>
            {newTagOpen && (
              <form className="nook-catalog-create nook-catalog-create--tag flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/40 p-3 mb-2" onSubmit={(event) => { void submitNewTag(event) }}>
                <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-muted-foreground">Tag name<Input value={newTagName} onChange={(event) => setNewTagName(event.currentTarget.value)} maxLength={48} required placeholder="Tag name" className="h-8 rounded-md" /></label>
                <Button size="sm" type="submit" className="h-8" disabled={working || !newTagName.trim()}>Add tag</Button>
                <Button size="sm" type="button" variant="outline" className="h-8" onClick={() => setNewTagOpen(false)}>Cancel</Button>
              </form>
            )}
            <div className="nook-catalog-list rounded-xl border border-border bg-card overflow-hidden divide-y divide-border" role="list" aria-label="Tags">
              {filteredTags.map((tag) => (
                <div className="nook-catalog-row flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors" role="listitem" key={tag.id}>
                  {editingTag === tag.id ? (
                    <form className="nook-catalog-edit flex w-full items-center justify-between gap-2" onSubmit={(event) => { void saveTag(event, tag.id) }}>
                      <label className="sr-only" htmlFor={`edit-tag-name-${tag.id}`}>Tag name</label>
                      <Input id={`edit-tag-name-${tag.id}`} value={editName} onChange={(event) => setEditName(event.currentTarget.value)} maxLength={48} required className="h-8 rounded-md flex-1" />
                      <div className="nook-catalog-row-actions flex items-center gap-1 shrink-0">
                        <Button size="sm" className="h-8 px-2.5 text-xs" type="submit" disabled={working || !editName.trim()}><Check className="size-3.5" aria-hidden="true" /> Save</Button>
                        <Button size="sm" className="h-8 px-2.5 text-xs" type="button" variant="outline" onClick={() => setEditingTag(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="nook-catalog-main flex min-w-0 items-center gap-2">
                        <span className="nook-hash-mark text-xs font-medium text-muted-foreground">#</span>
                        <strong className="truncate text-sm font-medium text-foreground">{tag.name}</strong>
                        <span className="nook-catalog-metadata">
                          <span>{tagUsage.get(tag.id)?.active ?? 0} {(tagUsage.get(tag.id)?.active ?? 0) === 1 ? 'note' : 'notes'}</span>
                          {(tagUsage.get(tag.id)?.total ?? 0) > (tagUsage.get(tag.id)?.active ?? 0) && <span className="nook-catalog-trash-usage" title={`${(tagUsage.get(tag.id)?.total ?? 0) - (tagUsage.get(tag.id)?.active ?? 0)} notes in Trash`}><Trash2 aria-hidden="true" />{(tagUsage.get(tag.id)?.total ?? 0) - (tagUsage.get(tag.id)?.active ?? 0)}<span className="sr-only">in Trash</span></span>}
                        </span>
                      </div>
                      <div className="nook-catalog-row-actions flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="nook-catalog-action" aria-label={`Rename tag ${tag.name}`} onClick={() => { setEditingTag(tag.id); setEditingType(null); setEditName(tag.name); setLocalError(null) }}>Edit</Button>
                        <Button variant="destructive" size="sm" className="nook-catalog-action" aria-label={`Delete tag ${tag.name}`} onClick={() => askDeleteTag(tag)}>Delete</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!filteredTags.length && <p className="nook-settings-empty p-6 text-center text-sm text-muted-foreground">{snapshot.tags.length ? 'No tags match this search.' : 'No tags yet.'}</p>}
            </div>
          </TabsContent>

          <TabsContent value="display" className="nook-settings-panel">
            <p className="nook-settings-panel-intro text-xs text-muted-foreground">Customize how much detail appears while browsing your library.</p>
            <section className="nook-display-row border-b border-border py-3" aria-labelledby="display-theme-heading">
              <div><h3 className="text-sm font-medium" id="display-theme-heading">Theme</h3><p className="text-xs text-muted-foreground">Choose a theme directly, or let Auto follow your system. Press <kbd>T</kbd> in the library to cycle.</p></div>
              <Select items={THEME_LABELS} value={theme} onValueChange={(value) => { if (value) setTheme(value as ThemeMode) }}>
                <SelectTrigger className="nook-theme-picker" aria-label="Theme"><ThemePreview mode={theme} /><SelectValue /></SelectTrigger>
                <SelectContent className="nook-theme-picker__menu">
                  {THEME_PICKER_MODES.map((mode) => <SelectItem key={mode} value={mode} aria-label={mode === 'auto' ? 'Auto (follows system)' : THEME_LABELS[mode]} className="nook-theme-picker__option"><ThemePreview mode={mode} /><span className="nook-theme-picker__copy"><span>{THEME_LABELS[mode]}</span>{mode === 'auto' && <small>Follows system</small>}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </section>
            <section className="nook-display-row border-b border-border py-3" aria-labelledby="preview-lines-heading">
              <div><h3 className="text-sm font-medium" id="preview-lines-heading">Note card content</h3><p className="text-xs text-muted-foreground" id="note-preview-lines-help">Choose how many content lines appear on each note card. Changes apply instantly.</p></div>
              <div className="nook-preview-lines-control"><div className="flex justify-between gap-2 text-sm"><label htmlFor="note-preview-lines">Preview lines</label><output htmlFor="note-preview-lines">{previewLines} lines</output></div><input id="note-preview-lines" type="range" min="3" max="10" step="1" value={previewLines} aria-valuetext={previewLines + ' lines'} aria-describedby="note-preview-lines-help" onChange={(event) => changePreviewLines(Number(event.currentTarget.value))} /><div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true"><span>3</span><span>10</span></div></div>
            </section>
          </TabsContent>

          <TabsContent value="data" className="nook-settings-panel nook-data-panel">
            <div className="nook-settings-panel-heading"><div><p className="text-xs text-muted-foreground">Back up, restore, or delete your local library.</p></div></div>
            <section className="nook-data-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="backup-export-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><Download aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="backup-export-heading">Back up</h4><p className="text-xs text-muted-foreground">Download notes, types, tags, Trash, and version history. Unfinished recovery drafts stay only in this browser and are not included.</p></div><Button variant="outline" size="sm" onClick={onExportBackup}><Download className="size-3.5" aria-hidden="true" /> Export backup</Button></section>
            <section className="nook-data-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="backup-import-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><Archive aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="backup-import-heading">Restore backup</h4><p className="text-xs text-muted-foreground">Inspect and validate a Nook backup before replacing the library. Older backups remain supported.</p>{hasDirtyDrafts && <p className="nook-settings-inline-warning text-xs text-destructive">Save or close open drafts before importing.</p>}</div><Button variant="outline" size="sm" disabled={hasDirtyDrafts} onClick={onRequestImportBackup}><RotateCcw className="size-3.5" aria-hidden="true" /> Import backup</Button></section>
            {pendingBackup && chosenCount && <section className="nook-import-review grid gap-3 rounded-xl border border-primary/30 bg-accent/30 p-3" aria-label="Backup replacement review"><div><p className="nook-settings-eyebrow mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Validated backup</p><h4 className="text-base font-semibold">{pendingBackup.filename}</h4><p className="mt-1 text-sm text-muted-foreground">This replaces the local notes, types, tags, and version history. Draft recovery records stay outside backups.</p></div><dl><div className="rounded-md border border-border bg-card p-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="m-0 mt-1 font-semibold">{chosenCount.notes}</dd></div><div className="rounded-md border border-border bg-card p-2"><dt className="text-xs text-muted-foreground">Types</dt><dd className="m-0 mt-1 font-semibold">{chosenCount.types}</dd></div><div className="rounded-md border border-border bg-card p-2"><dt className="text-xs text-muted-foreground">Tags</dt><dd className="m-0 mt-1 font-semibold">{chosenCount.tags}</dd></div><div className="rounded-md border border-border bg-card p-2"><dt className="text-xs text-muted-foreground">Saved versions</dt><dd className="m-0 mt-1 font-semibold">{chosenCount.noteVersions}</dd></div></dl><div className="nook-import-review-actions flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onCancelBackupImport}>Cancel</Button><Button variant="destructive" size="sm" disabled={hasDirtyDrafts || working} onClick={() => setConfirmAction({ title: 'Replace this local library?', description: `${chosenCount.notes} notes, ${chosenCount.types} types, ${chosenCount.tags} tags, and ${chosenCount.noteVersions} saved versions from “${pendingBackup.filename}” will replace this browser’s library. This cannot be undone.`, label: 'Replace library', destructive: true, run: async () => { await onConfirmBackupImport(); setConfirmAction(null) } })}>Replace library</Button></div></section>}
            <section className="nook-data-row nook-storage-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="storage-health-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><HardDrive aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="storage-health-heading">Browser storage</h4><p className="text-xs text-muted-foreground">{storageInfo.message}</p>{storageInfo.usage !== undefined && <><div className="nook-storage-summary text-xs"><span>{formatBytes(storageInfo.usage)} used</span><span>{storageInfo.quota === undefined ? 'Quota unavailable' : `Estimated quota ${formatBytes(storageInfo.quota)}`}</span></div>{usagePercent !== null && <div className="nook-storage-meter mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Approximate browser storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usagePercent}><span className="block h-full rounded-full bg-primary" style={{ width: `${usagePercent}%` }} /></div>}</>}{storageInfo.persisted !== undefined && <p className="nook-storage-persistence text-xs text-foreground">{storageHasPersisted ? 'Persistent storage is granted for this site.' : 'Persistent storage is not granted.'} This may reduce automatic eviction; it is not a backup.</p>}</div>{!storageHasPersisted && <Button variant="outline" size="sm" disabled={storageBusy || !storageApi?.persist} onClick={() => { void requestPersistence() }}>{storageBusy ? 'Requesting…' : 'Request persistence'}</Button>}</section>
            <section className="nook-data-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="install-app-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><Plus aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="install-app-heading">Install Nook</h4><p className="text-xs text-muted-foreground" aria-live="polite">{installStatus}</p></div>{installPrompt && <Button variant="outline" size="sm" disabled={installing} onClick={() => { void installApp() }}>{installing ? 'Opening…' : 'Install app'}</Button>}</section>
            <section className="nook-data-row nook-update-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="offline-update-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><RotateCcw aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="offline-update-heading">Hosted offline access</h4><p className="text-xs text-muted-foreground">{updateMessage}</p><span className="nook-update-status text-xs text-muted-foreground" data-status={updateStatus}>{updateAvailable ? 'Update available' : updateStatus === 'ready' ? 'Ready for offline visits' : updateStatus === 'disabled' ? 'Offline cache unavailable here' : updateStatus}</span></div>{updateAvailable && <Button variant="outline" size="sm" disabled={!canApplyUpdate} onClick={() => { void applyUpdate() }}>Apply update</Button>}</section>
            <section className="nook-data-row grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3" aria-labelledby="delete-library-heading"><div className="nook-data-row-icon grid size-8 place-items-center rounded-md bg-destructive/10 text-destructive"><Trash2 aria-hidden="true" className="size-4" /></div><div className="nook-data-row-copy min-w-0"><h4 className="text-sm font-medium" id="delete-library-heading">Delete all data</h4><p className="text-xs text-muted-foreground">Permanent. Export a backup first.</p></div><Button variant="destructive" size="sm" disabled={hasDirtyDrafts} onClick={() => { setDeletePhrase(''); setConfirmAction({ title: 'Delete all data?', description: `This permanently deletes ${snapshot.notes.length} notes and ${snapshot.tags.length} tags. Note types reset to Nook’s defaults. Download a backup and close other Nook tabs before continuing.`, label: 'Delete all data', destructive: true, run: deleteAllData }) }}>Delete data…</Button></section>
          </TabsContent>
          <TabsContent value="shortcuts" className="nook-settings-panel">
            <div className="nook-settings-panel-heading mb-1">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Keyboard shortcuts</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Shortcuts work outside text fields and dialogs unless they edit or save the current note.</p>
              </div>
            </div>
            {shortcutGroups.map((group) => (
              <section className="nook-shortcut-group mt-3" aria-label={`${group.title} shortcuts`} key={group.title}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{group.title}</h4>
                <div className="nook-shortcut-list rounded-xl border border-border bg-card divide-y divide-border overflow-hidden px-3.5">
                  {group.shortcuts.map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between py-2 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <kbd className="px-2 py-0.5 rounded border border-border bg-muted/40 font-mono text-xs font-semibold text-foreground">{keys}</kbd>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </TabsContent>

          {(localError || error) && <p className="nook-settings-feedback nook-settings-feedback--error rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive" role="alert">{localError ?? error}</p>}
          {(localMessage || notice) && <p className="nook-settings-feedback rounded-md border border-border bg-muted p-2 text-sm" role="status">{localMessage ?? notice}</p>}
          {localError && <Button className="nook-feedback-dismiss" variant="ghost" size="icon-xs" aria-label="Dismiss settings error" onClick={() => setLocalError(null)}><X aria-hidden="true" /></Button>}
        </div>
      </Tabs>
      <nav className="nook-mobile-settings-nav" aria-label="Mobile settings navigation">
        <Button type="button" variant="ghost" aria-label="Open all notes" onClick={onOpenNotes}><FileText aria-hidden="true" /><span>Notes</span></Button>
        <Button type="button" variant="ghost" aria-label="Search notes" onClick={onOpenSearch}><Search aria-hidden="true" /><span>Search</span></Button>
        <Button type="button" className="nook-mobile-settings-nav__create" aria-label="Create note" onClick={onCreateNote}><Plus aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" aria-label="Open Trash" onClick={onOpenTrash}><Trash2 aria-hidden="true" /><span>Trash</span></Button>
        <Button type="button" variant="secondary" aria-label="Settings home" onClick={showMobileHome}><Settings2 aria-hidden="true" /><span>Settings</span></Button>
      </nav>
    </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(confirmAction)} onOpenChange={(isOpen) => { if (!isOpen) setConfirmAction(null) }}>
      <AlertDialogContent className="nook-settings-dialog--confirm">
        <AlertDialogHeader className="nook-settings-confirm-header"><AlertDialogTitle>{confirmAction?.title ?? 'Confirm change'}</AlertDialogTitle><AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription></AlertDialogHeader>
        {confirmAction?.title === 'Delete all data?' && <div className="nook-delete-confirmation grid gap-3"><Button variant="outline" onClick={onExportBackup}><Download aria-hidden="true" />Export backup</Button><label className="grid gap-1 text-sm">Type <strong>DELETE</strong> to confirm<Input autoComplete="off" spellCheck={false} value={deletePhrase} onChange={(event) => setDeletePhrase(event.currentTarget.value)} placeholder="DELETE" /></label></div>}
        <AlertDialogFooter className="nook-settings-confirm-actions"><AlertDialogCancel onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel><AlertDialogAction variant={confirmAction?.destructive ? 'destructive' : 'default'} disabled={working || (confirmAction?.title === 'Delete all data?' && deletePhrase.trim() !== 'DELETE')} onClick={() => { const action = confirmAction?.run; setConfirmAction(null); if (action) void action() }}>{confirmAction?.label ?? 'Confirm'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
