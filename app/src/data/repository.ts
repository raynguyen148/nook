import type {
  BackupInspection,
  LibrarySnapshot,
  Note,
  NoteRepository,
  NoteType,
  NoteVersion,
  SaveNoteInput,
  Tag,
} from "../domain/contracts"

// Keep the proven v3 IndexedDB implementation as the storage owner. Vite bundles
// this local script with the app; it has no network or package dependency.
import "../../../js/storage.js"

type LegacyStorageApi = NoteRepository & {
  readonly HISTORY_RETENTION_LIMIT: number
  readonly HISTORY_MAX_CONTENT_BYTES: number
}

function legacyStorage(): LegacyStorageApi {
  const namespace = globalThis as typeof globalThis & {
    PersonalNotesStorage?: LegacyStorageApi
  }
  if (!namespace.PersonalNotesStorage) {
    throw new Error("The local note storage module did not initialize.")
  }
  return namespace.PersonalNotesStorage
}

/** Typed repository boundary for the existing IndexedDB v3 storage contract. */
export const repository: NoteRepository = {
  get FALLBACK_TYPE_ID() {
    return legacyStorage().FALLBACK_TYPE_ID
  },
  get TYPE_COLORS() {
    return legacyStorage().TYPE_COLORS
  },
  initialize(): Promise<unknown> {
    return legacyStorage().initialize()
  },
  getSnapshot(options?: { includeHistory?: boolean }): Promise<LibrarySnapshot> {
    return legacyStorage().getSnapshot(options)
  },
  getNote(id: string): Promise<Note | null> {
    return legacyStorage().getNote(id)
  },
  saveNote(input: SaveNoteInput): Promise<Note> {
    return legacyStorage().saveNote(input)
  },
  deleteNote(id: string): Promise<void> {
    return legacyStorage().deleteNote(id)
  },
  restoreNote(id: string): Promise<Note> {
    return legacyStorage().restoreNote(id)
  },
  permanentlyDeleteNote(id: string): Promise<void> {
    return legacyStorage().permanentlyDeleteNote(id)
  },
  emptyTrash(): Promise<number> {
    return legacyStorage().emptyTrash()
  },
  setNotePinned(id: string, isPinned: boolean): Promise<Note> {
    return legacyStorage().setNotePinned(id, isPinned)
  },
  listNoteVersions(id: string, options?: { limit?: number }): Promise<NoteVersion[]> {
    return legacyStorage().listNoteVersions(id, options)
  },
  getNoteVersion(id: string, revision: number): Promise<NoteVersion | null> {
    return legacyStorage().getNoteVersion(id, revision)
  },
  restoreNoteVersion(
    id: string,
    revision: number,
    options?: { expectedRevision?: number },
  ): Promise<Note> {
    return legacyStorage().restoreNoteVersion(id, revision, options)
  },
  addType(input: { name: string; color?: string }): Promise<NoteType> {
    return legacyStorage().addType(input)
  },
  updateType(id: string, input: { name: string; color?: string }): Promise<NoteType> {
    return legacyStorage().updateType(id, input)
  },
  deleteType(id: string): Promise<number> {
    return legacyStorage().deleteType(id)
  },
  addTag(input: { name: string }): Promise<Tag> {
    return legacyStorage().addTag(input)
  },
  updateTag(id: string, input: { name: string }): Promise<Tag> {
    return legacyStorage().updateTag(id, input)
  },
  deleteTag(id: string): Promise<number> {
    return legacyStorage().deleteTag(id)
  },
  buildExport(): Promise<unknown> {
    return legacyStorage().buildExport()
  },
  inspectBackup(value: unknown): BackupInspection {
    return legacyStorage().inspectBackup(value)
  },
  importBackup(value: unknown): Promise<BackupInspection> {
    return legacyStorage().importBackup(value)
  },
  resetLibrary(): Promise<unknown> {
    return legacyStorage().resetLibrary()
  },
}
