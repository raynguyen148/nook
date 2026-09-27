import { useLayoutEffect, type RefObject } from 'react'

interface SplitSelectionOptions {
  enabled: boolean
  content: string
  sourceRef: RefObject<HTMLTextAreaElement | null>
  previewRef: RefObject<HTMLDivElement | null>
}

interface MarkdownBlock {
  element: HTMLElement
  start: number
  end: number
}

interface SelectionIndex {
  text: string
  lines: number[]
  blocks: MarkdownBlock[]
  byElement: Map<HTMLElement, MarkdownBlock>
  subtrees: WeakMap<HTMLElement, MarkdownBlock[]>
}

interface SourceRange {
  start: number
  end: number
}

interface SplitSelectionSession {
  index: SelectionIndex | null
  matches: Set<HTMLElement>
  overlay: HTMLDivElement | null
  mirror: HTMLDivElement | null
  textNode: Text | null
  rangeLayer: HTMLDivElement | null
  key: string
  sourceLinesKey: string
  leader: 'source' | 'preview' | null
}

function createSession(): SplitSelectionSession {
  return {
    index: null,
    matches: new Set(),
    overlay: null,
    mirror: null,
    textNode: null,
    rangeLayer: null,
    key: '',
    sourceLinesKey: '',
    leader: null,
  }
}

function lineStarts(source: string): number[] {
  const lines = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lines.push(index + 1)
  }
  return lines
}

function sourceLineForOffset(lines: number[], offset: number): number {
  let low = 0
  let high = lines.length
  while (low + 1 < high) {
    const middle = (low + high) >>> 1
    if (lines[middle] <= offset) low = middle
    else high = middle
  }
  return low
}

function getIndex(session: SplitSelectionSession, source: HTMLTextAreaElement, preview: HTMLElement): SelectionIndex {
  if (session.index?.text === source.value) return session.index
  const lines = lineStarts(source.value)
  const blocks = [...preview.querySelectorAll<HTMLElement>('[data-markdown-source-start]')]
    .map((element) => ({
      element,
      start: Number(element.dataset.markdownSourceStart),
      end: Number(element.dataset.markdownSourceEnd),
    }))
    .filter(({ start, end }) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && start < lines.length)
  const index = {
    text: source.value,
    lines,
    blocks,
    byElement: new Map(blocks.map((block) => [block.element, block])),
    subtrees: new WeakMap<HTMLElement, MarkdownBlock[]>(),
  }
  session.index = index
  return index
}

function blocksForPreviewRange(index: SelectionIndex, range: Range): MarkdownBlock[] {
  const common = range.commonAncestorContainer
  const element = common.nodeType === Node.ELEMENT_NODE ? common as Element : common.parentElement
  const root = element?.closest<HTMLElement>('[data-markdown-source-start]')
  if (!root || !index.byElement.has(root)) return index.blocks
  if (!index.subtrees.has(root)) {
    index.subtrees.set(root, [
      index.byElement.get(root)!,
      ...[...root.querySelectorAll<HTMLElement>('[data-markdown-source-start]')]
        .map((child) => index.byElement.get(child))
        .filter((block): block is MarkdownBlock => Boolean(block)),
    ])
  }
  return index.subtrees.get(root)!
}

function smallestBlocks(blocks: MarkdownBlock[], preview: HTMLElement): MarkdownBlock[] {
  const visible = blocks.filter(({ element }) => !element.parentElement?.closest('details:not([open])'))
  const parents = new Set<HTMLElement>()
  visible.forEach(({ element }) => {
    for (let parent = element.parentElement; parent && parent !== preview; parent = parent.parentElement) parents.add(parent)
  })
  return visible.filter(({ element }) => !parents.has(element))
}

function mergeSourceRanges(blocks: MarkdownBlock[]): SourceRange[] {
  const ranges: SourceRange[] = []
  blocks
    .map(({ start, end }) => ({ start, end }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((range) => {
      const previous = ranges.at(-1)
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
      else ranges.push(range)
    })
  return ranges
}

function createSourceMirror(source: string, textarea: HTMLTextAreaElement): { mirror: HTMLDivElement; textNode: Text } {
  const styles = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
  const textProperties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'fontKerning', 'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'textAlign', 'direction', 'tabSize',
  ] as const
  Object.assign(mirror.style, {
    position: 'relative',
    left: '0',
    top: '0',
    boxSizing: 'content-box',
    width: `${Math.max(1, textarea.clientWidth - horizontalPadding)}px`,
    minHeight: '0',
    margin: '0',
    paddingTop: styles.paddingTop,
    paddingRight: styles.paddingRight,
    paddingBottom: styles.paddingBottom,
    paddingLeft: styles.paddingLeft,
    border: '0',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: styles.wordBreak === 'normal' ? 'break-word' : styles.wordBreak,
    overflow: 'visible',
    contain: 'layout style paint',
  })
  textProperties.forEach((property) => { mirror.style[property] = styles[property] })
  mirror.setAttribute('aria-hidden', 'true')
  const textNode = document.createTextNode(source || '\u200b')
  mirror.append(textNode)
  return { mirror, textNode }
}

function mergeVisualLineRects(rects: DOMRectList): Array<{ left: number; right: number; top: number; height: number }> {
  const lines: Array<{ left: number; right: number; top: number; height: number }> = []
  Array.from(rects).forEach((rect) => {
    if (rect.width <= 0 || rect.height <= 0) return
    const current = { left: rect.left, right: rect.right, top: rect.top, height: rect.height }
    const previous = lines.at(-1)
    if (previous && Math.abs(previous.top - current.top) < 0.5 && current.left <= previous.right + 1) {
      previous.right = Math.max(previous.right, current.right)
      previous.height = Math.max(previous.height, current.height)
      return
    }
    lines.push(current)
  })
  return lines
}

function syncOverlayGeometry(session: SplitSelectionSession, source: HTMLTextAreaElement, resize = false): void {
  if (!session.overlay || !session.rangeLayer) return
  if (resize) {
    Object.assign(session.overlay.style, {
      left: `${source.offsetLeft + source.clientLeft}px`,
      top: `${source.offsetTop + source.clientTop}px`,
      width: `${source.clientWidth}px`,
      height: `${source.clientHeight}px`,
    })
  }
  session.rangeLayer.style.transform = `translate(${-source.scrollLeft}px, ${-source.scrollTop}px)`
}

function renderSourceMatch(session: SplitSelectionSession, source: HTMLTextAreaElement, preview: HTMLElement, ranges: SourceRange[]): void {
  const { text, lines } = getIndex(session, source, preview)
  if (!session.overlay) {
    const parent = source.parentElement
    if (!parent) return
    const { mirror, textNode } = createSourceMirror(text, source)
    const overlay = document.createElement('div')
    overlay.className = 'workspace-split-selection-overlay'
    overlay.setAttribute('aria-hidden', 'true')
    const rangeLayer = document.createElement('div')
    rangeLayer.className = 'workspace-split-selection-overlay__ranges'
    overlay.append(mirror, rangeLayer)
    parent.append(overlay)
    session.overlay = overlay
    session.mirror = mirror
    session.textNode = textNode
    session.rangeLayer = rangeLayer
    syncOverlayGeometry(session, source, true)
  }
  if (!session.mirror || !session.textNode || !session.rangeLayer) return
  const origin = session.mirror.getBoundingClientRect()
  const fragment = document.createDocumentFragment()
  const range = document.createRange()
  ranges.forEach(({ start, end }) => {
    const from = lines[start]
    const to = lines[end] ?? text.length
    range.setStart(session.textNode!, from)
    range.setEnd(session.textNode!, to)
    mergeVisualLineRects(range.getClientRects()).forEach((bounds) => {
      const mark = document.createElement('mark')
      mark.dataset.sourceStart = String(from)
      mark.dataset.sourceEnd = String(to)
      Object.assign(mark.style, {
        left: `${bounds.left - origin.left}px`,
        top: `${bounds.top - origin.top}px`,
        width: `${bounds.right - bounds.left}px`,
        height: `${bounds.height}px`,
      })
      fragment.append(mark)
    })
  })
  session.rangeLayer.replaceChildren(fragment)
}

function clearMatch(session: SplitSelectionSession, invalidate = false): void {
  session.matches.forEach((element) => element.classList.remove('is-split-selection-match'))
  session.matches.clear()
  session.overlay?.remove()
  session.overlay = null
  session.mirror = null
  session.textNode = null
  session.rangeLayer = null
  session.key = ''
  session.sourceLinesKey = ''
  session.leader = null
  if (invalidate) session.index = null
}

/**
 * Restores the legacy Split-mode correspondence highlight without replacing
 * native textarea selection or changing either pane's scroll ownership.
 */
export function useSplitSelectionHighlight({ enabled, content, sourceRef, previewRef }: SplitSelectionOptions): void {
  useLayoutEffect(() => {
    const source = sourceRef.current
    const preview = previewRef.current
    const session = createSession()
    if (!enabled || !source || !preview) return () => clearMatch(session, true)

    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateMatch()
      })
    }

    const updateMatch = () => {
      let leader: 'source' | 'preview'
      let candidates: MarkdownBlock[]
      let sourceLinesKey = ''
      if (document.activeElement === source) {
        if (source.selectionStart === source.selectionEnd) {
          if (session.key) clearMatch(session)
          return
        }
        const index = getIndex(session, source, preview)
        const start = sourceLineForOffset(index.lines, source.selectionStart)
        const end = sourceLineForOffset(index.lines, source.selectionEnd - 1) + 1
        sourceLinesKey = `${start}-${end}`
        if (session.leader === 'source' && session.sourceLinesKey === sourceLinesKey) return
        leader = 'source'
        candidates = index.blocks.filter((block) => block.start < end && block.end > start)
      } else {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.rangeCount
          || !preview.contains(selection.anchorNode) || !preview.contains(selection.focusNode)) {
          if (session.key) clearMatch(session)
          return
        }
        const anchorNode = selection.anchorNode
        const anchor = anchorNode?.nodeType === Node.ELEMENT_NODE ? anchorNode as Element : anchorNode?.parentElement
        if (anchor?.closest('button, input, .markdown-footnote-backref')) {
          clearMatch(session)
          return
        }
        leader = 'preview'
        const index = getIndex(session, source, preview)
        const range = selection.getRangeAt(0)
        const contents = document.createRange()
        candidates = blocksForPreviewRange(index, range).filter(({ element }) => {
          if (!range.intersectsNode(element)) return false
          contents.selectNodeContents(element)
          return range.compareBoundaryPoints(Range.END_TO_START, contents) < 0
            && range.compareBoundaryPoints(Range.START_TO_END, contents) > 0
        })
      }

      const blocks = smallestBlocks(candidates, preview)
      const ranges = mergeSourceRanges(blocks)
      const key = `${leader}:${ranges.map(({ start, end }) => `${start}-${end}`).join(',')}`
      if (key === session.key) return
      if (session.leader !== leader) clearMatch(session)
      session.leader = leader
      session.key = key
      if (leader === 'source') {
        const next = new Set(blocks.map(({ element }) => element))
        session.matches.forEach((element) => {
          if (!next.has(element)) element.classList.remove('is-split-selection-match')
        })
        next.forEach((element) => element.classList.add('is-split-selection-match'))
        session.matches = next
      } else if (ranges.length) {
        renderSourceMatch(session, source, preview, ranges)
      } else {
        clearMatch(session)
      }
      session.sourceLinesKey = sourceLinesKey
    }

    const onSourceInput = () => clearMatch(session, true)
    const observer = new MutationObserver(() => clearMatch(session, true))
    observer.observe(preview, { childList: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (!session.overlay) return
      clearMatch(session)
      schedule()
    })
    resizeObserver?.observe(source)
    const onSourceScroll = () => syncOverlayGeometry(session, source)
    source.addEventListener('select', schedule)
    source.addEventListener('input', onSourceInput)
    source.addEventListener('scroll', onSourceScroll, { passive: true })
    source.addEventListener('keyup', schedule)
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('focusin', schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver?.disconnect()
      source.removeEventListener('select', schedule)
      source.removeEventListener('input', onSourceInput)
      source.removeEventListener('scroll', onSourceScroll)
      source.removeEventListener('keyup', schedule)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('focusin', schedule)
      clearMatch(session, true)
    }
  }, [content, enabled, previewRef, sourceRef])
}
