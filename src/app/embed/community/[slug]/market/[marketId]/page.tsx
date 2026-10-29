/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { recordCommunityEvent } from '@/lib/communities/events'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityEmbedRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'
import { getTrustCard } from '@/lib/db/queries/community-trust'
import { formatPoolMoney } from '@/lib/pools/format'
import { getPoolSummary } from '@/lib/pools/service'

import './embed.css'

/**
 * Public embed page for a community market: the article card.
 *
 * Lives outside `[locale]` on purpose — no platform shell, no nav, no auth
 * state, no localization. The embed is a self-contained, CSP-friendly card
 * a publisher can drop into any article with a single `<iframe>` snippet.
 *
 * What it shows: the community (with its level), the question, live odds
 * with Yes / No that open the market in a new tab ready to stake, the pool
 * and close time, and who powers it. Closed markets show the result and a
 * link to the verdicts.
 *
 * Hard rules
 * ----------
 *   - Only `status === 'active'` markets are embeddable. Pending/rejected
 *     markets 404 so a leaked URL never exposes pre-publication content.
 *   - We record an `embed.view` event into the community's activity log,
 *     with the referrer as the payload — that's what powers the "where am I
 *     getting embedded" insights view.
 *   - `?theme=light|dark|auto` overrides the community's embed theme;
 *     `?ref=<username>` is carried into every link.
 */
export function generateStaticParams() {
  return [{ slug: '__placeholder__', marketId: '__placeholder__' }]
}

const SITE_ORIGIN = (process.env.SITE_URL ?? 'https://beta.makeprophit.com').replace(/\/$/, '')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; marketId: string }>
}): Promise<Metadata> {
  const { marketId } = await params
  // Skip the DB for the build-time placeholder: Bun SQL reads `Date.now()` while
  // connecting, which cacheComponents rejects during prerender.
  if (marketId === '__placeholder__') {
    return { title: 'Market' }
  }
  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data) {
    return { title: 'Market' }
  }
  return {
    title: `${data.market.title} — ${data.community.name}`,
    description: data.market.description ?? undefined,
    robots: { index: false, follow: false },
  }
}

interface EmbedParams {
  params: Promise<{ slug: string; marketId: string }>
  searchParams: Promise<{ referrer?: string; theme?: string; ref?: string }>
}

function pct(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

export default async function CommunityMarketEmbed({ params, searchParams }: EmbedParams) {
  const { slug, marketId } = await params
  if (slug === '__placeholder__' || marketId === '__placeholder__') {
    notFound()
  }
  const { referrer, theme: themeParam, ref } = await searchParams

  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data || data.community.slug !== slug || data.market.status !== 'active') {
    notFound()
  }
  const { market, community } = data

  // Fire-and-forget view event; never block the render on it.
  void recordCommunityEvent({
    communityId: community.id,
    actor: { id: 'embed', label: 'embed' },
    kind: 'embed.view',
    targetType: 'market',
    targetId: market.id,
    payload: {
      referrer: typeof referrer === 'string' ? referrer.slice(0, 256) : null,
    },
  })

  const [config, theme, trust, summary] = await Promise.all([
    CommunityEmbedRepository.get(community.id).catch(() => null),
    CommunityThemeRepository.get(community.id).catch(() => null),
    getTrustCard(community.id).catch(() => null),
    getPoolSummary(market.id, null).catch(() => null),
  ])
  const mode =
    themeParam === 'light' || themeParam === 'dark' || themeParam === 'auto'
      ? themeParam
      : (config?.theme?.mode ?? 'auto')
  const accent =
    config?.theme?.accent && isSafeAccent(config.theme.accent)
      ? config.theme.accent
      : theme?.accent && isSafeAccent(theme.accent)
        ? theme.accent
        : null

  const refQuery = typeof ref === 'string' && /^[a-z0-9_.-]{2,40}$/i.test(ref) ? `&ref=${ref}` : ''
  const marketUrl = `${SITE_ORIGIN}/community/${community.slug}/market/${market.id}`
  function stakeUrl(side: 'yes' | 'no') {
    return `${marketUrl}?stake=${side}&from=embed${refQuery}`
  }

  const pool = summary?.pool ?? null
  const open = pool ? pool.acceptingStakes : false
  const settled = pool ? pool.state === 'settled' || pool.state === 'cancelled' || pool.state === 'held' : false
  const outcome = pool?.settledOutcome ?? null
  const totalMinor = pool ? BigInt(pool.totalYes) + BigInt(pool.totalNo) : 0n
  const closesAt = pool?.closesAt
    ? new Date(pool.closesAt)
    : market.resolution_date
      ? new Date(market.resolution_date)
      : null
  const closesLabel = closesAt
    ? closesAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null
  const yes = pool ? pool.odds.yes : 0.5
  const no = pool ? pool.odds.no : 0.5

  return (
    <main
      data-embed-mode={mode}
      style={accent ? { ['--embed-accent' as string]: accent } : undefined}
      className="embed-card"
    >
      <span className="embed-card__stripe" aria-hidden="true" />
      <header className="embed-card__header">
        <a
          href={`${SITE_ORIGIN}/community/${community.slug}${refQuery ? `?${refQuery.slice(1)}` : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-card__community"
        >
          {community.icon_url ? <img src={community.icon_url} alt="" /> : <span aria-hidden>🏛️</span>}
          <span>{community.name}</span>
          {trust ? (
            <small className="embed-card__level">
              Level {trust.level} · {trust.levelName}
            </small>
          ) : null}
        </a>
        {settled ? (
          <span
            className={`embed-card__pill embed-card__pill--${outcome === 'yes' ? 'yes' : outcome === 'no' ? 'no' : 'void'}`}
          >
            {outcome === 'yes'
              ? 'Resolved Yes'
              : outcome === 'no'
                ? 'Resolved No'
                : pool?.state === 'held'
                  ? 'Result in'
                  : 'Refunded'}
          </span>
        ) : (
          <span className="embed-card__pill embed-card__pill--live">
            <span className="embed-card__pulse" />
            {open ? 'Live' : 'Closed'}
          </span>
        )}
      </header>

      <h1 className="embed-card__title">{market.title}</h1>

      <div className="embed-card__odds" role="group" aria-label="Current odds">
        <a
          href={open ? stakeUrl('yes') : marketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`embed-card__side embed-card__side--yes${outcome === 'no' ? ' embed-card__side--lost' : ''}`}
        >
          <span className="embed-card__side-name">Yes</span>
          <strong className="embed-card__side-pct">{pct(yes)}</strong>
          {open ? <small>Stake Yes</small> : null}
        </a>
        <a
          href={open ? stakeUrl('no') : marketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`embed-card__side embed-card__side--no${outcome === 'yes' ? ' embed-card__side--lost' : ''}`}
        >
          <span className="embed-card__side-name">No</span>
          <strong className="embed-card__side-pct">{pct(no)}</strong>
          {open ? <small>Stake No</small> : null}
        </a>
      </div>
      <div className="embed-card__bar" aria-hidden="true">
        <span style={{ width: pct(yes) }} />
      </div>

      <p className="embed-card__meta">
        {pool ? <span>{formatPoolMoney(totalMinor, pool.currency)} pool</span> : <span>No stakes yet</span>}
        {pool ? <span aria-hidden="true">·</span> : null}
        {pool ? (
          <span>
            {pool.stakeCount} {pool.stakeCount === 1 ? 'stake' : 'stakes'}
          </span>
        ) : null}
        {closesLabel ? <span aria-hidden="true">·</span> : null}
        {closesLabel ? (
          <span>
            {settled || !open ? 'Closed' : 'Closes'} {closesLabel}
          </span>
        ) : null}
      </p>

      <footer className="embed-card__footer">
        <a href={marketUrl} target="_blank" rel="noopener noreferrer">
          {settled ? 'Read the verdicts →' : 'See the market →'}
        </a>
        <a href={SITE_ORIGIN} target="_blank" rel="noopener noreferrer" className="embed-card__powered">
          Powered by Prophit
        </a>
      </footer>
    </main>
  )
}
