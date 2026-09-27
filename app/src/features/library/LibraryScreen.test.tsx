import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySnapshot, Note, NoteRepository } from '@/domain/contracts'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { LibraryScreen } from './LibraryScreen'

const { useNookMock } = vi.hoisted(() => ({ useNookMock: vi.fn() }))
vi.mock('@/app/NookContext', () => ({ useNook: useNookMock }))
vi.mock('@/app/OfflineContext', () => ({
  useOfflineStatus: () => ({ status: 'ready', updateAvailable: false, canApplyUpdate: false, message: 'Ready for offline visits.', applyUpdate: vi.fn(async () => false) }),
}))

const timestamp = '2026-09-01T10:00:00.000Z'
const types: LibrarySnapshot['types'] = [
  { id: 'type-general', name: 'General', normalizedName: 'general', color: 'slate', isFallback: true, createdAt: timestamp, updatedAt: timestamp },
  { id: 'type-work', name: 'Work', normalizedName: 'work', color: 'indigo', isFallback: false, createdAt: timestamp, updatedAt: timestamp },
]
const tags: LibrarySnapshot['tags'] = [
  { id: 'tag-work', name: 'work', normalizedName: 'work', createdAt: timestamp, updatedAt: timestamp },
  { id: 'tag-planning', name: 'planning', normalizedName: 'planning', createdAt: timestamp, updatedAt: timestamp },
]

function makeNote(id: string, title: string, content: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title,
    content,
    typeId: 'type-work',
    tagIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    isPinned: false,
    deletedAt: null,
    revision: 1,
    ...overrides,
  }
}

function makeContext(notes: Note[]) {
  const repository = {
    TYPE_COLORS: ['indigo', 'blue', 'slate'],
    deleteNote: vi.fn(async () => undefined),
    restoreNote: vi.fn(async (id: string) => notes.find((note) => note.id === id)!),
    permanentlyDeleteNote: vi.fn(async () => undefined),
    emptyTrash: vi.fn(async () => notes.filter((note) => note.deletedAt).length),
    setNotePinned: vi.fn(async () => notes[0]),
    buildExport: vi.fn(async () => ({ format: 'nook-backup' })),
    inspectBackup: vi.fn(() => ({ format: 'nook-backup', schemaVersion: 3, counts: { notes: 0, types: 1, tags: 0, noteVersions: 0 } })),
    importBackup: vi.fn(async () => ({ format: 'nook-backup', schemaVersion: 3, counts: { notes: 0, types: 1, tags: 0, noteVersions: 0 } })),
  } as unknown as NoteRepository & Record<string, ReturnType<typeof vi.fn>>

  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    return operation()
  }

  return {
    repository,
    snapshot: { notes, types, tags, noteVersions: [] },
    mutate: vi.fn(mutate),
    openNote: vi.fn(),
    createNote: vi.fn(),
    closeWorkspace: vi.fn(),
    workspace: null,
    setDirtyDraftCount: vi.fn(),
    hasDirtyDrafts: false,
  }
}

function renderLibrary(notes: Note[]) {
  const context = makeContext(notes)
  useNookMock.mockReturnValue(context)
  window.localStorage.clear()
  return {
    context,
    ...render(<ThemeProvider><LibraryScreen /></ThemeProvider>),
  }
}

describe('LibraryScreen', () => {
  beforeEach(() => {
    useNookMock.mockReset()
    window.localStorage.clear()
  })

  it('searches title and Markdown content and sorts pinned notes ahead of newer notes', () => {
    renderLibrary([
      makeNote('pinned', 'Pinned older note', 'An older pinned idea.', { isPinned: true, createdAt: '2026-08-01T10:00:00.000Z' }),
      makeNote('newer', 'Newer note', 'A new item.', { createdAt: '2026-09-07T10:00:00.000Z' }),
      makeNote('content-hit', 'Content result', 'The searchable phrase is inside this Markdown.'),
    ])

    expect(document.querySelector('.nook-note-card')?.getAttribute('data-note-id')).toBe('pinned')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search title or content' }), { target: { value: 'searchable phrase' } })
    expect(screen.getByRole('button', { name: 'Content result' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Newer note' })).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search title or content' }), { target: { value: 'Newer note' } })
    expect(screen.getByRole('button', { name: 'Newer note' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Content result' })).toBeNull()
  })

  it('applies all selected tag filters together and clears them as one action', () => {
    renderLibrary([
      makeNote('both', 'Both tags', 'Matches both selected tags.', { tagIds: ['tag-work', 'tag-planning'] }),
      makeNote('work-only', 'Work only', 'Matches one selected tag.', { tagIds: ['tag-work'] }),
      makeNote('planning-only', 'Planning only', 'Matches the other tag.', { tagIds: ['tag-planning'] }),
    ])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Filter by tag work' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Filter by tag planning' }))

    expect(document.querySelectorAll('.nook-note-card')).toHaveLength(1)
    expect(document.querySelector('.nook-note-card')?.getAttribute('data-note-id')).toBe('both')

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(document.querySelectorAll('.nook-note-card')).toHaveLength(3)
  })

  it('offers undo after moving a note to Trash and restores it through the repository', async () => {
    const { context } = renderLibrary([makeNote('note-1', 'Keep this note', 'Useful content.')])

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash: Keep this note' }))
    await waitFor(() => expect(context.repository.deleteNote).toHaveBeenCalledWith('note-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(context.repository.restoreNote).toHaveBeenCalledWith('note-1'))
  })

  it('requires confirmation before permanently deleting a trashed note', async () => {
    const trashed = makeNote('old-note', 'Old note', 'No longer needed.', { deletedAt: '2026-09-06T10:00:00.000Z' })
    const { context } = renderLibrary([trashed])

    fireEvent.click(screen.getByRole('button', { name: 'Trash', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently: Old note' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', exact: true }))

    await waitFor(() => expect(context.repository.permanentlyDeleteNote).toHaveBeenCalledWith('old-note'))
  })
})
