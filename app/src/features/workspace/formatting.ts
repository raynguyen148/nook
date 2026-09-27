import type { FormattingCommand } from './workspace-types'

export interface TextareaEdit {
  value: string
  start: number
  end: number
}

function toggleLinePrefix(value: string, start: number, end: number, prefix: string, pattern: RegExp): TextareaEdit {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd < 0) lineEnd = value.length
  const selected = value.slice(lineStart, lineEnd)
  const lines = selected.split('\n')
  const remove = lines.every((line) => pattern.test(line))
  const next = lines.map((line) => remove ? line.replace(pattern, '') : `${prefix}${line}`).join('\n')
  return { value: `${value.slice(0, lineStart)}${next}${value.slice(lineEnd)}`, start: lineStart, end: lineStart + next.length }
}

export function formatTextarea(textarea: Pick<HTMLTextAreaElement, 'value' | 'selectionStart' | 'selectionEnd'>, command: FormattingCommand): TextareaEdit {
  const { value, selectionStart: start, selectionEnd: end } = textarea
  const selected = value.slice(start, end)
  if (command === 'bullet') return toggleLinePrefix(value, start, end, '- ', /^-\s/)
  if (command === 'ordered') return toggleLinePrefix(value, start, end, '1. ', /^\d+\.\s/)
  if (command === 'task') return toggleLinePrefix(value, start, end, '- [ ] ', /^-\s\[[ xX]\]\s/)
  if (command === 'quote') return toggleLinePrefix(value, start, end, '> ', /^>\s?/)
  if (command === 'heading') return toggleLinePrefix(value, start, end, '## ', /^##\s/)
  if (command === 'table') {
    const table = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |'
    return { value: `${value.slice(0, start)}${table}${value.slice(end)}`, start: start + 2, end: start + 10 }
  }
  if (command === 'code-block') {
    const block = `\`\`\`\n${selected}\n\`\`\``
    return { value: `${value.slice(0, start)}${block}${value.slice(end)}`, start: start + 4, end: start + 4 + selected.length }
  }
  if (command === 'alert') {
    const content = selected || 'Add a note'
    const alert = `> [!NOTE]\n> ${content}`
    return { value: `${value.slice(0, start)}${alert}${value.slice(end)}`, start: start + 12, end: start + 12 + content.length }
  }
  if (command === 'footnote') {
    const references = [...value.matchAll(/\[\^(\d+)\]/g)].map((match) => Number.parseInt(match[1], 10)).filter(Number.isFinite)
    const number = references.length ? Math.max(...references) + 1 : 1
    const footnote = `${selected}[^${number}]\n\n[^${number}]: `
    return { value: `${value.slice(0, start)}${footnote}${value.slice(end)}`, start: start + footnote.length, end: start + footnote.length }
  }
  if (command === 'rule') {
    const rule = '\n---\n'
    return { value: `${value.slice(0, start)}${rule}${value.slice(end)}`, start: start + rule.length, end: start + rule.length }
  }
  if (command === 'link') {
    const label = selected || 'link text'
    const link = `[${label}](https://)`
    const urlStart = start + label.length + 3
    return { value: `${value.slice(0, start)}${link}${value.slice(end)}`, start: urlStart, end: urlStart + 8 }
  }
  const marker = command === 'bold' ? '**' : command === 'italic' ? '*' : command === 'strike' ? '~~' : '`'
  const hasWrapper = start >= marker.length && value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker
  if (hasWrapper) {
    return {
      value: `${value.slice(0, start - marker.length)}${selected}${value.slice(end + marker.length)}`,
      start: start - marker.length,
      end: end - marker.length,
    }
  }
  return {
    value: `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`,
    start: start + marker.length,
    end: end + marker.length,
  }
}

export function safeFilename(title: string): string {
  const normalized = (title.trim() || 'nook-note').split('').map((character) => {
    const code = character.charCodeAt(0)
    return '\\/:*?"<>|'.includes(character) || code < 32 || (code >= 127 && code <= 159) ? '-' : character
  }).join('')
  return normalized.replace(/\s+/g, ' ').slice(0, 100)
}
