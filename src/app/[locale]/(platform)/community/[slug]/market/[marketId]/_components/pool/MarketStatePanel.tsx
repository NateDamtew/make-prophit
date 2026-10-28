'use client'

import { Share2Icon, SmartphoneIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useState } from 'react'

import type { CommunityTrust } from '@/components/communities/types'
import type { PoolSummary } from '@/lib/pools/service'

import { formatCloseLabel, formatMoney } from '@/components/communities/format'
import { HoldCard } from '@/components/communities/lifecycle/HoldCard'
import { JuryProgress } from '@/components/communities/lifecycle/JuryProgress'
import { RateResolution } from '@/components/communities/lifecycle/RateResolution'
import { StakeSheet } from '@/components/communities/stake/StakeSheet'
import { TrustBlock } from '@/components/communities/trust/TrustBlock'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'

import type { MarketLifecycle } from './market-lifecycle'
import type { PoolCommunityRecord, PoolMarketRecord } from './pool-market-types'

import { ResultPill } from './MarketHero'
import { communityPath } from './pool-market-types'

/**
 * The right-hand column on desktop: the one thing the viewer can do in this
 * state. Stake while open, wait while the jury decides, watch the hold,
 * share a win or rate a loss, and under it the community's trust block.
 */

interface MarketStatePanelProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  summary: PoolSummary | null
  lifecycle: MarketLifecycle
  trust: CommunityTrust | null
  side: 'yes' | 'no'
  onSideChange: (side: 'yes' | 'no') => void
  outcomeLabels: { yes: string; no: string }
  onShareWin: () => void
  onMoneyMoved: () => void
}

function Card({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label={label}>
      {children}
    </section>
  )
}

export function MarketStateBody({
  community,
  lifecycle,
  outcomeLabels,
  onShareWin,
}: Pick<MarketStatePanelProps, 'community' | 'lifecycle' | 'outcomeLabels' | 'onShareWin'>) {
  const t = useExtracted()
  const locale = useLocale()
  const [rating, setRating] = useState<number | null>(null)
  const { phase, currency, viewer } = lifecycle
  const stake = viewer.stake

  if (phase === 'awaiting') {
    return (
      <Card label={t('Market closed')}>
        <p className="text-[15px] font-semibold">
          {lifecycle.source === 'imported'
            ? t('Closed. Waiting for the source to settle.')
            : t('Closed. The jury is deciding.')}
        </p>
        {lifecycle.source === 'community' && (
          <JuryProgress
            seats={lifecycle.jury.size}
            voted={lifecycle.jury.voted}
            required={lifecycle.jury.required}
            caption={
              lifecycle.juryDueAt !== null
                ? t('Due by {time}', { time: formatCloseLabel(lifecycle.juryDueAt, locale) })
                : null
            }
          />
        )}
        {stake && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('Your {amount} is locked in.', { amount: formatMoney(stake.amountMinor, currency) })}
          </p>
        )}
      </Card>
    )
  }

  if (phase === 'hold' || phase === 'review') {
    return (
      <Card label={t('Result')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-muted-foreground">{t('Result')}</p>
          <ResultPill outcome={lifecycle.outcome} outcomeLabels={outcomeLabels} size="md" />
        </div>
        {phase === 'hold' && lifecycle.hold ? (
          <HoldCard
            announcedAt={lifecycle.hold.announcedAt}
            paysAt={lifecycle.hold.paysAt}
            extended={lifecycle.hold.extended}
          />
        ) : (
          <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
            {phase === 'review'
              ? t('Payouts are frozen while Prophit reviews an appeal.')
              : t('Payouts land after the hold.')}
          </p>
        )}
        {stake && viewer.result === 'won' && stake.payoutMinor !== null && (
          <p className="text-lg font-bold tabular-nums">
            {t('You won {amount}', { amount: formatMoney(stake.payoutMinor, currency) })}
          </p>
        )}
        {stake && viewer.result === 'lost' && (
          <p className="text-sm text-muted-foreground">
            {t('Your side did not win. You can read every verdict below and appeal within the hold.')}
          </p>
        )}
        {phase === 'hold' && (
          <Button variant="secondary" nativeButton={false} render={<a href="#verdicts" />} className="h-11 rounded-md">
            {t('Read the verdicts')}
          </Button>
        )}
      </Card>
    )
  }

  if (phase === 'settled') {
    if (stake && viewer.result === 'won' && stake.payoutMinor !== null) {
      return (
        <Card label={t('You won')}>
          <p className="text-[13px] font-semibold text-muted-foreground">{t('Paid to your balance')}</p>
          <p className="text-[28px]/none font-bold tabular-nums">{formatMoney(stake.payoutMinor, currency)}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('From your {amount} on {side}.', {
              amount: formatMoney(stake.amountMinor, currency),
              side: stake.side === 'yes' ? outcomeLabels.yes : stake.side === 'no' ? outcomeLabels.no : t('both sides'),
            })}
          </p>
          <Button
            size="lg"
            className="h-12 rounded-md text-base font-bold shadow-lg shadow-primary/20"
            onClick={onShareWin}
          >
            <Share2Icon className="size-4" aria-hidden="true" />
            {t('Share your win')}
          </Button>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={`${communityPath(community.slug)}?sheet=withdraw`} />}
            className="h-11 rounded-md"
          >
            <SmartphoneIcon className="size-4" aria-hidden="true" />
            {t('Withdraw to mobile money')}
          </Button>
        </Card>
      )
    }
    if (stake && viewer.result === 'lost') {
      return (
        <Card label={t('Result')}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-muted-foreground">{t('Result')}</p>
            <ResultPill outcome={lifecycle.outcome} outcomeLabels={outcomeLabels} size="md" />
          </div>
          <RateResolution
            value={rating}
            onRate={(value) => {
              setRating(value)
              toast.success(t('Thanks. Your rating goes on each juror’s record.'))
            }}
          />
        </Card>
      )
    }
    return (
      <Card label={t('Result')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-muted-foreground">{t('Result')}</p>
          <ResultPill outcome={lifecycle.outcome} outcomeLabels={outcomeLabels} size="md" />
        </div>
        <p className="text-sm text-muted-foreground">{t('Winners have been paid.')}</p>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={communityPath(community.slug)} />}
          className="h-11 rounded-md"
        >
          {t('See open markets')}
        </Button>
      </Card>
    )
  }

  if (phase === 'refunded') {
    return (
      <Card label={t('Refunded')}>
        <ResultPill outcome={null} outcomeLabels={outcomeLabels} size="md" />
        <p className="text-sm text-muted-foreground tabular-nums">
          {stake
            ? t('Your {amount} is back in your balance.', { amount: formatMoney(stake.amountMinor, currency) })
            : lifecycle.refundReason === 'late'
              ? t('The jury missed its deadline, so every stake went back.')
              : t('This market was voided, so every stake went back.')}
        </p>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={communityPath(community.slug)} />}
          className="h-11 rounded-md"
        >
          {t('See open markets')}
        </Button>
      </Card>
    )
  }

  return null
}

export default function MarketStatePanel(props: MarketStatePanelProps) {
  const { market, community, summary, lifecycle, trust, side, onSideChange, outcomeLabels, onMoneyMoved } = props
  const open = lifecycle.phase === 'open' || lifecycle.phase === 'closing'
  return (
    <aside className="hidden lg:block lg:pt-5">
      <div className="grid gap-4 lg:sticky lg:top-29 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
        {open ? (
          <StakeSheet
            inline
            market={{
              id: market.id,
              title: market.title,
              imageUrl: market.image_url,
              closesAt: lifecycle.closesAt,
              juryDueAt: lifecycle.juryDueAt,
            }}
            community={{
              id: community.id,
              slug: community.slug,
              name: community.name,
              iconUrl: community.icon_url,
              jurySize: lifecycle.jury.size,
              juryRequired: lifecycle.jury.required,
            }}
            summary={summary}
            side={side}
            onSideChange={onSideChange}
            outcomeLabels={outcomeLabels}
            onMoneyMoved={onMoneyMoved}
          />
        ) : (
          <MarketStateBody
            community={community}
            lifecycle={lifecycle}
            outcomeLabels={outcomeLabels}
            onShareWin={props.onShareWin}
          />
        )}
        {trust ? <TrustBlock trust={trust} variant="compact" rulesHref={communityPath(community.slug)} /> : null}
      </div>
    </aside>
  )
}
