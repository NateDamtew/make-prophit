'use client'

import { GavelIcon, LockIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { formatCloseLabel } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

import type { MarketLifecycle } from './market-lifecycle'
import type { ViewerJurySeat } from './pool-market-types'

/**
 * What a seated juror sees on the market page: that they are on this jury
 * while it is open, "Vote now" once it closes, and "sealed" after they have
 * voted. The vote itself happens on the jury page, where the rule and the
 * other seats are laid out.
 */

interface MarketJuryCallProps {
  marketId: string
  lifecycle: MarketLifecycle
  seat: ViewerJurySeat | null
}

export default function MarketJuryCall({ marketId, lifecycle, seat }: MarketJuryCallProps) {
  const t = useExtracted()
  const locale = useLocale()
  if (!seat?.seated || lifecycle.source !== 'community') {
    return null
  }
  const { phase } = lifecycle

  if (phase === 'open' || phase === 'closing') {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm">
        <GavelIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {lifecycle.closesAt !== null
            ? t('You sit on this market’s jury. Voting opens when it closes, {time}.', {
                time: formatCloseLabel(lifecycle.closesAt, locale),
              })
            : t('You sit on this market’s jury. Voting opens when it closes.')}
        </span>
      </p>
    )
  }

  if (phase !== 'awaiting' || lifecycle.jury.revealed) {
    return null
  }

  if (seat.voted) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={t('Your vote')}>
        <div className="flex items-center gap-2">
          <LockIcon className="size-4" aria-hidden="true" />
          <h2 className="text-[17px] font-bold">{t('Your vote is in and sealed')}</h2>
        </div>
        <p className="text-sm/relaxed text-muted-foreground tabular-nums">
          {t('{voted} of {seats} jurors have voted. All votes open together when the last one is in{deadline}.', {
            voted: String(lifecycle.jury.voted),
            seats: String(lifecycle.jury.size),
            deadline:
              lifecycle.juryDueAt !== null
                ? t(', or at {time}', { time: formatCloseLabel(lifecycle.juryDueAt, locale) })
                : '',
          })}
        </p>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={`/jury/${marketId}`} />}
          className="h-11 rounded-md"
        >
          {t('Change your vote')}
        </Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={t('Your verdict')}>
      <div className="flex items-center gap-2">
        <GavelIcon className="size-4" aria-hidden="true" />
        <h2 className="text-[17px] font-bold">{t('Your vote is due')}</h2>
      </div>
      <p className="text-sm/relaxed text-muted-foreground tabular-nums">
        {lifecycle.juryDueAt !== null
          ? t('Read the source and vote by {time}. A missed vote refunds the market and costs you your pay for it.', {
              time: formatCloseLabel(lifecycle.juryDueAt, locale),
            })
          : t('Read the source and vote. A missed vote refunds the market and costs you your pay for it.')}
      </p>
      <Button
        size="lg"
        nativeButton={false}
        render={<Link href={`/jury/${marketId}`} />}
        className="h-12 rounded-md text-base font-bold shadow-lg shadow-primary/20"
      >
        {t('Vote now')}
      </Button>
    </section>
  )
}
