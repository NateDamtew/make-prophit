import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { isCommunityLevel, LEVEL_NAMES } from '@/lib/communities/rules'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'
import { impliedOdds } from '@/lib/pools/math'
import { poolsForMarkets } from '@/lib/pools/notices'

/**
 * Live data for the stream overlays: the community's open markets with
 * their odds, pool and close time. Public, read-only, polled every few
 * seconds by the overlay pages; cached briefly at the edge.
 */
export interface OverlayPayload {
  community: { name: string; slug: string; iconUrl: string | null; accent: string | null; levelName: string }
  markets: Array<{
    id: string
    title: string
    yesChance: number
    poolMinor: string
    currency: string
    stakeCount: number
    closesAt: string | null
    state: string
    outcome: string | null
  }>
  generatedAt: string
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [community] = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      icon_url: communities.icon_url,
      level: communities.level,
    })
    .from(communities)
    .where(eq(communities.slug, slug.toLowerCase()))
    .limit(1)
  if (!community) {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
  }
  const [theme, markets] = await Promise.all([
    CommunityThemeRepository.get(community.id).catch(() => null),
    db
      .select({ id: community_markets.id, title: community_markets.title })
      .from(community_markets)
      .where(and(eq(community_markets.community_id, community.id), eq(community_markets.status, 'active')))
      .orderBy(desc(community_markets.created_at))
      .limit(12),
  ])
  const pools = markets.length > 0 ? await poolsForMarkets(markets.map((market) => market.id)) : []
  const byMarket = new Map(pools.map((pool) => [pool.community_market_id, pool]))
  const level = isCommunityLevel(community.level) ? community.level : 0
  const payload: OverlayPayload = {
    community: {
      name: community.name,
      slug: community.slug,
      iconUrl: community.icon_url ?? null,
      accent: theme?.accent && isSafeAccent(theme.accent) ? theme.accent : null,
      levelName: LEVEL_NAMES[level],
    },
    markets: markets.flatMap((market) => {
      const pool = byMarket.get(market.id)
      if (!pool) {
        return []
      }
      return [
        {
          id: market.id,
          title: market.title,
          yesChance: impliedOdds(pool.total_yes, pool.total_no).yes,
          poolMinor: (pool.total_yes + pool.total_no).toString(),
          currency: pool.currency,
          stakeCount: pool.stake_count,
          closesAt: pool.closes_at?.toISOString() ?? null,
          state: pool.state,
          outcome: pool.settled_outcome ?? pool.planned_outcome ?? null,
        },
      ]
    }),
    generatedAt: new Date().toISOString(),
  }
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=5, s-maxage=5', 'Access-Control-Allow-Origin': '*' },
  })
}
