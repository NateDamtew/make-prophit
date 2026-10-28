'use client'

import { useExtracted } from 'next-intl'

import type { HomeStake } from '@/lib/db/queries/community-home'

import { formatMoney } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The viewer's stakes in this community, newest first: side, amount, and
 * what happens next. Links to every market.
 */

interface YourStakesProps {
  stakes: HomeStake[]
  communitySlug: string
  signedIn: boolean
  className?: string
}

function stakeStateLabel(state: HomeStake['state'], t: (key: string) => string): string {
  switch (state) {
    case 'open':
      return t('Open')
    case 'waiting':
      return t('With the jury')
    case 'won':
      return t('Won · paying soon')
    case 'paid':
      return t('Paid')
    case 'lost':
      return t('Lost')
    case 'refunded':
      return t('Refunded')
  }
}

export default function YourStakes({ stakes, communitySlug, signedIn, className }: YourStakesProps) {
  const t = useExtracted()
  if (!signedIn) {
    return null
  }
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label={t('Your stakes')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold">{t('Your stakes')}</h2>
        {stakes.length > 0 ? (
          <Link href="/me/stakes" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            {t('All')}
          </Link>
        ) : null}
      </div>
      {stakes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
          {t('Nothing yet. Pick a market and make your call.')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {stakes.slice(0, 6).map((stake) => (
            <li key={`${stake.marketId}-${stake.stakedAt}`}>
              <Link
                href={`/community/${communitySlug}/market/${stake.marketId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40"
              >
                <span
                  className={cn(
                    'inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-bold',
                    stake.side === 'yes' ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no-text',
                  )}
                >
                  {stake.side === 'yes' ? t('Yes') : t('No')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-semibold">{stake.title}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatMoney(stake.amountMinor, stake.currency)} · {stakeStateLabel(stake.state, t)}
                    {(stake.state === 'won' || stake.state === 'paid') && stake.payoutMinor
                      ? ` · ${formatMoney(stake.payoutMinor, stake.currency)}`
                      : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
