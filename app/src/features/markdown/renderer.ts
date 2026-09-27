// The legacy renderer is a browser-safe IIFE with no startup side effects beyond
// defining NookMarkdown. Vite bundles this local file into the React app.
// @ts-ignore - the legacy renderer intentionally has no TypeScript declaration.
import '../../../../js/markdown.js'

export interface MarkdownRenderOptions {
  idPrefix?: string
  sourceMap?: boolean
}

export interface NookMarkdownApi {
  renderInto(container: HTMLElement, source: string, emptyText?: string, options?: MarkdownRenderOptions): void
  toPlainText(source: string): string
}

declare global {
  interface Window {
    NookMarkdown?: NookMarkdownApi
  }
}

function getRenderer(): NookMarkdownApi {
  const renderer = typeof window === 'undefined' ? undefined : window.NookMarkdown
  if (!renderer) throw new Error('The local Markdown renderer did not load.')
  return renderer
}

export function renderMarkdownInto(
  container: HTMLElement,
  source: string,
  emptyText = 'No content yet.',
  options: MarkdownRenderOptions = {},
): void {
  getRenderer().renderInto(container, source, emptyText, options)
}

export function markdownToPlainText(source: string): string {
  return getRenderer().toPlainText(source)
}
