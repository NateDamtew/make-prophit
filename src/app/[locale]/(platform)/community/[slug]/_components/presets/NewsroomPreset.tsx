'use client'

import type { PresetMarket, PresetProps } from './types'
import { CalendarIcon, GavelIcon, GlobeIcon, NewspaperIcon, StarIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import CommunityMarketCard from '../CommunityMarketCard'

/**
 * Newsroom preset — the editorial / news-brand layout.
 *
 * Layout (top to bottom):
 *   1. Featured market HERO (pinned by the admin via theme editor; falls back
 *      to the most-recent active market with a resolution_source).
 *   2. Markets grouped BY TOPIC (main_category_slug → bucketed grid). News
 *      brands organise by section, not by status.
 *   3. Editorial integrity strip — resolution-source recap, dispute count.
 *   4. About + rules (collapsed).
 *
 * Reviews tab is intentionally hidden by default (publishers don't want
 * star-ratings on their journalism). Admins can re-enable it via theme
 * editor's hidden_sections in a later phase.
 */
export default function NewsroomPreset({ community, markets, memberRole, theme }: PresetProps) {
  const isAdmin = memberRole === 'admin'
  const isJuror = memberRole === 'juror' || memberRole === 'admin'

  const activeMarkets = useMemo(
    () => markets.filter(m => m.status === 'active'),
    [markets],
  )

  const featuredMarket = useMemo(() => {
    if (theme.featured_market_id) {
      const pinned = activeMarkets.find(m => m.id === theme.featured_market_id)
      if (pinned) {
        return pinned
      }
    }
    // Fallback: latest active market that has a resolution source — that's
    // what "good market" looks like in editorial context.
    const withSource = activeMarkets.filter(m => m.resolution_source && m.resolution_source.trim().length > 0)
    return withSource[0] ?? activeMarkets[0] ?? null
  }, [activeMarkets, theme.featured_market_id])

  const marketsByTopic = useMemo(() => {
    const grouped = new Map<string, PresetMarket[]>()
    for (const market of activeMarkets) {
      if (featuredMarket && market.id === featuredMarket.id) {
        continue
      }
      const topic = (market.main_category_slug ?? 'general').trim() || 'general'
      const list = grouped.get(topic) ?? []
      list.push(market)
      grouped.set(topic, list)
    }
    return [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [activeMarkets, featuredMarket])

  const resolvedMarkets = useMemo(
    () => markets.filter(m => m.status === 'resolved' || m.status === 'disputed'),
    [markets],
  )

  const sourceCount = new Set(
    activeMarkets
      .map(m => m.resolution_source?.trim())
      .filter((s): s is string => Boolean(s && s.length > 0)),
  ).size

  return (
    <div className="grid gap-8">
      {/* HERO — featured market */}
      {featuredMarket
        ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <NewspaperIcon className="size-3.5" />
                Featured market
              </div>
              <NewsroomHeroCard market={featuredMarket} communitySlug={community.slug} isJuror={isJuror} jurySize={community.jury_size} />
            </section>
          )
        : (
            <section className="rounded-sm border border-dashed border-border/70 px-6 py-10 text-center">
              <NewspaperIcon className="mx-auto size-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium">No markets yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAdmin
                  ? 'Publish your first market to populate the newsroom.'
                  : 'The newsroom is preparing its first markets.'}
              </p>
              {isAdmin && (
                <Link
                  href={`/community/${community.slug}/markets/new` as any}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Create a market →
                </Link>
              )}
            </section>
          )}

      {/* MARKETS BY TOPIC */}
      {marketsByTopic.length > 0 && (
        <section>
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By topic</h2>
            <span className="text-xs text-muted-foreground">{activeMarkets.length} active</span>
          </header>
          <div className="grid gap-6">
            {marketsByTopic.map(([topic, list]) => (
              <div key={topic}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  {topic.replace(/-/g, ' ')}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {list.map(market => (
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
              </div>
            ))}
          </div>
        </section>
      )}

      {/* EDITORIAL INTEGRITY STRIP */}
      <section className="grid gap-4 rounded-sm border bg-card p-5 sm:grid-cols-3">
        <IntegrityStat icon={GlobeIcon} label="Cited sources" value={String(sourceCount)} hint="distinct resolution sources" />
        <IntegrityStat icon={GavelIcon} label="Jury size" value={String(community.jury_size)} hint={community.jury_size === 1 ? 'juror' : 'jurors'} />
        <IntegrityStat icon={CalendarIcon} label="Resolved" value={String(resolvedMarkets.length)} hint="cumulative markets" />
      </section>

      {/* ABOUT */}
      {(community.description || community.rules) && (
        <section className="rounded-sm border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">About this newsroom</h2>
          {community.description && (
            <p className="mt-2 text-sm text-foreground/90">{community.description}</p>
          )}
          {community.rules && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Editorial rules
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{community.rules}</p>
            </details>
          )}
        </section>
      )}
    </div>
  )
}

function NewsroomHeroCard({ market, communitySlug, isJuror, jurySize }: { market: PresetMarket, communitySlug: string, isJuror: boolean, jurySize: number }) {
  const resolutionLabel = market.resolution_date
    ? new Date(market.resolution_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <Link href={`/community/${communitySlug}/market/${market.id}` as any} className="block">
      <article className="grid gap-4 rounded-sm border bg-card p-6 transition-colors hover:border-primary/40 sm:grid-cols-[1fr_280px]">
        <div className="grid gap-3">
          <h2 className="text-2xl/tight font-semibold sm:text-3xl/tight" style={{ fontFamily: 'var(--community-font-headline, inherit)' }}>
            {market.title}
          </h2>
          {market.description && (
            <p className="line-clamp-3 text-sm text-foreground/80">{market.description}</p>
          )}
          {market.resolution_source && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Resolution source: </span>
              {market.resolution_source}
            </p>
          )}
          {resolutionLabel && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Resolves: </span>
              {resolutionLabel}
            </p>
          )}
        </div>
        <div className="grid gap-2 self-start rounded-sm border bg-background p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</p>
          <div className="grid grid-cols-2 gap-2">
            <OutcomeStat label="Yes" value={market.votes?.yes ?? 0} accent="yes" />
            <OutcomeStat label="No" value={market.votes?.no ?? 0} accent="no" />
          </div>
          <p className="text-2xs text-muted-foreground">
            {jurySize}
            -juror panel · {isJuror ? 'You can vote' : 'Public discussion'}
          </p>
        </div>
      </article>
    </Link>
  )
}

function OutcomeStat({ label, value, accent }: { label: string, value: number, accent: 'yes' | 'no' }) {
  return (
    <div
      className={`rounded-sm border px-3 py-2 text-center ${accent === 'yes' ? 'border-(--yes)/30 bg-(--yes)/10' : 'border-(--no)/30 bg-(--no)/10'}`}
    >
      <p className={`text-xs font-medium ${accent === 'yes' ? 'text-(--yes)' : 'text-(--no)'}`}>{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function IntegrityStat({ icon: Icon, label, value, hint }: { icon: typeof StarIcon, label: string, value: string, hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-2xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
