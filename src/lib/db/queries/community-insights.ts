import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { community_comments, community_events, community_reactions } from '@/lib/db/schema/communities/engagement'
import { community_markets, community_members } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

export interface CommunityInsightsKpis {
  members: { total: number, weeklyDelta: number | null }
  markets: {
    active: number
    pending: number
    resolved: number
    medianTimeToReviewHours: number | null
  }
  engagement: {
    comments30d: number
    reactions30d: number
  }
}

export interface MemberGrowthPoint {
  date: string
  count: number
}

export interface RejectionReasonRow {
  excerpt: string
  count: number
}

export interface TopMarketRow {
  id: string
  title: string
  status: string
  engagement_score: number
  comments: number
  reactions: number
}

async function safeNumber<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  }
  catch (error) {
    console.error('Community insights query failed', error)
    return fallback
  }
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }
  return ((current - previous) / previous) * 100
}

/** Aggregate Insights KPIs for the admin dashboard. Each piece degrades to 0. */
export async function getCommunityKpis(communityId: string): Promise<CommunityInsightsKpis> {
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const [
    membersTotal,
    membersThisWeek,
    membersPrevWeek,
    activeCount,
    pendingCount,
    resolvedCount,
    comments30d,
    reactions30d,
    medianRow,
  ] = await Promise.all([
    safeNumber(async () => {
      const [r] = await db.select({ v: count() }).from(community_members).where(eq(community_members.community_id, communityId))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_members)
        .where(and(eq(community_members.community_id, communityId), gte(community_members.joined_at, weekAgo)))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_members)
        .where(and(
          eq(community_members.community_id, communityId),
          gte(community_members.joined_at, twoWeeksAgo),
          sql`${community_members.joined_at} < ${weekAgo}`,
        ))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_markets)
        .where(and(eq(community_markets.community_id, communityId), eq(community_markets.status, 'active')))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_markets)
        .where(and(
          eq(community_markets.community_id, communityId),
          sql`${community_markets.review_status} = 'pending'`,
        ))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_markets)
        .where(and(
          eq(community_markets.community_id, communityId),
          sql`${community_markets.status} IN ('resolved', 'disputed')`,
        ))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_comments)
        .where(and(
          eq(community_comments.community_id, communityId),
          gte(community_comments.created_at, thirtyDaysAgo),
        ))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const [r] = await db
        .select({ v: count() })
        .from(community_reactions)
        .where(and(
          eq(community_reactions.community_id, communityId),
          gte(community_reactions.created_at, thirtyDaysAgo),
        ))
      return Number(r?.v ?? 0)
    }, 0),
    safeNumber(async () => {
      const rows = await db.execute(sql`
        SELECT EXTRACT(EPOCH FROM percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (reviewed_at - submitted_at)
        )) / 3600.0 AS median_hours
        FROM community_markets
        WHERE community_id = ${communityId}
          AND submitted_at IS NOT NULL
          AND reviewed_at IS NOT NULL
      `)
      const r = ((rows as unknown as { rows: Array<{ median_hours: number | null }> }).rows
        ?? (rows as unknown as Array<{ median_hours: number | null }>))[0]
      return r?.median_hours == null ? null : Math.round(Number(r.median_hours) * 10) / 10
    }, null as number | null),
  ])

  return {
    members: {
      total: membersTotal,
      weeklyDelta: percentDelta(membersThisWeek, membersPrevWeek),
    },
    markets: {
      active: activeCount,
      pending: pendingCount,
      resolved: resolvedCount,
      medianTimeToReviewHours: medianRow,
    },
    engagement: { comments30d, reactions30d },
  }
}

/** 30-day daily series of new member joins. Sparse — caller densifies. */
export async function getMemberGrowth(communityId: string, days = 30): Promise<MemberGrowthPoint[]> {
  return safeNumber(async () => {
    const rows = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${community_members.joined_at}), 'YYYY-MM-DD')`,
        v: count(),
      })
      .from(community_members)
      .where(and(
        eq(community_members.community_id, communityId),
        sql`${community_members.joined_at} >= now() - make_interval(days => ${days})`,
      ))
      .groupBy(sql`date_trunc('day', ${community_members.joined_at})`)
      .orderBy(sql`date_trunc('day', ${community_members.joined_at}) asc`)
    return rows.map(r => ({ date: r.date, count: Number(r.v) }))
  }, [] as MemberGrowthPoint[])
}

/** Engagement leaderboard: top 5 markets by comment + reaction count. */
export async function getTopMarkets(communityId: string, limit = 5): Promise<TopMarketRow[]> {
  return safeNumber(async () => {
    const rows = await db.execute(sql`
      SELECT m.id, m.title, m.status,
             COALESCE(c.cnt, 0)::int AS comments,
             COALESCE(r.cnt, 0)::int AS reactions,
             COALESCE(c.cnt, 0)::int + COALESCE(r.cnt, 0)::int AS engagement_score
      FROM community_markets m
      LEFT JOIN (
        SELECT market_id, count(*) AS cnt
        FROM community_comments WHERE community_id = ${communityId} GROUP BY market_id
      ) c ON c.market_id = m.id
      LEFT JOIN (
        SELECT target_id, count(*) AS cnt
        FROM community_reactions
        WHERE community_id = ${communityId} AND target_type = 'market'
        GROUP BY target_id
      ) r ON r.target_id = m.id
      WHERE m.community_id = ${communityId}
      ORDER BY engagement_score DESC, m.created_at DESC
      LIMIT ${limit}
    `)
    const list = (rows as unknown as { rows: TopMarketRow[] }).rows
      ?? (rows as unknown as TopMarketRow[])
    return list
  }, [] as TopMarketRow[])
}

/** Recent community events powering the Insights activity feed. */
export async function getRecentCommunityEvents(communityId: string, limit = 12) {
  return safeNumber(async () => {
    const rows = await db
      .select()
      .from(community_events)
      .where(eq(community_events.community_id, communityId))
      .orderBy(desc(community_events.created_at))
      .limit(limit)
    return rows.map(row => ({
      id: row.id,
      kind: row.kind,
      actorLabel: row.actor_label,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: row.payload,
      createdAt: row.created_at.toISOString(),
    }))
  }, [] as Array<{ id: string, kind: string, actorLabel: string | null, targetType: string | null, targetId: string | null, payload: Record<string, unknown>, createdAt: string }>)
}

/**
 * Most common rejection reasons (excerpts) from review_feedback. Naive
 * bucketing — admins still see the full feedback per market. Phase 3 will
 * categorise these once we have data.
 */
export async function getRejectionReasons(communityId: string, limit = 5): Promise<RejectionReasonRow[]> {
  return safeNumber(async () => {
    const rows = await db.execute(sql`
      SELECT TRIM(BOTH FROM SUBSTRING(review_feedback FROM 1 FOR 140)) AS excerpt,
             count(*)::int AS cnt
      FROM community_markets
      WHERE community_id = ${communityId}
        AND review_status = 'rejected'
        AND review_feedback IS NOT NULL
        AND char_length(review_feedback) > 0
      GROUP BY excerpt
      ORDER BY cnt DESC, excerpt ASC
      LIMIT ${limit}
    `)
    const list = ((rows as unknown as { rows: Array<{ excerpt: string, cnt: number }> }).rows
      ?? (rows as unknown as Array<{ excerpt: string, cnt: number }>))
    return list.map(r => ({ excerpt: r.excerpt, count: Number(r.cnt) }))
  }, [] as RejectionReasonRow[])
}
