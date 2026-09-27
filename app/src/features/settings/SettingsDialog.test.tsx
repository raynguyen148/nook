import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySnapshot, NoteRepository, NoteType, Tag } from '@/domain/contracts'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { SettingsDialog } from './SettingsDialog'

const { useNookMock, useOfflineStatusMock } = vi.hoisted(() => ({
  useNookMock: vi.fn(),
  useOfflineStatusMock: vi.fn(),
}))
vi.mock('@/app/NookContext', () => ({ useNook: useNookMock }))
vi.mock('@/app/OfflineContext', () => ({ useOfflineStatus: useOfflineStatusMock }))

const timestamp = '2026-09-01T10:00:00.000Z'
const fallbackType: NoteType = {
  id: 'type-general',
  name: 'General',
  normalizedName: 'general',
  color: 'slate',
  isFallback: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const normalType: NoteType = {
  id: 'type-work',
  name: 'Work',
  normalizedName: 'work',
  color: 'indigo',
  isFallback: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const tag: Tag = { id: 'tag-priority', name: 'priority', normalizedName: 'priority', createdAt: timestamp, updatedAt: timestamp }

function makeContext() {
  const repository = {
    TYPE_COLORS: ['indigo', 'blue', 'slate'],
    addType: vi.fn(async ({ name, color }: { name: string; color: string }) => ({ ...normalType, id: 'type-new', name, normalizedName: name.toLowerCase(), color })),
    updateType: vi.fn(async (id: string, input: { name: string; color?: string }) => ({ ...normalType, id, ...input, normalizedName: input.name.toLowerCase() })),
    deleteType: vi.fn(async () => 0),
    addTag: vi.fn(async ({ name }: { name: string }) => ({ ...tag, id: 'tag-new', name, normalizedName: name.toLowerCase() })),
    updateTag: vi.fn(async (id: string, input: { name: string }) => ({ ...tag, id, ...input, normalizedName: input.name.toLowerCase() })),
    deleteTag: vi.fn(async () => 1),
  } as unknown as NoteRepository & Record<string, ReturnType<typeof vi.fn>>

  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    return operation()
  }

  const snapshot: LibrarySnapshot = { notes: [], types: [fallbackType, normalType], tags: [tag], noteVersions: [] }
  return { repository, snapshot, mutate: vi.fn(mutate) }
}

function renderSettings(pendingBackup: Parameters<typeof SettingsDialog>[0]['pendingBackup'] = null) {
  const context = makeContext()
  useNookMock.mockReturnValue({
    ...context,
    openNote: vi.fn(),
    createNote: vi.fn(),
    closeWorkspace: vi.fn(),
    workspace: null,
    setDirtyDraftCount: vi.fn(),
    hasDirtyDrafts: false,
  })
  useOfflineStatusMock.mockReturnValue({
    status: 'ready',
    updateAvailable: false,
    canApplyUpdate: false,
    message: 'Nook is ready for offline visits.',
    applyUpdate: vi.fn(async () => false),
  })
  const onConfirmBackupImport = vi.fn(async () => undefined)
  const onRequestImportBackup = vi.fn()
  render(<ThemeProvider><SettingsDialog
    open
    onClose={vi.fn()}
    pendingBackup={pendingBackup}
    onConfirmBackupImport={onConfirmBackupImport}
    onCancelBackupImport={vi.fn()}
    onExportBackup={vi.fn()}
    onRequestImportBackup={onRequestImportBackup}
    hasDirtyDrafts={false}
    notice={null}
    error={null}
    clearFeedback={vi.fn()}
    backupLabel="Local · No backup yet"
    onOpenNotes={vi.fn()}
    onOpenSearch={vi.fn()}
    onCreateNote={vi.fn()}
    onOpenTrash={vi.fn()}
  /></ThemeProvider>)
  return { context, onConfirmBackupImport, onRequestImportBackup }
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    useNookMock.mockReset()
    useOfflineStatusMock.mockReset()
    window.localStorage.clear()
  })

  it('creates a note type and protects the fallback type from deletion', async () => {
    const { context } = renderSettings()
    expect(screen.getByRole('button', { name: 'Delete type General' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'New type' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Projects' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add type' }))

    await waitFor(() => expect(context.repository.addType).toHaveBeenCalledWith({ name: 'Projects', color: 'indigo' }))
    expect(context.mutate).toHaveBeenCalledTimes(1)
  })

  it('supports tag rename and delete through the shared repository mutation wrapper', async () => {
    const { context } = renderSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Tags' }))

    fireEvent.click(screen.getByRole('button', { name: 'Rename tag priority' }))
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'urgent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(context.repository.updateTag).toHaveBeenCalledWith('tag-priority', { name: 'urgent' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete tag priority' }))
    const alert = await screen.findByRole('alertdialog')
    fireEvent.click(within(alert).getByRole('button', { name: 'Delete tag' }))
    await waitFor(() => expect(context.repository.deleteTag).toHaveBeenCalledWith('tag-priority'))
    expect(context.mutate).toHaveBeenCalledTimes(2)
  })

  it('shows all seven appearance modes and applies the selected mode', async () => {
    const user = userEvent.setup()
    renderSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))

    await user.click(screen.getByRole('combobox', { name: 'Theme' }))
    for (const mode of ['Auto (follows system)', 'Light', 'Coffee', 'Forest', 'Midnight', 'Dark', 'Retro']) {
      expect(screen.getByRole('option', { name: mode })).toBeTruthy()
    }
    await user.click(screen.getByRole('option', { name: 'Dark' }))
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    expect(window.localStorage.getItem('nook:theme')).toBe('dark')
  })

  it('reviews a validated backup by filename and counts before explicit replacement', async () => {
    const pendingBackup = {
      data: { content: 'validated-local-backup' },
      filename: 'nook-family-backup.json',
      inspection: {
        format: 'personal-notes-backup',
        schemaVersion: 3,
        counts: { notes: 12, types: 4, tags: 7, noteVersions: 3 },
      },
    }
    const { onConfirmBackupImport } = renderSettings(pendingBackup)

    expect(await screen.findByRole('heading', { name: 'Back up' })).toBeTruthy()
    expect(screen.getByText('nook-family-backup.json')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace library' }))
    const alert = await screen.findByRole('alertdialog')
    fireEvent.click(within(alert).getByRole('button', { name: 'Replace library' }))

    await waitFor(() => expect(onConfirmBackupImport).toHaveBeenCalledTimes(1))
  })
})
