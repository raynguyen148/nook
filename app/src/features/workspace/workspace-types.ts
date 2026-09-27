import type { RefObject } from 'react'
import type { Note, NoteDraft, NoteType, NoteVersion, Tag, WorkspaceMode } from '@/domain/contracts'
import type { DraftRecoveryRecord, EditorPaneId, EditorSession, EditorSessionState } from '@/features/editor-session/session'

export type PaneId = EditorPaneId
export type FormattingCommand = 'bold' | 'italic' | 'strike' | 'code' | 'code-block' | 'link' | 'bullet' | 'ordered' | 'task' | 'quote' | 'heading' | 'table' | 'alert' | 'footnote' | 'rule'
export type CloseIntent = 'workspace' | 'secondary' | 'switch-secondary'
export type SideNoteLayoutMode = 'focus' | 'comfortable'

export interface SidePane {
  noteId: string
  session: EditorSession
  mode: WorkspaceMode
}

export interface HistoryDialogState {
  pane: PaneId
  noteId: string
  versions: NoteVersion[]
  selectedRevision: number | null
  loading: boolean
  error: string
}

export interface TrashConfirmationState {
  note: Note
  pane: PaneId | null
  error: string
  busy: boolean
}

export interface EditorPaneProps {
  pane: PaneId
  mode: WorkspaceMode
  state: EditorSessionState
  note: Note | null
  types: NoteType[]
  tags: Tag[]
  isActive: boolean
  showHeader?: boolean
  recovery: DraftRecoveryRecord | null
  error: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onModeChange(mode: WorkspaceMode): void
  onDraftChange(draft: NoteDraft): void
  onActivate(): void
  onSave(closeAfterSave?: boolean): void
  onKeepMine(): void
  onClose(): void
  onHistory(): void
  onTogglePinned(): void
  onMoveToTrash(): void
  onCreateTag(name: string): Promise<void>
  onCopy(): void
  onExport(extension: 'md' | 'txt'): void
  onFormat(command: FormattingCommand): void
  onRecover(): void
  onDiscardRecovery(): void
  onConflictPreview(): void
}
