'use client'

import { useQuery } from '@tanstack/react-query'
import { GavelIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { getJurorProfileAction } from '@/app/[locale]/(platform)/_actions/jury'
import { formatRating } from '@/components/communities/format'
import { LevelBadge } from '@/components/communities/trust/LevelBadge'
import { Link } from '@/i18n/navigation'
import { LEVEL_NAMES, isCommunityLevel } from '@/lib/communities/rules'
import { cn } from '@/lib/utils'

/**
 * A juror's public record on their profile: agreement with final results,
 * loser rating, markets resolved, votes on time, where they serve, and
 * their latest verdicts with reasons. Ratings come only from stakers who
 * lost on the market.
 */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[22px]/tight font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export default function PublicJurorRecord({ userId }: { userId: string | null }) {
  const t = useExtracted()
  const locale = useLocale()
  const query = useQuery({
    queryKey: ['juror-profile', userId],
    queryFn: async () => (userId ? (await getJurorProfileAction(userId)).data : null),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  if (!userId || query.isPending) {
    return <div className="h-48 animate-pulse rounded-xl bg-secondary/50" />
  }
  const profile = query.data
  if (!profile || (profile.summary.markets === 0 && profile.servesOn.length === 0)) {
    return (
      <p className="rounded-xl border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
        {t('Not a juror yet. Jurors are appointed by a community’s leader and decide its markets in public.')}
      </p>
    )
  }
  const { summary } = profile
  const since = profile.since
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(profile.since))
    : null

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <GavelIcon className="size-4" aria-hidden="true" />
        {since ? t('Juror since {date}', { date: since }) : t('Juror')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          value={summary.agreementPct === null ? '—' : `${summary.agreementPct}%`}
          label={t('agree with the final result')}
        />
        <Stat
          value={summary.rating === null ? '—' : formatRating(summary.rating)}
          label={
            summary.ratings > 0 ? t('from {count} ratings', { count: String(summary.ratings) }) : t('no ratings yet')
          }
        />
        <Stat value={String(summary.markets)} label={t('markets resolved')} />
        <Stat value={summary.onTimePct === null ? '—' : `${summary.onTimePct}%`} label={t('votes on time')} />
      </div>
      {(summary.overturned > 0 || summary.dissentProven > 0) && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {summary.overturned > 0
            ? t('{count} verdict overturned on appeal.', { count: String(summary.overturned) })
            : ''}{' '}
          {summary.dissentProven > 0
            ? t('{count} dissent later proven right.', { count: String(summary.dissentProven) })
            : ''}
        </p>
      )}

      {profile.servesOn.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold">{t('Serves on')}</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {profile.servesOn.map((community) => (
              <li key={community.slug} className="flex items-center gap-3 px-4 py-3">
                <Link
                  href={`/community/${community.slug}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold underline-offset-2 hover:underline"
                >
                  {community.name}
                </Link>
                {isCommunityLevel(community.level) ? (
                  <LevelBadge level={community.level} name={LEVEL_NAMES[community.level]} size="sm" />
                ) : null}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('{count} markets', { count: String(community.markets) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold">{t('Verdict history')}</h3>
          <ul className="flex flex-col gap-2">
            {profile.history.map((row) => {
              const agreed = row.outcome === row.vote
              return (
                <li
                  key={row.marketId}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-xl border bg-card p-4',
                    row.overturned ? 'border-dashed border-muted-foreground/40' : 'border-border',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/community/${row.communitySlug}/market/${row.marketId}`}
                      className="text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <span
                      className={cn(
                        'inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-bold uppercase',
                        row.vote === 'yes' && 'bg-yes/15 text-yes',
                        row.vote === 'no' && 'bg-no/15 text-no-text',
                        row.vote === 'disputed' && 'bg-secondary text-secondary-foreground',
                      )}
                    >
                      {t('Voted {vote}', { vote: row.vote === 'disputed' ? t('void') : row.vote })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {row.communityName} ·{' '}
                    {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
                      new Date(row.revealedAt),
                    )}
                    {row.outcome
                      ? ` · ${t('Result {outcome}', { outcome: row.outcome === 'cancelled' ? t('void') : row.outcome })}`
                      : ''}
                    {row.outcome && !agreed && row.outcome !== 'cancelled' ? ` · ${t('dissent')}` : ''}
                    {row.wasLate ? ` · ${t('late')}` : ''}
                    {row.overturned ? ` · ${t('overturned on appeal')}` : ''}
                  </p>
                  <p className="text-sm/relaxed text-muted-foreground">{row.reasoning}</p>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t('Ratings come only from stakers who lost on the market.')}</p>
        </section>
      )}
    </div>
  )
}
