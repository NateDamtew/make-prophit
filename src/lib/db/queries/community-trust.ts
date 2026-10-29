import { and, eq, sql } from 'drizzle-orm'

import type { CommunityTrust } from '@/components/communities/types'
import type { CommunityLevel, CommunityStatus } from '@/lib/communities/rules'

import { getJurorRatings } from '@/lib/communities/jury-service'
import { getEffectiveCaps, isCommunityLevel, isLeaderType, majorityOf } from '@/lib/communities/rules'
import { getCommunitySettings } from '@/lib/communities/settings'
import { communities, community_markets, community_members, jury_votes } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

/**
 * Everything the trust block shows about a community. One read, shared by
 * the community page, market pages, cards and embeds. Returns the client-safe
 * shape (money as strings) so pages can pass it straight to components.
 *
 * Juror ratings come from the losers' ratings cached in `juror_stats`; the
 * on-time share counts markets the jury decided before the deadline against
 * the ones it let lapse.
 */

export async function getTrustCard(communityId: string): Promise<CommunityTrust | null> {
  const [community] = await db
    .select({
      id: communities.id,
      level: communities.level,
      trust_score: communities.trust_score,
      status: communities.status,
      joins_paused: communities.joins_paused,
      leader_type: communities.leader_type,
      member_count: communities.member_count,
      jury_size: communities.jury_size,
      currency: communities.currency,
      caps_override: communities.caps_override,
      review_mode_override: communities.review_mode_override,
      is_verified: sql<boolean>`COALESCE(${communities}.is_verified, false)`,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)

  if (!community) {
    return null
  }

  const settings = await getCommunitySettings(community.currency ?? 'KES')
  const level: CommunityLevel = isCommunityLevel(community.level) ? community.level : 0
  const override = community.caps_override
    ? {
        maxMembers: community.caps_override.maxMembers,
        maxPoolPerMarketMinor: community.caps_override.maxPoolPerMarketMinor
          ? BigInt(community.caps_override.maxPoolPerMarketMinor)
          : undefined,
        maxPerPersonMinor: community.caps_override.maxPerPersonMinor
          ? BigInt(community.caps_override.maxPerPersonMinor)
          : undefined,
      }
    : null
  const reviewOverride =
    community.review_mode_override === 'every' ||
    community.review_mode_override === 'spot' ||
    community.review_mode_override === 'none'
      ? community.review_mode_override
      : null
  const caps = getEffectiveCaps(settings.levels[level], override, reviewOverride)

  const [jurorRows, [resolvedRow], [lateRow]] = await Promise.all([
    db
      .select({
        user_id: community_members.user_id,
        role: community_members.role,
        username: sql<string | null>`(SELECT username FROM users WHERE users.id = ${community_members.user_id})`,
        image: sql<string | null>`(SELECT image FROM users WHERE users.id = ${community_members.user_id})`,
        markets: sql<number>`(
          SELECT COUNT(*)::int FROM ${jury_votes}
          INNER JOIN ${community_markets} ON ${community_markets.id} = ${jury_votes.community_market_id}
          WHERE ${jury_votes.juror_id} = ${community_members.user_id}
            AND ${community_markets.community_id} = ${community_members.community_id}
        )`,
      })
      .from(community_members)
      .where(
        and(
          eq(community_members.community_id, communityId),
          sql`${community_members.role} IN ('juror', 'admin', 'co_owner')`,
        ),
      )
      .orderBy(sql`CASE ${community_members.role} WHEN 'admin' THEN 0 WHEN 'co_owner' THEN 1 ELSE 2 END`),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(community_markets)
      .where(and(eq(community_markets.community_id, communityId), eq(community_markets.status, 'resolved'))),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(community_markets)
      .where(and(eq(community_markets.community_id, communityId), eq(community_markets.late_resolution, true))),
  ])
  const ratings = await getJurorRatings(jurorRows.map((row) => row.user_id))
  const resolved = resolvedRow?.count ?? 0
  const late = lateRow?.count ?? 0

  return {
    communityId: community.id,
    currency: community.currency ?? null,
    level,
    levelName: caps.name,
    trustScore: community.trust_score ?? null,
    status: community.status as CommunityStatus,
    joinsPaused: community.joins_paused,
    isVerified: Boolean(community.is_verified),
    leaderType: isLeaderType(community.leader_type) ? community.leader_type : null,
    memberCount: community.member_count,
    jurySize: community.jury_size,
    juryRequired: majorityOf(community.jury_size),
    jurors: jurorRows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      image: row.image,
      isOwner: row.role === 'admin' || row.role === 'co_owner',
      markets: row.markets,
      rating: ratings.get(row.user_id) ?? null,
    })),
    resolved,
    overturned: 0,
    onTimePct: resolved + late > 0 ? Math.round((resolved / (resolved + late)) * 100) : null,
    caps: {
      maxMembers: caps.maxMembers,
      maxPoolPerMarketMinor: caps.maxPoolPerMarketMinor.toString(),
      maxPerPersonMinor: caps.maxPerPersonMinor.toString(),
      reviewMode: caps.reviewMode,
    },
    rakeBps: caps.rakeBps,
    holdHours: 24,
  }
}
