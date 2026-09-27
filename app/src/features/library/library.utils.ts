export function sameLocalDay(value: string, today = new Date()): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function notePreview(content: string): string {
  return content.replace(/^\s*#+\s*/gm, '').replace(/[>*_~`#[\]!-]/g, ' ').replace(/\s+/g, ' ').trim()
}
