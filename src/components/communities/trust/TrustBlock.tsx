'use client'

import { ShieldCheckIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { formatBps, formatMoney, formatRating, initials } from '@/components/communities/format'
import { JuryStack } from '@/components/communities/trust/JuryStack'
import { LevelBadge, LevelBars } from '@/components/communities/trust/LevelBadge'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The trust block: why a stranger should put money here. One component,
 * three sizes. `full` is the card on community and market pages, `compact`
 * sits in the desktop sidebar, `mini` is a one-line strip for headers,
 * cards and embeds (it drops "held 24h", then the rating, then the score;
 * the level and juror count never drop).
 */

interface TrustBlockProps {
  trust: CommunityTrust
  variant?: 'full' | 'compact' | 'mini'
  /** Where "How this community resolves" points. */
  rulesHref?: string
  className?: string
}

function Score({ score, size }: { score: number | null; size: 'lg' | 'md' }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn('font-bold tabular-nums', size === 'lg' ? 'text-[28px]/none' : 'text-2xl/none')}>
        {score === null ? '—' : score}
      </span>
      <span className="text-xs text-muted-foreground">{score === null ? 'no score yet' : '/ 100 trust score'}</span>
    </span>
  )
}

export function TrustBlock({ trust, variant = 'full', rulesHref, className }: TrustBlockProps) {
  const t = useExtracted()
  const jurorCount = trust.jurors.length
  const ratedJurors = trust.jurors.filter((juror) => juror.rating !== null)
  const avgRating =
    ratedJurors.length > 0
      ? ratedJurors.reduce((sum, juror) => sum + (juror.rating ?? 0), 0) / ratedJurors.length
      : null
  const record = t('{resolved} resolved · {overturned} overturned · {onTime} on time', {
    resolved: String(trust.resolved),
    overturned: String(trust.overturned),
    onTime: trust.onTimePct === null ? '—' : `${Math.round(trust.onTimePct)}%`,
  })
  const heldLine = t('Payouts held {hours}h', { hours: String(trust.holdHours) })

  if (variant === 'mini') {
    return (
      <span
        className={cn(
          'inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border bg-card px-2.5 text-xs whitespace-nowrap text-foreground tabular-nums',
          className,
        )}
      >
        <LevelBars level={trust.level} />
        <span className="font-semibold">{trust.levelName}</span>
        {trust.trustScore !== null && (
          <span className="hidden text-muted-foreground md:inline">· {trust.trustScore}</span>
        )}
        <span className="text-muted-foreground">
          · {t('{count} jurors', { count: String(trust.jurySize) })}
          {avgRating !== null ? <span className="hidden sm:inline"> {formatRating(avgRating)}</span> : null}
        </span>
        <span className="hidden text-muted-foreground lg:inline">
          · {t('held {hours}h', { hours: String(trust.holdHours) })}
        </span>
      </span>
    )
  }

  if (variant === 'compact') {
    return (
      <section
        className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-5', className)}
        aria-label={t('Trust')}
      >
        <div className="flex items-center justify-between gap-3">
          <Score score={trust.trustScore} size="md" />
          <LevelBadge level={trust.level} name={trust.levelName} size="sm" />
        </div>
        <div className="flex items-center gap-3">
          <JuryStack people={trust.jurors} size="sm" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {t('{count} jurors', { count: String(jurorCount) })}
              {avgRating !== null ? (
                <span className="font-normal text-muted-foreground"> · avg {formatRating(avgRating)}</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('{required} must agree', { required: String(trust.juryRequired) })}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">{record}</p>
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium">
          <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
          {t('Payouts held {hours}h for appeals', { hours: String(trust.holdHours) })}
        </div>
      </section>
    )
  }

  const isNew = trust.level === 0 && trust.resolved === 0

  return (
    <section
      className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-4', className)}
      aria-label={t('Trust')}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{t('Trust')}</h3>
        <LevelBadge level={trust.level} name={trust.levelName} size="sm" />
      </div>

      <Score score={trust.trustScore} size="lg" />
      {trust.trustScore !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <span className="block h-full rounded-full bg-foreground" style={{ width: `${trust.trustScore}%` }} />
        </div>
      )}

      {isNew ? (
        <p className="text-sm/relaxed text-muted-foreground">
          {t(
            'New community. Prophit checks every market before it opens. Up to {members} members and {pool} per market while it builds a record.',
            {
              members: trust.caps.maxMembers.toLocaleString('en-US'),
              pool: formatMoney(trust.caps.maxPoolPerMarketMinor, trust.currency),
            },
          )}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
          <div className="rounded-md bg-secondary px-2 py-2">
            <div className="text-lg font-bold">{trust.resolved}</div>
            <div className="text-[11px] text-muted-foreground">{t('resolved')}</div>
          </div>
          <div className="rounded-md bg-secondary px-2 py-2">
            <div className="text-lg font-bold">{trust.overturned}</div>
            <div className="text-[11px] text-muted-foreground">{t('overturned')}</div>
          </div>
          <div className="rounded-md bg-secondary px-2 py-2">
            <div className="text-lg font-bold">
              {trust.onTimePct === null ? '—' : `${Math.round(trust.onTimePct)}%`}
            </div>
            <div className="text-[11px] text-muted-foreground">{t('on time')}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          {t('Jury: {seats} seated, {required} must agree', {
            seats: String(jurorCount),
            required: String(trust.juryRequired),
          })}
        </p>
        {trust.jurors.length === 0 ? (
          <p className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
            {t('No jurors seated yet.')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {trust.jurors.map((juror) => (
              <li key={juror.userId} className="flex items-center gap-3 py-2">
                <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
                  {juror.image ? (
                    <img src={juror.image} alt="" className="size-full object-cover" />
                  ) : (
                    initials(juror.username)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold">
                    {juror.username ? (
                      <Link href={`/profile/@${juror.username}`} className="truncate hover:underline">
                        @{juror.username}
                      </Link>
                    ) : (
                      <span>{t('Juror')}</span>
                    )}
                    {juror.isOwner && (
                      <span className="rounded-[6px] border border-border px-1.5 text-[11px] font-medium text-muted-foreground">
                        {t('Owner')}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('{count} markets', { count: String(juror.markets) })}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums">{formatRating(juror.rating)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs/relaxed text-muted-foreground">
        <p>
          <strong className="font-semibold text-foreground">{heldLine}</strong>{' '}
          {t('after each result, so any staker can appeal.')}
        </p>
        <p>
          {t('{rake} of each pool goes to the community and its jury. Prophit holds the money.', {
            rake: formatBps(trust.rakeBps),
          })}
        </p>
        {rulesHref && (
          <Link href={rulesHref} className="font-semibold text-foreground underline underline-offset-[3px]">
            {t('How this community resolves')}
          </Link>
        )}
      </div>
    </section>
  )
}
