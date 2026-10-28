import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { CommunityLevel, LeaderType } from '@/lib/communities/rules'

import { isCommunityLevel, isLeaderType, LEVEL_NAMES } from '@/lib/communities/rules'
import { users } from '@/lib/db/schema/auth/tables'
import { communities, community_markets, community_members } from '@/lib/db/schema/communities/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'

/**
 * Read models for the community home, the explore page and "My stakes".
 * Money is returned as strings of minor units (bigint does not cross the
 * RSC boundary).
 */

export type HomeStakeState = 'open' | 'waiting' | 'won' | 'lost' | 'paid' | 'refunded'

export interface HomeStake {
  marketId: string
  title: string
  side: 'yes' | 'no'
  amountMinor: string
  payoutMinor: string | null
  currency: string
  state: HomeStakeState
  closesAt: string | null
  holdUntil: string | null
  outcome: string | null
  stakedAt: string
}

export interface HomeStaker {
  userId: string
  username: string | null
  image: string | null
  totalMinor: string
  stakeCount: number
}

export interface CommunityHome {
  currency: string | null
  yourStakes: HomeStake[]
  topStakers: HomeStaker[]
  openMarkets: number
  volume30dMinor: string
}

function stakeState(row: {
  pool_state: string
  payout: bigint | null
  settled_outcome: string | null
  market_status: string
}): HomeStakeState {
  if (row.pool_state === 'cancelled' || row.settled_outcome === 'cancelled' || row.market_status === 'cancelled') {
    return 'refunded'
  }
  if (row.pool_state === 'settled') {
    return row.payout !== null && row.payout > 0n ? 'paid' : 'lost'
  }
  if (row.pool_state === 'held') {
    return row.payout !== null && row.payout > 0n ? 'won' : 'lost'
  }
  if (row.pool_state === 'closed' || row.market_status !== 'active') {
    return 'waiting'
  }
  return 'open'
}

async function stakesFor(where: ReturnType<typeof and>, limit: number) {
  const rows = await db
    .select({
      stake_id: pool_stakes.id,
      market_id: community_markets.id,
      title: community_markets.title,
      outcome: pool_stakes.outcome,
      amount: pool_stakes.amount,
      payout: pool_stakes.payout,
      currency: pool_stakes.currency,
      pool_state: pools.state,
      settled_outcome: pools.settled_outcome,
      closes_at: pools.closes_at,
      hold_until: pools.hold_until,
      market_status: community_markets.status,
      created_at: pool_stakes.created_at,
      community_slug: communities.slug,
      community_name: communities.name,
      community_icon: communities.icon_url,
    })
    .from(pool_stakes)
    .innerJoin(pools, eq(pool_stakes.pool_id, pools.id))
    .innerJoin(community_markets, eq(pools.community_market_id, community_markets.id))
    .innerJoin(communities, eq(community_markets.community_id, communities.id))
    .where(where)
    .orderBy(desc(pool_stakes.created_at))
    .limit(limit)
  return rows
}

type StakeRow = Awaited<ReturnType<typeof stakesFor>>[number]

function toHomeStake(row: StakeRow): HomeStake {
  return {
    marketId: row.market_id,
    title: row.title,
    side: row.outcome,
    amountMinor: row.amount.toString(),
    payoutMinor: row.payout === null ? null : row.payout.toString(),
    currency: row.currency,
    state: stakeState(row),
    closesAt: row.closes_at?.toISOString() ?? null,
    holdUntil: row.hold_until?.toISOString() ?? null,
    outcome: row.settled_outcome,
    stakedAt: row.created_at.toISOString(),
  }
}

/** Everything the community home needs beyond the market list. */
export async function getCommunityHome(communityId: string, userId: string | null): Promise<CommunityHome> {
  const [yourRows, stakerRows, [counts]] = await Promise.all([
    userId
      ? stakesFor(and(eq(community_markets.community_id, communityId), eq(pool_stakes.user_id, userId)), 12)
      : Promise.resolve([] as StakeRow[]),
    db
      .select({
        user_id: pool_stakes.user_id,
        username: users.username,
        image: users.image,
        total: sql<string>`sum(${pool_stakes.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(pool_stakes)
      .innerJoin(pools, eq(pool_stakes.pool_id, pools.id))
      .innerJoin(community_markets, eq(pools.community_market_id, community_markets.id))
      .innerJoin(users, eq(pool_stakes.user_id, users.id))
      .where(eq(community_markets.community_id, communityId))
      .groupBy(pool_stakes.user_id, users.username, users.image)
      .orderBy(desc(sql`sum(${pool_stakes.amount})`))
      .limit(5),
    db
      .select({
        currency: sql<string | null>`max(${pools.currency})`,
        open: sql<number>`count(*) filter (where ${pools.state} = 'open')::int`,
        volume: sql<string>`coalesce(sum(${pools.total_yes} + ${pools.total_no}) filter (where ${pools.created_at} > now() - interval '30 days'), 0)`,
      })
      .from(pools)
      .innerJoin(community_markets, eq(pools.community_market_id, community_markets.id))
      .where(eq(community_markets.community_id, communityId)),
  ])

  return {
    currency: counts?.currency ?? null,
    yourStakes: yourRows.map(toHomeStake),
    topStakers: stakerRows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      image: row.image,
      totalMinor: String(row.total ?? '0'),
      stakeCount: row.count,
    })),
    openMarkets: counts?.open ?? 0,
    volume30dMinor: String(counts?.volume ?? '0'),
  }
}

export interface MyStake extends HomeStake {
  community: { slug: string; name: string; iconUrl: string | null }
}

/** Every pool stake the viewer has, newest first, across communities. */
export async function listMyPoolStakes(userId: string): Promise<MyStake[]> {
  const rows = await stakesFor(eq(pool_stakes.user_id, userId), 200)
  return rows.map((row) => ({
    ...toHomeStake(row),
    community: { slug: row.community_slug, name: row.community_name, iconUrl: row.community_icon },
  }))
}

export interface ExploreCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  type: string
  level: CommunityLevel
  levelName: string
  trustScore: number | null
  isVerified: boolean
  leaderType: LeaderType | null
  memberCount: number
  maxMembers: number
  joinsPaused: boolean
  openMarkets: number
  volume30dMinor: string
  currency: string | null
  rating: number | null
  reviewCount: number
  jurySize: number
  createdAt: string
  joined: boolean
}

/** Public, active communities with the trust fields the explore cards show. */
export async function listCommunitiesForExplore(
  options: { limit?: number; userId?: string | null } = {},
): Promise<ExploreCommunity[]> {
  const limit = options.limit ?? 60
  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      icon_url: communities.icon_url,
      banner_url: communities.banner_url,
      type: communities.type,
      level: communities.level,
      trust_score: communities.trust_score,
      is_verified: sql<boolean>`coalesce(${communities}.is_verified, false)`,
      leader_type: communities.leader_type,
      member_count: communities.member_count,
      max_members: communities.max_members,
      joins_paused: communities.joins_paused,
      average_rating: communities.average_rating,
      review_count: communities.review_count,
      jury_size: communities.jury_size,
      created_at: communities.created_at,
      open_markets: sql<number>`(
        select count(*)::int from ${pools} p
        join ${community_markets} m on m.id = p.community_market_id
        where m.community_id = ${communities}.id and p.state = 'open'
      )`,
      volume_30d: sql<string>`(
        select coalesce(sum(p.total_yes + p.total_no), 0)::text from ${pools} p
        join ${community_markets} m on m.id = p.community_market_id
        where m.community_id = ${communities}.id and p.created_at > now() - interval '30 days'
      )`,
      currency: sql<string | null>`(
        select max(p.currency) from ${pools} p
        join ${community_markets} m on m.id = p.community_market_id
        where m.community_id = ${communities}.id
      )`,
    })
    .from(communities)
    .where(and(inArray(communities.status, ['active', 'paused', 'dormant']), eq(communities.type, 'public')))
    .orderBy(desc(communities.member_count), desc(communities.created_at))
    .limit(limit)

  const joined = new Set<string>()
  if (options.userId && rows.length > 0) {
    const memberships = await db
      .select({ community_id: community_members.community_id })
      .from(community_members)
      .where(
        and(
          eq(community_members.user_id, options.userId),
          inArray(
            community_members.community_id,
            rows.map((row) => row.id),
          ),
        ),
      )
    for (const membership of memberships) {
      joined.add(membership.community_id)
    }
  }

  return rows.map((row) => {
    const level: CommunityLevel = isCommunityLevel(row.level) ? row.level : 0
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      bannerUrl: row.banner_url,
      type: row.type,
      level,
      levelName: LEVEL_NAMES[level],
      trustScore: row.trust_score === null ? null : Number(row.trust_score),
      isVerified: Boolean(row.is_verified),
      leaderType: isLeaderType(row.leader_type) ? row.leader_type : null,
      memberCount: row.member_count,
      maxMembers: row.max_members,
      joinsPaused: row.joins_paused,
      openMarkets: row.open_markets ?? 0,
      volume30dMinor: String(row.volume_30d ?? '0'),
      currency: row.currency ?? null,
      rating: row.review_count > 0 && row.average_rating !== null ? Number(row.average_rating) : null,
      reviewCount: row.review_count,
      jurySize: row.jury_size,
      createdAt: row.created_at.toISOString(),
      joined: joined.has(row.id),
    }
  })
}
