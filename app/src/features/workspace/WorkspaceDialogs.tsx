import { useId } from 'react'
import { Copy, Grid2X2, List, Pencil, Save, Trash2, X } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Note, NoteType, NoteVersion, Tag } from '@/domain/contracts'
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
        <header className="workspace-dialog__header">
          <div><DialogTitle id={pickerTitleId}>Open a Side note</DialogTitle><DialogDescription>Choose a note to keep beside your current work.</DialogDescription></div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close Side note picker" onClick={() => onSidePickerOpenChange(false)}><X aria-hidden="true" /></Button>
        </header>
        <Input name="side-note-search" autoComplete="off" value={sideSearch} aria-label="Search notes for Side note" placeholder="Search notes" onChange={(event) => onSideSearchChange(event.currentTarget.value)} />
        <div className="workspace-note-picker__controls" role="group" aria-label="Side note picker layout">
          <Button type="button" size="sm" variant={sideNoteLayout === 'focus' ? 'secondary' : 'ghost'} aria-pressed={sideNoteLayout === 'focus'} onClick={() => onSideNoteLayoutChange('focus')}><List aria-hidden="true" />Focus</Button>
          <Button type="button" size="sm" variant={sideNoteLayout === 'comfortable' ? 'secondary' : 'ghost'} aria-pressed={sideNoteLayout === 'comfortable'} onClick={() => onSideNoteLayoutChange('comfortable')}><Grid2X2 aria-hidden="true" />Comfortable</Button>
        </div>
        <div className={`workspace-note-picker__list workspace-note-picker__list--${sideNoteLayout}`}>
          {availableSideNotes.length ? availableSideNotes.map((note) => (
            <article key={note.id} className="workspace-note-picker__card">
              <button type="button" className="workspace-note-picker__item" aria-label={`Open ${note.title || 'Untitled note'} as Side note`} onClick={() => onChooseSideNote(note, 'preview')}>
                <span className="workspace-note-picker__title">{note.title || 'Untitled note'}</span>
                <span className="workspace-note-picker__meta">{types.find((type) => type.id === note.typeId)?.name || 'General'} · {formatDate(note.updatedAt)}</span>
                <span className="workspace-note-picker__preview">{note.content.slice(0, 140).replace(/\s+/g, ' ') || 'No content yet.'}</span>
                {sideNoteLayout === 'comfortable' && <span className="workspace-note-picker__tags">{note.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean).join(' · ') || 'No tags'}</span>}
              </button>
              <div className="workspace-note-picker__actions" role="group" aria-label={`${note.title || 'Untitled note'} actions`}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${note.title || 'Untitled note'} as Side note`} title="Edit in Side note" onClick={() => onChooseSideNote(note, 'edit')}><Pencil aria-hidden="true" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Copy ${note.title || 'Untitled note'} Markdown`} title="Copy Markdown" onClick={() => onCopySideNote(note)}><Copy aria-hidden="true" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${note.title || 'Untitled note'} to Trash`} title="Move to Trash" onClick={() => onTrashSideNote(note)}><Trash2 aria-hidden="true" /></Button>
              </div>
            </article>
          )) : <p className="workspace-muted workspace-note-picker__empty">No other notes are available.</p>}
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
