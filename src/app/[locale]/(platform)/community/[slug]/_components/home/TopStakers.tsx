'use client'

import { useExtracted } from 'next-intl'

import type { HomeStaker } from '@/lib/db/queries/community-home'

import { formatMoney, initials } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * The five people with the most staked in this community. A leaderboard
 * for sports pages, a quiet list elsewhere.
 */

interface TopStakersProps {
  stakers: HomeStaker[]
  currency: string | null
  title?: string
  className?: string
}

export default function TopStakers({ stakers, currency, title, className }: TopStakersProps) {
  const t = useExtracted()
  if (stakers.length === 0) {
    return null
  }
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label={title ?? t('Top stakers')}>
      <h2 className="text-[15px] font-bold">{title ?? t('Top stakers')}</h2>
      <ol className="divide-y divide-border rounded-xl border border-border bg-card">
        {stakers.map((staker, index) => (
          <li key={staker.userId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
            <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
              {staker.image ? (
                <img src={staker.image} alt="" className="size-full object-cover" />
              ) : (
                initials(staker.username)
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {staker.username ? `@${staker.username}` : t('Member')}
            </span>
            <span className="text-sm tabular-nums">{formatMoney(staker.totalMinor, currency)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
