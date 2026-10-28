import { formatMoney } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * How close an appeal is to review: two bars, backers and money in escrow.
 * It goes to Prophit when either line fills.
 */

interface AppealProgressProps {
  backers: number
  backersNeeded: number
  escrowMinor: string | bigint
  escrowTargetMinor: string | bigint
  currency: string | null
  /** 'open' shows both bars; 'met' shows the filled state; 'short' the ended-short state. */
  state?: 'open' | 'met' | 'short'
  compact?: boolean
  className?: string
}

function ratio(value: bigint, target: bigint) {
  if (target <= 0n) {
    return 1
  }
  return Math.max(0, Math.min(1, Number((value * 1000n) / target) / 1000))
}

function Bar({ value, tone }: { value: number; tone: 'foreground' | 'muted' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <span
        className={cn('block h-full rounded-full', tone === 'foreground' ? 'bg-foreground' : 'bg-muted-foreground/60')}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}

export function AppealProgress({
  backers,
  backersNeeded,
  escrowMinor,
  escrowTargetMinor,
  currency,
  state = 'open',
  compact = false,
  className,
}: AppealProgressProps) {
  const escrow = BigInt(escrowMinor)
  const target = BigInt(escrowTargetMinor)
  const backersRatio = backersNeeded > 0 ? Math.min(1, backers / backersNeeded) : 1
  const escrowRatio = ratio(escrow, target)

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground tabular-nums', className)}>
        <span className="font-semibold text-foreground">Appeal open</span>
        <span className="inline-block h-1 w-20 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <span className="block h-full bg-foreground" style={{ width: `${backersRatio * 100}%` }} />
        </span>
        <span>
          {backers} of {backersNeeded} backers
        </span>
      </span>
    )
  }

  if (state === 'met') {
    return (
      <div className={cn('flex flex-col gap-2 rounded-xl border border-foreground bg-card p-4', className)}>
        <p className="text-sm font-semibold">Enough backers. Prophit is reviewing.</p>
        <Bar value={1} tone="foreground" />
        <p className="text-xs text-muted-foreground tabular-nums">
          {backers} backers · {formatMoney(escrow, currency)} held · all payouts on this market are paused
        </p>
      </div>
    )
  }

  if (state === 'short') {
    return (
      <div className={cn('flex flex-col gap-2 rounded-xl bg-secondary p-4', className)}>
        <p className="text-sm font-semibold">Not enough backers in time</p>
        <Bar value={backersRatio} tone="muted" />
        <p className="text-xs/relaxed text-muted-foreground">
          The result stands and payouts were released. Escrow went back to everyone who backed it.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm tabular-nums">
          <span>Backers</span>
          <span>
            <strong>{backers}</strong> of {backersNeeded} needed
          </span>
        </div>
        <Bar value={backersRatio} tone="foreground" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm tabular-nums">
          <span>Held in escrow</span>
          <span>
            <strong>{formatMoney(escrow, currency)}</strong> of {formatMoney(target, currency)}
          </span>
        </div>
        <Bar value={escrowRatio} tone="foreground" />
      </div>
      <p className="text-xs/relaxed text-muted-foreground">
        Goes to Prophit review when <strong>either</strong> line fills. Escrow is returned if the appeal wins or the
        market is voided, and lost if it is rejected.
      </p>
    </div>
  )
}
