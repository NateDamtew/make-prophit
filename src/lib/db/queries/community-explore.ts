import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'

import type { LeaderType } from '@/lib/communities/rules'
import type { ExploreCommunity } from '@/lib/db/queries/community-home'

import { getCommunitySettings } from '@/lib/communities/settings'
import { listCommunitiesForExplore, listMyPoolStakes } from '@/lib/db/queries/community-home'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { impliedOdds } from '@/lib/pools/math'

/**
 * Everything the Explore page and the category pages show: communities
 * with their record (last 10 results), what they are asking right now,
 * money staked this week, and the viewer's own communities.
 */

export type RecordMark = 'stood' | 'late' | 'overturned' | 'pending'

export interface ExploreMarket {
  id: string
  title: string
  communityId: string
  communitySlug: string
  communityName: string
  communityIcon: string | null
  leaderType: LeaderType | null
  jurySize: number
  yesChance: number
  totalMinor: string
  stakeCount: number
  currency: string
  closesAt: string | null
  mainCategorySlug: string | null
  categorySlugs: string[]
  resolutionSource: string | null
}

export interface ExploreCommunityRow extends ExploreCommunity {
  /** The last 10 results, newest first, padded with 'pending'. */
  record: RecordMark[]
  staked7dMinor: string
  /** The open market with the most money in it. */
  topMarket: ExploreMarket | null
  /** One of Prophit's own communities ("Run by Prophit"). */
  runByProphit: boolean
}

export interface YourCommunity {
  slug: string
  name: string
  iconUrl: string | null
  openStakes: number
  stakedMinor: string
  currency: string
  nextCloseAt: string | null
}

export interface ExploreData {
  communities: ExploreCommunityRow[]
  /** Every open market across the listed communities, biggest pool first. */
  openMarkets: ExploreMarket[]
  yourCommunities: YourCommunity[]
}

const RECORD_LENGTH = 10

async function loadRecords(communityIds: string[]): Promise<Map<string, RecordMark[]>> {
  const marks = new Map<string, RecordMark[]>()
  if (communityIds.length === 0) {
    return marks
  }
  const rows = await db.execute<{
    community_id: string
    late_resolution: boolean
    status: string
    overturned: boolean
    rn: number
  }>(sql`
    select community_id, late_resolution, status, overturned, rn from (
      select
        m.community_id,
        m.late_resolution,
        m.status,
        exists (
          select 1 from market_appeals a
          where a.community_market_id = m.id and a.ruling in ('upheld', 'voided')
        ) as overturned,
        row_number() over (partition by m.community_id order by m.resolved_at desc) as rn
      from community_markets m
      where m.community_id in (${sql.join(
        communityIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        and m.status in ('resolved', 'cancelled')
        and m.resolved_at is not null
    ) ranked
    where rn <= ${RECORD_LENGTH}
    order by community_id, rn
  `)
  const list = (rows as unknown as { rows?: typeof rows }).rows ?? rows
  for (const row of list as Array<{
    community_id: string
    late_resolution: boolean
    status: string
    overturned: boolean
  }>) {
    const mark: RecordMark = row.overturned
      ? 'overturned'
      : row.late_resolution || row.status === 'cancelled'
        ? 'late'
        : 'stood'
    const current = marks.get(row.community_id) ?? []
    current.push(mark)
    marks.set(row.community_id, current)
  }
  return marks
}

async function loadStaked7d(communityIds: string[], now: Date): Promise<Map<string, bigint>> {
  const totals = new Map<string, bigint>()
  if (communityIds.length === 0) {
    return totals
  }
  const rows = await db
    .select({
      community_id: community_markets.community_id,
      total: sql<string>`coalesce(sum(${pool_stakes.amount}), 0)::text`,
    })
    .from(pool_stakes)
    .innerJoin(pools, eq(pools.id, pool_stakes.pool_id))
    .innerJoin(community_markets, eq(community_markets.id, pools.community_market_id))
    .where(
      and(
        inArray(community_markets.community_id, communityIds),
        gt(pool_stakes.created_at, new Date(now.getTime() - 7 * 86_400_000)),
      ),
    )
    .groupBy(community_markets.community_id)
  for (const row of rows) {
    totals.set(row.community_id, BigInt(row.total))
  }
  return totals
}

async function loadOpenMarkets(communityIds: string[]): Promise<ExploreMarket[]> {
  if (communityIds.length === 0) {
    return []
  }
  const rows = await db
    .select({
      id: community_markets.id,
      title: community_markets.title,
      community_id: community_markets.community_id,
      main_category_slug: community_markets.main_category_slug,
      category_slugs: community_markets.category_slugs,
      resolution_source: community_markets.resolution_source,
      slug: communities.slug,
      name: communities.name,
      icon_url: communities.icon_url,
      leader_type: communities.leader_type,
      jury_size: communities.jury_size,
      total_yes: pools.total_yes,
      total_no: pools.total_no,
      stake_count: pools.stake_count,
      currency: pools.currency,
      closes_at: pools.closes_at,
    })
    .from(pools)
    .innerJoin(community_markets, eq(community_markets.id, pools.community_market_id))
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(
      and(
        inArray(community_markets.community_id, communityIds),
        eq(pools.state, 'open'),
        eq(community_markets.status, 'active'),
      ),
    )
    .orderBy(desc(sql`${pools.total_yes} + ${pools.total_no}`), desc(pools.stake_count), desc(pools.created_at))
    .limit(120)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    communityId: row.community_id,
    communitySlug: row.slug,
    communityName: row.name,
    communityIcon: row.icon_url,
    leaderType: (row.leader_type as LeaderType | null) ?? null,
    jurySize: row.jury_size,
    yesChance: impliedOdds(row.total_yes, row.total_no).yes,
    totalMinor: (row.total_yes + row.total_no).toString(),
    stakeCount: row.stake_count,
    currency: row.currency,
    closesAt: row.closes_at?.toISOString() ?? null,
    mainCategorySlug: row.main_category_slug,
    categorySlugs: row.category_slugs ?? [],
    resolutionSource: row.resolution_source,
  }))
}

async function loadYourCommunities(userId: string | null): Promise<YourCommunity[]> {
  if (!userId) {
    return []
  }
  const stakes = await listMyPoolStakes(userId)
  const grouped = new Map<string, YourCommunity>()
  for (const stake of stakes) {
    if (stake.state !== 'open') {
      continue
    }
    const current = grouped.get(stake.community.slug) ?? {
      slug: stake.community.slug,
      name: stake.community.name,
      iconUrl: stake.community.iconUrl,
      openStakes: 0,
      stakedMinor: '0',
      currency: stake.currency,
      nextCloseAt: null,
    }
    current.openStakes += 1
    current.stakedMinor = (BigInt(current.stakedMinor) + BigInt(stake.amountMinor)).toString()
    if (stake.closesAt && (!current.nextCloseAt || stake.closesAt < current.nextCloseAt)) {
      current.nextCloseAt = stake.closesAt
    }
    grouped.set(stake.community.slug, current)
  }
  return Array.from(grouped.values()).sort((a, b) => (a.nextCloseAt ?? '').localeCompare(b.nextCloseAt ?? ''))
}

export async function loadExplore(options: {
  userId: string | null
  leaderType?: LeaderType | null
  now: Date
  limit?: number
}): Promise<ExploreData> {
  const all = await listCommunitiesForExplore({ limit: options.limit ?? 120, userId: options.userId })
  const listed = options.leaderType ? all.filter((community) => community.leaderType === options.leaderType) : all
  const ids = listed.map((community) => community.id)
  const [records, staked, openMarkets, yourCommunities, settings] = await Promise.all([
    loadRecords(ids),
    loadStaked7d(ids, options.now),
    loadOpenMarkets(ids),
    loadYourCommunities(options.userId),
    getCommunitySettings().catch(() => null),
  ])
  const prophitIds = new Set(settings?.prophitCommunityIds ?? [])
  const topByCommunity = new Map<string, ExploreMarket>()
  for (const market of openMarkets) {
    if (!topByCommunity.has(market.communityId)) {
      topByCommunity.set(market.communityId, market)
    }
  }
  const rows: ExploreCommunityRow[] = listed.map((community) => {
    const marks = records.get(community.id) ?? []
    while (marks.length < RECORD_LENGTH) {
      marks.push('pending')
    }
    return {
      ...community,
      record: marks,
      staked7dMinor: (staked.get(community.id) ?? 0n).toString(),
      topMarket: topByCommunity.get(community.id) ?? null,
      runByProphit: prophitIds.has(community.id),
    }
  })
  return { communities: rows, openMarkets, yourCommunities }
}
