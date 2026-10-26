import { createHash } from 'node:crypto'

import type { ExternalMarketEntry } from '@/app/api/sync/events/route'
import type { GammaEvent, GammaMarket } from '@/lib/polymarket/gamma'

import { parseGammaStringArray } from '@/lib/polymarket/gamma'

/**
 * Turns Polymarket Gamma events into the metadata shape Kuest's market sync
 * ingests (the Irys documents), so imported events go through the same event,
 * market, tag, sports and cache pipeline as Kuest markets.
 */

/** Slug prefix keeping imported events apart from Kuest mirrors of the same Polymarket event. */
const POLYMARKET_SLUG_PREFIX = 'pm-'

/** Polymarket's CTF Exchange; stands in as the "creator" of imported conditions. */
export const POLYMARKET_SOURCE_CREATOR = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'

export function toProphitSlug(polymarketSlug: string) {
  return `${POLYMARKET_SLUG_PREFIX}${polymarketSlug}`.slice(0, 200)
}

function toUnixSeconds(value: string | null | undefined, fallbackMs: number) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return String(Math.floor((Number.isFinite(parsed) ? parsed : fallbackMs) / 1000))
}

/** 0–1 price of the first outcome once a market has settled, else null. */
export function resolveSettledPrice(market: Pick<GammaMarket, 'closed' | 'outcomePrices' | 'umaResolutionStatus'>) {
  if (!market.closed) {
    return null
  }
  const prices = parseGammaStringArray(market.outcomePrices).map(Number)
  if (prices.length < 2 || prices.some((price) => !Number.isFinite(price))) {
    return null
  }
  const total = prices.reduce((sum, price) => sum + price, 0)
  const isFinal = prices.every((price) => price === 0 || price === 1 || price === 0.5) && Math.abs(total - 1) < 1e-6
  if (!isFinal && market.umaResolutionStatus !== 'resolved') {
    return null
  }
  return isFinal ? prices[0] : null
}

/**
 * Settled markets across Gamma events, plus the events whose every market has
 * settled. Covers hidden events too, so their results still land.
 */
export function collectSettledMarkets(gammaEvents: Iterable<GammaEvent>) {
  const settled: { conditionId: string; price: number }[] = []
  const fullySettledEventIds: string[] = []
  for (const event of gammaEvents) {
    const eventMarkets = event.markets ?? []
    let allSettled = eventMarkets.length > 0
    for (const market of eventMarkets) {
      const price = resolveSettledPrice(market)
      if (price == null) {
        allSettled = false
        continue
      }
      settled.push({ conditionId: market.conditionId, price })
    }
    if (allSettled) {
      fullySettledEventIds.push(String(event.id))
    }
  }
  return { settled, fullySettledEventIds }
}

function isSportsGame(event: GammaEvent) {
  return Boolean(event.gameId || (event.teams && event.teams.length > 0 && event.startTime))
}

function buildSportsTeams(event: GammaEvent) {
  return (event.teams ?? []).map((team) => ({
    name: team.name ?? null,
    abbreviation: team.abbreviation ?? null,
    record: team.record ?? null,
    color: team.color ?? null,
    host_status: team.ordering ?? null,
    logo_url: team.logo ?? null,
  }))
}

function buildSportsMetadata(event: GammaEvent, market: GammaMarket) {
  if (!isSportsGame(event)) {
    return undefined
  }
  const leagueSlug = event.teams?.find((team) => team.league)?.league ?? event.sport ?? null
  const series = event.series?.[0]
  return {
    event: {
      event_id: String(event.id),
      slug: toProphitSlug(event.slug),
      game_id: event.gameId ?? null,
      event_date: event.eventDate ?? null,
      start_time: event.startTime ?? null,
      event_week: event.eventWeek ?? null,
      series_slug: event.seriesSlug ?? series?.slug ?? null,
      series_id: series?.id ?? null,
      series_recurrence: series?.recurrence ?? null,
      sport_slug: event.sport ?? leagueSlug,
      league_slug: leagueSlug,
      teams: buildSportsTeams(event),
      score: event.score ?? null,
      period: event.period ?? null,
      elapsed: event.elapsed ?? null,
      live: event.live ?? null,
      ended: event.ended ?? null,
    },
    market: {
      event_id: String(event.id),
      event_slug: toProphitSlug(event.slug),
      game_id: event.gameId ?? null,
      event_date: event.eventDate ?? null,
      start_time: event.startTime ?? null,
      game_start_time: market.gameStartTime ?? event.startTime ?? null,
      sports_market_type: market.sportsMarketType ?? null,
      line: market.line == null ? null : String(market.line),
      group_item_title: market.groupItemTitle ?? null,
      group_item_threshold: market.groupItemThreshold ?? null,
      teams: buildSportsTeams(event),
    },
  }
}

function buildMarketMetadata(event: GammaEvent, market: GammaMarket) {
  const outcomes = parseGammaStringArray(market.outcomes)
  const tokenIds = parseGammaStringArray(market.clobTokenIds)
  if (outcomes.length < 2 || tokenIds.length !== outcomes.length) {
    return null
  }

  return {
    name: market.groupItemTitle?.trim() || market.question,
    slug: toProphitSlug(market.slug),
    question: market.question,
    short_title: market.groupItemTitle?.trim() || null,
    description: market.description ?? null,
    icon: market.icon || market.image || event.icon || event.image || null,
    end_time: market.endDate ?? event.endDate ?? null,
    outcomes: outcomes.map((outcome, index) => ({ outcome, token_id: tokenIds[index] })),
    market_rules: market.description ?? null,
    resolution_source: market.resolutionSource || event.resolutionSource || null,
    resolver: market.resolvedBy ?? null,
    neg_risk: Boolean(market.negRisk),
    neg_risk_other: Boolean(market.negRiskOther),
    neg_risk_market_id: market.negRiskMarketID ?? null,
    neg_risk_request_id: market.negRiskRequestID ?? null,
    archived: Boolean(market.archived),
    sports: buildSportsMetadata(event, market),
    event: {
      slug: toProphitSlug(event.slug),
      title: event.title,
      icon: event.icon || event.image || null,
      tags: (event.tags ?? []).map((tag) => tag.label).filter(Boolean),
      end_time: event.endDate ?? null,
      rules: event.description ?? null,
      neg_risk: Boolean(event.negRisk),
      enable_neg_risk: Boolean(event.enableNegRisk),
      neg_risk_augmented: Boolean(event.negRiskAugmented),
      neg_risk_market_id: event.negRiskMarketID ?? null,
      series_slug: event.seriesSlug ?? event.series?.[0]?.slug ?? null,
      series_id: event.series?.[0]?.id ?? null,
      series_recurrence: event.series?.[0]?.recurrence ?? null,
      show_market_icons: event.showMarketImages ?? true,
    },
  }
}

export function buildExternalMarketEntries(
  event: GammaEvent,
  markets: GammaMarket[],
  nowMs = Date.now(),
): ExternalMarketEntry[] {
  const entries: ExternalMarketEntry[] = []
  for (const market of markets) {
    const metadata = buildMarketMetadata(event, market)
    if (!metadata) {
      continue
    }
    entries.push({
      condition: {
        id: market.conditionId,
        oracle: (market.resolvedBy ?? POLYMARKET_SOURCE_CREATOR).toLowerCase(),
        questionId: market.questionID ?? market.conditionId,
        resolved: resolveSettledPrice(market) != null,
        metadataHash: `polymarket:${market.id}`,
        creator: POLYMARKET_SOURCE_CREATOR,
        creationTimestamp: toUnixSeconds(market.createdAt ?? event.createdAt, nowMs),
        updatedAt: toUnixSeconds(market.updatedAt ?? event.updatedAt, nowMs),
      },
      metadata,
    })
  }
  return entries
}

/** Bump to make every market re-import once (e.g. after the adapter's output changes). */
const ENTRY_FINGERPRINT_VERSION = 1

/**
 * Stable hash of everything the import writes for a market. Gamma's updatedAt
 * moves on every price tick and creationTimestamp can fall back to "now", so
 * both are left out; live scores and results are in and still trigger an update.
 */
export function fingerprintMarketEntry(entry: ExternalMarketEntry) {
  const condition = { ...entry.condition, updatedAt: undefined, creationTimestamp: undefined }
  return createHash('sha256')
    .update(JSON.stringify({ version: ENTRY_FINGERPRINT_VERSION, condition, metadata: entry.metadata }))
    .digest('hex')
}
