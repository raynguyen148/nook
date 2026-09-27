import { expect, test } from '@playwright/test'

test('Split mode highlights the matching Markdown block in both panes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Split selection')
  const source = page.getByRole('textbox', { name: 'Note Markdown source' })
  await source.fill('# First\n\nParagraph one.\n\n## Second\n\nParagraph two.')
  await page.getByRole('button', { name: 'Split', exact: true }).click()

  await source.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf('Second')
    element.focus()
    element.setSelectionRange(start, start + 'Second'.length)
    element.dispatchEvent(new Event('select', { bubbles: true }))
  })
  await expect(page.getByRole('heading', { name: 'Second' })).toHaveClass(/is-split-selection-match/)

  const preview = page.getByRole('region', { name: 'Note rendered Markdown' })
  await preview.evaluate((element) => {
    const paragraph = element.querySelector('p:last-of-type')
    if (!paragraph?.firstChild) throw new Error('Expected rendered paragraph')
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    element.closest<HTMLElement>('.workspace-preview-scroll')?.focus()
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })
  await expect(page.locator('.workspace-split-selection-overlay mark')).toHaveCount(1)
})
