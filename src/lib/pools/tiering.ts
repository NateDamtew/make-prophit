import { and, eq, gte, inArray, sql } from 'drizzle-orm'

import { SettingsRepository } from '@/lib/db/queries/settings'
import { communities } from '@/lib/db/schema/communities/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { MOBILE_MONEY_SETTINGS_GROUP } from '@/lib/mobile-money/settings'

/**
 * Community tiering (LOCAL-PAYMENTS-DESIGN.md §6.3). Communities start on the
 * pool engine; a nightly job promotes those with real activity to the Kuest
 * order book for NEW markets, and demotes quiet ones. Super admins can pin a
 * tier with `tier_override`.
 */

export type CommunityTier = 'pool' | 'orderbook'

export interface TierThresholds {
  minMembers: number
  minTraders30d: number
  /** Average settled pool size over 90 days, minor units. */
  minAvgPoolMinor: bigint
  /** Days of inactivity (below thresholds) before an orderbook community drops back. */
  demoteAfterDays: number
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  minMembers: 1_000,
  minTraders30d: 100,
  minAvgPoolMinor: 5_000_000n, // 50,000.00
  demoteAfterDays: 60,
}

const TIERING_SETTINGS_KEY = 'tiering'

export interface CommunityTierMetrics {
  members: number
  traders30d: number
  avgPool90dMinor: bigint
}

function readCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function readMinor(value: unknown, fallback: bigint): bigint {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.floor(value))
  }
  return fallback
}

export function parseTierThresholds(raw: string | undefined): TierThresholds {
  if (!raw) {
    return DEFAULT_TIER_THRESHOLDS
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      minMembers: readCount(parsed.minMembers, DEFAULT_TIER_THRESHOLDS.minMembers),
      minTraders30d: readCount(parsed.minTraders30d, DEFAULT_TIER_THRESHOLDS.minTraders30d),
      minAvgPoolMinor: readMinor(parsed.minAvgPoolMinor, DEFAULT_TIER_THRESHOLDS.minAvgPoolMinor),
      demoteAfterDays: readCount(parsed.demoteAfterDays, DEFAULT_TIER_THRESHOLDS.demoteAfterDays),
    }
  } catch {
    return DEFAULT_TIER_THRESHOLDS
  }
}

export function meetsThresholds(metrics: CommunityTierMetrics, thresholds: TierThresholds): boolean {
  return (
    metrics.members >= thresholds.minMembers &&
    metrics.traders30d >= thresholds.minTraders30d &&
    metrics.avgPool90dMinor >= thresholds.minAvgPoolMinor
  )
}

/**
 * Decide the tier for one community. Override wins. Otherwise promote when all
 * thresholds hold; demote only after `demoteAfterDays` below threshold (hysteresis).
 */
export function decideTier(params: {
  current: CommunityTier
  override: CommunityTier | null
  metrics: CommunityTierMetrics
  thresholds: TierThresholds
  tierChangedAt: Date | null
  now?: Date
}): { tier: CommunityTier; reason: string } {
  const { current, override, metrics, thresholds } = params
  const now = params.now ?? new Date()
  if (override) {
    return { tier: override, reason: 'override' }
  }
  const qualifies = meetsThresholds(metrics, thresholds)
  if (current === 'pool') {
    return qualifies
      ? { tier: 'orderbook', reason: 'promoted: thresholds met' }
      : { tier: 'pool', reason: 'below thresholds' }
  }
  if (qualifies) {
    return { tier: 'orderbook', reason: 'thresholds met' }
  }
  const sinceChange = params.tierChangedAt
    ? (now.getTime() - params.tierChangedAt.getTime()) / 86_400_000
    : Number.POSITIVE_INFINITY
  if (sinceChange >= thresholds.demoteAfterDays) {
    return { tier: 'pool', reason: `demoted: below thresholds for ${thresholds.demoteAfterDays}+ days` }
  }
  return { tier: 'orderbook', reason: 'grace period before demotion' }
}

async function getTierThresholds(): Promise<TierThresholds> {
  const { data } = await SettingsRepository.getSettings()
  return parseTierThresholds(data?.[MOBILE_MONEY_SETTINGS_GROUP]?.[TIERING_SETTINGS_KEY]?.value)
}

async function collectCommunityMetrics(): Promise<Map<string, CommunityTierMetrics>> {
  const since30 = new Date(Date.now() - 30 * 86_400_000)
  const since90 = new Date(Date.now() - 90 * 86_400_000)
  const members = await db.select({ id: communities.id, members: communities.member_count }).from(communities)
  const traders = await db
    .select({ communityId: pools.community_id, traders: sql<string>`COUNT(DISTINCT ${pool_stakes.user_id})` })
    .from(pool_stakes)
    .innerJoin(pools, eq(pool_stakes.pool_id, pools.id))
    .where(gte(pool_stakes.created_at, since30))
    .groupBy(pools.community_id)
  const avgPools = await db
    .select({
      communityId: pools.community_id,
      avg: sql<string>`COALESCE(AVG(${pools.total_yes} + ${pools.total_no}), 0)`,
    })
    .from(pools)
    .where(and(inArray(pools.state, ['settled', 'cancelled']), gte(pools.settled_at, since90)))
    .groupBy(pools.community_id)
  const tradersBy = new Map(traders.map((row) => [row.communityId, Number(row.traders)]))
  const avgBy = new Map(avgPools.map((row) => [row.communityId, BigInt(Math.floor(Number(row.avg)))]))
  const result = new Map<string, CommunityTierMetrics>()
  for (const row of members) {
    result.set(row.id, {
      members: row.members,
      traders30d: tradersBy.get(row.id) ?? 0,
      avgPool90dMinor: avgBy.get(row.id) ?? 0n,
    })
  }
  return result
}

export interface TierEvaluationResult {
  evaluated: number
  changed: Array<{ communityId: string; from: CommunityTier; to: CommunityTier; reason: string }>
}

/** Nightly job: re-evaluate every community and apply tier changes (new markets only are affected). */
export async function evaluateCommunityTiers(
  options: { thresholds?: TierThresholds; now?: Date } = {},
): Promise<TierEvaluationResult> {
  const thresholds = options.thresholds ?? (await getTierThresholds())
  const metrics = await collectCommunityMetrics()
  const rows = await db
    .select({
      id: communities.id,
      tier: communities.tier,
      override: communities.tier_override,
      changedAt: communities.tier_changed_at,
    })
    .from(communities)
  const changed: TierEvaluationResult['changed'] = []
  for (const row of rows) {
    const current = (row.tier === 'orderbook' ? 'orderbook' : 'pool') as CommunityTier
    const override = row.override === 'orderbook' || row.override === 'pool' ? row.override : null
    const decision = decideTier({
      current,
      override,
      metrics: metrics.get(row.id) ?? { members: 0, traders30d: 0, avgPool90dMinor: 0n },
      thresholds,
      tierChangedAt: row.changedAt,
      now: options.now,
    })
    if (decision.tier !== current) {
      await db
        .update(communities)
        .set({ tier: decision.tier, tier_changed_at: new Date(), updated_at: new Date() })
        .where(eq(communities.id, row.id))
      changed.push({ communityId: row.id, from: current, to: decision.tier, reason: decision.reason })
    }
  }
  return { evaluated: rows.length, changed }
}

export async function setCommunityTierOverride(communityId: string, override: CommunityTier | null) {
  const [row] = await db
    .update(communities)
    .set({
      tier_override: override,
      ...(override ? { tier: override, tier_changed_at: new Date() } : {}),
      updated_at: new Date(),
    })
    .where(eq(communities.id, communityId))
    .returning({ id: communities.id, tier: communities.tier, tier_override: communities.tier_override })
  return row ?? null
}
