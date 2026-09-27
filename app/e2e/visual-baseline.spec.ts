import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const demoBackup = readFileSync(new URL('../../docs/sample-data/nook-demo-library.json', import.meta.url))

test('captures synthetic Library, workspace, Settings, Trash, and mobile baselines', async ({ page }, testInfo) => {
  async function capture(name: string) {
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
    await page.screenshot({ path: testInfo.outputPath(name) })
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
  await page.getByLabel('Choose a Nook backup file').setInputFiles({
    name: 'nook-demo-library.json', mimeType: 'application/json', buffer: demoBackup,
  })
  await page.getByRole('tab', { name: 'Data' }).click()
  await page.getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace library' }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview Code review checklist for risky changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Code review checklist for risky changes with Side Note' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sort notes' })).toContainText('Newest created')
  await expect.poll(() => page.evaluate(() => ({
    micro: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-micro')),
    short: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-short')),
    medium: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-medium')),
    long: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-long')),
  }))).toEqual({ micro: 0.12, short: 0.18, medium: 0.26, long: 0.36 })
  await capture('library-desktop.png')

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  const libraryShell = page.locator('.nook-library-shell')
  await expect(libraryShell).toHaveClass(/is-sidebar-collapsing/)
  await expect(page.getByRole('navigation', { name: 'Filter notes' })).toBeVisible()
  await expect(libraryShell).toHaveClass(/sidebar-collapsed/)
  await expect(libraryShell).not.toHaveClass(/is-sidebar-resizing/)
  await capture('library-collapsed-desktop.png')
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(libraryShell).toHaveClass(/is-sidebar-expanding/)
  await expect(libraryShell).not.toHaveClass(/sidebar-collapsed/)
  await expect(libraryShell).not.toHaveClass(/is-sidebar-resizing/)

  await page.locator('button[aria-label="Compact layout"]').click()
  await expect.poll(() => page.locator('.nook-note-list').evaluate((list) => list.getAnimations().some((animation) => animation.playState === 'running'))).toBe(true)
  await expect(page.locator('.nook-note-card--compact').first()).toBeVisible()
  const compactBadgeWidths = await page.locator('.nook-note-card--compact .nook-type-badge__label').evaluateAll((labels) => labels.map((label) => ({
    clientWidth: label.clientWidth,
    scrollWidth: label.scrollWidth,
  })))
  expect(compactBadgeWidths.length).toBeGreaterThan(0)
  expect(compactBadgeWidths.every(({ clientWidth, scrollWidth }) => clientWidth > 0 && scrollWidth <= clientWidth + 1)).toBe(true)
  await capture('library-compact-desktop.png')
  await page.locator('button[aria-label="Comfortable layout"]').click()

  await page.getByRole('button', { name: 'Preview Code review checklist for risky changes' }).click()
  await expect(page.getByRole('region', { name: 'Note workspace pane' })).toBeVisible()
  await capture('workspace-preview.png')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Note type' })).toContainText('Coding')
  await capture('workspace-edit.png')
  await page.getByRole('combobox', { name: 'Note type' }).click()
  await expect(page.getByRole('option').first()).toBeVisible()
  await capture('workspace-type-picker.png')
  await page.keyboard.press('Escape')
  await page.locator('summary.workspace-tag-picker__trigger').click()
  await expect(page.getByRole('group', { name: 'Available tags' })).toBeVisible()
  await capture('workspace-tag-picker.png')
  await page.locator('summary.workspace-tag-picker__trigger').click()
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  await capture('workspace-split.png')
  const shortcutButton = page.getByRole('button', { name: 'Show note shortcuts' })
  await shortcutButton.hover()
  const shortcutTooltip = page.getByRole('tooltip').filter({ hasText: 'Note shortcuts' })
  await expect(shortcutTooltip).toBeVisible()
  await expect(shortcutTooltip.locator('.workspace-help-tooltip__row')).toHaveCount(11)
  const shortcutBounds = await shortcutTooltip.boundingBox()
  expect(shortcutBounds).not.toBeNull()
  expect(shortcutBounds!.x).toBeGreaterThanOrEqual(0)
  expect(shortcutBounds!.x + shortcutBounds!.width).toBeLessThanOrEqual(1280)
  await capture('workspace-shortcuts-tooltip.png')
  await page.mouse.move(0, 0)
  await expect(shortcutTooltip).toBeHidden()

  const markdownButton = page.getByRole('button', { name: 'Show Markdown guide' })
  await markdownButton.hover()
  const markdownTooltip = page.getByRole('tooltip').filter({ hasText: 'Markdown guide' })
  await expect(markdownTooltip).toBeVisible()
  await expect(markdownTooltip.locator('.workspace-help-tooltip__row')).toHaveCount(13)
  const markdownBounds = await markdownTooltip.boundingBox()
  expect(markdownBounds).not.toBeNull()
  expect(markdownBounds!.x).toBeGreaterThanOrEqual(0)
  expect(markdownBounds!.x + markdownBounds!.width).toBeLessThanOrEqual(1280)
  await capture('workspace-markdown-tooltip.png')
  await page.mouse.move(0, 0)
  await expect(markdownTooltip).toBeHidden()
  await page.getByRole('button', { name: 'Open Side note picker' }).click()
  const picker = page.getByRole('region', { name: 'Side notes to open' })
  await expect(picker).toBeVisible()
  await expect(picker.locator('.nook-note-card').first()).toBeVisible()
  await expect(picker.getByRole('button', { name: /with Side Note/ })).toHaveCount(0)
  await expect(page.locator('.workspace-topbar')).toHaveCount(0)
  const primaryPane = page.locator('.workspace-pane[data-pane="primary"]')
  const primaryModes = primaryPane.locator('.workspace-mode-switch')
  await expect(primaryModes.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(primaryModes.getByRole('button', { name: 'Split', exact: true })).toBeVisible()
  await expect(primaryModes.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
  const pickerHeaderGeometry = await page.evaluate(() => {
    const primaryHeader = document.querySelector<HTMLElement>('.workspace-pane[data-pane="primary"] .workspace-pane__header')?.getBoundingClientRect()
    const pickerHeader = document.querySelector<HTMLElement>('.workspace-side-picker__header')?.getBoundingClientRect()
    return {
      primaryHeight: primaryHeader?.height ?? 0,
      pickerHeight: pickerHeader?.height ?? 0,
      topDelta: primaryHeader && pickerHeader ? Math.abs(primaryHeader.top - pickerHeader.top) : Number.POSITIVE_INFINITY,
    }
  })
  expect(pickerHeaderGeometry.primaryHeight).toBeGreaterThan(0)
  expect(Math.abs(pickerHeaderGeometry.primaryHeight - pickerHeaderGeometry.pickerHeight)).toBeLessThanOrEqual(1)
  expect(pickerHeaderGeometry.topDelta).toBeLessThanOrEqual(1)
  await capture('workspace-side-note-picker.png')
  await page.setViewportSize({ width: 1024, height: 1000 })
  await page.getByRole('button', { name: 'Comfortable layout' }).click()
  const comfortableCards = picker.locator('.nook-note-card--comfortable')
  await expect(comfortableCards.first()).toBeVisible()
  await expect(comfortableCards.first().locator('.nook-note-title')).toBeVisible()
  await expect(comfortableCards.first().locator('.nook-note-preview')).toBeVisible()
  const comfortableGeometry = await comfortableCards.evaluateAll((cards) => cards.slice(0, 2).map((card) => {
    const rect = card.getBoundingClientRect()
    const title = card.querySelector('.nook-note-title')?.getBoundingClientRect()
    const preview = card.querySelector('.nook-note-preview')?.getBoundingClientRect()
    return { x: rect.x, y: rect.y, height: rect.height, bottom: rect.bottom, titleBottom: title?.bottom ?? 0, previewBottom: preview?.bottom ?? 0 }
  }))
  expect(comfortableGeometry).toHaveLength(2)
  expect(comfortableGeometry[0].x).not.toBe(comfortableGeometry[1].x)
  expect(Math.abs(comfortableGeometry[0].y - comfortableGeometry[1].y)).toBeLessThanOrEqual(1)
  expect(comfortableGeometry.every(({ height, bottom, titleBottom, previewBottom }) => height >= 168 && titleBottom <= bottom && previewBottom <= bottom)).toBe(true)
  await capture('workspace-side-note-picker-comfortable.png')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Focus layout' }).click()
  await page.getByRole('textbox', { name: 'Search notes for Side note' }).fill('PostgreSQL indexes')
  await picker.getByRole('button', { name: 'Open PostgreSQL indexes — start from the query as Side note' }).click()
  const sidePane = page.getByRole('region', { name: 'Side note workspace pane' })
  await expect(sidePane).toBeVisible()
  await sidePane.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(sidePane.getByRole('textbox', { name: 'Note title' })).toBeVisible()
  const sideGeometry = await page.evaluate(() => {
    const sidebar = document.querySelector('.nook-desktop-sidebar')?.getBoundingClientRect()
    const screen = document.querySelector('.workspace-screen')?.getBoundingClientRect()
    return { sidebarRight: sidebar?.right ?? 0, screenLeft: screen?.left ?? 0, scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }
  })
  expect(sideGeometry.screenLeft, JSON.stringify(sideGeometry)).toBeGreaterThan(sideGeometry.sidebarRight)
  expect(sideGeometry.scrollWidth, JSON.stringify(sideGeometry)).toBeLessThanOrEqual(sideGeometry.viewportWidth)
  const detailGeometry = await page.evaluate(() => {
    const workspaceScreen = document.querySelector<HTMLElement>('.workspace-screen--with-side')
    const workspaceStyle = workspaceScreen ? getComputedStyle(workspaceScreen) : null
    const headers = [...document.querySelectorAll<HTMLElement>('.workspace-pane__header')]
    const sideTitle = document.querySelector<HTMLElement>('.workspace-pane--side .workspace-title-input')
    const sideFooter = document.querySelector<HTMLElement>('.workspace-pane--side .workspace-pane__footer')
    const sideTools = sideFooter?.querySelector<HTMLElement>('.workspace-export-actions')
    const sideActions = sideFooter?.querySelector<HTMLElement>('.workspace-save-actions')
    return {
      topbarCount: document.querySelectorAll('.workspace-topbar').length,
      outerSurface: workspaceStyle ? {
        backgroundColor: workspaceStyle.backgroundColor,
        borderTopWidth: workspaceStyle.borderTopWidth,
        borderRadius: workspaceStyle.borderRadius,
        boxShadow: workspaceStyle.boxShadow,
        paddingTop: workspaceStyle.paddingTop,
      } : null,
      headerHeights: headers.map((header) => header.getBoundingClientRect().height),
      headerTops: headers.map((header) => header.getBoundingClientRect().top),
      sideTitleBorderWidth: sideTitle ? parseFloat(getComputedStyle(sideTitle).borderTopWidth) : -1,
      sideFooterHeight: sideFooter?.getBoundingClientRect().height ?? 0,
      footerAlignmentDelta: sideTools && sideActions
        ? Math.abs(sideTools.getBoundingClientRect().y - sideActions.getBoundingClientRect().y)
        : Number.POSITIVE_INFINITY,
    }
  })
  expect(detailGeometry.topbarCount).toBe(0)
  expect(detailGeometry.outerSurface).toEqual({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderTopWidth: '0px',
    borderRadius: '0px',
    boxShadow: 'none',
    paddingTop: '0px',
  })
  expect(detailGeometry.headerHeights).toHaveLength(2)
  expect(detailGeometry.headerHeights.every((height) => Math.abs(height - 56) <= 1)).toBe(true)
  expect(Math.abs(detailGeometry.headerTops[0] - detailGeometry.headerTops[1])).toBeLessThanOrEqual(1)
  expect(detailGeometry.sideTitleBorderWidth).toBe(0)
  expect(detailGeometry.sideFooterHeight).toBeLessThanOrEqual(56)
  expect(detailGeometry.footerAlignmentDelta).toBeLessThanOrEqual(1)
  await capture('workspace-side-note.png')

  await primaryPane.getByRole('button', { name: 'All notes' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await capture('settings.png')
  await page.getByRole('tab', { name: 'Display' }).click()
  await capture('settings-display.png')
  await page.getByRole('tab', { name: 'Data' }).click()
  await capture('settings-data.png')
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Trash', exact: true }).click()
  await capture('trash.png')
  await page.getByRole('navigation', { name: 'Library spaces' }).getByRole('button', { name: 'All notes' }).click()

  await page.setViewportSize({ width: 375, height: 812 })
  await capture('library-mobile-375.png')
  await page.getByRole('button', { name: 'Open mobile settings' }).click()
  await capture('settings-mobile-375.png')
  for (const width of [320, 414, 768]) {
    await page.setViewportSize({ width, height: 812 })
    const settingsGeometry = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('.nook-settings-dialog--main')
      const rect = dialog?.getBoundingClientRect()
      return {
        left: rect?.left ?? -1,
        right: rect?.right ?? Number.POSITIVE_INFINITY,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })
    expect(settingsGeometry.left, `${width}px: ${JSON.stringify(settingsGeometry)}`).toBeGreaterThanOrEqual(0)
    expect(settingsGeometry.right, `${width}px: ${JSON.stringify(settingsGeometry)}`).toBeLessThanOrEqual(width)
    expect(settingsGeometry.documentWidth, `${width}px: ${JSON.stringify(settingsGeometry)}`).toBeLessThanOrEqual(settingsGeometry.viewportWidth)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: 'Close settings' }).click()
  await page.getByRole('button', { name: 'Filters and sort' }).click()
  await capture('mobile-filters-375.png')
  await page.getByRole('button', { name: 'Close filters' }).click()
  await page.getByRole('button', { name: 'Preview Code review checklist for risky changes' }).click()
  await capture('workspace-mobile-preview-375.png')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await capture('workspace-mobile-edit-375.png')
  await page.getByRole('button', { name: 'Note actions' }).click()
  await expect(page.getByRole('dialog', { name: 'Note actions' }).getByRole('button', { name: 'Version history' })).toBeVisible()
  await capture('workspace-mobile-actions-375.png')
})
