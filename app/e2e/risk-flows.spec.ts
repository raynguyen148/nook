import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const demoBackup = readFileSync(new URL('../../docs/sample-data/nook-demo-library.json', import.meta.url))

async function openLibrary(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
}

async function importBackup(page: Page, buffer: Buffer) {
  await page.getByLabel('Choose a Nook backup file').setInputFiles({
    name: 'synthetic-backup.json', mimeType: 'application/json', buffer,
  })
  await page.getByRole('tab', { name: 'Data' }).click()
  await expect(page.getByRole('region', { name: 'Backup replacement review' })).toBeVisible()
  await page.getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
}

async function editDemoNote(page: Page) {
  await page.getByRole('textbox', { name: 'Search title or content' }).fill('Code review checklist for risky changes')
  await page.getByRole('button', { name: 'Edit Code review checklist for risky changes' }).click()
  await expect(page.getByRole('textbox', { name: 'Note Markdown source' })).toBeVisible()
}

test('Delete all data requires the exact confirmation phrase and resets the synthetic library', async ({ page }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Data' }).click()
  await page.getByRole('button', { name: 'Delete data…' }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Delete all data?' })
  await expect(confirmation.getByRole('button', { name: 'Delete all data' })).toBeDisabled()
  await confirmation.getByRole('textbox', { name: /Type DELETE/ }).fill('DELETE')
  await confirmation.getByRole('button', { name: 'Delete all data' }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your library is ready' })).toBeVisible()
})

test('exports a real v3 backup with history and imports it in a separate browser profile', async ({ browser, page }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  await editDemoNote(page)
  const source = page.getByRole('textbox', { name: 'Note Markdown source' })
  await source.fill('# Updated for round trip\n\nA synthetic note.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' }).first()).toBeVisible()
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Backup', exact: true }).click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const exportedBuffer = readFileSync(downloadedPath!)
  const backup = JSON.parse(exportedBuffer.toString()) as {
    format: string
    schemaVersion: number
    data: { notes: Array<{ title: string; content: string }>; noteVersions: unknown[] }
  }
  expect(backup.format).toBe('personal-notes-backup')
  expect(backup.schemaVersion).toBe(3)
  expect(backup.data.notes.find((note) => note.title === 'Code review checklist for risky changes')?.content)
    .toBe('# Updated for round trip\n\nA synthetic note.')
  expect(backup.data.noteVersions.length).toBeGreaterThan(0)

  const secondContext = await browser.newContext()
  try {
    const secondPage = await secondContext.newPage()
    await openLibrary(secondPage)
    await importBackup(secondPage, exportedBuffer)
    await secondPage.getByRole('textbox', { name: 'Search title or content' }).fill('Updated for round trip')
    await expect(secondPage.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
  } finally {
    await secondContext.close()
  }
})

test('a second tab keeps its dirty draft through a revision conflict and Keep mine', async ({ page, context }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  const secondPage = await context.newPage()
  await openLibrary(secondPage)
  await editDemoNote(page)
  await editDemoNote(secondPage)

  await secondPage.getByRole('textbox', { name: 'Note Markdown source' }).fill('# Draft from tab two')
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('# Saved from tab one')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(secondPage.getByRole('alert', { name: 'Save conflict' })).toBeVisible()
  await expect(secondPage.getByRole('textbox', { name: 'Note Markdown source' })).toHaveValue('# Draft from tab two')
  await secondPage.getByRole('button', { name: 'Keep mine' }).click()
  await expect(secondPage.getByRole('alert', { name: 'Save conflict' })).toHaveCount(0)
  await expect(secondPage.getByRole('status').filter({ hasText: 'saved' }).first()).toBeVisible()
  await secondPage.reload()
  await secondPage.getByRole('textbox', { name: 'Search title or content' }).fill('Draft from tab two')
  await expect(secondPage.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
})

test('new-note draft recovers after reload and the dirty close guard requires a choice', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Interrupted synthetic draft')
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('Unfinished browser text.')
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Close this workspace?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('textbox', { name: 'Note Markdown source' })).toHaveValue('Unfinished browser text.')

  await page.reload()
  await page.getByRole('button', { name: 'New note' }).first().click()
  await expect(page.getByRole('region', { name: 'Note draft recovery' })).toBeVisible()
  await page.getByRole('button', { name: 'Recover draft' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Interrupted synthetic draft')
  await expect(page.getByRole('textbox', { name: 'Note Markdown source' })).toHaveValue('Unfinished browser text.')
})

test('history previews and restores an earlier committed version', async ({ page }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  await editDemoNote(page)
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('# Second committed version')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  const history = page.getByRole('dialog', { name: 'Version history' })
  await expect(history.getByRole('option', { name: /Revision 1/ })).toBeVisible()
  await expect(history).toContainText('Code review checklist')
  await history.getByRole('button', { name: 'Restore this version' }).click()
  await page.getByRole('alertdialog', { name: 'Restore this version?' }).getByRole('button', { name: 'Restore version' }).click()
  await expect(page.getByRole('textbox', { name: 'Note Markdown source' })).toHaveValue(/# Code review checklist/)
})

test('editor tag picker adds and removes tags, then shows saved chips in Preview', async ({ page }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  await editDemoNote(page)

  await page.getByRole('combobox', { name: 'Note type' }).click()
  const typeOptionAlignment = await page.getByRole('option').first().evaluate((option) => {
    const optionRect = option.getBoundingClientRect()
    const dotRect = option.querySelector<HTMLElement>('.nook-type-dot')?.getBoundingClientRect()
    return dotRect ? Math.abs((optionRect.top + optionRect.height / 2) - (dotRect.top + dotRect.height / 2)) : Number.POSITIVE_INFINITY
  })
  expect(typeOptionAlignment).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')

  await page.locator('summary.workspace-tag-picker__trigger').click()
  const availableTags = page.getByRole('group', { name: 'Available tags' })
  const editorTag = availableTags.getByRole('button', { name: 'dev', exact: true })
  const sidebarTag = page.locator('.nook-tag-filter').filter({ hasText: /^dev/ }).first()
  const [editorTagStyle, sidebarTagStyle] = await Promise.all([editorTag, sidebarTag].map((tag) => tag.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      paddingBlock: `${style.paddingTop} ${style.paddingBottom}`,
      paddingInline: `${style.paddingLeft} ${style.paddingRight}`,
    }
  })))
  expect(editorTagStyle).toEqual(sidebarTagStyle)
  await editorTag.click()
  await expect(page.getByRole('button', { name: 'Remove tag dev' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove tag dev' }).click()
  await page.getByRole('textbox', { name: 'Create tag for Note' }).fill('ux-check')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await expect(page.getByRole('button', { name: 'Remove tag ux-check' })).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Note details' })).toContainText('ux-check')
})

test('settings manages types and tags and persists a chosen theme', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'New type' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Synthetic type')
  await page.getByRole('button', { name: 'Add type' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Synthetic type', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rename type Synthetic type' }).click()
  await page.getByRole('textbox', { name: 'Type name' }).fill('Synthetic category')
  await page.getByRole('combobox', { name: 'Type color for Synthetic type' }).click()
  await page.getByRole('option', { name: 'emerald' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Synthetic category', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Tags' }).click()
  await page.getByRole('button', { name: 'New tag' }).click()
  await page.getByRole('textbox', { name: 'Tag name' }).fill('synthetic-tag')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('synthetic-tag', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rename tag synthetic-tag' }).click()
  await page.getByRole('textbox', { name: 'Tag name' }).fill('synthetic-renamed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Delete tag synthetic-renamed' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete tag' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('synthetic-renamed', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Display' }).click()
  await page.getByRole('combobox', { name: 'Theme' }).click()
  await page.getByRole('option', { name: 'Forest' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Synthetic category', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete type Synthetic category' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete type' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Synthetic category', { exact: true })).toHaveCount(0)
})

test('opens an existing v1 IndexedDB database without resetting its note', async ({ page }) => {
  const blockBundle = (route: import('@playwright/test').Route) => route.abort()
  await page.route('**/assets/*.js', blockBundle)
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('personal-notes', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        const notes = database.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('by-type-id', 'typeId')
        notes.createIndex('by-tag-ids', 'tagIds', { multiEntry: true })
        notes.createIndex('by-created-at', 'createdAt')
        notes.createIndex('by-updated-at', 'updatedAt')
        const types = database.createObjectStore('types', { keyPath: 'id' })
        types.createIndex('by-normalized-name', 'normalizedName', { unique: true })
        const tags = database.createObjectStore('tags', { keyPath: 'id' })
        tags.createIndex('by-normalized-name', 'normalizedName', { unique: true })
        database.createObjectStore('meta', { keyPath: 'key' })
        const timestamp = '2026-09-18T00:00:00.000Z'
        request.transaction!.objectStore('types').put({
          id: 'type-general', name: 'General', normalizedName: 'general', color: 'slate',
          isFallback: true, createdAt: timestamp, updatedAt: timestamp,
        })
        request.transaction!.objectStore('notes').put({
          id: 'note-v1-browser', title: 'Preserved v1 note', content: 'Migrated browser content.',
          typeId: 'type-general', tagIds: [], createdAt: timestamp, updatedAt: timestamp,
        })
      }
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
    })
  })
  await page.unroute('**/assets/*.js', blockBundle)
  await openLibrary(page)
  await expect(page.getByRole('button', { name: 'Preview Preserved v1 note' })).toBeVisible()
  const migrated = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('personal-notes')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('notes', 'readonly')
    const note = await new Promise<{ revision: number; content: string }>((resolve, reject) => {
      const request = transaction.objectStore('notes').get('note-v1-browser')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const version = database.version
    database.close()
    return { version, revision: note.revision, content: note.content }
  })
  expect(migrated).toEqual({ version: 3, revision: 1, content: 'Migrated browser content.' })
})

test('Side note keeps an independent editor and formatting shortcuts target the focused pane', async ({ page }) => {
  await openLibrary(page)
  await importBackup(page, demoBackup)
  await page.getByRole('textbox', { name: 'Search title or content' }).fill('Code review checklist for risky changes')
  await page.getByRole('button', { name: 'Open Code review checklist for risky changes with Side Note' }).click()
  const picker = page.getByRole('region', { name: 'Side notes to open' })
  await expect(picker).toBeVisible()
  await page.getByRole('textbox', { name: 'Search notes for Side note' }).fill('PostgreSQL indexes')
  await picker.getByRole('button', { name: 'Open PostgreSQL indexes — start from the query as Side note' }).click()

  const primary = page.getByRole('region', { name: 'Note workspace pane', exact: true })
  const secondary = page.getByRole('region', { name: 'Side note workspace pane', exact: true })
  await expect(secondary).toContainText('PostgreSQL indexes')
  await primary.getByRole('button', { name: 'Split', exact: true }).click()
  const splitPreview = primary.locator('.workspace-preview-scroll')
  await splitPreview.evaluate((element) => { element.scrollTop = 240 })
  expect(await splitPreview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await primary.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect.poll(() => primary.locator('.workspace-preview-scroll--full').evaluate((element) => element.scrollTop)).toBe(0)
  await primary.getByRole('button', { name: 'Edit' }).click()
  await secondary.getByRole('button', { name: 'Edit' }).click()

  const primarySource = primary.getByRole('textbox', { name: 'Note Markdown source' })
  const sideSource = secondary.getByRole('textbox', { name: 'Side note Markdown source' })
  await primarySource.fill('Primary note remains separate.')
  await sideSource.fill('Side editor text')
  await sideSource.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, element.value.length))
  await sideSource.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b')
  await expect(sideSource).toHaveValue('**Side editor text**')
  await expect(primarySource).toHaveValue('Primary note remains separate.')
  await secondary.getByRole('button', { name: 'Save changes' }).click()
  await primary.getByRole('button', { name: 'Save changes' }).click()
  await expect(primary.getByRole('status')).toContainText(/saved/i)
  await expect(secondary.getByRole('status')).toContainText(/saved/i)
})

test('copy and note downloads use the raw Markdown source', async ({ page, context }) => {
  await openLibrary(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Synthetic export')
  const source = '# Heading\n\n**Strong** [link](https://example.invalid/path)'
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill(source)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source)

  const markdownDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '.md' }).click()
  const markdownFile = await markdownDownload
  expect(markdownFile.suggestedFilename()).toBe('Synthetic export.md')
  expect(readFileSync((await markdownFile.path())!, 'utf8')).toBe(source)
  await expect(page.getByRole('button', { name: 'Export .txt file' })).toHaveCount(0)
})
