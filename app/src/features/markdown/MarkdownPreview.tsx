import { useId, useLayoutEffect, useRef } from 'react'
import { renderMarkdownInto } from './renderer'
import './markdown.css'

interface MarkdownPreviewProps {
  source: string
  pane: string
  className: string
  emptyText?: string
  label?: string
  sourceMap?: boolean
}

function safeId(value: string): string {
  return value.replace(/[^a-z\d_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'markdown'
}

export function MarkdownPreview({ source, pane, className, emptyText, label, sourceMap = false }: MarkdownPreviewProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const reactId = useId()

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    renderMarkdownInto(element, source, emptyText, { idPrefix: `${safeId(pane)}-${safeId(reactId)}`, sourceMap })
    return () => element.replaceChildren()
  }, [emptyText, pane, reactId, source, sourceMap])

  return <section ref={elementRef} className={className} aria-label={label} />
}
