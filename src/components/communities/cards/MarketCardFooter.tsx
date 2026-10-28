'use client'

import { CheckIcon, LockIcon, PauseIcon, XIcon } from 'lucide-react'
import { useLocale } from 'next-intl'

import { formatCloseLabel, formatMoney, formatShortCountdown } from '@/components/communities/format'
import { AppealProgress } from '@/components/communities/lifecycle/AppealProgress'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { cn } from '@/lib/utils'

/**
 * Once a market is past "open", the Yes/No buttons give way to one of these
 * strips: what state it is in and what it means for the viewer's money.
 */

export type MarketCardFooterState =
  | { kind: 'closing'; closesAt: Date | string | number }
  | { kind: 'jury'; voted: number; seats: number; dueAt: Date | string | number | null }
  | { kind: 'hold'; outcome: string; side: 'yes' | 'no' | null; paysAt: Date | string | number }
  | { kind: 'appeal'; backers: number; backersNeeded: number }
  | { kind: 'review' }
  | { kind: 'won'; amountMinor: string | bigint; currency: string | null; outcome: string; side: 'yes' | 'no' | null }
  | { kind: 'lost'; outcome: string; side: 'yes' | 'no' | null }
  | { kind: 'resolved'; outcome: string; side: 'yes' | 'no' | null; paidAt: Date | string | number | null }
  | { kind: 'voided'; refundMinor: string | bigint | null; currency: string | null }
  | { kind: 'empty' }

function OutcomePill({ outcome, side }: { outcome: string; side: 'yes' | 'no' | null }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold tracking-wide uppercase',
        side === 'yes' && 'bg-yes/15 text-yes',
        side === 'no' && 'bg-no/15 text-no-text',
        !side && 'border border-border text-foreground',
      )}
    >
      {side === 'yes' ? <CheckIcon className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
      {side === 'no' ? <XIcon className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
      {outcome}
    </span>
  )
}

export function MarketCardFooter({ state, className }: { state: MarketCardFooterState; className?: string }) {
  const locale = useLocale()
  const now = useNowTimestamp()
  const base = cn(
    'flex h-11 items-center gap-2 rounded-md bg-secondary px-3 text-xs text-foreground tabular-nums',
    className,
  )

  switch (state.kind) {
    case 'closing': {
      const remaining = now === null ? null : new Date(state.closesAt).getTime() - now
      return (
        <div className={base}>
          <span className="relative inline-flex size-2" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-foreground/15" />
            <span className="absolute inset-0.5 rounded-full bg-foreground" />
          </span>
          Closes in {remaining === null ? '…' : formatShortCountdown(remaining)}
        </div>
      )
    }
    case 'jury':
      return (
        <div className={base}>
          <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Jury deciding · {state.voted}/{state.seats}
            {state.dueAt ? ` · due ${formatCloseLabel(state.dueAt, locale, now)}` : ''}
          </span>
        </div>
      )
    case 'hold':
      return (
        <div className={base}>
          <OutcomePill outcome={state.outcome} side={state.side} />
          <span className="truncate">Result in · paid {formatCloseLabel(state.paysAt, locale, now)}</span>
        </div>
      )
    case 'appeal':
      return (
        <div className={base}>
          <AppealProgress
            compact
            backers={state.backers}
            backersNeeded={state.backersNeeded}
            escrowMinor="0"
            escrowTargetMinor="0"
            currency={null}
          />
        </div>
      )
    case 'review':
      return (
        <div className={base}>
          <PauseIcon className="size-3.5 shrink-0" aria-hidden="true" />
          Prophit is reviewing · payouts paused
        </div>
      )
    case 'won':
      return (
        <div className={base}>
          <OutcomePill outcome={state.outcome} side={state.side} />
          <span>
            You won <strong>{formatMoney(state.amountMinor, state.currency)}</strong>
          </span>
        </div>
      )
    case 'lost':
      return (
        <div className={base}>
          <OutcomePill outcome={state.outcome} side={state.side} />
          <span className="text-muted-foreground">You lost this one</span>
        </div>
      )
    case 'resolved':
      return (
        <div className={base}>
          <OutcomePill outcome={state.outcome} side={state.side} />
          <span className="truncate text-muted-foreground">
            {state.paidAt ? `Paid ${formatCloseLabel(state.paidAt, locale, now)}` : 'Resolved'}
          </span>
        </div>
      )
    case 'voided':
      return (
        <div className={base}>
          <span className="truncate">
            Voided
            {state.refundMinor !== null
              ? ` · your ${formatMoney(state.refundMinor, state.currency)} is back`
              : ' · everyone refunded'}
          </span>
        </div>
      )
    case 'empty':
      return (
        <div
          className={cn(base, 'border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground')}
        >
          No stakes yet · be the first
        </div>
      )
    default:
      return null
  }
}
