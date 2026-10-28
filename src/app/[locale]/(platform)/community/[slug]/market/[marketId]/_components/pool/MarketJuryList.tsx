'use client'

import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { formatRating, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'

/**
 * Who sits on this community's jury: name, record, rating. Nothing to tap
 * but the names; the point is that the people deciding are visible.
 */

interface MarketJuryListProps {
  trust: CommunityTrust | null
  jurySize: number
  juryRequired: number
}

export default function MarketJuryList({ trust, jurySize, juryRequired }: MarketJuryListProps) {
  const t = useExtracted()
  const jurors = trust?.jurors ?? []
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{t('The jury')}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('{required} of {size} must agree', { required: String(juryRequired), size: String(jurySize) })}
        </span>
      </div>
      {jurors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('Jurors are appointed by the community leader.')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {jurors.map((juror) => (
            <li key={juror.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
                {juror.image ? (
                  <img src={juror.image} alt="" className="size-full object-cover" />
                ) : (
                  initials(juror.username)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {juror.username ? (
                    <Link href={`/profile/${juror.username}`} className="underline-offset-2 hover:underline">
                      @{juror.username}
                    </Link>
                  ) : (
                    t('Juror')
                  )}
                  {juror.isOwner ? (
                    <span className="ml-2 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {t('Leader')}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t('{count} markets', { count: String(juror.markets) })} · {formatRating(juror.rating)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
