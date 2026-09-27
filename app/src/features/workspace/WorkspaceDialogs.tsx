import { useId } from 'react'
import { Save, X } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ComfortableLayoutIcon, CompactLayoutIcon } from '@/components/NookIcons'
import type { Note, NoteType, NoteVersion, Tag } from '@/domain/contracts'
import { NoteCard } from '@/features/library/LibraryComponents'
import { MarkdownPreview } from '@/features/markdown/MarkdownPreview'
import { formatDate } from './EditorPane'
import type { CloseIntent, HistoryDialogState, PaneId, SideNoteLayoutMode, TrashConfirmationState } from './workspace-types'

interface WorkspaceDialogsProps {
  types: NoteType[]
  tags: Tag[]
  sidePickerOpen: boolean
  sideSearch: string
  availableSideNotes: Note[]
  sideNoteLayout: SideNoteLayoutMode
  closeIntent: CloseIntent | null
  closeBusy: boolean
  history: HistoryDialogState | null
  selectedHistoryVersion: NoteVersion | null
  restoreConfirmation: NoteVersion | null
  trashConfirmation: TrashConfirmationState | null
  trashDirty: boolean
  conflictPreview: { pane: PaneId; note: Note } | null
  conflictNote: Note | null
  onSidePickerOpenChange(open: boolean): void
  onSideSearchChange(value: string): void
  onChooseSideNote(note: Note, mode: 'preview' | 'edit'): void
  onCopySideNote(note: Note): void
  onTrashSideNote(note: Note): void
  onSideNoteLayoutChange(mode: SideNoteLayoutMode): void
  onDismissClose(): void
  onSaveAndResolveClose(): void
  onDiscardAndResolveClose(): void
  onHistoryClose(): void
  onHistorySelectRevision(revision: number): void
  onRequestRestoreVersion(): void
  onRestoreVersion(): void
  onCancelRestore(): void
  onTrashConfirmationOpenChange(open: boolean): void
  onConfirmTrash(): void
  onSaveAndTrash(): void
  onDiscardAndTrash(): void
  onCloseConflictPreview(): void
}

interface SideNotePickerProps {
  types: NoteType[]
  tags: Tag[]
  sideSearch: string
  availableSideNotes: Note[]
  sideNoteLayout: SideNoteLayoutMode
  onClose(): void
  onSideSearchChange(value: string): void
  onChooseSideNote(note: Note, mode: 'preview' | 'edit'): void
  onCopySideNote(note: Note): void
  onTrashSideNote(note: Note): void
  onSideNoteLayoutChange(mode: SideNoteLayoutMode): void
}

export function SideNotePicker({
  types,
  tags,
  sideSearch,
  availableSideNotes,
  sideNoteLayout,
  onClose,
  onSideSearchChange,
  onChooseSideNote,
  onCopySideNote,
  onTrashSideNote,
  onSideNoteLayoutChange,
}: SideNotePickerProps) {
  const titleId = useId()
  const fallbackType = types.find((type) => type.isFallback)
  return <section className="workspace-side-picker" id="side-note-picker" aria-labelledby={titleId}>
    <header className="workspace-side-picker__header">
      <h2 id={titleId}>Choose a side note</h2>
      <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:text-foreground" aria-label="Close Side note picker" onClick={onClose}><X className="size-4" aria-hidden="true" /></Button>
    </header>
    <div className="workspace-side-picker__toolbar">
      <Input name="side-note-search" autoComplete="off" autoFocus value={sideSearch} aria-label="Search notes for Side note" placeholder="Search title or content…" onChange={(event) => onSideSearchChange(event.currentTarget.value)} className="h-9 rounded-lg" />
      <div className="nook-layout-toggle workspace-note-picker__controls" role="group" aria-label="Side note picker layout">
        <Tooltip>
          <TooltipTrigger render={<Button type="button" size="icon-sm" variant={sideNoteLayout === 'focus' ? 'secondary' : 'ghost'} aria-label="Focus layout" aria-pressed={sideNoteLayout === 'focus'} onClick={() => onSideNoteLayoutChange('focus')}><CompactLayoutIcon /></Button>} />
          <TooltipContent role="tooltip">Focus view · 1</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button type="button" size="icon-sm" variant={sideNoteLayout === 'comfortable' ? 'secondary' : 'ghost'} aria-label="Comfortable layout" aria-pressed={sideNoteLayout === 'comfortable'} onClick={() => onSideNoteLayoutChange('comfortable')}><ComfortableLayoutIcon /></Button>} />
          <TooltipContent role="tooltip">Comfortable view · 2</TooltipContent>
        </Tooltip>
      </div>
    </div>
    <div className={`workspace-note-picker__list workspace-note-picker__list--side workspace-note-picker__list--${sideNoteLayout}`} role="region" aria-label="Side notes to open">
      {availableSideNotes.length ? availableSideNotes.map((note) => {
        const type = types.find((item) => item.id === note.typeId) ?? fallbackType
        return <NoteCard
          key={note.id}
          note={note}
          type={type}
          tags={note.tagIds.flatMap((id) => {
            const tag = tags.find((item) => item.id === id)
            return tag ? [tag] : []
          })}
          trash={false}
          sort="updated-desc"
          busy={false}
          layout={sideNoteLayout === 'focus' ? 'compact' : 'comfortable'}
          secondary
          openAriaLabel={`Open ${note.title || 'Untitled note'} as Side note`}
          editAriaLabel={`Edit ${note.title || 'Untitled note'} as Side note`}
          onOpen={() => onChooseSideNote(note, 'preview')}
          onEdit={() => onChooseSideNote(note, 'edit')}
          onPin={() => {}}
          onCopy={() => onCopySideNote(note)}
          onTrash={() => onTrashSideNote(note)}
          onRestore={() => {}}
          onPermanentlyDelete={() => {}}
          onTag={() => {}}
          onType={() => {}}
          onHover={() => {}}
        />
      }) : <p className="workspace-muted workspace-note-picker__empty text-center py-6 text-sm text-muted-foreground">No other notes are available.</p>}
    </div>
  </section>
}

export function WorkspaceDialogs({
  types,
  tags,
  sidePickerOpen,
  sideSearch,
  availableSideNotes,
  sideNoteLayout,
  closeIntent,
  closeBusy,
  history,
  selectedHistoryVersion,
  restoreConfirmation,
  trashConfirmation,
  trashDirty,
  conflictPreview,
  conflictNote,
  onSidePickerOpenChange,
  onSideSearchChange,
  onChooseSideNote,
  onCopySideNote,
  onTrashSideNote,
  onSideNoteLayoutChange,
  onDismissClose,
  onSaveAndResolveClose,
  onDiscardAndResolveClose,
  onHistoryClose,
  onHistorySelectRevision,
  onRequestRestoreVersion,
  onRestoreVersion,
  onCancelRestore,
  onTrashConfirmationOpenChange,
  onConfirmTrash,
  onSaveAndTrash,
  onDiscardAndTrash,
  onCloseConflictPreview,
}: WorkspaceDialogsProps) {
  const pickerTitleId = useId()
  const closeTitleId = useId()
  const historyTitleId = useId()
  const restoreTitleId = useId()
  const trashTitleId = useId()
  const conflictTitleId = useId()
  return <>
    <Dialog open={sidePickerOpen} onOpenChange={onSidePickerOpenChange}>
      <DialogContent className="workspace-dialog workspace-dialog--picker" aria-labelledby={pickerTitleId} initialFocus={false} showCloseButton={false}>
        <header className="workspace-dialog__header flex items-start justify-between pb-1">
          <div>
            <DialogTitle id={pickerTitleId} className="text-lg font-bold tracking-tight text-foreground">Open a Side note</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">Choose a note to keep beside your current work.</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:text-foreground" aria-label="Close Side note picker" onClick={() => onSidePickerOpenChange(false)}><X className="size-4" aria-hidden="true" /></Button>
        </header>
        <Input name="side-note-search" autoComplete="off" value={sideSearch} aria-label="Search notes for Side note" placeholder="Search notes" onChange={(event) => onSideSearchChange(event.currentTarget.value)} className="h-9 rounded-lg" />
        <div className="nook-layout-toggle workspace-note-picker__controls flex items-center justify-end gap-2 my-1" role="group" aria-label="Side note picker layout">
          <Button type="button" size="icon-sm" variant={sideNoteLayout === 'focus' ? 'secondary' : 'ghost'} aria-label="Focus layout" aria-pressed={sideNoteLayout === 'focus'} onClick={() => onSideNoteLayoutChange('focus')}><CompactLayoutIcon /></Button>
          <Button type="button" size="icon-sm" variant={sideNoteLayout === 'comfortable' ? 'secondary' : 'ghost'} aria-label="Comfortable layout" aria-pressed={sideNoteLayout === 'comfortable'} onClick={() => onSideNoteLayoutChange('comfortable')}><ComfortableLayoutIcon /></Button>
        </div>
        <div className={`workspace-note-picker__list workspace-note-picker__list--dialog workspace-note-picker__list--${sideNoteLayout}`}>
          {availableSideNotes.length ? availableSideNotes.map((note) => {
            const type = types.find((item) => item.id === note.typeId)
            return <NoteCard
              key={note.id}
              note={note}
              type={type}
              tags={note.tagIds.flatMap((id) => {
                const tag = tags.find((item) => item.id === id)
                return tag ? [tag] : []
              })}
              trash={false}
              sort="updated-desc"
              busy={false}
              layout={sideNoteLayout === 'focus' ? 'compact' : 'comfortable'}
              secondary
              openAriaLabel={`Open ${note.title || 'Untitled note'} as Side note`}
              editAriaLabel={`Edit ${note.title || 'Untitled note'} as Side note`}
              onOpen={() => onChooseSideNote(note, 'preview')}
              onEdit={() => onChooseSideNote(note, 'edit')}
              onPin={() => {}}
              onCopy={() => onCopySideNote(note)}
              onTrash={() => onTrashSideNote(note)}
              onRestore={() => {}}
              onPermanentlyDelete={() => {}}
              onTag={() => {}}
              onType={() => {}}
              onHover={() => {}}
            />
          }) : <p className="workspace-muted workspace-note-picker__empty text-center py-6 text-sm text-muted-foreground">No other notes are available.</p>}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(closeIntent)} onOpenChange={(open) => { if (!open) onDismissClose() }}>
      <AlertDialogContent className="workspace-dialog workspace-dialog--confirm" aria-labelledby={closeTitleId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={closeTitleId}>{closeIntent === 'workspace' ? 'Close this workspace?' : closeIntent === 'switch-secondary' ? 'Switch the Side note?' : 'Close the Side note?'}</AlertDialogTitle>
          <AlertDialogDescription>{closeIntent === 'workspace' ? 'Save your unfinished note sessions before returning to the library.' : 'The Side note has unfinished changes.'}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="workspace-dialog__actions">
          <Button type="button" disabled={closeBusy} onClick={onSaveAndResolveClose}><Save aria-hidden="true" />{closeBusy ? 'Saving…' : `Save and ${closeIntent === 'switch-secondary' ? 'switch' : 'close'}`}</Button>
          <Button type="button" variant="destructive" disabled={closeBusy} onClick={onDiscardAndResolveClose}>{closeIntent === 'switch-secondary' ? 'Discard and switch' : 'Discard changes'}</Button>
          <Button type="button" variant="outline" disabled={closeBusy} onClick={onDismissClose}>Keep editing</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(history)} onOpenChange={(open) => { if (!open) onHistoryClose() }}>
      <DialogContent className="workspace-dialog workspace-dialog--history" aria-labelledby={historyTitleId} showCloseButton={false}>
        <header className="workspace-dialog__header"><div>
          <DialogTitle id={historyTitleId}>Version history</DialogTitle>
          <DialogDescription>Earlier saved versions remain available after a restore.</DialogDescription>
        </div><Button type="button" variant="ghost" size="icon" aria-label="Close version history" onClick={onHistoryClose}><X aria-hidden="true" /></Button></header>
        {history?.loading ? <p role="status" className="workspace-muted">Loading saved versions…</p> : null}
        {history?.error && <p role="alert" className="workspace-inline-message">{history.error}</p>}
        {!history?.loading && !history?.versions.length && !history?.error && <p className="workspace-muted">No earlier saved versions yet.</p>}
        {history && history.versions.length > 0 && (
          <div className="workspace-history-layout">
            <div className="workspace-history-list" role="listbox" aria-label="Saved note versions">
              {history.versions.map((version) => (
                <button
                  key={version.revision}
                  type="button"
                  role="option"
                  aria-selected={version.revision === history.selectedRevision}
                  onClick={() => onHistorySelectRevision(version.revision)}
                >
                  <strong>{version.title || 'Untitled note'}</strong>
                  <span>Revision {version.revision}</span>
                  <small>{formatDate(version.archivedAt || version.updatedAt)}</small>
                </button>
              ))}
            </div>
            <section className="workspace-history-preview" aria-label="Selected version preview">
              {selectedHistoryVersion ? <>
                <div className="workspace-history-preview__heading"><strong>{selectedHistoryVersion.title || 'Untitled note'}</strong><span>Revision {selectedHistoryVersion.revision}</span></div>
                <div className="workspace-preview-scroll quick-view-content">
                  <MarkdownPreview source={selectedHistoryVersion.content} pane={`history-${selectedHistoryVersion.id}-${selectedHistoryVersion.revision}`} className="workspace-markdown-body" emptyText="No content in this version." label={`Revision ${selectedHistoryVersion.revision} preview`} />
                </div>
              </> : <p className="workspace-muted">Select a version to preview it.</p>}
            </section>
          </div>
        )}
        <footer className="workspace-dialog__footer">
          <Button type="button" variant="outline" onClick={onHistoryClose}>Close</Button>
          <Button type="button" disabled={!selectedHistoryVersion || history?.loading} onClick={onRequestRestoreVersion}>Restore this version</Button>
        </footer>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(restoreConfirmation)} onOpenChange={(open) => { if (!open) onCancelRestore() }}>
      <AlertDialogContent className="workspace-dialog workspace-dialog--confirm" aria-labelledby={restoreTitleId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={restoreTitleId}>Restore this version?</AlertDialogTitle>
          <AlertDialogDescription>The current note will be saved to history before revision {restoreConfirmation?.revision} becomes current.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="workspace-dialog__actions">
          <Button type="button" onClick={onRestoreVersion}>Restore version</Button>
          <Button type="button" variant="outline" onClick={onCancelRestore}>Keep current note</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={Boolean(trashConfirmation)} onOpenChange={onTrashConfirmationOpenChange}>
      <AlertDialogContent className="workspace-dialog workspace-dialog--confirm" aria-labelledby={trashTitleId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={trashTitleId}>Move this note to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {trashDirty
              ? `“${trashConfirmation?.note.title || 'Untitled note'}” has unsaved changes. Save them before moving the note, or discard them.`
              : `“${trashConfirmation?.note.title || 'Untitled note'}” will move to Trash and can be restored later.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {trashConfirmation?.error && <p role="alert" className="workspace-inline-message">{trashConfirmation.error}</p>}
        <AlertDialogFooter className="workspace-dialog__actions">
          {trashDirty ? <>
            <Button type="button" disabled={trashConfirmation?.busy} onClick={onSaveAndTrash}>Save and move to Trash</Button>
            <Button type="button" variant="destructive" disabled={trashConfirmation?.busy} onClick={onDiscardAndTrash}>Discard draft and move</Button>
          </> : <Button type="button" variant="destructive" disabled={trashConfirmation?.busy} onClick={onConfirmTrash}>Move to Trash</Button>}
          <Button type="button" variant="outline" disabled={trashConfirmation?.busy} onClick={() => onTrashConfirmationOpenChange(false)}>Keep note</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(conflictPreview)} onOpenChange={(open) => { if (!open) onCloseConflictPreview() }}>
      <DialogContent className="workspace-dialog workspace-dialog--conflict-preview" aria-labelledby={conflictTitleId} showCloseButton={false}>
        <header className="workspace-dialog__header"><div>
          <DialogTitle id={conflictTitleId}>Newer saved version</DialogTitle>
          <DialogDescription>{conflictNote ? `Revision ${conflictNote.revision} · saved ${formatDate(conflictNote.updatedAt)}` : 'This note is no longer available.'}</DialogDescription>
        </div><Button type="button" variant="ghost" size="icon" aria-label="Close newer version preview" onClick={onCloseConflictPreview}><X aria-hidden="true" /></Button></header>
        {conflictNote && <div className="workspace-preview-scroll quick-view-content"><MarkdownPreview source={conflictNote.content} pane={`conflict-${conflictPreview?.pane}-${conflictNote.id}`} className="workspace-markdown-body" label="Newer saved version preview" /></div>}
        <footer className="workspace-dialog__footer"><Button type="button" variant="outline" onClick={onCloseConflictPreview}>Keep my draft open</Button></footer>
      </DialogContent>
    </Dialog>
  </>
}
