import { formatChance } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * The one big number on a market: "62% chance", in yellow, with how it moved.
 * Yellow is reserved for this number and the screen's primary action.
 */

interface HeadlineOddsProps {
  /** 0–1 chance for the headline outcome. */
  chance: number | null
  /** "chance", or the outcome name for a multi-outcome market ("Gor Mahia win"). */
  label?: string
  /** Movement line, e.g. "up 4 today". Null hides it. */
  delta?: string | null
  size?: 'md' | 'lg'
  className?: string
}

export function HeadlineOdds({ chance, label = 'chance', delta, size = 'lg', className }: HeadlineOddsProps) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      <span
        className={cn(
          'font-bold text-primary tabular-nums',
          size === 'lg' ? 'text-[44px]/none sm:text-[56px]/none' : 'text-[32px]/none',
        )}
      >
        {formatChance(chance)}
        <span className={cn('ml-1 font-semibold', size === 'lg' ? 'text-lg sm:text-xl' : 'text-base')}>{label}</span>
      </span>
      {delta ? <span className="text-sm font-semibold text-yes">{delta}</span> : null}
    </div>
  )
}
