import { and, desc, eq, gte, inArray } from 'drizzle-orm'

import { fetchOutcomePrices } from '@/lib/clob-event-prices'
import { event_sports, events, market_sports, markets, outcomes } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

/**
 * Read-only view of the admin-curated Polymarket catalogue, for other Prophit
 * apps (the daily-call points game). Only visible venue = 'polymarket' events.
 */

export interface PublicPolymarketOutcome {
  index: number
  label: string
  tokenId: string
  /** Best ask (0–1) on Polymarket, when available. */
  price: number | null
  isWinner: boolean | null
  payout: number | null
}

export interface PublicPolymarketMarket {
  conditionId: string
  title: string
  question: string | null
  marketType: string | null
  /** Kickoff / tip-off for sports markets — predictions should lock here. */
  startsAt: string | null
  endsAt: string | null
  resolved: boolean
  outcomes: PublicPolymarketOutcome[]
}

export interface PublicPolymarketEvent {
  id: string
  polymarketEventId: string | null
  slug: string
  title: string
  iconUrl: string | null
  status: string
  startsAt: string | null
  endsAt: string | null
  resolvedAt: string | null
  updatedAt: string
  markets: PublicPolymarketMarket[]
}

export interface PublicCatalogueQuery {
  status?: 'open' | 'resolved' | 'all'
  eventIds?: string[]
  updatedSince?: Date
  limit?: number
}

const MAX_EVENTS = 200

export async function listPublicPolymarketCatalogue(
  query: PublicCatalogueQuery = {},
): Promise<PublicPolymarketEvent[]> {
  const conditions = [eq(events.venue, 'polymarket')]
  const byId = Boolean(query.eventIds && query.eventIds.length > 0)
  // Lookups by id include hidden events: picks placed before an admin hid an event
  // must settle on its real result instead of looking like a voided market.
  if (!byId) {
    conditions.push(eq(events.is_hidden, false))
  }
  if (query.status === 'open') {
    conditions.push(eq(events.status, 'active'))
  } else if (query.status === 'resolved') {
    conditions.push(eq(events.status, 'resolved'))
  }
  if (byId) {
    conditions.push(inArray(events.id, query.eventIds!))
  }
  if (query.updatedSince) {
    conditions.push(gte(events.updated_at, query.updatedSince))
  }

  const eventRows = await db
    .select({
      id: events.id,
      polymarket_event_id: events.polymarket_event_id,
      slug: events.slug,
      title: events.title,
      icon_url: events.icon_url,
      status: events.status,
      start_date: events.start_date,
      end_date: events.end_date,
      resolved_at: events.resolved_at,
      updated_at: events.updated_at,
      sports_start_time: event_sports.sports_start_time,
    })
    .from(events)
    .leftJoin(event_sports, eq(event_sports.event_id, events.id))
    .where(and(...conditions))
    .orderBy(desc(events.updated_at))
    .limit(Math.min(query.limit ?? MAX_EVENTS, MAX_EVENTS))

  if (eventRows.length === 0) {
    return []
  }

  const marketRows = await db
    .select({
      condition_id: markets.condition_id,
      event_id: markets.event_id,
      title: markets.title,
      question: markets.question,
      is_resolved: markets.is_resolved,
      end_time: markets.end_time,
      sports_market_type: market_sports.sports_market_type,
      sports_game_start_time: market_sports.sports_game_start_time,
    })
    .from(markets)
    .leftJoin(market_sports, eq(market_sports.condition_id, markets.condition_id))
    .where(
      inArray(
        markets.event_id,
        eventRows.map((row) => row.id),
      ),
    )

  const outcomeRows =
    marketRows.length === 0
      ? []
      : await db
          .select()
          .from(outcomes)
          .where(
            inArray(
              outcomes.condition_id,
              marketRows.map((row) => row.condition_id),
            ),
          )

  const openTokenIds = outcomeRows
    .filter((row) => !marketRows.find((market) => market.condition_id === row.condition_id)?.is_resolved)
    .map((row) => row.token_id)
  const prices = await fetchOutcomePrices(openTokenIds, { polymarketTokenIds: new Set(openTokenIds) })

  const outcomesByCondition = new Map<string, PublicPolymarketOutcome[]>()
  for (const row of outcomeRows) {
    const list = outcomesByCondition.get(row.condition_id) ?? []
    list.push({
      index: row.outcome_index,
      label: row.outcome_text,
      tokenId: row.token_id,
      price: prices.get(row.token_id)?.buy ?? null,
      isWinner: row.payout_value == null ? null : Boolean(row.is_winning_outcome),
      payout: row.payout_value == null ? null : Number(row.payout_value),
    })
    outcomesByCondition.set(row.condition_id, list)
  }

  const marketsByEvent = new Map<string, PublicPolymarketMarket[]>()
  for (const row of marketRows) {
    const list = marketsByEvent.get(row.event_id) ?? []
    list.push({
      conditionId: row.condition_id,
      title: row.title,
      question: row.question,
      marketType: row.sports_market_type,
      startsAt: row.sports_game_start_time?.toISOString() ?? null,
      endsAt: row.end_time?.toISOString() ?? null,
      resolved: row.is_resolved,
      outcomes: (outcomesByCondition.get(row.condition_id) ?? []).sort((left, right) => left.index - right.index),
    })
    marketsByEvent.set(row.event_id, list)
  }

  return eventRows.map((row) => ({
    id: row.id,
    polymarketEventId: row.polymarket_event_id,
    slug: row.slug,
    title: row.title,
    iconUrl: row.icon_url,
    status: row.status,
    startsAt: (row.sports_start_time ?? row.start_date)?.toISOString() ?? null,
    endsAt: row.end_date?.toISOString() ?? null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    markets: marketsByEvent.get(row.id) ?? [],
  }))
}
