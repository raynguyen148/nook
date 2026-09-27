import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bold,
  Check,
  Clock3,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  FileText,
  Hash,
  Italic,
  Keyboard,
  List,
  ListOrdered,
  Pin,
  Plus,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { NoteDraft, WorkspaceMode } from '@/domain/contracts'
import type { EditorSessionState } from '@/features/editor-session/session'
import { MarkdownPreview } from '@/features/markdown/MarkdownPreview'
import { buildMarkdownScrollMap, interpolateScrollMap, isMarkdownScrollMapCurrent, type MarkdownScrollMap } from './split-scroll'
import type { EditorPaneProps, FormattingCommand } from './workspace-types'

export function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function WorkspaceSaveStatus({ state }: { state: EditorSessionState }) {
  const label = state.phase === 'saving'
    ? 'Saving…'
    : state.phase === 'error'
      ? 'Save failed'
      : state.phase === 'conflict'
        ? 'Newer version found'
        : state.dirty
          ? 'Unsaved changes'
          : state.phase === 'idle'
            ? 'Not saved yet'
            : 'Saved'
  return <span className={`workspace-save-status workspace-save-status--${state.phase}`} role="status" aria-live="polite" title={state.error?.message || ''}>
    <span className="workspace-save-status__dot" aria-hidden="true" />{label}
  </span>
}

export function WorkspaceModeSwitch({ mode, paneLabel, onModeChange }: { mode: WorkspaceMode; paneLabel: string; onModeChange(mode: WorkspaceMode): void }) {
  return <div className="workspace-mode-switch" role="group" aria-label={`${paneLabel} display mode`}>
    {([
      ['edit', <FileText aria-hidden="true" />, 'Edit'],
      ['split', <Columns2 aria-hidden="true" />, 'Split'],
      ['preview', <Eye aria-hidden="true" />, 'Preview'],
    ] as const).map(([value, icon, label]) => <Button key={value} type="button" size="sm" variant={mode === value ? 'secondary' : 'ghost'} aria-pressed={mode === value} onClick={() => onModeChange(value)}>{icon}<span>{label}</span></Button>)}
  </div>
}

function MarkdownToolbar({ onFormat }: { onFormat(command: FormattingCommand): void }) {
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const commands: Array<{ command: FormattingCommand; label: string; hint: string; icon: ReactNode }> = [
    { command: 'heading', label: 'Toggle heading', hint: 'Prefix selected lines with a heading', icon: <span className="workspace-format-mark">H</span> },
    { command: 'bold', label: 'Toggle bold', hint: `${modifier}+B`, icon: <Bold aria-hidden="true" /> },
    { command: 'italic', label: 'Toggle italic', hint: `${modifier}+I`, icon: <Italic aria-hidden="true" /> },
    { command: 'strike', label: 'Toggle strikethrough', hint: 'Wrap in ~~', icon: <Strikethrough aria-hidden="true" /> },
    { command: 'code', label: 'Toggle inline code', hint: `${modifier}+E`, icon: <Code2 aria-hidden="true" /> },
    { command: 'code-block', label: 'Insert code block', hint: 'Wrap selected text in a fenced block', icon: <span className="workspace-format-mark">{'{ }'}</span> },
    { command: 'bullet', label: 'Toggle bullet list', hint: `${modifier}+Shift+8`, icon: <List aria-hidden="true" /> },
    { command: 'ordered', label: 'Toggle numbered list', hint: `${modifier}+Shift+7`, icon: <ListOrdered aria-hidden="true" /> },
    { command: 'task', label: 'Toggle task list', hint: 'Prefix selected lines with task boxes', icon: <Check aria-hidden="true" /> },
    { command: 'table', label: 'Insert table', hint: 'Insert a two-column Markdown table', icon: <Table2 aria-hidden="true" /> },
    { command: 'alert', label: 'Insert note alert', hint: 'Insert a Markdown alert', icon: <span className="workspace-format-mark">[!]</span> },
    { command: 'footnote', label: 'Insert footnote', hint: 'Insert a numbered footnote', icon: <span className="workspace-format-mark">[^]</span> },
  ]
  return (
    <div className="workspace-formatting" role="toolbar" aria-label="Markdown formatting">
      {commands.map(({ command, label, hint, icon }) => (
        <Tooltip key={command}>
          <TooltipTrigger render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={label}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onFormat(command)}
            />
          }>
            {icon}
          </TooltipTrigger>
          <TooltipContent role="tooltip">{label} · {hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export function EditorPane({
  pane,
  mode,
  state,
  note,
  types,
  tags,
  isActive,
  showHeader = true,
  recovery,
  error,
  textareaRef,
  onModeChange,
  onDraftChange,
  onActivate,
  onSave,
  onKeepMine,
  onClose,
  onHistory,
  onTogglePinned,
  onMoveToTrash,
  onCreateTag,
  onCopy,
  onExport,
  onFormat,
  onRecover,
  onDiscardRecovery,
  onConflictPreview,
}: EditorPaneProps) {
  const [newTagName, setNewTagName] = useState('')
  const [tagError, setTagError] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const draft = state.currentDraft
  const previewRef = useRef<HTMLDivElement>(null)
  const scrollMapRef = useRef<MarkdownScrollMap | null>(null)
  const scrollLeaderRef = useRef<HTMLElement | null>(null)
  const scrollEchoRef = useRef<{ target: HTMLElement; top: number } | null>(null)
  const scheduleMapRef = useRef<() => void>(() => {})
  const paneLabel = pane === 'primary' ? 'Note' : 'Side note'
  const isDeleted = Boolean(note?.deletedAt)
  const update = (patch: Partial<NoteDraft>) => onDraftChange({ ...draft, ...patch })
  const isEditing = mode === 'edit' || mode === 'split'
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'

  useLayoutEffect(() => {
    const source = textareaRef.current
    const preview = previewRef.current
    if (mode !== 'split' || !source || !preview) {
      scrollMapRef.current = null
      scrollLeaderRef.current = null
      scrollEchoRef.current = null
      scheduleMapRef.current = () => {}
      return
    }

    let frame = 0
    const syncMappedScroll = (leader: HTMLElement, map: MarkdownScrollMap) => {
      const isSource = leader === source
      const target = isSource ? preview : source
      const points = isSource ? map.sourceToPreview : map.previewToSource
      const maximum = isSource ? map.previewMaximum : map.sourceMaximum
      const top = Math.min(Math.max(interpolateScrollMap(points, leader.scrollTop), 0), maximum)
      scrollEchoRef.current = { target, top }
      target.scrollTop = top
    }
    const scheduleRebuild = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        const nextMap = buildMarkdownScrollMap(source, preview)
        scrollMapRef.current = nextMap
        const leader = scrollLeaderRef.current || source
        if (nextMap) syncMappedScroll(leader, nextMap)
        scrollLeaderRef.current = null
      })
    }
    scheduleMapRef.current = scheduleRebuild
    scheduleRebuild()

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRebuild)
    observer?.observe(source)
    observer?.observe(preview)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      scheduleMapRef.current = () => {}
    }
  }, [draft.content, mode, textareaRef])

  const syncPaneScroll = (source: HTMLElement, target: HTMLElement) => {
    if (mode !== 'split') return
    const echo = scrollEchoRef.current
    if (echo?.target === source) {
      scrollEchoRef.current = null
      if (Math.abs(source.scrollTop - echo.top) < 1) return
    }
    scrollLeaderRef.current = source
    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return
    const map = scrollMapRef.current
    if (!isMarkdownScrollMapCurrent(map, textarea, preview)) {
      scheduleMapRef.current()
      return
    }
    const isSource = source === textarea
    const points = isSource ? map.sourceToPreview : map.previewToSource
    const maximum = isSource ? map.previewMaximum : map.sourceMaximum
    const top = Math.min(Math.max(interpolateScrollMap(points, source.scrollTop), 0), maximum)
    scrollEchoRef.current = { target, top }
    target.scrollTop = top
  }

  return (
    <Card
      className={`workspace-pane ${pane === 'secondary' ? 'workspace-pane--side' : ''} ${isActive ? 'is-active' : ''}`}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
      data-pane={pane}
      role="region"
      aria-label={`${paneLabel} workspace pane`}
    >
      {showHeader && <CardHeader className="workspace-pane__header">
        <div className="workspace-pane__heading">
          <span className="workspace-pane__eyebrow">{pane === 'primary' ? 'PRIMARY NOTE' : 'SIDE NOTE'}</span>
          <div className="workspace-pane__title-row">
            {pane === 'primary'
              ? <h1 id="workspace-heading" tabIndex={-1} className="workspace-pane__title">{draft.id ? 'Edit note' : 'New note'}</h1>
              : <h2 className="workspace-pane__title">Side note</h2>}
            <WorkspaceSaveStatus state={state} />
          </div>
        </div>
        <div className="workspace-pane__header-actions">
          <WorkspaceModeSwitch mode={mode} paneLabel={paneLabel} onModeChange={onModeChange} />
          {pane === 'secondary' && (
            <Button type="button" variant="ghost" size="icon" aria-label="Close Side note" title="Close Side note" onClick={onClose}>
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardHeader>}

      <CardContent className="workspace-pane__body">
        {recovery && (
          <div className="workspace-recovery" role="region" aria-label={`${paneLabel} draft recovery`}>
            <div><strong>Unfinished draft found</strong><p>Saved {formatDate(recovery.savedAt)} in this browser tab.</p></div>
            <div className="workspace-recovery__actions">
              <Button type="button" size="sm" onClick={onRecover}>Recover draft</Button>
              <Button type="button" size="sm" variant="ghost" onClick={onDiscardRecovery}>Discard</Button>
            </div>
          </div>
        )}

        {isEditing ? <>
          <div className="workspace-metadata">
            <label className="workspace-field workspace-field--title">
              <span className="sr-only">Title</span>
              <Input
                className="workspace-title-input"
                name={`${pane}-title`}
                autoComplete="off"
                value={draft.title}
                maxLength={160}
                placeholder="Give this note a clear title"
                aria-label={`${paneLabel} title`}
                aria-invalid={error === 'title'}
                onChange={(event) => update({ title: event.currentTarget.value })}
                disabled={isDeleted}
              />
            </label>
            <label className="workspace-field workspace-field--type">
              <span className="sr-only">Type</span>
              <Select items={Object.fromEntries(types.map((type) => [type.id, type.name]))} value={draft.typeId || types[0]?.id || ''} onValueChange={(value) => { if (value) update({ typeId: value }) }} disabled={isDeleted}>
                <SelectTrigger aria-label={`${paneLabel} type`}>
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          <fieldset className="workspace-tags" disabled={isDeleted}>
            <legend className="sr-only">Tags</legend>
            <div className="workspace-tags__list">
              {tags.filter((tag) => draft.tagIds.includes(tag.id)).map((tag) => <Button key={tag.id} type="button" size="xs" variant="secondary" aria-label={`Remove tag ${tag.name}`} onClick={() => update({ tagIds: draft.tagIds.filter((id) => id !== tag.id) })}>{tag.name}<X aria-hidden="true" /></Button>)}
              <details className="workspace-tag-picker">
                <summary className="workspace-tag-picker__trigger inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground" aria-label="Add tag" title="Add tag"><Plus size={14} aria-hidden="true" /><span className="sr-only">Add tag</span></summary>
                <div className="workspace-tag-picker__panel rounded-md border border-border bg-popover p-2 shadow-md">
                  <div className="workspace-tag-picker__options" role="group" aria-label="Available tags">
                    {tags.filter((tag) => !draft.tagIds.includes(tag.id)).map((tag) => <Button key={tag.id} type="button" size="xs" variant="ghost" onClick={() => update({ tagIds: [...draft.tagIds, tag.id] })}>{tag.name}</Button>)}
                  </div>
                  <div className="workspace-tag-create">
                    <Input name={`${pane}-new-tag`} autoComplete="off" value={newTagName} maxLength={40} aria-label={`Create tag for ${paneLabel}`} placeholder="Create a tag" onChange={(event) => { setNewTagName(event.currentTarget.value); setTagError('') }} disabled={isDeleted || creatingTag} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createTag() } }} />
                    <Button type="button" size="sm" variant="outline" disabled={isDeleted || creatingTag || !newTagName.trim()} onClick={() => { void createTag() }}>{creatingTag ? 'Adding…' : 'Add tag'}</Button>
                  </div>
                  {tagError && <p className="workspace-inline-message" role="alert">{tagError}</p>}
                </div>
              </details>
            </div>
          </fieldset>
          </div>
        </> : <section className="workspace-readonly-metadata" aria-label={pane === 'primary' ? 'Note details' : 'Side note details'}>
          <h2 className="workspace-readonly-title">{draft.title || 'Untitled note'}</h2>
          <div className="workspace-readonly-chips"><span className="workspace-readonly-type rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">{types.find((type) => type.id === draft.typeId)?.name || 'General'}</span>{draft.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag) => Boolean(tag)).map((tag) => <span key={tag!.id} className="rounded-full border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground">{tag!.name}</span>)}</div>
        </section>}

        {isDeleted && <p className="workspace-inline-message" role="status">This note is in Trash. Restore it from the library before editing.</p>}

        {isEditing && (
          <section className={`workspace-content workspace-content--${mode}`} aria-label={`${paneLabel} Markdown editor`}>
            <MarkdownToolbar onFormat={onFormat} />
            <div className="workspace-editor-column">
              <div className="workspace-editor-label"><span>MARKDOWN</span><span>{draft.content.length.toLocaleString()} / 50,000</span></div>
              <Textarea
                ref={textareaRef}
                name={`${pane}-markdown`}
                autoComplete="off"
                className="workspace-source"
                value={draft.content}
                maxLength={50000}
                aria-label={`${paneLabel} Markdown source`}
                spellCheck={false}
                placeholder="Write anything you want to keep…"
                onChange={(event) => update({ content: event.currentTarget.value })}
                onFocus={onActivate}
                onScroll={(event) => {
                  const preview = previewRef.current
                  if (preview) syncPaneScroll(event.currentTarget, preview)
                }}
                disabled={isDeleted}
              />
            </div>
            {mode === 'split' && (
              <div className="workspace-preview-column">
                <div className="workspace-editor-label"><span>PREVIEW</span></div>
                <div
                  ref={previewRef}
                  className="workspace-preview-scroll note-content-preview"
                  tabIndex={0}
                  aria-label={`${paneLabel} rendered Markdown preview`}
                  onFocus={onActivate}
                  onWheel={() => { scrollLeaderRef.current = previewRef.current }}
                  onPointerDown={() => { scrollLeaderRef.current = previewRef.current }}
                  onScroll={(event) => {
                    const source = textareaRef.current
                    if (source) syncPaneScroll(event.currentTarget, source)
                  }}
                >
                  <MarkdownPreview source={draft.content} pane={pane} className="workspace-markdown-body" emptyText="No content yet." label={`${paneLabel} rendered Markdown`} sourceMap />
                </div>
              </div>
            )}
          </section>
        )}

        {mode === 'preview' && (
          <div className="workspace-preview-scroll workspace-preview-scroll--full quick-view-content" tabIndex={0} aria-label={`${paneLabel} rendered Markdown preview`} onFocus={onActivate}>
            <MarkdownPreview source={draft.content} pane={`${pane}-full`} className="workspace-markdown-body" emptyText="No content yet." label={`${paneLabel} rendered Markdown`} />
          </div>
        )}

        {note && (note.createdAt || note.updatedAt) && (
          <div className="workspace-note-dates">
            {note.createdAt && <span>Created {formatDate(note.createdAt)}</span>}
            {note.updatedAt && <span>Updated {formatDate(note.updatedAt)}</span>}
          </div>
        )}

        {state.conflict && (
          <section className="workspace-conflict" aria-label="Save conflict" role="alert">
            <div>
              <strong>{state.conflict.deleted ? 'This note was deleted elsewhere.' : 'A newer version was saved elsewhere.'}</strong>
              <p>Your local draft is still here. Review the newer version or retry your draft against it.</p>
            </div>
            <div className="workspace-conflict__actions">
              {!state.conflict.deleted && <Button type="button" size="sm" variant="outline" onClick={onConflictPreview}>View latest</Button>}
              <Button type="button" size="sm" onClick={onKeepMine}>{state.conflict.deleted ? 'Save as new' : 'Keep mine'}</Button>
            </div>
          </section>
        )}
        {state.error && state.phase === 'error' && <p className="workspace-inline-message" role="alert">{state.error.message || 'Could not save this note.'}</p>}
        {error === 'title' && <p className="workspace-inline-message" role="alert">A title is required before this note can be saved.</p>}
        {error === 'content' && <p className="workspace-inline-message" role="alert">This note is longer than the 50,000 character limit.</p>}
      </CardContent>

      <CardFooter className="workspace-pane__footer">
        <div className="workspace-export-actions">
          {draft.id && !isDeleted && <>
            <Button type="button" size="sm" variant="ghost" onClick={onMoveToTrash} disabled={state.saving} aria-label="Move note to Trash" title="Move to Trash"><Trash2 aria-hidden="true" /><span>Trash</span></Button>
            <Button type="button" size="sm" variant="ghost" onClick={onTogglePinned} disabled={state.dirty || state.saving} aria-label={note?.isPinned ? 'Unpin note' : 'Pin note'} title={state.dirty ? 'Save changes before pinning' : note?.isPinned ? 'Unpin note' : 'Pin note'}><Pin aria-hidden="true" fill={note?.isPinned ? 'currentColor' : 'none'} /><span>{note?.isPinned ? 'Unpin' : 'Pin'}</span></Button>
          </>}
          <Button type="button" size="sm" variant="ghost" onClick={onCopy}><Copy aria-hidden="true" /><span>Copy Markdown</span></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onExport('md')}><Download aria-hidden="true" /><span>.md</span></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onExport('txt')}><Download aria-hidden="true" /><span>.txt</span></Button>
          {draft.id && <Button type="button" size="sm" variant="ghost" onClick={onHistory}><Clock3 aria-hidden="true" /><span>History</span></Button>}
          {pane === 'primary' && <>
            <span className="workspace-help-divider" aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="sm" variant="ghost" aria-label="Show note shortcuts" />}><Keyboard aria-hidden="true" /></TooltipTrigger>
              <TooltipContent className="workspace-help-tooltip" align="start" role="tooltip"><strong>Note shortcuts</strong><span>1 Edit · 2 Split · 3 Preview</span><span>{modifier}+B Bold · {modifier}+I Italic · {modifier}+K Link</span><span>{modifier}+Shift+S Quick Save · {modifier}+Enter Save &amp; close</span></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="sm" variant="ghost" aria-label="Show Markdown guide" />}><Hash aria-hidden="true" /></TooltipTrigger>
              <TooltipContent className="workspace-help-tooltip" align="start" role="tooltip"><strong>Markdown guide</strong><span># Heading · **bold** · *italic* · `code`</span><span>- List · - [ ] Task · &gt; Quote</span><span>``` Code block · | A | B | Table</span></TooltipContent>
            </Tooltip>
          </>}
        </div>
        <div className="workspace-save-actions">
          {pane === 'primary' && <Button type="button" size="sm" variant="outline" onClick={onClose}>Close</Button>}
          <Tooltip>
            <TooltipTrigger render={<Button type="button" size="sm" variant="outline" onClick={() => onSave(false)} disabled={isDeleted || state.saving} />}>
              <Save aria-hidden="true" /><span>Save changes</span>
            </TooltipTrigger>
            <TooltipContent role="tooltip">Save and keep editing · {modifier}+Shift+S</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={pane === 'primary'
              ? <Button type="button" size="sm" onClick={() => onSave(true)} />
              : <Button type="button" size="sm" variant="outline" onClick={onClose} />
            }>
              {pane === 'primary' ? 'Done' : 'Close side note'}
            </TooltipTrigger>
            <TooltipContent role="tooltip">{pane === 'primary' ? `Finish editing · ${modifier}+Enter` : 'Close Side note'}</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  )

  async function createTag() {
    const name = newTagName.trim()
    if (!name || creatingTag || isDeleted) return
    setCreatingTag(true)
    setTagError('')
    try {
      await onCreateTag(name)
      setNewTagName('')
    } catch (cause) {
      setTagError(cause instanceof Error ? cause.message : 'Could not create this tag.')
    } finally {
      setCreatingTag(false)
    }
  }
}
