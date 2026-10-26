import type { Event, Market } from '@/types'

/**
 * Trims events before they are serialised into a page for list cards (home
 * hero, category grids). Cards never show rules, resolution sources or the
 * imported metadata documents (the question stays: grid cards use it as a label), which were most of the home page's weight.
 * Event pages load their own full event and are not affected.
 */

/** The only metadata cards read: chart labels use short_title, mention charts the tweet/mention counts. */
const CARD_METADATA_KEY = /^(?:short_title|(?:tweets?|mentions?)_?count|(?:tweets?|mentions?)Count)$/

function slimMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined
  }
  const slim: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (CARD_METADATA_KEY.test(key) && (typeof value === 'string' || typeof value === 'number')) {
      slim[key] = value
    }
  }
  return slim
}

export function slimMarketForCard(market: Market): Market {
  const slim: Market = { ...market, metadata: slimMetadata(market.metadata) }
  if (market.condition) {
    // The condition repeats the market's outcomes; cards read the market's own copy.
    const condition: Record<string, unknown> = { ...market.condition }
    delete condition.outcomes
    slim.condition = condition as unknown as Market['condition']
  }
  delete slim.market_rules
  delete slim.resolution_source
  delete slim.resolution_source_url
  return slim
}

/**
 * `maxMarkets` caps very large events (Polymarket futures carry 60–110 markets)
 * to the ones a card can show: `keepConditionIds` first, then the highest
 * priced. `total_markets_count` keeps the real count.
 */
export function slimEventForCard(
  event: Event,
  options: { maxMarkets?: number; keepConditionIds?: Iterable<string> } = {},
): Event {
  let markets = event.markets

  if (options.maxMarkets != null && markets.length > options.maxMarkets) {
    const kept = new Set(options.keepConditionIds ?? [])
    const ranked = [...markets]
      .filter((market) => !kept.has(market.condition_id))
      .sort((left, right) => (Number(right.price) || 0) - (Number(left.price) || 0))
    for (const market of ranked) {
      if (kept.size >= options.maxMarkets) {
        break
      }
      kept.add(market.condition_id)
    }
    markets = markets.filter((market) => kept.has(market.condition_id))
  }

  const slim: Event = { ...event, markets: markets.map(slimMarketForCard) }
  delete slim.rules
  delete slim.additional_context
  return slim
}
