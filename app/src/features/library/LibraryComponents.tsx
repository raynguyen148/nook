import { useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Copy, Eye, FileText, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CheckIcon, PinIcon, SideNoteIcon } from '@/components/NookIcons'
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
  const resolvedType = type ?? { name: 'General', color: 'slate' }
  if (!onClick) return <Badge className="nook-type-badge inline-flex max-w-[45%] items-center gap-1.5" variant="secondary"><TypeDot color={resolvedType.color} /><span className="nook-type-badge__label">{resolvedType.name}</span></Badge>
  return <button type="button" className="nook-type-badge nook-type-badge--button inline-flex max-w-[45%] items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground" onClick={onClick} aria-label={`Filter by type ${resolvedType.name}`}>
    <TypeDot color={resolvedType.color} /><span className="nook-type-badge__label">{resolvedType.name}</span>
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
  collapsed = false,
  onToggleSidebar,
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
  collapsed?: boolean
  onToggleSidebar?: () => void
}) {
  const [backup, setBackup] = useState(backupStatus)
  const [tagsExpanded, setTagsExpanded] = useState(false)
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

  const TAG_COLLAPSED_LIMIT = 12
  const displayedTags = useMemo(() => {
    if (tagsExpanded || tags.length <= TAG_COLLAPSED_LIMIT) return tags
    const selectedTagSet = new Set(filters.tagIds)
    const prioritized = tags.filter((t) => selectedTagSet.has(t.id))
    const remaining = tags.filter((t) => !selectedTagSet.has(t.id))
    return [...prioritized, ...remaining].slice(0, TAG_COLLAPSED_LIMIT)
  }, [tags, filters.tagIds, tagsExpanded])

  if (collapsed) {
    return (
      <div className="nook-filter-panel nook-filter-panel--collapsed">
        <div className="nook-sidebar-rail-header">
          <img className="nook-brand-mark size-9 shrink-0 rounded-xl" src={`${import.meta.env.BASE_URL}favicon.svg`} width="36" height="36" alt="Nook" />
          {onToggleSidebar && (
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="nook-sidebar-rail-toggle"
                  aria-label="Expand sidebar"
                  title={`Expand sidebar (${typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}\\)`}
                  onClick={onToggleSidebar}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              } />
              <TooltipContent role="tooltip">Expand sidebar</TooltipContent>
            </Tooltip>
          )}
        </div>

        <nav className="nook-sidebar-rail-nav" aria-label="Library spaces">
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant={!filters.trashOnly ? 'secondary' : 'ghost'} size="icon-sm" aria-label="All notes" aria-current={!filters.trashOnly ? 'page' : undefined} onClick={() => onSpace(false)}><FileText aria-hidden="true" /></Button>} />
            <TooltipContent role="tooltip">All notes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant={filters.trashOnly ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Trash" aria-current={filters.trashOnly ? 'page' : undefined} onClick={() => onSpace(true)}><Trash2 aria-hidden="true" /></Button>} />
            <TooltipContent role="tooltip">Trash</TooltipContent>
          </Tooltip>
        </nav>

        {!filters.trashOnly && <nav className="nook-sidebar-rail-nav nook-sidebar-rail-nav--filters" aria-label="Filter notes">
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant={filters.createdToday ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Created Today" aria-pressed={filters.createdToday} onClick={onToggleCreatedToday}><CalendarDays aria-hidden="true" /></Button>} />
            <TooltipContent role="tooltip">Created Today</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant={filters.updatedToday ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Updated Today" aria-pressed={filters.updatedToday} onClick={onToggleUpdatedToday}><CalendarDays aria-hidden="true" /></Button>} />
            <TooltipContent role="tooltip">Updated Today</TooltipContent>
          </Tooltip>
          {types.map((type) => (
            <Tooltip key={type.id}>
              <TooltipTrigger render={<Button type="button" variant={filters.typeId === type.id ? 'secondary' : 'ghost'} size="icon-sm" aria-label={`Filter by type ${type.name}`} aria-pressed={filters.typeId === type.id} onClick={() => onToggleType(type.id)}><TypeDot color={type.color} /></Button>} />
              <TooltipContent role="tooltip">{type.name}</TooltipContent>
            </Tooltip>
          ))}
        </nav>}
      </div>
    )
  }

  return <div className="nook-filter-panel flex min-h-full flex-col gap-5 p-4">
    <div className="nook-sidebar-brand flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <img className="nook-brand-mark size-9 shrink-0" src={`${import.meta.env.BASE_URL}favicon.svg`} width="36" height="36" alt="" aria-hidden="true" />
        <div className="nook-brand-text min-w-0"><strong className="block text-sm font-semibold text-sidebar-foreground">Nook</strong><span className="mt-0.5 block text-xs text-muted-foreground">Private workspace</span></div>
      </div>
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="nook-sidebar-toggle-btn hidden md:inline-flex shrink-0 text-muted-foreground hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={`${collapsed ? 'Expand sidebar' : 'Collapse sidebar'} (${typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}\\)`}
          onClick={onToggleSidebar}
        >
          <svg className={`size-3.5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Button>
      )}
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
        <p className="nook-sidebar-label mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tags <span className="text-xs font-normal normal-case text-primary">{filters.tagIds.length ? `${filters.tagIds.length} selected` : ''}</span>
        </p>
        {tags.length === 0 ? <p className="text-sm text-muted-foreground">No tags yet.</p> : <p className="nook-filter-help mb-2 text-xs text-muted-foreground">Match all selected tags</p>}
        <div className="nook-tag-filter-list flex flex-wrap gap-1.5">
          {displayedTags.map((tag) => (
            <Badge
              key={tag.id}
              render={<label />}
              variant={filters.tagIds.includes(tag.id) ? 'tagSelected' : 'tag'}
              className="nook-tag-filter max-w-full cursor-pointer"
              title={`Filter by ${tag.name} (${tagCounts.get(tag.id) ?? 0})`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={filters.tagIds.includes(tag.id)}
                onChange={() => onToggleTag(tag.id)}
                aria-label={`Filter by tag ${tag.name}`}
              />
              <span className="nook-tag-filter-name max-w-32 truncate">{tag.name}</span>
              <span className="nook-nav-count text-xs" aria-hidden="true">{tagCounts.get(tag.id) ?? 0}</span>
            </Badge>
          ))}
        </div>
        {tags.length > TAG_COLLAPSED_LIMIT && (
          <button
            type="button"
            className="nook-text-button mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setTagsExpanded((prev) => !prev)}
          >
            {tagsExpanded ? (
              <>
                <span>Show less</span>
                <ChevronUp className="size-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                <span>Show {tags.length - displayedTags.length} more</span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        )}
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
  layout,
  secondary = false,
  openAriaLabel,
  editAriaLabel,
  onOpen,
  onOpenWithSideNote,
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
  layout?: 'grid' | 'comfortable' | 'compact'
  secondary?: boolean
  openAriaLabel?: string
  editAriaLabel?: string
  onOpen: (focusKey: string) => void
  onOpenWithSideNote?: () => void
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
  const [copied, setCopied] = useState(false)
  const isEdited = Boolean(note.updatedAt && note.createdAt && Date.parse(note.updatedAt) > Date.parse(note.createdAt))
  const dateLabel = note.deletedAt ? 'Deleted' : sort.startsWith('updated') && isEdited ? 'Updated' : ''
  const dateValue = note.deletedAt ?? (sort.startsWith('updated') && isEdited ? note.updatedAt : note.createdAt)
  const preview = notePreview(note.content)
  const canPin = !trash && !secondary
  const canFilter = !trash && !secondary
  const canOpenWithSideNote = !trash && !secondary && Boolean(onOpenWithSideNote)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (layout === 'compact') {
    return (
      <Card
        className={`nook-note-card nook-note-card--compact group relative flex items-center min-h-[2.75rem] h-auto min-w-0 gap-2.5 px-3 py-1.5 rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-150 hover:shadow-xs hover:border-primary/40 ${note.isPinned && canPin ? 'is-pinned' : ''}`}
        data-note-id={note.id}
        onPointerEnter={() => onHover(note.id)}
        onPointerLeave={() => onHover(null)}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button className="nook-note-card__mobile-menu md:hidden" type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${note.title || 'Untitled note'}`} disabled={busy} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpen(`note-${note.id}-view`)}><Eye aria-hidden="true" />Preview</DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}><Copy aria-hidden="true" />Copy Markdown</DropdownMenuItem>
            {trash ? (
              <>
                <DropdownMenuItem onClick={onRestore}><ArchiveRestore aria-hidden="true" />Restore</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onPermanentlyDelete}><Trash2 aria-hidden="true" />Delete permanently</DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={onEdit}><Pencil aria-hidden="true" />Edit</DropdownMenuItem>
                {canPin && <DropdownMenuItem onClick={onPin}><PinIcon className="size-4" filled={note.isPinned} aria-hidden="true" />{note.isPinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
                <DropdownMenuItem variant="destructive" onClick={onTrash}><Trash2 aria-hidden="true" />Move to Trash</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="nook-note-card__type shrink-0 flex items-center">
          <NoteTypeBadge type={type} onClick={canFilter ? onType : undefined} />
        </div>

        <button
          type="button"
          className="nook-note-title font-semibold text-xs leading-snug tracking-tight text-left text-foreground hover:text-primary transition-colors truncate shrink-0 max-w-[15.5rem]"
          data-library-focus-key={`note-${note.id}-title`}
          onClick={() => onOpen(`note-${note.id}-title`)}
          aria-label={openAriaLabel}
          title={note.title || 'Untitled note'}
        >
          {note.title.trim() || 'Untitled note'}
        </button>

        {tags.length > 0 && (
          <div className="nook-note-tags hidden sm:flex items-center gap-1.5 shrink-0 max-w-[9.5rem] overflow-hidden" role="group" aria-label="Note tags">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="nook-note-tag inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.65rem] text-secondary-foreground hover:bg-accent transition-colors shrink-0"
                disabled={!canFilter}
                onClick={() => onTag(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="flex-1 min-w-0 truncate text-left text-xs leading-normal text-muted-foreground hover:text-foreground/80 transition-colors hidden md:block"
          data-library-focus-key={`note-${note.id}-preview`}
          onClick={() => onOpen(`note-${note.id}-preview`)}
          aria-label={`Preview ${note.title || 'Untitled note'}`}
        >
          {preview || <span className="italic text-muted-foreground/60">No content</span>}
        </button>

        <span className="ml-auto shrink-0 text-xs text-muted-foreground whitespace-nowrap tabular-nums pl-2">
          {formatDate(dateValue)}
        </span>

        {canPin && (
          <Tooltip>
            <TooltipTrigger render={
              <Button
                className={`nook-pin-button shrink-0 size-7 p-0 transition-opacity ${
                  note.isPinned
                    ? 'is-pinned opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`}
                variant="ghost"
                size="icon-xs"
                aria-label={note.isPinned ? `Unpin ${note.title || 'Untitled note'}` : `Pin ${note.title || 'Untitled note'}`}
                aria-pressed={note.isPinned}
                disabled={busy}
                onClick={onPin}
              >
                <PinIcon filled={note.isPinned} className={note.isPinned ? 'text-[var(--pinned-marker-color,#d97706)]' : 'text-muted-foreground'} />
              </Button>
            } />
            <TooltipContent role="tooltip">{note.isPinned ? 'Unpin note' : 'Pin note'}</TooltipContent>
          </Tooltip>
        )}

        <div className="nook-note-actions hidden sm:flex items-center gap-0.5 shrink-0" role="group" aria-label={`Actions for ${note.title || 'Untitled note'}`}>
          {canOpenWithSideNote && (
            <Tooltip>
              <TooltipTrigger render={
                <Button variant="ghost" size="icon-xs" className="hidden size-7 text-muted-foreground hover:text-foreground min-[960px]:inline-flex" aria-label={`Open ${note.title || 'Untitled note'} with Side Note`} disabled={busy} onClick={onOpenWithSideNote}>
                  <SideNoteIcon className="size-3.5" />
                </Button>
              } />
              <TooltipContent role="tooltip">Open with Side Note</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Copy ${note.title || 'Untitled note'}`} disabled={busy || !note.content.trim()} onClick={handleCopy}>
                {copied ? <CheckIcon className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
              </Button>
            } />
            <TooltipContent role="tooltip">{copied ? 'Copied!' : 'Copy Markdown'}</TooltipContent>
          </Tooltip>

          {trash ? (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Restore ${note.title || 'Untitled note'}`} disabled={busy} onClick={onRestore}>
                    <ArchiveRestore className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Restore note</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-destructive hover:text-destructive" aria-label={`Delete permanently: ${note.title || 'Untitled note'}`} disabled={busy} onClick={onPermanentlyDelete}>
                    <Trash2 className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Delete permanently</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" data-library-focus-key={`note-${note.id}-edit`} aria-label={editAriaLabel ?? `Edit ${note.title || 'Untitled note'}`} disabled={busy} onClick={onEdit}>
                    <Pencil className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Edit note</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Move to Trash: ${note.title || 'Untitled note'}`} disabled={busy} onClick={onTrash}>
                    <Trash2 className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Move to Trash</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card
      className={`nook-note-card nook-note-card--${layout ?? 'grid'} group relative flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:shadow-xs hover:border-primary/40 ${note.isPinned && canPin ? 'is-pinned' : ''}`}
      data-note-id={note.id}
      onPointerEnter={() => onHover(note.id)}
      onPointerLeave={() => onHover(null)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button className="nook-note-card__mobile-menu" type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${note.title || 'Untitled note'}`} disabled={busy} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpen(`note-${note.id}-view`)}><Eye aria-hidden="true" />Preview</DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}><Copy aria-hidden="true" />Copy Markdown</DropdownMenuItem>
          {trash ? (
            <>
              <DropdownMenuItem onClick={onRestore}><ArchiveRestore aria-hidden="true" />Restore</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onPermanentlyDelete}><Trash2 aria-hidden="true" />Delete permanently</DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={onEdit}><Pencil aria-hidden="true" />Edit</DropdownMenuItem>
              {canPin && <DropdownMenuItem onClick={onPin}><PinIcon className="size-4" filled={note.isPinned} aria-hidden="true" />{note.isPinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
              <DropdownMenuItem variant="destructive" onClick={onTrash}><Trash2 aria-hidden="true" />Move to Trash</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="nook-note-card-meta flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
          <NoteTypeBadge type={type} onClick={canFilter ? onType : undefined} />
          <span className="truncate">{dateLabel ? `${dateLabel} ` : ''}{formatDate(dateValue)}</span>
        </div>
        {canPin && (
          <Tooltip>
            <TooltipTrigger render={
              <Button
                className={`nook-pin-button size-7 p-0 transition-opacity ${
                  note.isPinned
                    ? 'is-pinned opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`}
                variant="ghost"
                size="icon-xs"
                aria-label={note.isPinned ? `Unpin ${note.title || 'Untitled note'}` : `Pin ${note.title || 'Untitled note'}`}
                aria-pressed={note.isPinned}
                disabled={busy}
                onClick={onPin}
              >
                <PinIcon filled={note.isPinned} className={note.isPinned ? 'text-[var(--pinned-marker-color,#d97706)]' : 'text-muted-foreground'} />
              </Button>
            } />
            <TooltipContent role="tooltip">{note.isPinned ? 'Unpin note' : 'Pin note'}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="nook-note-card-title-row min-w-0">
        <button
          type="button"
          className="nook-note-title font-bold text-base leading-snug tracking-tight text-left text-foreground hover:text-primary transition-colors truncate"
          data-library-focus-key={`note-${note.id}-title`}
          onClick={() => onOpen(`note-${note.id}-title`)}
          aria-label={openAriaLabel}
        >
          {note.title.trim() || 'Untitled note'}
        </button>
      </div>

      <button
        type="button"
        className="nook-note-preview text-left text-sm leading-relaxed text-muted-foreground hover:text-foreground/80 transition-colors line-clamp-3 mt-0.5"
        data-library-focus-key={`note-${note.id}-preview`}
        onClick={() => onOpen(`note-${note.id}-preview`)}
        aria-label={`Preview ${note.title || 'Untitled note'}`}
      >
        {preview || <span className="italic text-muted-foreground/70">No content</span>}
      </button>

      <div className="nook-note-card-footer flex items-end justify-between gap-3 min-w-0">
        <div className="nook-note-tags flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" role="group" aria-label="Note tags">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="nook-note-tag inline-flex max-w-full shrink-0 items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-accent"
                disabled={!canFilter}
                onClick={() => onTag(tag.id)}
              >
                {tag.name}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground select-none">No tags</span>
          )}
        </div>

        <div className="nook-note-actions flex shrink-0 items-center gap-0.5" role="group" aria-label={`Actions for ${note.title || 'Untitled note'}`}>
          {canOpenWithSideNote && (
            <Tooltip>
              <TooltipTrigger render={
                <Button variant="ghost" size="icon-xs" className="hidden size-7 text-muted-foreground hover:text-foreground min-[960px]:inline-flex" aria-label={`Open ${note.title || 'Untitled note'} with Side Note`} disabled={busy} onClick={onOpenWithSideNote}>
                  <SideNoteIcon className="size-3.5" />
                </Button>
              } />
              <TooltipContent role="tooltip">Open with Side Note</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Copy ${note.title || 'Untitled note'}`} disabled={busy || !note.content.trim()} onClick={handleCopy}>
                {copied ? <CheckIcon className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
              </Button>
            } />
            <TooltipContent role="tooltip">{copied ? 'Copied!' : 'Copy Markdown'}</TooltipContent>
          </Tooltip>

          {trash ? (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Restore ${note.title || 'Untitled note'}`} disabled={busy} onClick={onRestore}>
                    <ArchiveRestore className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Restore note</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-destructive hover:text-destructive" aria-label={`Delete permanently: ${note.title || 'Untitled note'}`} disabled={busy} onClick={onPermanentlyDelete}>
                    <Trash2 className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Delete permanently</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-foreground" data-library-focus-key={`note-${note.id}-edit`} aria-label={editAriaLabel ?? `Edit ${note.title || 'Untitled note'}`} disabled={busy} onClick={onEdit}>
                    <Pencil className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Edit note</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon-xs" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Move to Trash: ${note.title || 'Untitled note'}`} disabled={busy} onClick={onTrash}>
                    <Trash2 className="size-3.5" />
                  </Button>
                } />
                <TooltipContent role="tooltip">Move to Trash</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
