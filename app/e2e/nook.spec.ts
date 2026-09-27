import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const demoBackup = readFileSync(new URL('../../docs/sample-data/nook-demo-library.json', import.meta.url))

async function openLibrary(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
}

async function importDemoBackup(page: Page) {
  await page.getByLabel('Choose a Nook backup file').setInputFiles({
    name: 'nook-demo-library.json',
    mimeType: 'application/json',
    buffer: demoBackup,
  })
  if (page.viewportSize()?.width && page.viewportSize()!.width < 768) {
    const bounds = await page.locator('.nook-settings-dialog--main').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, right: rect.right, viewport: window.innerWidth }
    })
    expect(bounds.x).toBeGreaterThanOrEqual(-1)
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1)
  }
  if ((page.viewportSize()?.width ?? 1280) > 700) await page.getByRole('tab', { name: 'Data' }).click()
  await expect(page.getByRole('region', { name: 'Backup replacement review' })).toContainText('48')
  await page.getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
}

test('imports a legacy backup, filters the library, and exposes accessible controls', async ({ page }) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== `http://127.0.0.1:${process.env.NOOK_E2E_PORT || '4187'}`) externalRequests.push(request.url())
  })
  await openLibrary(page)
  await importDemoBackup(page)

  await page.getByRole('textbox', { name: 'Search title or content' }).fill('Code review checklist')
  await expect(page.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview PostgreSQL indexes — start from the query' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()

  await page.getByRole('button', { name: 'Grid layout' }).click()
  await expect(page.getByRole('button', { name: 'Grid layout' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Compact layout' }).click()
  await page.locator('label.nook-tag-filter').filter({ hasText: 'testing' }).click()
  await page.locator('label.nook-tag-filter').filter({ hasText: 'architecture' }).click()
  await expect(page.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear all' }).click()

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(accessibility.violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.slice(0, 8).map(({ target, any }) => ({ target, detail: any[0]?.data })),
    total: nodes.length,
  }))).toEqual([])
  expect(externalRequests).toEqual([])
})

test('grid paginates a full library and preserves the page after opening a note', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openLibrary(page)
  await importDemoBackup(page)
  await page.getByRole('button', { name: 'Grid layout' }).click()
  await expect(page.getByText('Showing 1–32 of 44 notes')).toBeVisible()
  await page.getByRole('navigation', { name: 'Notes pagination' }).getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Showing 33–44 of 44 notes')).toBeVisible()
  const lastNote = page.getByRole('button', { name: /^Preview / }).first()
  await lastNote.click()
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()
  await expect(page.getByText('Showing 33–44 of 44 notes')).toBeVisible()
})

test('Display preview line preference updates cards and survives reload', async ({ page }) => {
  await openLibrary(page)
  await importDemoBackup(page)
  const preview = page.locator('.nook-note-preview').first()
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Display' }).click()
  const slider = page.getByRole('slider', { name: 'Preview lines' })
  await slider.focus()
  await slider.press('End')
  await expect(slider).toHaveAttribute('aria-valuetext', '10 lines')
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(preview).toHaveCSS('-webkit-line-clamp', '10')
  await page.reload()
  await expect(page.locator('.nook-note-preview').first()).toHaveCSS('-webkit-line-clamp', '10')
})

test('mobile note actions match the reference sheet and open version history', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Filters and sort' })).toBeVisible()
  await importDemoBackup(page)
  await page.getByRole('button', { name: 'Preview Code review checklist for risky changes' }).click()
  await page.getByRole('button', { name: 'Note actions' }).click()
  const actions = page.getByRole('dialog', { name: 'Note actions' })
  for (const label of ['Version history', 'Copy content', 'Export .md', 'Export .txt', 'Move to Trash']) {
    await expect(actions.getByRole('button', { name: label })).toBeVisible()
  }
  await actions.getByRole('button', { name: 'Version history' }).click()
  await expect(page.getByRole('dialog', { name: 'Version history' })).toBeVisible()
  await page.getByRole('button', { name: 'Close version history' }).click()
  await expect(page.getByRole('button', { name: 'Note actions', exact: true })).toBeVisible()
})

test('mobile Settings opens its overview and returns from Appearance', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open mobile settings' }).click()
  const overview = page.getByRole('region', { name: 'Settings overview' })
  await expect(overview).toBeVisible()
  await overview.getByRole('button', { name: /Appearance/ }).click()
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible()
  await page.getByRole('button', { name: 'All settings', exact: true }).click()
  await expect(overview).toBeVisible()
  await page.getByRole('button', { name: 'Close settings' }).click()
})

test('creates and saves a Markdown note, then opens its detail workspace and Trash', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Synthetic browser note')
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('# Browser note\n\nSafe **Markdown** content.')
  await page.getByRole('button', { name: 'Split' }).first().click()
  await expect(page.getByText('Safe Markdown content.')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'saved' }).first()).toBeVisible()
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()
  await expect(page.getByRole('button', { name: 'Preview Synthetic browser note' })).toBeVisible()

  await page.getByRole('button', { name: 'Move to Trash: Synthetic browser note' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Preview Synthetic browser note' })).toBeVisible()
})

test('production shell and IndexedDB remain usable offline after the first load', async ({ page, context }) => {
  await openLibrary(page)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Offline note')
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('Created with no connection.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()
  await expect(page.getByRole('button', { name: 'Preview Offline note' })).toBeVisible()
})

test('library and workspace controls fit narrow and tablet viewports', async ({ page }) => {
  await openLibrary(page)
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 800 })
    if (width < 768) await expect(page.getByRole('button', { name: 'Filters and sort' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, `horizontal overflow at ${width}px`).toBe(false)
    await page.getByRole('button', { name: width < 768 ? 'Open mobile settings' : 'Settings', exact: true }).click()
    const dialogBounds = await page.locator('.nook-settings-dialog--main').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, viewport: window.innerWidth }
    })
    expect(dialogBounds.left, `Settings left edge at ${width}px`).toBeGreaterThanOrEqual(-1)
    expect(dialogBounds.right, `Settings right edge at ${width}px`).toBeLessThanOrEqual(dialogBounds.viewport + 1)
    await page.getByRole('button', { name: 'Close settings' }).click()
  }
  await page.getByRole('button', { name: 'New note' }).first().click()
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, `workspace horizontal overflow at ${width}px`).toBe(false)
  }
  await page.setViewportSize({ width: 375, height: 800 })
  await page.getByRole('button', { name: 'Note actions' }).click()
  const actions = page.getByRole('dialog', { name: 'Note actions' })
  await expect(actions.getByRole('button', { name: 'Copy content' })).toBeDisabled()
  await expect(actions.getByRole('button', { name: 'Export .md' })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Export .txt' })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Open Side note' })).toHaveCount(0)
  await actions.getByRole('button', { name: 'Close note actions' }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('opening a note starts at the workspace top and returns to the library position', async ({ page }) => {
  await openLibrary(page)
  await importDemoBackup(page)
  const lastPreview = page.getByRole('button', { name: /^Preview / }).last()
  await lastPreview.scrollIntoViewIfNeeded()
  const libraryScroll = await page.evaluate(() => window.scrollY)
  expect(libraryScroll).toBeGreaterThan(0)
  await lastPreview.evaluate((button) => button.addEventListener('click', () => {
    (window as Window & { __clickedLibraryScroll?: number }).__clickedLibraryScroll = window.scrollY
  }, { once: true }))
  await lastPreview.click()
  const clickedScroll = await page.evaluate(() => (window as Window & { __clickedLibraryScroll?: number }).__clickedLibraryScroll)
  await expect(page.getByRole('region', { name: 'Note workspace pane' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.locator('.workspace-topbar').getByRole('button', { name: 'All notes' }).click()
  await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(clickedScroll)
})

test('all themes and the note workspace expose accessible content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openLibrary(page)
  await importDemoBackup(page)
  for (const theme of ['Light', 'Coffee', 'Forest', 'Midnight', 'Dark', 'Retro', 'Auto']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Display' }).click()
    await page.getByRole('combobox', { name: 'Theme' }).click()
    await page.getByRole('option', { name: theme === 'Auto' ? 'Auto (follows system)' : theme }).click()
    const settingsAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(settingsAudit.violations.map(({ id, nodes }) => ({ theme, id, targets: nodes.slice(0, 5).map(({ target, html, failureSummary }) => ({ target, html, failureSummary })), count: nodes.length }))).toEqual([])
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const libraryAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(libraryAudit.violations.map(({ id, nodes }) => ({ theme, id, targets: nodes.slice(0, 5).map(({ target }) => target), count: nodes.length }))).toEqual([])
  }

  await page.getByRole('button', { name: 'Edit Code review checklist for risky changes' }).click()
  const workspaceAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(workspaceAudit.violations.map(({ id, nodes }) => ({ id, targets: nodes.slice(0, 5).map(({ target }) => target), count: nodes.length }))).toEqual([])
})

test('a waiting Service Worker update cannot replace a dirty tab', async ({ page, context }) => {
  await openLibrary(page)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20_000 })
  const cleanPage = await context.newPage()
  await openLibrary(cleanPage)
  await cleanPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20_000 })
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note Markdown source' }).fill('An unsaved draft without a title.')
  await page.evaluate(() => { (window as Window & { __draftPageMarker?: string }).__draftPageMarker = 'still-here' })

  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js?e2e-update=1', { scope: '/', updateViaCache: 'none' })
  })
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting), null, { timeout: 20_000 })
  await cleanPage.getByRole('button', { name: 'Settings', exact: true }).click()
  await cleanPage.getByRole('tab', { name: 'Data' }).click()
  const applyUpdate = cleanPage.getByRole('button', { name: 'Apply update' })
  await expect(applyUpdate).toBeEnabled()
  await applyUpdate.click()
  await expect(cleanPage.getByText('Another open tab has an unsaved draft or did not respond.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Note Markdown source' })).toHaveValue('An unsaved draft without a title.')
  await expect.poll(() => page.evaluate(() => (window as Window & { __draftPageMarker?: string }).__draftPageMarker)).toBe('still-here')
})
