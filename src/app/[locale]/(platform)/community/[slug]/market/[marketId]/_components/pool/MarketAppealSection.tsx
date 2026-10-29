'use client'

import { ScaleIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { AppealView } from '@/lib/communities/appeals-service'

import { formatCloseLabel, formatMoney, formatShortCountdown, initials } from '@/components/communities/format'
import { AppealProgress } from '@/components/communities/lifecycle/AppealProgress'
import { Button } from '@/components/ui/button'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import type { MarketLifecycle } from './market-lifecycle'
import type { AppealViewerState, PoolCommunityRecord } from './pool-market-types'

import { communityPath } from './pool-market-types'

/**
 * The appeal on the market page: who claims what, the two lines it has to
 * fill, and the one thing the viewer can do about it. After a ruling, the
 * outcome in a line with a link to the full ruling.
 */

interface MarketAppealSectionProps {
  community: PoolCommunityRecord
  marketId: string
  appeal: AppealView
  lifecycle: MarketLifecycle
  outcomeLabels: { yes: string; no: string }
  viewer: AppealViewerState | null
}

export function ClaimPill({
  claim,
  outcomeLabels,
  size = 'md',
}: {
  claim: 'yes' | 'no' | 'cancelled'
  outcomeLabels: { yes: string; no: string }
  size?: 'md' | 'lg'
}) {
  const t = useExtracted()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-bold tracking-wide uppercase',
        size === 'lg' ? 'h-8 px-3 text-sm' : 'h-6 px-2.5 text-[11px]',
        claim === 'yes' && 'bg-yes/15 text-yes',
        claim === 'no' && 'bg-no/15 text-no-text',
        claim === 'cancelled' && 'border border-border bg-background text-foreground',
      )}
    >
      {claim === 'yes' ? outcomeLabels.yes : claim === 'no' ? outcomeLabels.no : t('Void')}
    </span>
  )
}

export default function MarketAppealSection({
  community,
  marketId,
  appeal,
  lifecycle,
  outcomeLabels,
  viewer,
}: MarketAppealSectionProps) {
  const t = useExtracted()
  const locale = useLocale()
  const now = useNowTimestamp()
  const href = `${communityPath(community.slug)}/market/${marketId}/appeal`
  const live = appeal.status === 'open' || appeal.status === 'threshold_met' || appeal.status === 'under_review'
  const remaining = now === null ? null : Math.max(0, new Date(appeal.windowEndsAt).getTime() - now)
  const filer = appeal.filedBy.username ? `@${appeal.filedBy.username}` : t('A staker')

  if (!live) {
    const headline =
      appeal.ruling === 'rejected'
        ? t('Appeal rejected: the result stands')
        : appeal.ruling === 'upheld'
          ? t('Appeal upheld: the result was overturned')
          : appeal.ruling === 'voided'
            ? t('Market voided on appeal')
            : appeal.status === 'expired'
              ? t('The appeal did not get enough backing')
              : t('The appeal was withdrawn')
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={t('Appeal')}>
        <div className="flex items-center gap-2">
          <ScaleIcon className="size-4" aria-hidden="true" />
          <h2 className="text-[17px] font-bold">{headline}</h2>
        </div>
        {appeal.rulingText ? <p className="text-sm/relaxed text-muted-foreground">{appeal.rulingText}</p> : null}
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={href} />}
          className="h-11 self-start rounded-md"
        >
          {appeal.ruling ? t('Read the ruling') : t('See the appeal')}
        </Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" aria-label={t('Appeal')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScaleIcon className="size-4" aria-hidden="true" />
          <h2 className="text-[17px] font-bold">
            {appeal.status === 'open' ? t('Appeal open') : t('Prophit is reviewing this result')}
          </h2>
        </div>
        {appeal.status === 'open' && remaining !== null ? (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {t('{time} left to back it', { time: formatShortCountdown(remaining) })}
          </span>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
          {appeal.filedBy.image ? (
            <img src={appeal.filedBy.image} alt="" className="size-full object-cover" />
          ) : (
            initials(appeal.filedBy.username)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{filer}</span>
            <span className="text-muted-foreground">{t('claims the answer is')}</span>
            <ClaimPill claim={appeal.claimedOutcome} outcomeLabels={outcomeLabels} />
          </p>
          <p className="mt-1.5 text-sm/relaxed">{appeal.reason}</p>
          {appeal.evidence.length > 0 ? (
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
              {appeal.evidence.map((item, index) => (
                <a
                  key={`${item.url}-${index}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-[3px]"
                >
                  {item.label || (item.type === 'photo' ? t('Photo') : item.url.replace(/^https?:\/\//, ''))}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <AppealProgress
        backers={appeal.backerCount}
        backersNeeded={appeal.backersNeeded}
        escrowMinor={appeal.escrowTotalMinor}
        escrowTargetMinor={appeal.escrowTargetMinor}
        currency={appeal.currency}
        state={appeal.status === 'open' ? 'open' : 'met'}
      />

      <p className="text-xs/relaxed text-muted-foreground tabular-nums">
        {appeal.status === 'open'
          ? lifecycle.hold
            ? t(
                'Goes to Prophit for review when either line fills. Backers get their escrow back if the appeal wins or the market is voided, and lose it if the appeal is rejected. Payouts wait until {time}.',
                { time: formatCloseLabel(lifecycle.hold.paysAt, locale) },
              )
            : t('Goes to Prophit for review when either line fills.')
          : t('Enough stakers backed it. Every payout on this market is paused until Prophit rules.')}
      </p>

      {viewer?.canBack ? (
        <Button nativeButton={false} render={<Link href={href} />} className="h-12 rounded-md text-base font-bold">
          {t('Back this appeal')}
        </Button>
      ) : viewer && BigInt(viewer.backedMinor) > 0n ? (
        <p className="text-sm font-semibold tabular-nums">
          {t('You backed it with {amount}.', { amount: formatMoney(viewer.backedMinor, appeal.currency) })}
        </p>
      ) : (
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={href} />}
          className="h-11 self-start rounded-md"
        >
          {t('See the appeal')}
        </Button>
      )}
    </section>
  )
}
