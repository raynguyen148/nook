import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySnapshot, Note, NoteRepository, WorkspaceMode } from '@/domain/contracts'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkspaceScreen } from './WorkspaceScreen'

const { useNookMock } = vi.hoisted(() => ({ useNookMock: vi.fn() }))
vi.mock('@/app/NookContext', () => ({ useNook: useNookMock }))

const timestamp = '2026-09-01T10:00:00.000Z'
const type = { id: 'type-general', name: 'General', normalizedName: 'general', color: 'slate', isFallback: true, createdAt: timestamp, updatedAt: timestamp }

function makeNote(id: string, title: string, content: string, revision = 1): Note {
  return {
    id,
    title,
    content,
    typeId: type.id,
    tagIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    isPinned: false,
    deletedAt: null,
    revision,
  }
}

function makeContext(notes: Note[], mode: WorkspaceMode = 'edit', noteId: string | null = notes[0]?.id ?? null) {
  const noteById = (id: string) => notes.find((note) => note.id === id) || null
  const repository = {
    FALLBACK_TYPE_ID: type.id,
    TYPE_COLORS: ['slate'],
    getNote: vi.fn(async (id: string) => noteById(id)),
    saveNote: vi.fn(async (input: { id: string; title: string; typeId: string; tagIds: string[]; content: string }) => makeNote(
      input.id || 'created-note', input.title, input.content, input.id ? (noteById(input.id)?.revision || 1) + 1 : 1,
    )),
    listNoteVersions: vi.fn(async () => []),
    addTag: vi.fn(async ({ name }: { name: string }) => ({ id: 'created-tag', name, normalizedName: name.toLowerCase(), createdAt: timestamp, updatedAt: timestamp })),
    setNotePinned: vi.fn(async (id: string, isPinned: boolean) => ({ ...noteById(id)!, isPinned, revision: (noteById(id)?.revision || 0) + 1 })),
    deleteNote: vi.fn(async () => undefined),
    restoreNote: vi.fn(async (id: string) => noteById(id)!),
    restoreNoteVersion: vi.fn(async (id: string, revision: number) => ({ ...noteById(id)!, revision })),
  } as unknown as NoteRepository & Record<string, ReturnType<typeof vi.fn>>
  const snapshot: LibrarySnapshot = { notes, types: [type], tags: [], noteVersions: [] }
  return {
    repository,
    snapshot,
    mutate: vi.fn(async <T,>(operation: () => Promise<T>) => operation()),
    closeWorkspace: vi.fn(),
    setDirtyDraftCount: vi.fn(),
    workspace: { noteId, mode },
  }
}

function WorkspaceHarness({ context }: { context: ReturnType<typeof makeContext> }) {
  const [mode, setMode] = useState(context.workspace.mode)
  useNookMock.mockReturnValue({ ...context, workspace: { ...context.workspace, mode }, setWorkspaceMode: setMode })
  return <TooltipProvider><WorkspaceScreen /></TooltipProvider>
}

describe('WorkspaceScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
    window.localStorage.clear()
    window.sessionStorage.clear()
    useNookMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('switches to a read-only Preview without exposing edit controls', async () => {
    const user = userEvent.setup()
    const context = makeContext([makeNote('note-1', 'Read only note', '# A rendered heading\n\nBody.')])
    render(<WorkspaceHarness context={context} />)

    await screen.findByRole('textbox', { name: 'Note Markdown source' })
    await user.click(screen.getByRole('button', { name: 'Preview', exact: true }))

    expect(await screen.findByRole('heading', { name: 'A rendered heading' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Note title' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Note type' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'General' })).toBeNull()
    expect(screen.getAllByText('Read only note').length).toBeGreaterThan(0)
  })

  it('renders source anchors in Split mode for Markdown-aware scrolling', async () => {
    const user = userEvent.setup()
    const context = makeContext([makeNote('note-1', 'Anchored note', '# First block\n\nText.\n\n## Later block')])
    render(<WorkspaceHarness context={context} />)
    await screen.findByRole('textbox', { name: 'Note Markdown source' })

    await user.click(screen.getByRole('button', { name: 'Split', exact: true }))

    const preview = await screen.findByRole('region', { name: 'Note rendered Markdown' })
    expect(preview.querySelector('h1')?.getAttribute('data-markdown-source-start')).toBe('0')
    expect(preview.querySelector('h2')?.getAttribute('data-markdown-source-start')).toBe('4')
  })

  it('protects a dirty new note and saves before closing when requested', async () => {
    const user = userEvent.setup()
    const context = makeContext([], 'edit', null)
    render(<WorkspaceHarness context={context} />)

    await user.type(await screen.findByRole('textbox', { name: 'Note title' }), 'Draft title')
    await user.type(screen.getByRole('textbox', { name: 'Note Markdown source' }), 'Draft content')
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done', exact: true }))

    await waitFor(() => expect(context.repository.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Draft title',
      content: 'Draft content',
    })))
    await waitFor(() => expect(context.closeWorkspace).toHaveBeenCalledOnce())
    const afterClose = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(afterClose)
    expect(afterClose.defaultPrevented).toBe(false)
  })

  it('keeps the primary and Side note drafts independent', async () => {
    const user = userEvent.setup()
    const context = makeContext([
      makeNote('primary', 'Main idea', 'Main content'),
      makeNote('side', 'Reference note', 'Reference content'),
    ])
    render(<WorkspaceHarness context={context} />)
    await screen.findByRole('textbox', { name: 'Note Markdown source' })

    await user.click(screen.getByRole('button', { name: 'Open Side note picker', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Edit Reference note as Side note' }))
    const sideContent = await screen.findByRole('textbox', { name: 'Side note Markdown source' })
    await user.type(sideContent, ' changed')

    expect((screen.getByRole('textbox', { name: 'Note Markdown source' }) as HTMLTextAreaElement).value).toBe('Main content')
    expect((sideContent as HTMLTextAreaElement).value).toBe('Reference content changed')
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
  })

  it('shows the keyboard hint on focus for formatting controls', async () => {
    const user = userEvent.setup()
    const context = makeContext([makeNote('note-1', 'Keyboard note', 'Text')])
    render(<WorkspaceHarness context={context} />)
    await screen.findByRole('textbox', { name: 'Note Markdown source' })

    const boldButton = screen.getByRole('button', { name: 'Toggle bold' })
    for (let tab = 0; tab < 30 && document.activeElement !== boldButton; tab += 1) await user.tab()
    expect(document.activeElement).toBe(boldButton)
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/Toggle bold · (⌘|Ctrl)\+B/)
  })
})
