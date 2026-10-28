import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import type { CommunityLevel } from '@/lib/communities/rules'

import { isCommunityLevel } from '@/lib/communities/rules'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { conditions, events, markets } from '@/lib/db/schema/events/tables'
import { pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { computePoolSettlement, openPoolForMarket } from '@/lib/pools/service'

/**
 * Markets imported from the main Prophit catalogue into a community pool.
 * They settle from the source condition (UMA / the platform's resolution),
 * so there is no jury, no hold and no jury share. Level 1 and up only.
 */

export const IMPORT_MIN_LEVEL: CommunityLevel = 1

export interface ImportableMarket {
  conditionId: string
  eventId: string
  eventTitle: string
  eventSlug: string
  title: string
  question: string | null
  iconUrl: string | null
  endTime: string | null
  resolutionSource: string | null
}

/** Open, unresolved binary markets of the main catalogue matching a search, newest end first. */
export async function listImportableMarkets(search: string, limit = 20): Promise<ImportableMarket[]> {
  const q = search.trim()
  const rows = await db
    .select({
      condition_id: markets.condition_id,
      event_id: markets.event_id,
      event_title: events.title,
      event_slug: events.slug,
      title: markets.title,
      question: markets.question,
      icon_url: markets.icon_url,
      end_time: markets.end_time,
      resolution_source: markets.resolution_source,
    })
    .from(markets)
    .innerJoin(events, eq(markets.event_id, events.id))
    .where(
      and(
        eq(markets.is_active, true),
        eq(markets.is_resolved, false),
        eq(markets.neg_risk, false),
        sql`${markets.end_time} > now()`,
        q ? sql`(${markets.title} ILIKE ${`%${q}%`} OR ${events.title} ILIKE ${`%${q}%`})` : undefined,
      ),
    )
    .orderBy(desc(markets.volume_24h), markets.end_time)
    .limit(limit)
  return rows.map((row) => ({
    conditionId: row.condition_id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventSlug: row.event_slug,
    title: row.title,
    question: row.question,
    iconUrl: row.icon_url,
    endTime: row.end_time?.toISOString() ?? null,
    resolutionSource: row.resolution_source,
  }))
}

/**
 * The outcome a resolved condition settles to. UMA prices: 1 = Yes, 0 = No,
 * 0.5 = unresolvable (void). Null while the condition is open.
 */
export function sourceOutcomeFromCondition(condition: {
  resolved: boolean | null
  resolution_price: string | number | null
}): 'yes' | 'no' | 'cancelled' | null {
  if (!condition.resolved || condition.resolution_price === null || condition.resolution_price === undefined) {
    return null
  }
  const price = Number(condition.resolution_price)
  if (!Number.isFinite(price)) {
    return null
  }
  if (price >= 0.99) {
    return 'yes'
  }
  if (price <= 0.01) {
    return 'no'
  }
  return 'cancelled'
}

export class ImportError extends Error {
  constructor(
    public readonly code: 'level_too_low' | 'not_found' | 'already_imported' | 'source_closed' | 'bad_close',
    message: string,
  ) {
    super(message)
    this.name = 'ImportError'
  }
}

/**
 * Create the community market and its pool for a source market. Closes at
 * the earlier of the owner's close time and the source's end time.
 */
export async function importMarket(params: {
  communityId: string
  conditionId: string
  createdBy: string
  closesAt?: Date | null
}): Promise<{ marketId: string; poolId: string }> {
  const [community] = await db
    .select({ id: communities.id, level: communities.level, currency: communities.currency })
    .from(communities)
    .where(eq(communities.id, params.communityId))
    .limit(1)
  if (!community) {
    throw new ImportError('not_found', 'Community not found.')
  }
  const level: CommunityLevel = isCommunityLevel(community.level) ? community.level : 0
  if (level < IMPORT_MIN_LEVEL) {
    throw new ImportError('level_too_low', 'Importing markets opens at Level 1.')
  }
  const [source] = await db
    .select({
      condition_id: markets.condition_id,
      event_id: markets.event_id,
      title: markets.title,
      question: markets.question,
      icon_url: markets.icon_url,
      end_time: markets.end_time,
      resolution_source: markets.resolution_source,
      market_rules: markets.market_rules,
      is_resolved: markets.is_resolved,
      is_active: markets.is_active,
    })
    .from(markets)
    .where(eq(markets.condition_id, params.conditionId))
    .limit(1)
  if (!source) {
    throw new ImportError('not_found', 'That market is not in the catalogue.')
  }
  if (source.is_resolved || !source.is_active) {
    throw new ImportError('source_closed', 'That market has already closed.')
  }
  const [existing] = await db
    .select({ id: community_markets.id })
    .from(community_markets)
    .where(
      and(
        eq(community_markets.community_id, params.communityId),
        eq(community_markets.source_condition_id, params.conditionId),
      ),
    )
    .limit(1)
  if (existing) {
    throw new ImportError('already_imported', 'This market is already in your community.')
  }
  const sourceEnd = source.end_time ?? null
  const requested = params.closesAt ?? null
  const closesAt =
    requested && sourceEnd ? (requested < sourceEnd ? requested : sourceEnd) : (requested ?? sourceEnd ?? null)
  if (!closesAt || closesAt.getTime() <= Date.now()) {
    throw new ImportError('bad_close', 'The close time must be in the future.')
  }

  const [market] = await db
    .insert(community_markets)
    .values({
      community_id: params.communityId,
      title: source.question?.trim() || source.title,
      description: source.market_rules ?? null,
      image_url: source.icon_url ?? null,
      resolution_source: source.resolution_source ?? 'Prophit',
      resolution_rules: 'Settles from the source market on Prophit. No community jury.',
      resolution_date: closesAt,
      status: 'active',
      engine: 'pool',
      created_by: params.createdBy,
      source_event_id: source.event_id,
      source_condition_id: source.condition_id,
      source_platform: 'prophit',
    })
    .returning({ id: community_markets.id })
  if (!market) {
    throw new ImportError('not_found', 'Could not create the market.')
  }
  const pool = await openPoolForMarket({
    communityMarketId: market.id,
    communityId: params.communityId,
    closesAt,
    currency: community.currency ?? undefined,
    isImported: true,
  })
  return { marketId: market.id, poolId: pool.id }
}

/**
 * Settle imported markets whose source has resolved: write the outcome on
 * the community market and compute the pool, which releases at once.
 */
export async function settleImportedMarkets(
  now = new Date(),
): Promise<{ settled: string[]; errors: Array<{ marketId: string; error: string }> }> {
  const rows = await db
    .select({
      id: community_markets.id,
      condition_id: community_markets.source_condition_id,
      resolved: conditions.resolved,
      resolution_price: conditions.resolution_price,
    })
    .from(community_markets)
    .innerJoin(pools, eq(pools.community_market_id, community_markets.id))
    .innerJoin(conditions, eq(conditions.id, community_markets.source_condition_id))
    .where(
      and(
        isNotNull(community_markets.source_condition_id),
        eq(community_markets.status, 'active'),
        inArray(pools.state, ['open', 'closed']),
        eq(conditions.resolved, true),
      ),
    )
  const settled: string[] = []
  const errors: Array<{ marketId: string; error: string }> = []
  for (const row of rows) {
    const outcome = sourceOutcomeFromCondition(row)
    if (!outcome) {
      continue
    }
    try {
      await db
        .update(community_markets)
        .set({
          status: outcome === 'cancelled' ? 'cancelled' : 'resolved',
          resolved_outcome: outcome,
          resolved_at: now,
          updated_at: now,
        })
        .where(eq(community_markets.id, row.id))
      await computePoolSettlement(row.id, { now })
      settled.push(row.id)
    } catch (error) {
      errors.push({ marketId: row.id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { settled, errors }
}
