import { formatChance } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * Inline odds: a neutral "62%", a "Yes 62%" / "No 38%" in its colour, or a
 * dashed "No stakes yet" when the pool is empty.
 */

interface OddsChipProps {
  /** 0–1. Null means the pool has no stakes yet. */
  chance: number | null
  side?: 'yes' | 'no' | null
  /** Outcome labels when the market renames Yes/No. */
  labels?: { yes: string; no: string }
  className?: string
}

export function OddsChip({ chance, side = null, labels, className }: OddsChipProps) {
  if (chance === null) {
    return (
      <span
        className={cn(
          'inline-flex h-6 items-center rounded-full border border-dashed border-muted-foreground/40 px-2 text-xs font-semibold text-muted-foreground',
          className,
        )}
      >
        No stakes yet
      </span>
    )
  }
  const sideLabel = side === 'yes' ? (labels?.yes ?? 'Yes') : side === 'no' ? (labels?.no ?? 'No') : null
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-bold tabular-nums',
        side === 'yes' && 'bg-yes/15 text-yes',
        side === 'no' && 'bg-no/15 text-no-text',
        !side && 'bg-secondary text-secondary-foreground',
        className,
      )}
    >
      {sideLabel ? <span>{sideLabel}</span> : null}
      <span>{formatChance(chance)}</span>
    </span>
  )
}
