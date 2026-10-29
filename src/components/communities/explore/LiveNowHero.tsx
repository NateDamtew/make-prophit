'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { ExploreMarket, RecordMark } from '@/lib/db/queries/community-explore'

import { recordSummary } from '@/components/communities/explore/RecordBars'
import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { getCategoryForLeaderType } from '@/lib/communities/categories'

/**
 * The biggest open question right now, with the odds you can act on, who
 * decides it and its record, and two more live ones underneath.
 */
export function LiveNowHero({
  market,
  record,
  memberCount,
  more,
  now,
  eyebrow,
}: {
  market: ExploreMarket
  record: RecordMark[]
  memberCount: number
  more: ExploreMarket[]
  now: number
  eyebrow?: string
}) {
  const t = useExtracted()
  const locale = useLocale()
  const yes = Math.round(market.yesChance * 100)
  const category = getCategoryForLeaderType(market.leaderType)
  const marketHref = `/community/${market.communitySlug}/market/${market.id}`

  return (
    <section
      className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-lg ring-1 shadow-primary/10 ring-primary/20 lg:grid-cols-[minmax(0,1fr)_200px] lg:p-6"
      aria-label={eyebrow ?? t('Live now')}
    >
      <div className="flex flex-col gap-4">
        <Link href={`/community/${market.communitySlug}`} className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-sm font-bold text-muted-foreground">
            {market.communityIcon ? (
              <img src={market.communityIcon} alt="" className="size-full object-cover" />
            ) : (
              initials(market.communityName)
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">{market.communityName}</span>
            <span className="block text-xs text-muted-foreground capitalize">
              {eyebrow ??
                `${category?.countNoun.one ?? t('Community')} · ${t('{count} members', { count: memberCount.toLocaleString('en-US') })}`}
            </span>
          </span>
        </Link>
        <h2 className="text-[22px]/tight font-bold sm:text-[26px]/tight">
          <Link href={marketHref} className="hover:underline">
            {market.title}
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Link
            href={`${marketHref}?stake=yes`}
            className="flex h-12 items-center justify-between rounded-[10px] bg-yes px-4 text-base font-bold text-background"
          >
            <span>{t('Yes')}</span>
            <span className="tabular-nums">{yes}%</span>
          </Link>
          <Link
            href={`${marketHref}?stake=no`}
            className="flex h-12 items-center justify-between rounded-[10px] bg-no px-4 text-base font-bold text-background"
          >
            <span>{t('No')}</span>
            <span className="tabular-nums">{100 - yes}%</span>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Decided by {count} named jurors.', { count: String(market.jurySize) })} {recordSummary(record)}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span>{t('{amount} pool', { amount: formatMoney(market.totalMinor, market.currency) })}</span>
          <span>{t('{count} people in', { count: String(market.stakeCount) })}</span>
          {market.closesAt ? (
            <span>{t('closes {when}', { when: formatCloseLabel(market.closesAt, locale, now) })}</span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-col justify-between gap-4 border-border lg:border-l lg:pl-5">
        <div>
          <p className="text-[44px]/none font-bold text-primary tabular-nums">{yes}%</p>
          <p className="text-xs text-muted-foreground">{t('chance of Yes')}</p>
        </div>
        {more.length > 0 ? (
          <ul className="grid gap-2 text-sm">
            {more.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/community/${item.communitySlug}/market/${item.id}`}
                  className="line-clamp-2 font-semibold hover:underline"
                >
                  {item.communityName}: {item.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
