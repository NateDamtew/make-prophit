import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { CommunityTrust } from '@/components/communities/types'

import { nextLevelRequirements } from '@/lib/communities/trust'
import { community_earnings } from '@/lib/db/schema/communities/earnings'
import { community_trust_events } from '@/lib/db/schema/communities/governance'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'

/**
 * Everything the owner's dashboard shows: what the community earned, which
 * markets are where, how far it is from the next level, and the ladder's
 * recent history. Money as strings of minor units.
 */

export interface OwnerEarnings {
  currency: string | null
  ownerAllTimeMinor: string
  owner30dMinor: string
  juryAllTimeMinor: string
  jury30dMinor: string
  /** Owner earnings per ISO week for the last 8 weeks, oldest first. */
  weekly: Array<{ weekStart: string; ownerMinor: string; juryMinor: string }>
  /** Pool money that is settled or on hold (what the rake was cut from). */
  settledPoolMinor: string
}

export interface OwnerMarketRow {
  id: string
  title: string
  status: string
  reviewStatus: string | null
  poolState: string | null
  poolMinor: string
  stakeCount: number
  currency: string | null
  closesAt: string | null
  holdUntil: string | null
  resolvedOutcome: string | null
  createdAt: string
}

export interface OwnerDashboard {
  earnings: OwnerEarnings
  markets: OwnerMarketRow[]
  counts: { open: number; closing48h: number; deciding: number; held: number; resolved: number; inReview: number }
  ladder: {
    resolved: number
    late: number
    overturned: number
    next: ReturnType<typeof nextLevelRequirements>
    events: Array<{
      id: string
      kind: string
      fromLevel: number | null
      toLevel: number | null
      reason: string | null
      at: string
    }>
  }
}

function sumStrings(values: string[]): string {
  return values.reduce((acc, value) => acc + BigInt(value || '0'), 0n).toString()
}

export async function getOwnerDashboard(communityId: string, trust: CommunityTrust | null): Promise<OwnerDashboard> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const since8w = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000)
  const [sums, weekly, marketRows, [record], events] = await Promise.all([
    db
      .select({
        role: community_earnings.role,
        all_time: sql<string>`coalesce(sum(${community_earnings.amount}), 0)::text`,
        last_30d: sql<string>`coalesce(sum(${community_earnings.amount}) filter (where ${community_earnings.created_at} >= ${since30d}), 0)::text`,
        currency: sql<string | null>`max(${community_earnings.currency})`,
      })
      .from(community_earnings)
      .where(eq(community_earnings.community_id, communityId))
      .groupBy(community_earnings.role),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${community_earnings.created_at}), 'YYYY-MM-DD')`,
        owner: sql<string>`coalesce(sum(${community_earnings.amount}) filter (where ${community_earnings.role} = 'owner'), 0)::text`,
        jury: sql<string>`coalesce(sum(${community_earnings.amount}) filter (where ${community_earnings.role} <> 'owner'), 0)::text`,
      })
      .from(community_earnings)
      .where(and(eq(community_earnings.community_id, communityId), gte(community_earnings.created_at, since8w)))
      .groupBy(sql`date_trunc('week', ${community_earnings.created_at})`)
      .orderBy(sql`date_trunc('week', ${community_earnings.created_at})`),
    db
      .select({
        id: community_markets.id,
        title: community_markets.title,
        status: community_markets.status,
        review_status: community_markets.review_status,
        resolved_outcome: community_markets.resolved_outcome,
        resolution_date: community_markets.resolution_date,
        created_at: community_markets.created_at,
        pool_state: pools.state,
        total_yes: pools.total_yes,
        total_no: pools.total_no,
        stake_count: sql<number>`(select count(*)::int from pool_stakes s where s.pool_id = ${pools.id})`,
        currency: pools.currency,
        closes_at: pools.closes_at,
        hold_until: pools.hold_until,
      })
      .from(community_markets)
      .leftJoin(pools, eq(pools.community_market_id, community_markets.id))
      .where(eq(community_markets.community_id, communityId))
      .orderBy(desc(community_markets.created_at))
      .limit(100),
    db
      .select({
        resolved: sql<number>`count(*) filter (where ${community_markets.status} = 'resolved')::int`,
        late: sql<number>`count(*) filter (where ${community_markets.status} = 'cancelled' and ${community_markets.resolved_outcome} = 'cancelled')::int`,
        overturned: sql<number>`(select upheld_appeal_count from ${communities} where ${communities.id} = ${communityId})`,
        settled_pool: sql<string>`(
          select coalesce(sum(p.total_yes + p.total_no), 0)::text from ${pools} p
          join ${community_markets} m on m.id = p.community_market_id
          where m.community_id = ${communityId} and p.state in ('held', 'settled')
        )`,
      })
      .from(community_markets)
      .where(eq(community_markets.community_id, communityId)),
    db
      .select({
        id: community_trust_events.id,
        kind: community_trust_events.kind,
        from_level: community_trust_events.from_level,
        to_level: community_trust_events.to_level,
        reason: community_trust_events.reason,
        created_at: community_trust_events.created_at,
      })
      .from(community_trust_events)
      .where(eq(community_trust_events.community_id, communityId))
      .orderBy(desc(community_trust_events.created_at))
      .limit(8),
  ])

  const owner = sums.find((row) => row.role === 'owner')
  const juryRows = sums.filter((row) => row.role !== 'owner')
  const now = Date.now()
  const counts = { open: 0, closing48h: 0, deciding: 0, held: 0, resolved: 0, inReview: 0 }
  const markets: OwnerMarketRow[] = marketRows.map((row) => {
    const total = (row.total_yes ?? 0n) + (row.total_no ?? 0n)
    const closesAt = row.closes_at ?? row.resolution_date ?? null
    if (row.review_status === 'pending') {
      counts.inReview += 1
    } else if (
      row.status === 'resolved' ||
      row.status === 'cancelled' ||
      row.status === 'disputed' ||
      row.pool_state === 'settled' ||
      row.pool_state === 'cancelled'
    ) {
      counts.resolved += 1
    } else if (row.pool_state === 'held') {
      counts.held += 1
    } else if (row.pool_state === 'closed' || (closesAt && closesAt.getTime() <= now)) {
      counts.deciding += 1
    } else {
      counts.open += 1
      if (closesAt && closesAt.getTime() - now < 48 * 60 * 60 * 1000) {
        counts.closing48h += 1
      }
    }
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      reviewStatus: row.review_status,
      poolState: row.pool_state ?? null,
      poolMinor: total.toString(),
      stakeCount: row.stake_count ?? 0,
      currency: row.currency ?? null,
      closesAt: closesAt?.toISOString() ?? null,
      holdUntil: row.hold_until?.toISOString() ?? null,
      resolvedOutcome: row.resolved_outcome,
      createdAt: row.created_at.toISOString(),
    }
  })

  const ladderRecord = { resolved: record?.resolved ?? 0, overturned: record?.overturned ?? 0, rating: null }
  return {
    earnings: {
      currency: owner?.currency ?? juryRows[0]?.currency ?? trust?.currency ?? null,
      ownerAllTimeMinor: owner?.all_time ?? '0',
      owner30dMinor: owner?.last_30d ?? '0',
      juryAllTimeMinor: sumStrings(juryRows.map((row) => row.all_time)),
      jury30dMinor: sumStrings(juryRows.map((row) => row.last_30d)),
      weekly: weekly.map((row) => ({ weekStart: row.week, ownerMinor: row.owner, juryMinor: row.jury })),
      settledPoolMinor: record?.settled_pool ?? '0',
    },
    markets,
    counts,
    ladder: {
      resolved: ladderRecord.resolved,
      late: record?.late ?? 0,
      overturned: ladderRecord.overturned,
      next: nextLevelRequirements(trust?.level ?? 0, ladderRecord),
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        fromLevel: event.from_level,
        toLevel: event.to_level,
        reason: event.reason,
        at: event.created_at.toISOString(),
      })),
    },
  }
}
