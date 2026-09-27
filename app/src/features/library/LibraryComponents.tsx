import { useEffect, useState } from 'react'
import { ArchiveRestore, CalendarDays, Copy, Eye, FileText, MoreHorizontal, Pencil, Pin, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Note, NoteType, Tag } from '@/domain/contracts'
import type { Filters, SortMode } from './library.types'
import { formatDate, notePreview, sameLocalDay } from './library.utils'

export function TypeDot({ color }: { color: string }) {
  return <span className="nook-type-dot" data-type-color={color} aria-hidden="true" />
}

function navItemClasses(active: boolean): string {
  return `nook-nav-item flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`
}

export function backupStatus(): { label: string; description: string; state: 'never' | 'good' | 'warning' } {
  let requested = ''
  try {
    const stored = JSON.parse(window.localStorage.getItem('nook:backup-health') || 'null') as { lastDownloadRequestedAt?: string; lastExportedAt?: string } | null
    requested = stored?.lastDownloadRequestedAt || stored?.lastExportedAt || ''
  } catch { /* A blocked preference never blocks the library. */ }
  const time = Date.parse(requested)
  if (!Number.isFinite(time)) return { label: 'Local · No backup yet', description: 'Notes are stored only in this browser. No backup download has been requested yet.', state: 'never' }
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000))
  if (days === 0) return { label: 'Local · Backup requested today', description: 'Notes are stored locally. A backup download was requested today.', state: 'good' }
  return {
    label: days >= 10 ? `Local · Backup due (${days}d)` : `Local · Backup requested ${days}d ago`,
    description: `Notes are stored locally. A backup download was requested ${days} ${days === 1 ? 'day' : 'days'} ago.`,
    state: days >= 10 ? 'warning' : 'good',
  }
}

function NoteTypeBadge({ type, onClick }: { type: NoteType | undefined; onClick?: () => void }) {
  if (!type) return <Badge variant="secondary">General</Badge>
  if (!onClick) return <Badge className="nook-type-badge inline-flex max-w-[45%] items-center gap-1.5 truncate" variant="secondary"><TypeDot color={type.color} />{type.name}</Badge>
  return <button type="button" className="nook-type-badge nook-type-badge--button inline-flex max-w-[45%] items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground" onClick={onClick} aria-label={`Filter by type ${type.name}`}>
    <TypeDot color={type.color} />{type.name}
  </button>
}

export function FilterList({
  types,
  tags,
  notes,
  filters,
  onToggleType,
  onToggleTag,
  onToggleCreatedToday,
  onToggleUpdatedToday,
  onClear,
  onSpace,
  onCloseMobile,
  searchActive = false,
}: {
  types: NoteType[]
  tags: Tag[]
  notes: Note[]
  filters: Filters
  onToggleType: (id: string) => void
  onToggleTag: (id: string) => void
  onToggleCreatedToday: () => void
  onToggleUpdatedToday: () => void
  onClear: () => void
  onSpace: (trash: boolean) => void
  onCloseMobile?: () => void
  searchActive?: boolean
}) {
  const [backup, setBackup] = useState(backupStatus)
  useEffect(() => {
    const update = () => setBackup(backupStatus())
    window.addEventListener('storage', update)
    window.addEventListener('nook:backup-requested', update)
    return () => { window.removeEventListener('storage', update); window.removeEventListener('nook:backup-requested', update) }
  }, [])
  const activeNotes = notes.filter((note) => Boolean(note.deletedAt) === filters.trashOnly)
  const typeCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  activeNotes.forEach((note) => {
    typeCounts.set(note.typeId, (typeCounts.get(note.typeId) ?? 0) + 1)
    note.tagIds.forEach((id) => tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1))
  })
  const activeCount = Number(filters.typeId !== 'all') + filters.tagIds.length + Number(filters.createdToday) + Number(filters.updatedToday) + Number(searchActive)
  const createdTodayCount = activeNotes.filter((note) => sameLocalDay(note.createdAt)).length
  const updatedTodayCount = activeNotes.filter((note) => sameLocalDay(note.updatedAt)).length
  const allCount = notes.filter((note) => !note.deletedAt).length
  const trashCount = notes.filter((note) => Boolean(note.deletedAt)).length

  return <div className="nook-filter-panel flex min-h-full flex-col gap-5 p-4">
    <div className="nook-sidebar-brand flex items-center gap-3">
      <img className="nook-brand-mark size-9 shrink-0" src={`${import.meta.env.BASE_URL}favicon.svg`} width="36" height="36" alt="" aria-hidden="true" />
      <div className="min-w-0"><strong className="block text-sm font-semibold text-sidebar-foreground">Nook</strong><span className="mt-0.5 block text-xs text-muted-foreground">Private workspace</span></div>
      {onCloseMobile && <Button variant="ghost" size="icon-sm" className="ml-auto md:hidden" aria-label="Close filters" onClick={onCloseMobile}><X /></Button>}
    </div>
    <div className="nook-sidebar-status flex items-center gap-2 rounded-md border border-sidebar-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground" data-state={backup.state} aria-label={backup.description} title={backup.description}><span className="nook-local-dot size-2 rounded-full" aria-hidden="true" />{backup.label}</div>
    <div className="nook-sidebar-section nook-spaces-section border-t border-sidebar-border pt-4">
      <p className="nook-sidebar-label mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spaces</p>
      <nav className="space-y-1" aria-label="Library spaces">
        <button type="button" aria-label="All notes" className={navItemClasses(!filters.trashOnly)} aria-current={!filters.trashOnly ? 'page' : undefined} onClick={() => { onSpace(false); onCloseMobile?.() }}>
          <FileText size={16} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">All notes</span><span className={`nook-nav-count text-xs ${!filters.trashOnly ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} aria-hidden="true">{allCount}</span>
        </button>
        <button type="button" aria-label="Trash" className={navItemClasses(filters.trashOnly)} aria-current={filters.trashOnly ? 'page' : undefined} onClick={() => { onSpace(true); onCloseMobile?.() }}>
          <Trash2 size={16} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Trash</span><span className={`nook-nav-count text-xs ${filters.trashOnly ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} aria-hidden="true">{trashCount}</span>
        </button>
      </nav>
    </div>
    {!filters.trashOnly && <>
      <div className="nook-sidebar-section border-t border-sidebar-border pt-4">
        <div className="nook-sidebar-heading flex items-center justify-between"><p className="nook-sidebar-label mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</p><button className="nook-text-button px-1 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50" type="button" disabled={!activeCount} onClick={onClear}>Clear</button></div>
        <nav className="space-y-1" aria-label="Filter notes">
          <button type="button" className={navItemClasses(filters.createdToday)} aria-pressed={filters.createdToday} onClick={onToggleCreatedToday}>
            <CalendarDays size={16} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Created Today</span><span className={`nook-nav-count text-xs ${filters.createdToday ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} aria-hidden="true">{createdTodayCount}</span>
          </button>
          <button type="button" className={navItemClasses(filters.updatedToday)} aria-pressed={filters.updatedToday} onClick={onToggleUpdatedToday}>
            <CalendarDays size={16} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Updated Today</span><span className={`nook-nav-count text-xs ${filters.updatedToday ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} aria-hidden="true">{updatedTodayCount}</span>
          </button>
          {types.map((type) => <button key={type.id} type="button" className={navItemClasses(filters.typeId === type.id)} aria-pressed={filters.typeId === type.id} onClick={() => onToggleType(type.id)}>
            <TypeDot color={type.color} /><span className="min-w-0 flex-1 truncate">{type.name}</span><span className={`nook-nav-count text-xs ${filters.typeId === type.id ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} aria-hidden="true">{typeCounts.get(type.id) ?? 0}</span>
          </button>)}
        </nav>
      </div>
      <div className="nook-sidebar-section nook-tag-section">
        <p className="nook-sidebar-label mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags <span className="text-xs font-normal normal-case text-primary">{filters.tagIds.length ? `${filters.tagIds.length} selected` : ''}</span></p>
        {tags.length === 0 ? <p className="text-sm text-muted-foreground">No tags yet.</p> : <p className="nook-filter-help mb-2 text-xs text-muted-foreground">Match all selected tags</p>}
        <div className="nook-tag-filter-list flex flex-wrap gap-1.5">
          {tags.map((tag) => <label key={tag.id} className={`nook-tag-filter inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${filters.tagIds.includes(tag.id) ? 'border-primary/50 bg-accent text-accent-foreground' : 'border-border bg-card text-muted-foreground'}`} title={`Filter by ${tag.name} (${tagCounts.get(tag.id) ?? 0})`}>
            <input type="checkbox" className="sr-only" checked={filters.tagIds.includes(tag.id)} onChange={() => onToggleTag(tag.id)} aria-label={`Filter by tag ${tag.name}`} />
            <span className="nook-tag-filter-name max-w-32 truncate">{tag.name}</span><span className="nook-nav-count text-xs" aria-hidden="true">{tagCounts.get(tag.id) ?? 0}</span>
          </label>)}
        </div>
      </div>
    </>}
  </div>
}

export function NoteCard({
  note,
  type,
  tags,
  trash,
  sort,
  busy,
  onOpen,
  onEdit,
  onPin,
  onCopy,
  onTrash,
  onRestore,
  onPermanentlyDelete,
  onTag,
  onType,
  onHover,
}: {
  note: Note
  type: NoteType | undefined
  tags: Array<Pick<Tag, 'id' | 'name'>>
  trash: boolean
  sort: SortMode
  busy: boolean
  onOpen: (focusKey: string) => void
  onEdit: () => void
  onPin: () => void
  onCopy: () => void
  onTrash: () => void
  onRestore: () => void
  onPermanentlyDelete: () => void
  onTag: (id: string) => void
  onType: () => void
  onHover: (noteId: string | null) => void
}) {
  const dateLabel = sort.startsWith('updated') ? 'Updated' : 'Created'
  const dateValue = sort.startsWith('updated') ? note.updatedAt : note.createdAt
  const preview = notePreview(note.content)

  return <Card className={`nook-note-card gap-2 rounded-lg border border-border bg-card px-3 py-3 ${note.isPinned && !trash ? 'is-pinned' : ''}`} data-note-id={note.id} onPointerEnter={() => onHover(note.id)} onPointerLeave={() => onHover(null)}>
    <DropdownMenu><DropdownMenuTrigger render={<Button className="nook-note-card__mobile-menu" type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${note.title || 'Untitled note'}`} disabled={busy} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger><DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => onOpen(`note-${note.id}-view`)}><Eye aria-hidden="true" />Preview</DropdownMenuItem>
      <DropdownMenuItem onClick={onCopy}><Copy aria-hidden="true" />Copy Markdown</DropdownMenuItem>
      {trash ? <><DropdownMenuItem onClick={onRestore}><ArchiveRestore aria-hidden="true" />Restore</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={onPermanentlyDelete}><Trash2 aria-hidden="true" />Delete permanently</DropdownMenuItem></> : <><DropdownMenuItem onClick={onEdit}><Pencil aria-hidden="true" />Edit</DropdownMenuItem><DropdownMenuItem onClick={onPin}><Pin aria-hidden="true" />{note.isPinned ? 'Unpin' : 'Pin'}</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={onTrash}><Trash2 aria-hidden="true" />Move to Trash</DropdownMenuItem></>}
    </DropdownMenuContent></DropdownMenu>
    <div className="nook-note-card-meta flex items-center gap-2 text-xs text-muted-foreground"><NoteTypeBadge type={type} onClick={!trash ? onType : undefined} /><span>{dateLabel} {formatDate(dateValue)}</span>
      {!trash && <Button className="nook-pin-button" variant={note.isPinned ? 'secondary' : 'ghost'} size="icon-sm" aria-label={note.isPinned ? `Unpin ${note.title || 'Untitled note'}` : `Pin ${note.title || 'Untitled note'}`} aria-pressed={note.isPinned} disabled={busy} onClick={onPin}><Pin fill={note.isPinned ? 'currentColor' : 'none'} /></Button>}
    </div>
    <button type="button" className="nook-note-title font-semibold leading-snug text-left text-foreground hover:text-primary" data-library-focus-key={`note-${note.id}-title`} onClick={() => onOpen(`note-${note.id}-title`)}>{note.title.trim() || 'Untitled note'}</button>
    <button type="button" className="nook-note-preview text-left text-sm leading-relaxed text-muted-foreground" data-library-focus-key={`note-${note.id}-preview`} onClick={() => onOpen(`note-${note.id}-preview`)} aria-label={`Preview ${note.title || 'Untitled note'}`}>
      {preview || <span className="italic text-muted-foreground">No content</span>}
    </button>
    <div className="nook-note-card-footer flex min-w-0 flex-1 items-end justify-between gap-2">
      <div className="nook-note-tags" role="group" aria-label="Note tags">
        {tags.length ? tags.map((tag) => <button key={tag.id} type="button" className="nook-note-tag max-w-full overflow-hidden rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent" disabled={trash} onClick={() => onTag(tag.id)}>{tag.name}</button>) : <span className="nook-no-tags text-xs text-muted-foreground">No tags</span>}
      </div>
      <div className="nook-note-actions flex shrink-0 items-center" role="group" aria-label={`Actions for ${note.title || 'Untitled note'}`}>
        <Button variant="ghost" size="icon-xs" aria-label={`Copy ${note.title || 'Untitled note'}`} title="Copy Markdown" disabled={busy} onClick={onCopy}><Copy /></Button>
        <Button variant="ghost" size="icon-xs" data-library-focus-key={`note-${note.id}-view`} aria-label={`View ${note.title || 'Untitled note'}`} title="Preview note" disabled={busy} onClick={() => onOpen(`note-${note.id}-view`)}><Eye /></Button>
        {trash ? <>
          <Button variant="ghost" size="icon-xs" aria-label={`Restore ${note.title || 'Untitled note'}`} title="Restore note" disabled={busy} onClick={onRestore}><ArchiveRestore /></Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive" aria-label={`Delete permanently: ${note.title || 'Untitled note'}`} title="Delete permanently" disabled={busy} onClick={onPermanentlyDelete}><Trash2 /></Button>
        </> : <>
          <Button variant="ghost" size="icon-xs" data-library-focus-key={`note-${note.id}-edit`} aria-label={`Edit ${note.title || 'Untitled note'}`} title="Edit note" disabled={busy} onClick={onEdit}><Pencil /></Button>
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" aria-label={`Move to Trash: ${note.title || 'Untitled note'}`} title="Move to Trash" disabled={busy} onClick={onTrash}><Trash2 /></Button>
        </>}
      </div>
    </div>
  </Card>
}
