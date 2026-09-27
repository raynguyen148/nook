export interface ScrollPoint {
  from: number
  to: number
}

export interface MarkdownScrollMap {
  sourceToPreview: ScrollPoint[]
  previewToSource: ScrollPoint[]
  sourceMaximum: number
  previewMaximum: number
  sourceClientWidth: number
  sourceClientHeight: number
  previewClientWidth: number
  previewClientHeight: number
}

const MAX_SCROLL_ANCHORS = 320

function clamp(position: number, maximum: number): number {
  return Math.min(Math.max(position, 0), Math.max(0, maximum))
}

export function interpolateScrollMap(points: ScrollPoint[], position: number): number {
  if (points.length === 0) return 0
  if (position <= points[0].from) return points[0].to
  const last = points[points.length - 1]
  if (position >= last.from) return last.to
  let low = 0
  let high = points.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle].from <= position) low = middle
    else high = middle
  }
  const start = points[low]
  const end = points[high]
  const span = end.from - start.from
  if (span <= 0) return end.to
  return start.to + ((position - start.from) / span) * (end.to - start.to)
}

function monotonicMap(points: ScrollPoint[], duplicateTarget: 'min' | 'max' = 'min'): ScrollPoint[] {
  const sorted = points.filter((point) => Number.isFinite(point.from) && Number.isFinite(point.to))
    .map((point) => ({ ...point }))
    .sort((first, second) => first.from - second.from || first.to - second.to)
  const result: ScrollPoint[] = []
  sorted.forEach((point) => {
    const previous = result[result.length - 1]
    if (!previous) {
      result.push(point)
      return
    }
    if (point.from <= previous.from + 0.5) {
      previous.to = duplicateTarget === 'max' ? Math.max(previous.to, point.to) : Math.min(previous.to, point.to)
      return
    }
    result.push({ from: point.from, to: Math.max(previous.to, point.to) })
  })
  return result
}

function lineStarts(source: string): number[] {
  const offsets = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) offsets.push(index + 1)
  }
  return offsets
}

function createTextMirror(source: string, textarea: HTMLTextAreaElement): { mirror: HTMLDivElement; textNode: Text } {
  const styles = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
  const textProperties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'fontKerning', 'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'textAlign', 'direction', 'tabSize',
  ] as const
  Object.assign(mirror.style, {
    position: 'fixed', top: '0', left: '-100000px', visibility: 'hidden', pointerEvents: 'none',
    boxSizing: 'content-box', width: `${Math.max(1, textarea.clientWidth - horizontalPadding)}px`,
    minHeight: '0', margin: '0', paddingTop: styles.paddingTop, paddingRight: styles.paddingRight,
    paddingBottom: styles.paddingBottom, paddingLeft: styles.paddingLeft, border: '0',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    wordBreak: styles.wordBreak === 'normal' ? 'break-word' : styles.wordBreak,
    overflow: 'visible', contain: 'layout style paint',
  })
  textProperties.forEach((property) => { mirror.style[property] = styles[property] })
  mirror.setAttribute('aria-hidden', 'true')
  const textNode = document.createTextNode(source || '\u200b')
  mirror.append(textNode)
  document.body.append(mirror)
  return { mirror, textNode }
}

function caretTop(textNode: Text, offset: number): number | null {
  const safeOffset = Math.min(Math.max(offset, 0), textNode.length)
  const range = document.createRange()
  const top = () => {
    const rect = range.getBoundingClientRect()
    return rect.height > 0 ? rect.top : null
  }
  range.setStart(textNode, safeOffset)
  range.collapse(true)
  let measured = top()
  if (measured !== null) return measured
  if (safeOffset < textNode.length) {
    range.setEnd(textNode, safeOffset + 1)
    measured = top()
    if (measured !== null) return measured
  }
  if (safeOffset > 0) {
    range.setStart(textNode, safeOffset - 1)
    range.setEnd(textNode, safeOffset)
    measured = top()
  }
  return measured
}

function sampleAnchors<T>(anchors: T[]): T[] {
  if (anchors.length <= MAX_SCROLL_ANCHORS) return anchors
  return Array.from({ length: MAX_SCROLL_ANCHORS }, (_, index) => (
    anchors[Math.round((anchors.length - 1) * index / (MAX_SCROLL_ANCHORS - 1))]
  ))
}

export function buildMarkdownScrollMap(source: HTMLTextAreaElement, preview: HTMLElement): MarkdownScrollMap | null {
  if (source.clientWidth <= 0 || preview.clientWidth <= 0) return null
  const sourceMaximum = Math.max(0, source.scrollHeight - source.clientHeight)
  const previewMaximum = Math.max(0, preview.scrollHeight - preview.clientHeight)
  const starts = lineStarts(source.value)
  const sourceAnchors = [...preview.querySelectorAll<HTMLElement>('[data-markdown-source-start]')]
    .filter((element) => !element.closest('.markdown-footnotes'))
    .map((element) => ({ element, line: Number(element.dataset.markdownSourceStart) }))
    .filter(({ line }) => Number.isInteger(line) && line >= 0 && line < starts.length)
  const unique: Array<{ element: HTMLElement; line: number }> = []
  const seenLines = new Set<number>()
  sourceAnchors.sort((first, second) => first.line - second.line).forEach((anchor) => {
    if (seenLines.has(anchor.line)) return
    seenLines.add(anchor.line)
    unique.push(anchor)
  })
  const anchors = sampleAnchors(unique)
  const mirrorResult = createTextMirror(source.value, source)
  const sourceOffsets = new Map<number, number>()
  try {
    const { mirror, textNode } = mirrorResult
    const origin = caretTop(textNode, 0)
    const mirrorMaximum = Math.max(0, mirror.scrollHeight - source.clientHeight)
    const scale = mirrorMaximum > 0 && sourceMaximum > 0 ? sourceMaximum / mirrorMaximum : 1
    if (origin !== null) anchors.forEach(({ line }) => {
      const characterOffset = starts[line]
      const measured = caretTop(textNode, characterOffset)
      if (measured === null) return
      sourceOffsets.set(line, clamp((measured - origin) * scale, sourceMaximum))
    })
  } finally {
    mirrorResult.mirror.remove()
  }

  const previewTop = preview.getBoundingClientRect().top
  const points: ScrollPoint[] = [{ from: 0, to: 0 }]
  anchors.forEach(({ element, line }) => {
    const sourceOffset = sourceOffsets.get(line)
    if (sourceOffset === undefined || sourceOffset <= 0.5 || sourceOffset >= sourceMaximum - 0.5) return
    const bounds = element.getBoundingClientRect()
    const previewOffset = clamp(bounds.top - previewTop + preview.scrollTop, previewMaximum)
    points.push({ from: sourceOffset, to: previewOffset })
  })
  points.push({ from: sourceMaximum, to: previewMaximum })
  const sourceToPreview = monotonicMap(points)
  const previewToSource = monotonicMap(sourceToPreview.map(({ from, to }) => ({ from: to, to: from })), 'max')
  return {
    sourceToPreview,
    previewToSource,
    sourceMaximum,
    previewMaximum,
    sourceClientWidth: source.clientWidth,
    sourceClientHeight: source.clientHeight,
    previewClientWidth: preview.clientWidth,
    previewClientHeight: preview.clientHeight,
  }
}

export function isMarkdownScrollMapCurrent(map: MarkdownScrollMap | null, source: HTMLTextAreaElement, preview: HTMLElement): map is MarkdownScrollMap {
  return Boolean(map && map.sourceMaximum === Math.max(0, source.scrollHeight - source.clientHeight)
    && map.previewMaximum === Math.max(0, preview.scrollHeight - preview.clientHeight)
    && map.sourceClientWidth === source.clientWidth && map.sourceClientHeight === source.clientHeight
    && map.previewClientWidth === preview.clientWidth && map.previewClientHeight === preview.clientHeight)
}
