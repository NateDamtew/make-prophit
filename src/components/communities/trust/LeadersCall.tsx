import { initials } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * "Daily Ledger says YES": the leader's own call on a market, as a chip.
 * Yes and No keep their colours; any other outcome (a draw, a name) is a
 * neutral pill.
 */

interface LeadersCallProps {
  leaderName: string
  leaderImage?: string | null
  /** 'yes' | 'no' | any outcome label ("DRAW", "Gor Mahia"). */
  call: string
  className?: string
}

export function LeadersCall({ leaderName, leaderImage, call, className }: LeadersCallProps) {
  const normalized = call.trim().toLowerCase()
  const tone = normalized === 'yes' ? 'yes' : normalized === 'no' ? 'no' : 'neutral'
  return (
    <span
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-2 rounded-full bg-secondary py-0.5 pr-1 pl-1 text-xs text-secondary-foreground',
        className,
      )}
    >
      <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--community-accent,var(--color-muted-foreground)) text-[10px] font-bold text-background">
        {leaderImage ? <img src={leaderImage} alt="" className="size-full object-cover" /> : initials(leaderName)}
      </span>
      <span className="truncate">{leaderName} says</span>
      <span
        className={cn(
          'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold tracking-wide uppercase',
          tone === 'yes' && 'bg-yes/15 text-yes',
          tone === 'no' && 'bg-no/15 text-no-text',
          tone === 'neutral' && 'border border-border bg-background text-foreground',
        )}
      >
        {call}
      </span>
    </span>
  )
}
