import { describe, expect, it } from 'vitest'
import { renderMarkdownInto } from './renderer'

describe('the local Markdown adapter', () => {
  it('renders existing rich Markdown while keeping raw HTML inert and remote images local', () => {
    const host = document.createElement('div')
    const source = [
      '# Safe title',
      '',
      '> [!TIP]',
      '> Keep this private.',
      '',
      '- [x] Check the draft',
      '',
      '| Note | State |',
      '| --- | --- |',
      '| Local | Ready |',
      '',
      '![private image](https://example.invalid/image.png)',
      '',
      '<img src="https://example.invalid/leak.png" onerror="alert(1)">',
    ].join('\n')

    renderMarkdownInto(host, source, 'Empty', { idPrefix: 'primary-preview' })

    expect(host.querySelector('h1')?.textContent).toBe('Safe title')
    expect(host.querySelector('.markdown-alert--tip')?.textContent).toContain('Keep this private.')
    expect(host.querySelector('.markdown-task-item input')?.checked).toBe(true)
    expect(host.querySelector('table')?.textContent).toContain('Ready')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.markdown-image-alt')?.getAttribute('aria-label')).toContain('private image')
    expect(host.querySelector('script, img[src], iframe, video')).toBeNull()
    expect(host.textContent).toContain('<img src=')
  })

  it('scopes footnote targets independently for concurrently mounted panes', () => {
    const primary = document.createElement('div')
    const side = document.createElement('div')
    const source = 'Read this[^source].\n\n[^source]: A local footnote.'

    renderMarkdownInto(primary, source, 'Empty', { idPrefix: 'primary-pane' })
    renderMarkdownInto(side, source, 'Empty', { idPrefix: 'side-pane' })

    const primaryTarget = primary.querySelector('.markdown-footnote-ref a')?.getAttribute('href')
    const sideTarget = side.querySelector('.markdown-footnote-ref a')?.getAttribute('href')
    expect(primaryTarget).toBeTruthy()
    expect(sideTarget).toBeTruthy()
    expect(primaryTarget).not.toBe(sideTarget)
    expect(primaryTarget).toMatch(/^#fn-primary-pane/)
    expect(sideTarget).toMatch(/^#fn-side-pane/)
  })

  it('exposes source-line anchors for split-pane scroll synchronization', () => {
    const host = document.createElement('div')
    renderMarkdownInto(host, '# First\n\nParagraph.\n\n## Second', 'Empty', { sourceMap: true })

    expect(host.querySelector('h1')?.getAttribute('data-markdown-source-start')).toBe('0')
    expect(host.querySelector('h2')?.getAttribute('data-markdown-source-start')).toBe('4')
  })
})
