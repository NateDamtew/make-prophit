import { formatChance, formatMoney } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * Outcomes of a market with more than two answers, one row each with its
 * share of the pool drawn as a quiet fill. The leading outcome gets a solid
 * border. Greyscale on purpose: colour never implies a side here.
 */

export interface OutcomeRow {
  key: string
  label: string
  /** 0–1 share of the pool. */
  share: number
  totalMinor: string | bigint
}

interface MultiOutcomeRowsProps {
  outcomes: OutcomeRow[]
  currency: string | null
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /** Show at most this many rows, then "N more". */
  limit?: number
  size?: 'sm' | 'md'
  className?: string
}

export function MultiOutcomeRows({
  outcomes,
  currency,
  selectedKey = null,
  onSelect,
  limit,
  size = 'md',
  className,
}: MultiOutcomeRowsProps) {
  const leader = outcomes.reduce<OutcomeRow | null>(
    (best, row) => (best === null || row.share > best.share ? row : best),
    null,
  )
  const shown = limit ? outcomes.slice(0, limit) : outcomes
  const hidden = outcomes.length - shown.length
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {shown.map((row) => {
        const isLeader = leader?.key === row.key
        const isSelected = selectedKey === row.key
        const content = (
          <>
            <span
              className="absolute inset-y-0 left-0 rounded-[inherit] bg-foreground/8"
              style={{ width: `${Math.max(0, Math.min(1, row.share)) * 100}%` }}
              aria-hidden="true"
            />
            <span className="relative z-10 min-w-0 flex-1 truncate font-semibold">{row.label}</span>
            {size === 'md' && (
              <span className="relative z-10 text-xs text-muted-foreground tabular-nums">
                {formatMoney(row.totalMinor, currency)}
              </span>
            )}
            <span className="relative z-10 font-bold tabular-nums">{formatChance(row.share)}</span>
          </>
        )
        const rowClass = cn(
          'relative flex w-full items-center gap-3 overflow-hidden rounded-md bg-secondary px-3 text-left text-sm transition-colors',
          size === 'md' ? 'h-14' : 'h-11',
          isSelected
            ? 'border border-foreground'
            : isLeader
              ? 'border border-foreground/40'
              : 'border border-transparent',
          onSelect && 'hover:bg-secondary/70',
        )
        return onSelect ? (
          <button
            key={row.key}
            type="button"
            className={rowClass}
            onClick={() => onSelect(row.key)}
            aria-pressed={isSelected}
          >
            {content}
          </button>
        ) : (
          <div key={row.key} className={rowClass}>
            {content}
          </div>
        )
      })}
      {hidden > 0 && <p className="text-xs text-muted-foreground">{hidden} more</p>}
    </div>
  )
}
