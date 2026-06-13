/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { recordCommunityEvent } from '@/lib/communities/events'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityEmbedRepository } from '@/lib/db/queries/community-monetization'
import './embed.css'

/**
 * Public embed page for a community market.
 *
 * Lives outside `[locale]` on purpose — no platform shell, no nav, no auth
 * state, no localization. The embed is a self-contained, CSP-friendly card
 * a publisher can drop into any article with a single `<iframe>` snippet.
 *
 * Hard rules
 * ----------
 *   - Only `status === 'active'` markets are embeddable. Pending/rejected
 *     markets 404 so a leaked URL never exposes pre-publication content.
 *   - We record an `embed.view` event into the community's activity log,
 *     with the referrer as the payload — that's what powers the "where am I
 *     getting embedded" insights view in Workstream C.
 *   - Cache headers let busy embeds short-circuit the DB.
 */
export function generateStaticParams() {
  return [{ slug: '__placeholder__', marketId: '__placeholder__' }]
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string, marketId: string }> }): Promise<Metadata> {
  const { marketId } = await params
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
  params: Promise<{ slug: string, marketId: string }>
  searchParams: Promise<{ referrer?: string }>
}

export default async function CommunityMarketEmbed({ params, searchParams }: EmbedParams) {
  const { slug, marketId } = await params
  if (slug === '__placeholder__' || marketId === '__placeholder__') {
    notFound()
  }
  const { referrer } = await searchParams

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

  const config = await CommunityEmbedRepository.get(community.id).catch(() => null)
  const mode = config?.theme?.mode ?? 'auto'
  const accent = config?.theme?.accent

  const resolvedAt = market.resolution_date ? new Date(market.resolution_date) : null
  const resolutionLabel = resolvedAt
    ? resolvedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <main
      data-embed-mode={mode}
      style={accent ? ({ ['--embed-accent' as string]: accent }) : undefined}
      className="embed-card"
    >
      <header className="embed-card__header">
        <a
          href={`https://makeprophit.com/community/${community.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-card__community"
        >
          {community.icon_url
            ? <img src={community.icon_url} alt="" />
            : <span aria-hidden>🏛️</span>}
          <span>{community.name}</span>
        </a>
        <span className="embed-card__live-pill">
          <span className="embed-card__pulse" />
          Live
        </span>
      </header>

      <h1 className="embed-card__title">{market.title}</h1>

      <div className="embed-card__outcomes">
        <div className="embed-card__outcome embed-card__outcome--yes">
          <span>Yes</span>
          <small>Awaiting trading</small>
        </div>
        <div className="embed-card__outcome embed-card__outcome--no">
          <span>No</span>
          <small>Awaiting trading</small>
        </div>
      </div>

      {resolutionLabel && (
        <p className="embed-card__resolves">Resolves {resolutionLabel}</p>
      )}

      <footer className="embed-card__footer">
        <a
          href={`https://makeprophit.com/community/${community.slug}/market/${market.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Prophit →
        </a>
      </footer>
    </main>
  )
}
