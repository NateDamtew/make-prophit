'use client'

import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { formatBps } from '@/components/communities/format'
import { JuryStack } from '@/components/communities/trust/JuryStack'
import { Link } from '@/i18n/navigation'

/**
 * "How we resolve" in one card: who decides, how many must agree, the
 * hold, and what the pool keeps. The same numbers every market page shows.
 */

interface PinnedRulesProps {
  slug: string
  trust: CommunityTrust | null
  jurySize: number
  className?: string
}

export default function PinnedRules({ slug, trust, jurySize, className }: PinnedRulesProps) {
  const t = useExtracted()
  const seats = trust?.jurySize ?? jurySize
  const required = trust?.juryRequired ?? Math.floor(seats / 2) + 1
  return (
    <section className={className} aria-label={t('How we resolve')}>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold">{t('How we resolve')}</h2>
          <Link
            href={`/community/${slug}?tab=about`}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t('Rules')}
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
          <dt className="text-muted-foreground">{t('Jury')}</dt>
          <dd className="flex items-center gap-2">
            {trust && trust.jurors.length > 0 ? <JuryStack people={trust.jurors} max={4} size="sm" /> : null}
            <span>{t('{required} of {seats} agree', { required: String(required), seats: String(seats) })}</span>
          </dd>
          <dt className="text-muted-foreground">{t('Payouts')}</dt>
          <dd>{t('held {hours}h for appeals', { hours: String(trust?.holdHours ?? 24) })}</dd>
          <dt className="text-muted-foreground">{t('Pool share')}</dt>
          <dd>{trust ? t('{rake} to community and jury', { rake: formatBps(trust.rakeBps) }) : '—'}</dd>
          <dt className="text-muted-foreground">{t('Record')}</dt>
          <dd>
            {trust
              ? t('{resolved} resolved · {overturned} overturned', {
                  resolved: String(trust.resolved),
                  overturned: String(trust.overturned),
                })
              : '—'}
          </dd>
        </dl>
      </div>
    </section>
  )
}
