'use client'

import type { PresetMarket, PresetProps } from './types'
import { CalendarIcon, FlameIcon, TrophyIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import CommunityMarketCard from '../CommunityMarketCard'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Sports preset — live + fixture-grouped.
 *
 * Layout:
 *   1. Live ticker — markets resolving within 24h.
 *   2. This week's fixtures — markets resolving in the next 7 days, grouped
 *      by date for that "match day" feel.
 *   3. Later this season — beyond 7 days.
 *   4. Results — recently resolved.
 *
 * Member spotlight / leaderboards land in a later phase; the slot is wired
 * so Phase 3.2 can drop in real ranking data without restructuring.
 */
export default function SportsPreset({ community, markets, memberRole }: PresetProps) {
  const isJuror = memberRole === 'juror' || memberRole === 'admin'
  const isAdmin = memberRole === 'admin'

  const buckets = useMemo(() => buildBuckets(markets), [markets])

  return (
    <div className="grid gap-8">
      {/* LIVE TICKER */}
      {buckets.live.length > 0 && (
        <section className="rounded-sm border bg-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-(--no)">
              <FlameIcon className="size-3.5" />
              Live
            </span>
            <span className="text-xs text-muted-foreground">resolving within 24h</span>
          </header>
          <ul className="grid gap-2">
            {buckets.live.map(market => (
              <li key={market.id}>
                <Link
                  href={`/community/${community.slug}/market/${market.id}` as any}
                  className="flex items-center gap-3 rounded-sm border px-3 py-2 transition-colors hover:border-primary/40"
                >
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--no) opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-(--no)" />
                  </span>
                  <span className="line-clamp-1 flex-1 text-sm font-medium">{market.title}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">{relativeWhen(market.resolution_date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* THIS WEEK */}
      {buckets.thisWeek.length > 0 && (
        <section>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">This week</h2>
            <CalendarIcon className="size-4 text-muted-foreground" />
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {buckets.thisWeek.map(market => (
              <CommunityMarketCard
                key={market.id}
                communitySlug={community.slug}
                market={market}
                yesVotes={market.votes?.yes ?? 0}
                noVotes={market.votes?.no ?? 0}
                totalJurors={community.jury_size}
                isJuror={isJuror}
              />
            ))}
          </div>
        </section>
      )}

      {/* LATER */}
      {buckets.later.length > 0 && (
        <section>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Later this season</h2>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {buckets.later.map(market => (
              <CommunityMarketCard
                key={market.id}
                communitySlug={community.slug}
                market={market}
                yesVotes={market.votes?.yes ?? 0}
                noVotes={market.votes?.no ?? 0}
                totalJurors={community.jury_size}
                isJuror={isJuror}
              />
            ))}
          </div>
        </section>
      )}

      {/* RESULTS */}
      {buckets.resolved.length > 0 && (
        <section>
          <header className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Results</h2>
            <TrophyIcon className="size-4 text-amber-500" />
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {buckets.resolved.map(market => (
              <CommunityMarketCard
                key={market.id}
                communitySlug={community.slug}
                market={market}
                yesVotes={market.votes?.yes ?? 0}
                noVotes={market.votes?.no ?? 0}
                totalJurors={community.jury_size}
              />
            ))}
          </div>
        </section>
      )}

      {/* EMPTY STATE */}
      {markets.length === 0 && (
        <section className="rounded-sm border border-dashed border-border/70 px-6 py-10 text-center">
          <TrophyIcon className="mx-auto size-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium">No fixtures yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? 'Create your first sports market to populate the ticker.' : 'Check back closer to game day.'}
          </p>
        </section>
      )}
    </div>
  )
}

function buildBuckets(markets: PresetMarket[]) {
  const now = Date.now()
  const live: PresetMarket[] = []
  const thisWeek: PresetMarket[] = []
  const later: PresetMarket[] = []
  const resolved: PresetMarket[] = []

  for (const market of markets) {
    if (market.status === 'resolved' || market.status === 'disputed') {
      resolved.push(market)
      continue
    }
    if (market.status !== 'active') {
      continue
    }
    if (!market.resolution_date) {
      later.push(market)
      continue
    }
    const ms = new Date(market.resolution_date).getTime() - now
    if (ms <= 24 * 60 * 60 * 1000) {
      live.push(market)
    }
    else if (ms <= ONE_WEEK_MS) {
      thisWeek.push(market)
    }
    else {
      later.push(market)
    }
  }

  // Stable sort by date ascending for upcoming, descending for resolved.
  const ascByDate = (a: PresetMarket, b: PresetMarket) => {
    const da = a.resolution_date ? new Date(a.resolution_date).getTime() : Infinity
    const db = b.resolution_date ? new Date(b.resolution_date).getTime() : Infinity
    return da - db
  }
  live.sort(ascByDate)
  thisWeek.sort(ascByDate)
  later.sort(ascByDate)
  resolved.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return { live, thisWeek, later, resolved }
}

function relativeWhen(date: Date | null): string {
  if (!date) {
    return ''
  }
  const ms = new Date(date).getTime() - Date.now()
  if (ms < 0) {
    return 'past'
  }
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) {
    return 'soon'
  }
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}
