import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bold,
  Braces,
  Clock3,
  Code,
  Copy,
  Download,
  Hash,
  Heading,
  Italic,
  Keyboard,
  List,
  ListOrdered,
  Plus,
  Save,
  SquareCheck,
  Strikethrough,
  Table,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  CheckIcon,
  EditModeIcon,
  FootnoteFormatIcon,
  PreviewModeIcon,
  SplitModeIcon,
} from '@/components/NookIcons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { NoteDraft, WorkspaceMode } from '@/domain/contracts'
import type { EditorSessionState } from '@/features/editor-session/session'
import { TypeDot } from '@/features/library/LibraryComponents'
import { MarkdownPreview } from '@/features/markdown/MarkdownPreview'
import { buildMarkdownScrollMap, interpolateScrollMap, isMarkdownScrollMapCurrent, type MarkdownScrollMap } from './split-scroll'
import { useSplitSelectionHighlight } from './split-selection'
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
  const modes = [
    { value: 'edit' as const, icon: <EditModeIcon className="size-4" aria-hidden="true" />, label: 'Edit', shortcut: '1', tooltip: 'Markdown editor' },
    { value: 'split' as const, icon: <SplitModeIcon className="size-4" aria-hidden="true" />, label: 'Split', shortcut: '2', tooltip: 'Split editor and preview' },
    { value: 'preview' as const, icon: <PreviewModeIcon className="size-4" aria-hidden="true" />, label: 'Preview', shortcut: '3', tooltip: 'Preview rendered note' },
  ]
  return (
    <div className="workspace-mode-switch" role="group" aria-label={`${paneLabel} display mode`}>
      {modes.map(({ value, icon, label, shortcut, tooltip }) => (
        <Tooltip key={value}>
          <TooltipTrigger render={
            <Button
              type="button"
              size="sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              aria-label={label}
              aria-pressed={mode === value}
              aria-keyshortcuts={shortcut}
              onClick={() => onModeChange(value)}
            >
              {icon}<span>{label}</span>
            </Button>
          } />
          <TooltipContent role="tooltip">
            <span className="inline-flex items-center gap-2">
              <span>{tooltip}</span>
              <kbd>{shortcut}</kbd>
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function MarkdownToolbar({ onFormat }: { onFormat(command: FormattingCommand): void }) {
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const commands: Array<{ command: FormattingCommand; label: string; hint: string; icon: ReactNode }> = [
    { command: 'heading', label: 'Heading', hint: 'Toggle line heading', icon: <Heading className="size-4" aria-hidden="true" /> },
    { command: 'bold', label: 'Bold', hint: `${modifier}+B`, icon: <Bold className="size-4" aria-hidden="true" /> },
    { command: 'italic', label: 'Italic', hint: `${modifier}+I`, icon: <Italic className="size-4" aria-hidden="true" /> },
    { command: 'strike', label: 'Strikethrough', hint: 'Wrap in ~~', icon: <Strikethrough className="size-4" aria-hidden="true" /> },
    { command: 'code', label: 'Inline code', hint: `${modifier}+E`, icon: <Code className="size-4" aria-hidden="true" /> },
    { command: 'code-block', label: 'Code block', hint: 'Wrap in fenced block', icon: <Braces className="size-4" aria-hidden="true" /> },
    { command: 'bullet', label: 'Bullet list', hint: `${modifier}+Shift+8`, icon: <List className="size-4" aria-hidden="true" /> },
    { command: 'ordered', label: 'Numbered list', hint: `${modifier}+Shift+7`, icon: <ListOrdered className="size-4" aria-hidden="true" /> },
    { command: 'task', label: 'Task list', hint: 'Prefix with task checkboxes', icon: <SquareCheck className="size-4" aria-hidden="true" /> },
    { command: 'table', label: 'Table', hint: 'Insert Markdown table', icon: <Table className="size-4" aria-hidden="true" /> },
    { command: 'alert', label: 'Alert', hint: 'Insert note callout alert', icon: <TriangleAlert className="size-4" aria-hidden="true" /> },
    { command: 'footnote', label: 'Footnote', hint: 'Insert numbered footnote', icon: <FootnoteFormatIcon className="size-4" /> },
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
              aria-label={`Toggle ${label.toLowerCase()}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onFormat(command)}
            >
              {icon}
            </Button>
          } />
          <TooltipContent role="tooltip">
            <span className="inline-flex items-center gap-2">
              <span>{label}</span>
              {hint && <kbd>{hint}</kbd>}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function ShortcutHelp({ modifier }: { modifier: string }) {
  const rows = [
    ['Markdown editor', ['1']],
    ['Split preview', ['2']],
    ['Preview', ['3']],
    ['Bold', [modifier, 'B']],
    ['Italic', [modifier, 'I']],
    ['Insert link', [modifier, 'K']],
    ['Inline code', [modifier, 'E']],
    ['Numbered list', [modifier, 'Shift', '7']],
    ['Bullet list', [modifier, 'Shift', '8']],
    ['Quick save', [modifier, 'Shift', 'S']],
    ['Save & close', [modifier, 'Enter']],
  ] as const

  return (
    <div className="workspace-help-tooltip__inner">
      <div className="workspace-help-tooltip__header">
        <Keyboard className="size-3.5 text-primary" aria-hidden="true" />
        <span className="workspace-help-tooltip__title">Note shortcuts</span>
      </div>
      <div className="workspace-help-tooltip__list">
        {rows.map(([label, keys]) => (
          <div className="workspace-help-tooltip__row" key={label}>
            <span className="workspace-help-tooltip__label">{label}</span>
            <span className="workspace-help-tooltip__keys">
              {keys.map((key, index) => (
                <span className="contents" key={`${label}-${key}`}>
                  {index > 0 && <span className="workspace-help-tooltip__plus" aria-hidden="true">+</span>}
                  <kbd>{key}</kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarkdownHelp() {
  const rows = [
    ['Heading', '#  ##  ###'],
    ['Bold', '**text**'],
    ['Italic', '*text*'],
    ['Strikethrough', '~~text~~'],
    ['Inline code', '`code`'],
    ['Code block', '```js … ```'],
    ['Bullet list', '- item'],
    ['Numbered list', '1. item'],
    ['Quote', '> text'],
    ['Task list', '- [ ] item'],
    ['Table', '| A | B |'],
    ['Alert', '> [!NOTE]'],
    ['Footnote', '[^1] / [^1]: …'],
  ] as const

  return (
    <div className="workspace-help-tooltip__inner">
      <div className="workspace-help-tooltip__header">
        <Hash className="size-3.5 text-primary" aria-hidden="true" />
        <span className="workspace-help-tooltip__title">Markdown guide</span>
      </div>
      <div className="workspace-help-tooltip__list">
        {rows.map(([label, syntax]) => (
          <div className="workspace-help-tooltip__row" key={label}>
            <span className="workspace-help-tooltip__label">{label}</span>
            <code>{syntax}</code>
          </div>
        ))}
      </div>
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
  className,
  showHeader = true,
  headerLeading,
  headerTrailing,
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
  const selectedType = types.find((type) => type.id === draft.typeId) ?? types.find((type) => type.isFallback) ?? null

  useSplitSelectionHighlight({
    enabled: mode === 'split',
    content: draft.content,
    sourceRef: textareaRef,
    previewRef,
  })

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

  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card
      className={`workspace-pane workspace-pane--${mode} ${pane === 'secondary' ? 'workspace-pane--side' : ''} ${isActive ? 'is-active' : ''} ${className || ''}`}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
      data-pane={pane}
      role="region"
      aria-label={`${paneLabel} workspace pane`}
    >
      {showHeader && <CardHeader className="workspace-pane__header">
        <div className="workspace-pane__header-leading">
          {headerLeading ?? <>
            {pane === 'primary'
              ? <h1 id="workspace-heading" tabIndex={-1} className="workspace-pane__state-label">{mode === 'preview' ? 'Preview note' : draft.id ? 'Edit note' : 'New note'}</h1>
              : <h2 className="workspace-pane__state-label">Side note</h2>}
            <WorkspaceSaveStatus state={state} />
          </>}
        </div>
        <div className="workspace-pane__header-actions">
          <WorkspaceModeSwitch mode={mode} paneLabel={paneLabel} onModeChange={onModeChange} />
          {headerTrailing}
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
          <div className="workspace-metadata mb-3">
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
            <div className="workspace-editor-meta">
              <label className="workspace-field workspace-field--type">
                <span className="sr-only">Type</span>
                <Select items={Object.fromEntries(types.map((type) => [type.id, type.name]))} value={selectedType?.id || draft.typeId || types[0]?.id || ''} onValueChange={(value) => { if (value) update({ typeId: value }) }} disabled={isDeleted}>
                  <SelectTrigger className="workspace-type-select" aria-label={`${paneLabel} type`}>
                    <TypeDot color={selectedType?.color ?? 'slate'} />
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent className="workspace-type-select__content" align="start" alignItemWithTrigger={false}>
                    {types.map((type) => <SelectItem key={type.id} value={type.id} className="workspace-type-select__option"><TypeDot color={type.color} /><span>{type.name}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <fieldset className="workspace-tags" disabled={isDeleted}>
                <legend className="sr-only">Tags</legend>
                <div className="workspace-tags__list flex items-center flex-wrap gap-1.5">
                  {tags.filter((tag) => draft.tagIds.includes(tag.id)).map((tag) => <Badge key={tag.id} render={<button type="button" />} variant="tag" className="workspace-tag-badge" aria-label={`Remove tag ${tag.name}`} onClick={() => update({ tagIds: draft.tagIds.filter((id) => id !== tag.id) })}>{tag.name}<X aria-hidden="true" /></Badge>)}
                  <details className="workspace-tag-picker">
                    <summary className="workspace-tag-picker__trigger inline-flex cursor-pointer items-center justify-center size-6 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted" aria-label="Add tag" title="Add tag"><Plus size={14} aria-hidden="true" /><span className="sr-only">Add tag</span></summary>
                    <div className="workspace-tag-picker__panel rounded-md border border-border bg-popover p-2 shadow-md">
                      <div className="workspace-tag-picker__options" role="group" aria-label="Available tags">
                        {tags.filter((tag) => !draft.tagIds.includes(tag.id)).map((tag) => <Badge key={tag.id} render={<button type="button" />} variant="tag" className="workspace-tag-badge workspace-tag-badge--option" onClick={() => update({ tagIds: [...draft.tagIds, tag.id] })}>{tag.name}</Badge>)}
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
          </div>
        </> : <section className="workspace-readonly-section mb-4" aria-label={pane === 'primary' ? 'Note details' : 'Side note details'}>
          <h1 className="workspace-readonly-title text-2xl font-bold tracking-tight text-foreground my-3">{draft.title || 'Untitled note'}</h1>
          <div className="workspace-readonly-context">
            {(() => {
              const currentType = types.find((type) => type.id === draft.typeId) ?? types.find((type) => type.isFallback)
              return currentType ? (
                <div className="workspace-readonly-type flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <TypeDot color={currentType.color} />
                  <span>{currentType.name}</span>
                </div>
              ) : null
            })()}
            {draft.tagIds.length > 0 && (
              <div className="workspace-readonly-tags flex flex-wrap items-center gap-1 mt-1">
                {draft.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is typeof tags[number] => Boolean(tag)).map((tag) => (
                  <Badge key={tag.id} variant="tag">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
            {draft.tagIds.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
          </div>
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
                  key={`${pane}-split-preview`}
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

        {mode === 'preview' && <>
          <div className="workspace-preview-label">CONTENT</div>
          <div key={`${pane}-full-preview`} className="workspace-preview-scroll workspace-preview-scroll--full quick-view-content" tabIndex={0} aria-label={`${paneLabel} rendered Markdown preview`} onFocus={onActivate}>
            <MarkdownPreview source={draft.content} pane={`${pane}-full`} className="workspace-markdown-body" emptyText="No content yet." label={`${paneLabel} rendered Markdown`} />
          </div>
        </>}

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

      <CardFooter className={`workspace-pane__footer ${pane === 'secondary' ? 'workspace-pane__footer--side' : ''}`}>
        <div className="workspace-export-actions">
          <Tooltip>
            <TooltipTrigger render={
              <Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action" aria-label="Copy Markdown" onClick={handleCopy}>
                {copied ? <CheckIcon className="size-4 text-primary" /> : <Copy className="size-4" aria-hidden="true" />}
              </Button>
            } />
            <TooltipContent role="tooltip">{copied ? 'Copied to clipboard!' : 'Copy raw Markdown source'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action" aria-label="Export .md file" onClick={onExport}>
                <Download className="size-4" aria-hidden="true" />
              </Button>
            } />
            <TooltipContent role="tooltip">Export as Markdown (.md)</TooltipContent>
          </Tooltip>
          {draft.id && (
            <Tooltip>
              <TooltipTrigger render={
                <Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action" aria-label="Open version history" onClick={onHistory}>
                  <Clock3 className="size-4" aria-hidden="true" />
                </Button>
              } />
              <TooltipContent role="tooltip">Version history</TooltipContent>
            </Tooltip>
          )}
          {pane === 'primary' && <>
            <span className="workspace-help-divider" aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action" aria-label="Show note shortcuts"><Keyboard className="size-4" aria-hidden="true" /></Button>} />
              <TooltipContent className="workspace-help-tooltip" align="start" sideOffset={8} role="tooltip"><ShortcutHelp modifier={modifier} /></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action" aria-label="Show Markdown guide"><Hash className="size-4" aria-hidden="true" /></Button>} />
              <TooltipContent className="workspace-help-tooltip workspace-help-tooltip--markdown" align="start" sideOffset={8} role="tooltip"><MarkdownHelp /></TooltipContent>
            </Tooltip>
          </>}
          {draft.id && !isDeleted && <Tooltip>
            <TooltipTrigger render={<Button type="button" size="icon-xs" variant="ghost" className="workspace-icon-action workspace-icon-action--danger" aria-label="Move note to Trash" onClick={onMoveToTrash} disabled={state.saving}><Trash2 className="size-4" aria-hidden="true" /></Button>} />
            <TooltipContent role="tooltip">Move note to Trash</TooltipContent>
          </Tooltip>}
        </div>
        <div className="workspace-save-actions">
          {pane === 'primary' && <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={onClose}>Close</Button>}
          {isEditing && state.dirty && <Tooltip>
            <TooltipTrigger render={
              <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs flex items-center gap-1.5" onClick={() => onSave(false)} disabled={isDeleted || state.saving}>
                <Save className="size-4" aria-hidden="true" /><span>Save changes</span>
              </Button>
            } />
            <TooltipContent role="tooltip">
              <span className="inline-flex items-center gap-2">
                <span>Save and keep editing</span>
                <kbd>{modifier}+Shift+S</kbd>
              </span>
            </TooltipContent>
          </Tooltip>}
          <Tooltip>
            <TooltipTrigger render={pane === 'primary'
              ? <Button type="button" size="sm" className="h-8 rounded-lg px-4 text-xs font-medium" onClick={() => onSave(true)}>Done</Button>
              : <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={onClose}>Close side note</Button>
            } />
            <TooltipContent role="tooltip">
              <span className="inline-flex items-center gap-2">
                <span>{pane === 'primary' ? 'Finish editing' : 'Close Side note'}</span>
                {pane === 'primary' && <kbd>{modifier}+Enter</kbd>}
              </span>
            </TooltipContent>
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
