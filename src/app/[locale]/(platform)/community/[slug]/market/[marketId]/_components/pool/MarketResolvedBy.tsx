'use client'

import { GavelIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { LevelBadge } from '@/components/communities/trust/LevelBadge'
import { Link } from '@/i18n/navigation'

import type { PoolCommunityRecord } from './pool-market-types'

import { communityPath } from './pool-market-types'

/**
 * Who resolves this market and under what rules, in one card: the
 * community's jury, how many must agree, the hold, and the community's
 * level and record.
 */

interface MarketResolvedByProps {
  community: PoolCommunityRecord
  trust: CommunityTrust | null
  jurySize: number
  juryRequired: number
  holdHours: number
  imported: boolean
  source: string | null
}

export default function MarketResolvedBy({
  community,
  trust,
  jurySize,
  juryRequired,
  holdHours,
  imported,
  source,
}: MarketResolvedByProps) {
  const t = useExtracted()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold">{t('Resolved by')}</h2>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">
          {community.icon_url ? (
            <img src={community.icon_url} alt="" className="size-full object-cover" />
          ) : (
            <GavelIcon className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={communityPath(community.slug)}
              className="text-sm font-semibold underline-offset-2 hover:underline"
            >
              {community.name}
            </Link>
            {trust ? <LevelBadge level={trust.level} name={trust.levelName} size="sm" /> : null}
          </div>
          <p className="mt-1 text-sm/relaxed text-muted-foreground tabular-nums">
            {imported
              ? source
                ? t('Settles from {source}. No jury, no hold.', { source })
                : t('Settles from the source market. No jury, no hold.')
              : t(
                  '{size} jurors read the source and post a verdict with a reason. {required} must agree. Payouts wait {hours} hours so anyone can appeal.',
                  {
                    size: String(jurySize),
                    required: String(juryRequired),
                    hours: String(holdHours),
                  },
                )}
          </p>
          {trust ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {t('{resolved} resolved · {overturned} overturned', {
                resolved: String(trust.resolved),
                overturned: String(trust.overturned),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
