'use client'

import { useExtracted, useLocale } from 'next-intl'
import { useMemo, useState } from 'react'

import type { MyStake } from '@/lib/db/queries/community-home'

import { formatCloseLabel, formatMoney } from '@/components/communities/format'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Every stake the viewer has made, in three piles: open, waiting on a
 * result or a hold, and paid out (or refunded, or lost).
 */

type Pile = 'open' | 'waiting' | 'paid'

function pileOf(stake: MyStake): Pile {
  if (stake.state === 'open') {
    return 'open'
  }
  if (stake.state === 'waiting' || stake.state === 'won') {
    return 'waiting'
  }
  return 'paid'
}

export default function MyStakesList({ stakes }: { stakes: MyStake[] }) {
  const t = useExtracted()
  const locale = useLocale()
  const [pile, setPile] = useState<Pile>('open')
  const piles = useMemo(() => {
    const result: Record<Pile, MyStake[]> = { open: [], waiting: [], paid: [] }
    for (const stake of stakes) {
      result[pileOf(stake)].push(stake)
    }
    return result
  }, [stakes])
  const labels: Record<Pile, string> = { open: t('Open'), waiting: t('Waiting'), paid: t('Paid out') }
  const list = piles[pile]

  function detail(stake: MyStake): string {
    switch (stake.state) {
      case 'open':
        return stake.closesAt ? t('Closes {time}', { time: formatCloseLabel(stake.closesAt, locale) }) : t('Open')
      case 'waiting':
        return t('With the jury')
      case 'won':
        return stake.holdUntil
          ? t('Won {amount} · pays {time}', {
              amount: formatMoney(stake.payoutMinor ?? '0', stake.currency),
              time: formatCloseLabel(stake.holdUntil, locale),
            })
          : t('Won {amount} · paying soon', { amount: formatMoney(stake.payoutMinor ?? '0', stake.currency) })
      case 'paid':
        return t('Paid {amount}', { amount: formatMoney(stake.payoutMinor ?? '0', stake.currency) })
      case 'lost':
        return t('Lost · {outcome} won', { outcome: stake.outcome === 'yes' ? t('Yes') : t('No') })
      case 'refunded':
        return t('Refunded')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px]/tight font-bold">{t('My stakes')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Every call you have made across your communities.')}</p>
      </div>
      <div role="tablist" className="flex gap-2">
        {(['open', 'waiting', 'paid'] as Pile[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={pile === key}
            onClick={() => setPile(key)}
            className={cn(
              'h-9 rounded-full px-3.5 text-sm font-semibold tabular-nums transition-colors',
              pile === key
                ? 'bg-foreground text-background'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
            )}
          >
            {labels[key]} {piles[key].length > 0 ? piles[key].length : ''}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          dashed
          title={
            pile === 'open'
              ? t('No open stakes')
              : pile === 'waiting'
                ? t('Nothing waiting')
                : t('Nothing paid out yet')
          }
          body={t('Pick a market in one of your communities and make your call.')}
          action={
            <Button variant="secondary" nativeButton={false} render={<Link href="/communities" />}>
              {t('Browse communities')}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((stake) => (
            <li key={`${stake.marketId}-${stake.stakedAt}`}>
              <Link
                href={`/community/${stake.community.slug}/market/${stake.marketId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">
                  {stake.community.iconUrl ? (
                    <img src={stake.community.iconUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-semibold">{stake.title}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {stake.community.name} · {detail(stake)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-full px-2 text-xs font-bold',
                      stake.side === 'yes' ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no-text',
                    )}
                  >
                    {stake.side === 'yes' ? t('Yes') : t('No')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(stake.amountMinor, stake.currency)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
