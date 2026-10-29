'use client'

import { ArrowDownToLineIcon, CheckIcon, RotateCcwIcon, ShieldAlertIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { formatCloseLabel } from '@/components/communities/format'
import { HoldCard } from '@/components/communities/lifecycle/HoldCard'
import { JuryProgress } from '@/components/communities/lifecycle/JuryProgress'
import { HeadlineOdds } from '@/components/communities/odds/HeadlineOdds'
import { PoolSplitBar } from '@/components/communities/odds/PoolSplitBar'
import { Countdown } from '@/components/communities/time/Countdown'
import { cn } from '@/lib/utils'

import type { MarketLifecycle } from './market-lifecycle'
import type { PoolMarketRecord } from './pool-market-types'

import PoolMetaInformation from './PoolMetaInformation'

/**
 * The block under the title that says what the market is doing right now.
 * Open: the big chance number (the chart below carries the split). Closed: the jury's progress.
 * Decided: the result, and the hold, freeze or payout that follows it.
 */

interface MarketHeroProps {
  market: PoolMarketRecord
  lifecycle: MarketLifecycle
  outcomeLabels: { yes: string; no: string }
  totals: { yes: bigint; no: bigint }
  className?: string
}

export function ResultPill({
  outcome,
  outcomeLabels,
  size = 'lg',
}: {
  outcome: 'yes' | 'no' | null
  outcomeLabels: { yes: string; no: string }
  size?: 'md' | 'lg'
}) {
  const t = useExtracted()
  if (outcome === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-secondary font-bold',
          size === 'lg' ? 'h-12 px-5 text-xl' : 'h-9 px-3.5 text-base',
        )}
      >
        <RotateCcwIcon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden="true" />
        {t('Refunded')}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-bold',
        size === 'lg' ? 'h-12 px-5 text-xl' : 'h-9 px-3.5 text-base',
        outcome === 'yes' ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no-text',
      )}
    >
      <CheckIcon className={size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={3} aria-hidden="true" />
      {outcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no}
    </span>
  )
}

function ImportedTag({ source }: { source: string | null }) {
  const t = useExtracted()
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground">
      <ArrowDownToLineIcon className="size-3.5" aria-hidden="true" />
      {source ? t('Imported · settles from {source}', { source }) : t('Imported market')}
    </span>
  )
}

export default function MarketHero({ market, lifecycle, outcomeLabels, totals, className }: MarketHeroProps) {
  const t = useExtracted()
  const locale = useLocale()
  const { phase, chance, currency } = lifecycle
  const total = totals.yes + totals.no
  const segments = [
    {
      key: 'yes',
      label: outcomeLabels.yes,
      share: total > 0n ? Number((totals.yes * 10_000n) / total) / 10_000 : 0.5,
      totalMinor: totals.yes,
    },
    {
      key: 'no',
      label: outcomeLabels.no,
      share: total > 0n ? Number((totals.no * 10_000n) / total) / 10_000 : 0.5,
      totalMinor: totals.no,
    },
  ]
  const headlineLabel = outcomeLabels.yes.toLowerCase() === 'yes' ? t('chance') : outcomeLabels.yes
  const decidedLine = t('Decided by {required} of {size} jurors', {
    required: String(Math.max(lifecycle.jury.required, Math.min(lifecycle.jury.voted, lifecycle.jury.size))),
    size: String(lifecycle.jury.size),
  })

  if (phase === 'open' || phase === 'closing') {
    return (
      <section className={cn('flex flex-col gap-4', className)}>
        {lifecycle.source === 'imported' && <ImportedTag source={market.resolution_source} />}
        {chance === null ? (
          <div>
            <p className="text-[28px]/none font-bold">{t('No stakes yet')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('The first stake sets the odds.')}</p>
          </div>
        ) : (
          <HeadlineOdds chance={chance} label={headlineLabel} />
        )}
        {phase === 'closing' && lifecycle.closesAt !== null ? (
          <Countdown target={lifecycle.closesAt} verb={t('Closes')} start={market.created_at} />
        ) : null}
        <PoolMetaInformation
          totalMinor={total}
          stakeCount={lifecycle.stakeCount}
          currency={currency}
          endDate={phase === 'closing' ? null : lifecycle.closesAt}
        />
      </section>
    )
  }

  if (phase === 'awaiting') {
    return (
      <section className={cn('flex flex-col gap-4', className)}>
        {lifecycle.source === 'imported' && <ImportedTag source={market.resolution_source} />}
        <div>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {lifecycle.closesAt !== null
              ? t('Closed {time}', { time: formatCloseLabel(lifecycle.closesAt, locale) })
              : t('Closed')}
          </p>
          <h2 className="mt-1 text-[22px]/tight font-bold">
            {lifecycle.source === 'imported' ? t('Waiting for the source to settle') : t('The jury is deciding')}
          </h2>
        </div>
        {lifecycle.source === 'community' && (
          <JuryProgress
            seats={lifecycle.jury.size}
            voted={lifecycle.jury.voted}
            required={lifecycle.jury.required}
            caption={
              lifecycle.juryDueAt !== null
                ? t('Verdicts due by {time}. If the jury is late, everyone is refunded.', {
                    time: formatCloseLabel(lifecycle.juryDueAt, locale),
                  })
                : null
            }
          />
        )}
        <PoolSplitBar segments={segments} currency={currency} binary />
        <PoolMetaInformation totalMinor={total} stakeCount={lifecycle.stakeCount} currency={currency} endDate={null} />
      </section>
    )
  }

  // hold · review · settled · refunded
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      {lifecycle.source === 'imported' && <ImportedTag source={market.resolution_source} />}
      <div className="flex flex-col items-start gap-2">
        <p className="text-[13px] font-semibold text-muted-foreground">
          {phase === 'refunded' ? t('No result') : t('Result')}
        </p>
        <ResultPill outcome={phase === 'refunded' ? null : lifecycle.outcome} outcomeLabels={outcomeLabels} />
        <p className="text-sm text-muted-foreground">
          {phase === 'refunded'
            ? lifecycle.refundReason === 'late'
              ? t('The jury missed its deadline, so every stake went back to its owner.')
              : t('This market was voided and every stake went back to its owner.')
            : lifecycle.source === 'imported'
              ? t('Settled from the source. No jury, no hold.')
              : decidedLine}
        </p>
      </div>

      {phase === 'hold' && lifecycle.hold && (
        <HoldCard
          announcedAt={lifecycle.hold.announcedAt}
          paysAt={lifecycle.hold.paysAt}
          extended={lifecycle.hold.extended}
        />
      )}
      {phase === 'hold' && !lifecycle.hold && (
        <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
          {t('Payouts are being prepared. They land after the 24-hour hold.')}
        </p>
      )}
      {phase === 'review' && (
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm/snug">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{t('Payouts are frozen.')}</strong>{' '}
            {t('An appeal reached its threshold and Prophit is reviewing the verdicts. Nothing moves until it rules.')}
          </span>
        </div>
      )}
      {phase === 'settled' && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {lifecycle.hold
            ? t('Paid {time}', { time: formatCloseLabel(lifecycle.hold.paysAt, locale) })
            : t('Winners have been paid.')}
        </p>
      )}

      <PoolSplitBar segments={segments} currency={currency} binary />
      <PoolMetaInformation totalMinor={total} stakeCount={lifecycle.stakeCount} currency={currency} endDate={null} />
    </section>
  )
}
