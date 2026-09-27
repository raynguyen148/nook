export interface Note {
  id: string
  title: string
  typeId: string
  tagIds: string[]
  content: string
  createdAt: string
  updatedAt: string
  isPinned: boolean
  deletedAt: string | null
  revision: number
}

export interface NoteType {
  id: string
  name: string
  normalizedName: string
  color: string
  isFallback: boolean
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  name: string
  normalizedName: string
  createdAt: string
  updatedAt: string
}

export interface NoteVersion extends Note {
  noteId: string
  archivedAt: string
}

export interface LibrarySnapshot {
  notes: Note[]
  types: NoteType[]
  tags: Tag[]
  noteVersions: NoteVersion[]
}

export interface NoteDraft {
  id: string
  title: string
  typeId: string
  tagIds: string[]
  content: string
}

export interface SaveNoteInput extends NoteDraft {
  expectedRevision?: number
}

export interface BackupInspection {
  format: string
  schemaVersion: number
  counts: { notes: number; types: number; tags: number; noteVersions: number }
}

export interface NoteConflict extends Error {
  code: 'NOTE_CONFLICT'
  latestNote: Note | null
}

export interface NoteRepository {
  readonly FALLBACK_TYPE_ID: string
  readonly TYPE_COLORS: readonly string[]
  initialize(): Promise<unknown>
  getSnapshot(options?: { includeHistory?: boolean }): Promise<LibrarySnapshot>
  getNote(id: string): Promise<Note | null>
  saveNote(input: SaveNoteInput): Promise<Note>
  deleteNote(id: string): Promise<void>
  restoreNote(id: string): Promise<Note>
  permanentlyDeleteNote(id: string): Promise<void>
  emptyTrash(): Promise<number>
  setNotePinned(id: string, isPinned: boolean): Promise<Note>
  listNoteVersions(id: string, options?: { limit?: number }): Promise<NoteVersion[]>
  getNoteVersion(id: string, revision: number): Promise<NoteVersion | null>
  restoreNoteVersion(id: string, revision: number, options?: { expectedRevision?: number }): Promise<Note>
  addType(input: { name: string; color?: string }): Promise<NoteType>
  updateType(id: string, input: { name: string; color?: string }): Promise<NoteType>
  deleteType(id: string): Promise<number>
  addTag(input: { name: string }): Promise<Tag>
  updateTag(id: string, input: { name: string }): Promise<Tag>
  deleteTag(id: string): Promise<number>
  buildExport(): Promise<unknown>
  inspectBackup(value: unknown): BackupInspection
  importBackup(value: unknown): Promise<BackupInspection>
  resetLibrary(): Promise<unknown>
}

export type WorkspaceMode = 'preview' | 'edit' | 'split'
export interface WorkspaceLocation { noteId: string | null; mode: WorkspaceMode; openSideNotePicker?: boolean }
