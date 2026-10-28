import { formatChance, formatMoney } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * How the pool is split. Binary pools use the Yes green and No red; pools
 * with more outcomes use greyscale steps so colour never implies a side.
 */

export interface PoolSplitSegment {
  key: string
  label: string
  /** 0–1 share of the pool. */
  share: number
  totalMinor: string | bigint
}

interface PoolSplitBarProps {
  segments: PoolSplitSegment[]
  currency: string | null
  /** Binary pools pass exactly two segments in Yes, No order. */
  binary?: boolean
  showLegend?: boolean
  className?: string
}

const GREY_STEPS = ['bg-foreground', 'bg-foreground/55', 'bg-foreground/35', 'bg-foreground/20', 'bg-foreground/12']

export function PoolSplitBar({ segments, currency, binary = false, showLegend = true, className }: PoolSplitBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.share), 0)
  const normalized = segments.map((segment) => ({
    ...segment,
    width: total > 0 ? (Math.max(0, segment.share) / total) * 100 : 100 / Math.max(1, segments.length),
  }))
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        {normalized.map((segment, index) => (
          <span
            key={segment.key}
            style={{ width: `${segment.width}%` }}
            className={cn(
              'h-full',
              binary ? (index === 0 ? 'bg-yes' : 'bg-no') : (GREY_STEPS[index] ?? GREY_STEPS[GREY_STEPS.length - 1]),
            )}
          />
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {normalized.map((segment, index) => (
            <span key={segment.key} className="inline-flex items-center gap-1.5">
              {!binary && (
                <span
                  className={cn('size-2.5 rounded-[3px]', GREY_STEPS[index] ?? GREY_STEPS[GREY_STEPS.length - 1])}
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  'font-semibold',
                  binary && index === 0 && 'text-yes',
                  binary && index === 1 && 'text-no-text',
                )}
              >
                {segment.label} {formatChance(segment.share)}
              </span>
              <span>· {formatMoney(segment.totalMinor, currency)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
