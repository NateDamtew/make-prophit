'use client'

import { useExtracted, useLocale } from 'next-intl'

import { formatCloseLabel, formatMoney } from '@/components/communities/format'
import { OddsChip } from '@/components/communities/odds/OddsChip'
import { cn } from '@/lib/utils'

import type { MarketLifecycle } from './market-lifecycle'

/**
 * "Your stake" on the market page: how much, on which side, and what it
 * does next. Won, lost, refunded and open all read differently.
 */

interface MarketPositionCardProps {
  lifecycle: MarketLifecycle
  outcomeLabels: { yes: string; no: string }
  className?: string
}

export default function MarketPositionCard({ lifecycle, outcomeLabels, className }: MarketPositionCardProps) {
  const t = useExtracted()
  const locale = useLocale()
  const stake = lifecycle.viewer.stake
  if (!stake) {
    return null
  }
  const { currency } = lifecycle
  const sideLabel =
    stake.side === 'mixed' ? t('both sides') : stake.side === 'yes' ? outcomeLabels.yes : outcomeLabels.no
  const result = lifecycle.viewer.result
  const payout = stake.payoutMinor

  let headline: string
  let detail: string
  if (result === 'won' && payout !== null) {
    headline = t('You won {amount}', { amount: formatMoney(payout, currency) })
    detail =
      lifecycle.phase === 'settled'
        ? t('Paid to your balance. Your {stake} on {side} paid out.', {
            stake: formatMoney(stake.amountMinor, currency),
            side: sideLabel,
          })
        : lifecycle.hold
          ? t('Lands in your balance {time}, once the hold ends.', {
              time: formatCloseLabel(lifecycle.hold.paysAt, locale),
            })
          : t('Lands in your balance after the hold.')
  } else if (result === 'lost') {
    headline = t('Your {amount} on {side}', { amount: formatMoney(stake.amountMinor, currency), side: sideLabel })
    detail =
      lifecycle.outcome === null
        ? t('This side did not win.')
        : t('{winner} won, so this stake paid the winners.', {
            winner: lifecycle.outcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no,
          })
  } else if (result === 'refunded') {
    headline = t('{amount} returned', { amount: formatMoney(stake.amountMinor, currency) })
    detail = t('Your stake is back in your balance.')
  } else {
    headline = t('Your {amount} on {side}', { amount: formatMoney(stake.amountMinor, currency), side: sideLabel })
    detail =
      payout !== null && payout > 0n
        ? t('Pays about {payout} if {side} wins.', { payout: formatMoney(payout, currency), side: sideLabel })
        : lifecycle.phase === 'awaiting'
          ? t('Locked in. The jury decides next.')
          : t('Locked in until the market closes.')
  }

  return (
    <section
      className={cn('flex flex-col gap-2 rounded-xl border border-border bg-card p-4', className)}
      aria-label={t('Your stake')}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-muted-foreground">{t('Your stake')}</p>
        {stake.side !== 'mixed' && (
          <OddsChip
            chance={lifecycle.chance === null ? null : stake.side === 'yes' ? lifecycle.chance : 1 - lifecycle.chance}
            side={stake.side}
            labels={outcomeLabels}
          />
        )}
      </div>
      <p className="text-xl font-bold tabular-nums">{headline}</p>
      <p className="text-sm/relaxed text-muted-foreground tabular-nums">{detail}</p>
    </section>
  )
}
