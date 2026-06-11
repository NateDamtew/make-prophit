const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const plainNumber = new Intl.NumberFormat('en-US')

export function formatCompact(value: number): string {
  return compactNumber.format(value)
}

export function formatNumber(value: number): string {
  return plainNumber.format(value)
}

/** Relative time like "2h ago", "3d ago", falling back to a date for old items. */
export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)

  if (seconds < 45) {
    return 'just now'
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.round(hours / 24)
  if (days < 7) {
    return `${days}d ago`
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Absolute timestamp for tooltips. */
export function formatAbsolute(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
