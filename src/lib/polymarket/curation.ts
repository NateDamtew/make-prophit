import type {
  PolymarketCurationFilters,
  PolymarketCurationMode,
  PolymarketCurationScope,
} from '@/lib/db/schema/polymarket/tables'
import type { GammaEvent, GammaMarket } from '@/lib/polymarket/gamma'

import { toGammaNumber } from '@/lib/polymarket/gamma'

/**
 * Decides which Polymarket events and markets Prophit shows, from the admin's
 * rules. Nothing shows unless a rule includes it. Specificity, most to least:
 * market rule > event rule > league tag (has a parent) > category tag.
 * At the same level an exclude beats an include.
 */

export interface CurationRule {
  scope: PolymarketCurationScope
  ref: string
  mode: PolymarketCurationMode
  pinned: boolean
  parent_ref: string | null
  filters: PolymarketCurationFilters
}

export interface CurationIndex {
  tags: Map<string, CurationRule>
  events: Map<string, CurationRule>
  markets: Map<string, CurationRule>
}

export interface CurationDecision {
  visible: boolean
  pinned: boolean
  markets: GammaMarket[]
  /** Why: 'market' | 'event' | 'tag:<slug>' | 'none'. Shown in admin. */
  reason: string
}

export function buildCurationIndex(rules: CurationRule[]): CurationIndex {
  const index: CurationIndex = { tags: new Map(), events: new Map(), markets: new Map() }
  for (const rule of rules) {
    const ref = rule.ref.trim()
    if (!ref) {
      continue
    }
    const key = rule.scope === 'tag' ? ref.toLowerCase() : ref
    const bucket = rule.scope === 'tag' ? index.tags : rule.scope === 'event' ? index.events : index.markets
    bucket.set(key, rule)
  }
  return index
}

function eventTagSlugs(event: Pick<GammaEvent, 'tags'>): string[] {
  return (event.tags ?? []).map((tag) => tag.slug?.trim().toLowerCase()).filter((slug): slug is string => Boolean(slug))
}

/** The tag rule that governs an event, or null. Leagues outrank categories; excludes win ties. */
export function resolveTagRule(event: Pick<GammaEvent, 'tags'>, index: CurationIndex): CurationRule | null {
  const matched = eventTagSlugs(event)
    .map((slug) => index.tags.get(slug))
    .filter((rule): rule is CurationRule => Boolean(rule))
  if (matched.length === 0) {
    return null
  }
  function specificity(rule: CurationRule) {
    return rule.parent_ref ? 2 : 1
  }
  const topLevel = Math.max(...matched.map(specificity))
  const atTop = matched.filter((rule) => specificity(rule) === topLevel)
  return atTop.find((rule) => rule.mode === 'exclude') ?? atTop[0]
}

function marketPassesTypeFilter(market: Pick<GammaMarket, 'sportsMarketType'>, filters: PolymarketCurationFilters) {
  const allowed = filters.marketTypes
  if (!allowed || allowed.length === 0) {
    return true
  }
  const type = market.sportsMarketType?.trim().toLowerCase()
  // Futures and non-sports markets carry no type; type filters only trim game props.
  return !type || allowed.some((entry) => entry.trim().toLowerCase() === type)
}

function eventPassesFilters(event: GammaEvent, filters: PolymarketCurationFilters, nowMs = Date.now()) {
  if (filters.minVolume && toGammaNumber(event.volume) < filters.minVolume) {
    return false
  }
  if (filters.minLiquidity && toGammaNumber(event.liquidity) < filters.minLiquidity) {
    return false
  }
  if (filters.windowDays && event.endDate) {
    const endMs = Date.parse(event.endDate)
    if (Number.isFinite(endMs) && endMs > nowMs + filters.windowDays * 86_400_000) {
      return false
    }
  }
  return true
}

/**
 * Polymarket pre-creates spare slots in multi-outcome events ("Team A", "Player B",
 * "Other") and keeps them `active: false`, unpriced and untraded until one is
 * launched as a real outcome. Launched and resolved markets stay `active: true`.
 */
export function isPlaceholderMarket(market: Pick<GammaMarket, 'active'>) {
  return market.active === false
}

/**
 * Whether a stored market of a Polymarket event is listed. Unresolved inactive ones
 * are placeholder slots (switched off by the sync) or archived: never priced or traded.
 */
export function isListedPolymarketMarket(market: { is_active?: boolean | null; is_resolved?: boolean | null }) {
  return market.is_active !== false || Boolean(market.is_resolved)
}

function isListableMarket(market: GammaMarket) {
  return !market.archived && !isPlaceholderMarket(market) && Boolean(market.conditionId) && Boolean(market.clobTokenIds)
}

export function decideEvent(event: GammaEvent, index: CurationIndex, nowMs = Date.now()): CurationDecision {
  const markets = (event.markets ?? []).filter(isListableMarket)
  const eventRule = index.events.get(String(event.id)) ?? null
  const tagRule = eventRule ? null : resolveTagRule(event, index)

  let eventIncluded = false
  let reason = 'none'
  let filters: PolymarketCurationFilters = {}
  if (eventRule) {
    eventIncluded = eventRule.mode === 'include'
    reason = 'event'
  } else if (tagRule) {
    eventIncluded = tagRule.mode === 'include' && eventPassesFilters(event, tagRule.filters, nowMs)
    filters = tagRule.filters
    reason = `tag:${tagRule.ref}`
  }

  const chosen = markets.filter((market) => {
    const marketRule = index.markets.get(market.conditionId)
    if (marketRule) {
      return marketRule.mode === 'include'
    }
    return eventIncluded && marketPassesTypeFilter(market, filters)
  })

  const hasMarketInclude = markets.some((market) => index.markets.get(market.conditionId)?.mode === 'include')
  if (!eventIncluded && hasMarketInclude) {
    reason = 'market'
  }

  return {
    visible: chosen.length > 0,
    pinned: Boolean(eventRule?.pinned && eventRule.mode === 'include'),
    markets: chosen,
    reason,
  }
}
