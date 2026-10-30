import type { RecordMark } from '@/lib/db/queries/community-explore'

import { cn } from '@/lib/utils'

/**
 * A community's last 10 results as ten little bars, newest on the right:
 * solid when the result was decided on time and stood, an outline when
 * the jury was late and everyone was refunded, grey when it was overturned
 * on appeal, dashed when it is not decided yet.
 */

export const RECORD_MARK_CLASS: Record<RecordMark, string> = {
  stood: 'bg-foreground',
  late: 'border-[1.5px] border-muted-foreground',
  overturned: 'bg-muted-foreground/60',
  pending: 'border-[1.5px] border-dashed border-border',
}

export function RecordBars({
  record,
  size = 'sm',
  className,
}: {
  record: RecordMark[]
  size?: 'sm' | 'md'
  className?: string
}) {
  const stood = record.filter((mark) => mark === 'stood').length
  const decided = record.filter((mark) => mark !== 'pending').length
  return (
    <span
      className={cn('inline-flex items-center gap-[3px]', className)}
      role="img"
      aria-label={decided === 0 ? 'No results yet' : `${stood} of the last ${decided} results stood`}
    >
      {[...record].reverse().map((mark, index) => (
        <span
          key={index}
          className={cn('box-border rounded-[2px]', size === 'md' ? 'h-3.5 w-2' : 'h-3 w-1.5', RECORD_MARK_CLASS[mark])}
        />
      ))}
    </span>
  )
}

/** The words next to the bars on a card: "10 of 10 stood", "9 stood, 1 late", "3 decided", "No results yet". */
export function recordLabel(record: RecordMark[]): string {
  const decided = record.filter((mark) => mark !== 'pending')
  if (decided.length === 0) {
    return 'No results yet'
  }
  const stood = decided.filter((mark) => mark === 'stood').length
  const late = decided.filter((mark) => mark === 'late').length
  const overturned = decided.filter((mark) => mark === 'overturned').length
  if (stood === decided.length) {
    return decided.length >= 6 ? `${stood} of ${decided.length} stood` : `${decided.length} decided`
  }
  const parts = [`${stood} stood`]
  if (late > 0) {
    parts.push(`${late} late`)
  }
  if (overturned > 0) {
    parts.push(`${overturned} overturned`)
  }
  return parts.join(', ')
}

/** The sentence under the hero: "Their last 10 results all stood." */
export function recordSummary(record: RecordMark[]): string {
  const decided = record.filter((mark) => mark !== 'pending')
  if (decided.length === 0) {
    return 'No results yet.'
  }
  const stood = decided.filter((mark) => mark === 'stood').length
  if (stood === decided.length) {
    return decided.length === 1 ? 'Its one result stood.' : `Their last ${decided.length} results all stood.`
  }
  return `${stood} of the last ${decided.length} results stood.`
}
