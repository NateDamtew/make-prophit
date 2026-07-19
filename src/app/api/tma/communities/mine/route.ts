import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { MyCommunitiesRepository } from '@/lib/db/queries/my-communities'
import { community_markets, jury_votes } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'
import { requireTmaUser } from '../../_lib'

/**
 * GET /api/tma/communities/mine
 *
 * The authenticated TMA user's communities (with role) plus their outstanding
 * jury duties: active markets in communities where they are juror/admin and
 * haven't cast a vote yet. This is the discovery surface the web app covers
 * with /me/communities + each community's Jury tab.
 */
export async function GET() {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  const memberships = await MyCommunitiesRepository.listForUser(guard.user.id)

  const juryCommunities = memberships.filter(m => m.role === 'juror' || m.role === 'admin')
  const juryCommunityIds = juryCommunities.map(m => m.id)
  const communityBySlugId = new Map(juryCommunities.map(m => [m.id, m]))

  const pendingRows = juryCommunityIds.length > 0
    ? await db
        .select({
          marketId: community_markets.id,
          communityId: community_markets.community_id,
          title: community_markets.title,
          resolutionDate: community_markets.resolution_date,
        })
        .from(community_markets)
        .leftJoin(jury_votes, and(
          eq(jury_votes.community_market_id, community_markets.id),
          eq(jury_votes.juror_id, guard.user.id),
        ))
        .where(and(
          inArray(community_markets.community_id, juryCommunityIds),
          eq(community_markets.status, 'active'),
          sql`(${community_markets.review_status} IS NULL OR ${community_markets.review_status} NOT IN ('pending', 'rejected'))`,
          isNull(jury_votes.id),
        ))
    : []

  const pendingCountByCommunity = new Map<string, number>()
  for (const row of pendingRows) {
    pendingCountByCommunity.set(row.communityId, (pendingCountByCommunity.get(row.communityId) ?? 0) + 1)
  }

  return NextResponse.json({
    communities: memberships.map(m => ({
      slug: m.slug,
      name: m.name,
      description: m.description,
      icon: m.icon_url,
      type: m.type,
      role: m.role,
      memberCount: m.member_count,
      marketCount: m.market_count,
      joinedAt: m.joined_at,
      pendingJuryVotes: pendingCountByCommunity.get(m.id) ?? 0,
    })),
    pendingJuryVotes: pendingRows.map(row => ({
      marketId: row.marketId,
      title: row.title,
      resolutionDate: row.resolutionDate,
      communitySlug: communityBySlugId.get(row.communityId)?.slug ?? null,
      communityName: communityBySlugId.get(row.communityId)?.name ?? null,
    })),
  })
}
