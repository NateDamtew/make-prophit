import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { PoolOutcome } from '@/lib/db/schema/pools/tables'

import { users } from '@/lib/db/schema/auth/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { impliedOdds } from '@/lib/pools/math'

/**
 * Read models for the pool market page: the odds history behind the chart,
 * the "top holders" per side and the stake activity feed. All are derived
 * from pool_stakes so they stay consistent with the ledger.
 */

export interface PoolOddsPoint {
  /** Unix epoch milliseconds. */
  t: number
  /** Implied YES chance in percent (0–100). */
  yes: number
}

export interface PoolHolder {
  userId: string
  username: string | null
  image: string | null
  /** Total staked on this side, minor units, as a string (JSON-safe). */
  amountMinor: string
  stakeCount: number
}

export interface PoolActivityItem {
  id: string
  userId: string
  username: string | null
  image: string | null
  outcome: PoolOutcome
  amountMinor: string
  currency: string
  createdAt: string
  /** Implied YES chance (percent) right after this stake landed. */
  yesChanceAfter: number
}

/**
 * Cumulative implied odds after every stake, starting at 50/50 when the pool
 * opened. The series always has at least the opening point so the chart can
 * draw a flat line for a pool with no stakes yet.
 */
export async function getPoolOddsHistory(poolId: string): Promise<PoolOddsPoint[]> {
  const [pool] = await db.select({ created_at: pools.created_at }).from(pools).where(eq(pools.id, poolId)).limit(1)
  if (!pool) {
    return []
  }
  const rows = await db
    .select({ outcome: pool_stakes.outcome, amount: pool_stakes.amount, created_at: pool_stakes.created_at })
    .from(pool_stakes)
    .where(eq(pool_stakes.pool_id, poolId))
    .orderBy(pool_stakes.created_at, pool_stakes.id)

  const points: PoolOddsPoint[] = [{ t: pool.created_at.getTime(), yes: 50 }]
  let totalYes = 0n
  let totalNo = 0n
  for (const row of rows) {
    if (row.outcome === 'yes') {
      totalYes += row.amount
    } else {
      totalNo += row.amount
    }
    points.push({ t: row.created_at.getTime(), yes: impliedOdds(totalYes, totalNo).yes * 100 })
  }
  return points
}

export async function getPoolTopHolders(poolId: string, limit = 10): Promise<{ yes: PoolHolder[]; no: PoolHolder[] }> {
  const rows = await db
    .select({
      user_id: pool_stakes.user_id,
      outcome: pool_stakes.outcome,
      total: sql<string>`SUM(${pool_stakes.amount})::text`,
      count: sql<number>`COUNT(*)::int`,
      username: users.username,
      image: users.image,
    })
    .from(pool_stakes)
    .innerJoin(users, eq(pool_stakes.user_id, users.id))
    .where(eq(pool_stakes.pool_id, poolId))
    .groupBy(pool_stakes.user_id, pool_stakes.outcome, users.username, users.image)
    .orderBy(desc(sql`SUM(${pool_stakes.amount})`))

  const bySide: { yes: PoolHolder[]; no: PoolHolder[] } = { yes: [], no: [] }
  for (const row of rows) {
    const side = row.outcome === 'yes' ? bySide.yes : bySide.no
    if (side.length >= limit) {
      continue
    }
    side.push({
      userId: row.user_id,
      username: row.username,
      image: row.image,
      amountMinor: row.total,
      stakeCount: row.count,
    })
  }
  return bySide
}

/**
 * Most recent stakes first. `yesChanceAfter` is reconstructed by replaying the
 * pool, which is cheap at community scale and keeps the feed consistent with
 * the chart.
 */
export async function getPoolActivity(
  poolId: string,
  options: { limit?: number; outcome?: PoolOutcome | null } = {},
): Promise<PoolActivityItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
  const all = await db
    .select({
      id: pool_stakes.id,
      user_id: pool_stakes.user_id,
      outcome: pool_stakes.outcome,
      amount: pool_stakes.amount,
      currency: pool_stakes.currency,
      created_at: pool_stakes.created_at,
      username: users.username,
      image: users.image,
    })
    .from(pool_stakes)
    .innerJoin(users, eq(pool_stakes.user_id, users.id))
    .where(eq(pool_stakes.pool_id, poolId))
    .orderBy(pool_stakes.created_at, pool_stakes.id)

  let totalYes = 0n
  let totalNo = 0n
  const items: PoolActivityItem[] = []
  for (const row of all) {
    if (row.outcome === 'yes') {
      totalYes += row.amount
    } else {
      totalNo += row.amount
    }
    items.push({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      image: row.image,
      outcome: row.outcome,
      amountMinor: row.amount.toString(),
      currency: row.currency,
      createdAt: row.created_at.toISOString(),
      yesChanceAfter: impliedOdds(totalYes, totalNo).yes * 100,
    })
  }
  const filtered = options.outcome ? items.filter((item) => item.outcome === options.outcome) : items
  return filtered.reverse().slice(0, limit)
}

export interface PoolCardSummary {
  poolId: string
  state: string
  currency: string
  totalYesMinor: string
  totalNoMinor: string
  stakeCount: number
  yesChance: number
  settledOutcome: string | null
}

/** Pool totals for a list of community markets (for the market cards). */
export async function getPoolCardSummaries(communityMarketIds: string[]): Promise<Record<string, PoolCardSummary>> {
  if (communityMarketIds.length === 0) {
    return {}
  }
  const rows = await db
    .select({
      id: pools.id,
      community_market_id: pools.community_market_id,
      state: pools.state,
      currency: pools.currency,
      total_yes: pools.total_yes,
      total_no: pools.total_no,
      stake_count: pools.stake_count,
      settled_outcome: pools.settled_outcome,
    })
    .from(pools)
    .where(and(inArray(pools.community_market_id, communityMarketIds)))
  const result: Record<string, PoolCardSummary> = {}
  for (const row of rows) {
    result[row.community_market_id] = {
      poolId: row.id,
      state: row.state,
      currency: row.currency,
      totalYesMinor: row.total_yes.toString(),
      totalNoMinor: row.total_no.toString(),
      stakeCount: row.stake_count,
      yesChance: impliedOdds(row.total_yes, row.total_no).yes * 100,
      settledOutcome: row.settled_outcome ?? null,
    }
  }
  return result
}
