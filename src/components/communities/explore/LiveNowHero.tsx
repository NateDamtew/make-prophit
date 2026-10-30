'use client'

import { useExtracted, useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

import type { TrustJuror } from '@/components/communities/types'
import type {
  ExploreCommunityRow,
  ExploreHeroDetail,
  ExploreMarket,
  RecordMark,
} from '@/lib/db/queries/community-explore'
import type { PoolOddsPoint } from '@/lib/pools/activity'

import {
  HOME_FEED_CARD_CLASS,
  HomeFeedOutcomeLink,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { CommunityTile } from '@/components/communities/explore/CommunityTile'
import { oddsLabels, OutcomeRows } from '@/components/communities/explore/QuestionCard'
import { recordSummary } from '@/components/communities/explore/RecordBars'
import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { getCategoryForLeaderType } from '@/lib/communities/categories'
import { cn } from '@/lib/utils'

/**
 * The featured community: who is asking, its top question with Yes / No
 * you can act on, the jurors who decide it and their record, pool and
 * close; on the right the chance in big type, how it moved this week and
 * the odds over the last 7 days. Below, dots and pills for the rest of
 * the rotation, which turns every 20 seconds unless the pointer is on it.
 */

const WEEK_MS = 7 * 86_400_000
const ROTATE_MS = 20_000

function chanceAt(history: PoolOddsPoint[], at: number): number | null {
  let value: number | null = null
  for (const point of history) {
    if (point.t <= at) {
      value = point.yes
    } else {
      break
    }
  }
  return value
}

/** The last 7 days of the series, starting from where it stood a week ago. */
function lastWeek(history: PoolOddsPoint[], now: number): PoolOddsPoint[] {
  const from = now - WEEK_MS
  const before = chanceAt(history, from)
  const within = history.filter((point) => point.t > from)
  const points = before === null ? within : [{ t: from, yes: before }, ...within]
  if (points.length === 0) {
    return []
  }
  return [...points, { t: now, yes: points[points.length - 1]!.yes }]
}

function Sparkline({ points, className }: { points: PoolOddsPoint[]; className?: string }) {
  const width = 320
  const height = 110
  if (points.length < 2) {
    return null
  }
  const start = points[0]!.t
  const span = Math.max(1, points[points.length - 1]!.t - start)
  function x(t: number) {
    return ((t - start) / span) * width
  }
  function y(yes: number) {
    return height - (Math.max(0, Math.min(100, yes)) / 100) * height
  }
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.t).toFixed(1)},${y(point.yes).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]!
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {[75, 50, 25].map((level) => (
        <line
          key={level}
          x1={0}
          x2={width}
          y1={y(level)}
          y2={y(level)}
          className="stroke-border"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      ))}
      <path d={path} fill="none" className="stroke-yes" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.yes)} r={3.5} className="fill-yes" />
    </svg>
  )
}

function JurorStack({ jurors, count }: { jurors: TrustJuror[]; count: number }) {
  const shown = jurors.slice(0, 5)
  if (shown.length === 0) {
    return null
  }
  const tones = [
    'bg-primary/70 text-primary-foreground',
    'bg-yes/70 text-background',
    'bg-secondary text-foreground',
    'bg-no/60 text-background',
    'bg-muted-foreground/60 text-background',
  ]
  return (
    <span className="flex shrink-0 -space-x-2" aria-hidden="true">
      {shown.map((juror, index) => (
        <span
          key={juror.userId}
          className={cn(
            'flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-card text-[10px] font-bold',
            tones[index % tones.length],
          )}
        >
          {juror.image ? (
            <img src={juror.image} alt="" className="size-full object-cover" />
          ) : (
            initials(juror.username ?? '?')
          )}
        </span>
      ))}
      {count > shown.length ? (
        <span className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold">
          +{count - shown.length}
        </span>
      ) : null}
    </span>
  )
}

export function LiveNowHero({
  market,
  record,
  memberCount,
  accent,
  now,
  eyebrow,
  history = [],
  jurors = [],
}: {
  market: ExploreMarket
  record: RecordMark[]
  memberCount: number
  accent?: string | null
  now: number
  eyebrow?: string
  history?: PoolOddsPoint[]
  jurors?: TrustJuror[]
}) {
  const t = useExtracted()
  const locale = useLocale()
  const yes = Math.round(market.yesChance * 100)
  const category = getCategoryForLeaderType(market.leaderType)
  const marketHref = `/community/${market.communitySlug}/market/${market.id}`
  const members = t('{count} members', { count: memberCount.toLocaleString('en-US') })
  const week = lastWeek(history, now)
  const weekAgo = week[0]?.yes ?? null
  const delta = weekAgo === null ? null : Math.round(yes - weekAgo)
  const odds = oddsLabels(market, t('Yes'), t('No'))
  function dateLabel(time: number) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(time))
  }

  return (
    <section
      className={cn(HOME_FEED_CARD_CLASS, 'gap-5 p-5 lg:grid lg:grid-cols-2 lg:gap-8 lg:p-6')}
      aria-label={eyebrow ?? t('Featured')}
    >
      <div className="flex flex-col gap-4">
        <Link href={`/community/${market.communitySlug}`} className="flex items-center gap-3">
          <CommunityTile
            name={market.communityName}
            iconUrl={market.communityIcon}
            accent={accent}
            className="size-12 rounded-xl text-sm"
          />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-bold">{market.communityName}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {eyebrow ?? (category ? `${category.countNoun.one} · ${members}` : members)}
            </span>
          </span>
        </Link>
        <h2 className="text-[20px]/snug font-bold tracking-tight sm:text-[22px]/snug">
          <Link href={marketHref} className="hover:text-primary">
            {market.title}
          </Link>
        </h2>
        <div className="flex items-center gap-4 lg:hidden">
          <p className="text-[32px]/none font-extrabold text-primary tabular-nums">{yes}%</p>
          <div className="min-w-0 flex-1">
            <Sparkline points={week} className="h-10" />
          </div>
        </div>
        {market.outcomes && market.outcomes.length > 0 ? (
          <OutcomeRows outcomes={market.outcomes} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <HomeFeedOutcomeLink
              href={`${marketHref}?stake=yes`}
              tone="yes"
              label={odds.yes}
              className="h-11 tabular-nums"
            />
            <HomeFeedOutcomeLink
              href={`${marketHref}?stake=no`}
              tone="no"
              label={odds.no}
              className="h-11 tabular-nums"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <JurorStack jurors={jurors} count={market.jurySize} />
          <p className="text-xs/relaxed text-muted-foreground">
            {t('Decided by {count} named jurors.', { count: String(market.jurySize) })} {recordSummary(record)}
          </p>
        </div>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span>{t('{amount} pool', { amount: formatMoney(market.totalMinor, market.currency) })}</span>
          {market.closesAt ? (
            <span>{t('closes {when}', { when: formatCloseLabel(market.closesAt, locale, now) })}</span>
          ) : null}
        </p>
      </div>

      <div className="hidden flex-col gap-3 lg:flex">
        <div className="flex items-baseline justify-between gap-3">
          <p>
            <span className="text-[40px]/none font-extrabold text-primary tabular-nums">{yes}%</span>
            <span className="ml-1.5 text-[15px] font-semibold">{t('chance')}</span>
          </p>
          {delta !== null && delta !== 0 ? (
            <span className={cn('text-[13px] font-semibold tabular-nums', delta > 0 ? 'text-yes' : 'text-no-text')}>
              {delta > 0 ? t('up {n} this week', { n: String(delta) }) : t('down {n} this week', { n: String(-delta) })}
            </span>
          ) : null}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-1 text-[10px] text-muted-foreground tabular-nums">
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
          </div>
          <div className="pr-8">
            <Sparkline points={week} className="h-[110px]" />
          </div>
          {week.length > 1 ? (
            <div className="mt-1 flex justify-between pr-8 text-[10px] text-muted-foreground">
              <span>{dateLabel(week[0]!.t)}</span>
              <span>{dateLabel(week[0]!.t + (now - week[0]!.t) / 2)}</span>
              <span>{t('Today')}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** The hero plus the dots and pills that move through the featured rotation. */
export function FeaturedRotation({
  featured,
  markets,
  communities,
  now,
}: {
  featured: ExploreHeroDetail[]
  markets: ExploreMarket[]
  communities: ExploreCommunityRow[]
  now: number
}) {
  const t = useExtracted()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const items = featured
    .map((detail) => {
      const market = markets.find((item) => item.id === detail.marketId)
      const community = market ? communities.find((item) => item.id === market.communityId) : undefined
      return market && community ? { detail, market, community } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  useEffect(() => {
    if (items.length < 2 || paused) {
      return
    }
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [items.length, paused])

  const activeIndex = items.length > 0 ? index % items.length : 0
  const current = items[activeIndex]
  if (!current) {
    return null
  }

  return (
    <div className="flex flex-col gap-3" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <LiveNowHero
        key={current.market.id}
        market={current.market}
        record={current.community.record}
        memberCount={current.community.memberCount}
        accent={current.community.accent}
        now={now}
        history={current.detail.oddsHistory}
        jurors={current.detail.jurors}
      />
      {items.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="flex items-center gap-1" role="tablist" aria-label={t('Featured communities')}>
            {items.map((item, itemIndex) => (
              <button
                key={item.market.id}
                type="button"
                role="tab"
                aria-selected={itemIndex === activeIndex}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  'h-3 rounded-full transition-all',
                  itemIndex === activeIndex
                    ? 'w-5 bg-foreground'
                    : 'w-1.5 bg-muted-foreground/50 hover:bg-muted-foreground',
                )}
              >
                <span className="sr-only">{item.community.name}</span>
              </button>
            ))}
          </div>
          {items.map((item, itemIndex) =>
            itemIndex === activeIndex ? null : (
              <button
                key={item.market.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className="inline-block max-w-64 truncate rounded-full border px-3 text-xs/[30px] font-semibold transition-colors hover:border-foreground/40"
              >
                {item.community.name}: {item.market.title}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
