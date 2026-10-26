import { describe, expect, it } from 'bun:test'

import type { Event, Market } from '@/types'

import { slimEventForCard, slimMarketForCard } from '@/lib/event-card-payload'

function buildMarket(id: string, price: number, extra: Partial<Market> = {}) {
  return {
    condition_id: id,
    title: `Market ${id}`,
    price,
    market_rules: 'Long rules text',
    resolution_source: 'https://example.com',
    resolution_source_url: 'https://example.com/source',
    question: 'Will it happen?',
    metadata: {
      short_title: 'Short',
      tweet_count: 12,
      name: 'Name',
      outcomes: [{ outcome: 'Yes' }],
      description: 'x'.repeat(500),
    },
    condition: { id, oracle: '0xoracle', resolved: false, outcomes: [{ outcome_text: 'Yes' }] },
    ...extra,
  } as unknown as Market
}

function buildEvent(markets: Market[]) {
  return {
    id: 'e1',
    title: 'Event',
    rules: 'Event rules',
    additional_context: 'Context',
    total_markets_count: markets.length,
    markets,
  } as unknown as Event
}

describe('event card payload', () => {
  it('drops rules, sources and nested metadata but keeps the question and short scalar metadata', () => {
    const slim = slimMarketForCard(buildMarket('a', 0.5))
    expect(slim.market_rules).toBeUndefined()
    expect(slim.resolution_source).toBeUndefined()
    expect(slim.resolution_source_url).toBeUndefined()
    expect(slim.question).toBe('Will it happen?')
    expect(slim.metadata).toEqual({ short_title: 'Short', tweet_count: 12 })
    expect(slim.condition).toEqual({ id: 'a', oracle: '0xoracle', resolved: false } as Market['condition'])
    expect(slim.title).toBe('Market a')
  })

  it('drops event rules and context and slims every market', () => {
    const slim = slimEventForCard(buildEvent([buildMarket('a', 0.5), buildMarket('b', 0.2)]))
    expect(slim.rules).toBeUndefined()
    expect(slim.additional_context).toBeUndefined()
    expect(slim.markets.map((market) => market.condition_id)).toEqual(['a', 'b'])
    expect(slim.markets.every((market) => market.market_rules === undefined)).toBe(true)
  })

  it('caps large events to the kept markets plus the highest priced, in their original order', () => {
    const event = buildEvent([
      buildMarket('low', 0.01),
      buildMarket('mid', 0.3),
      buildMarket('kept', 0.02),
      buildMarket('top', 0.6),
      buildMarket('second', 0.4),
    ])
    const slim = slimEventForCard(event, { maxMarkets: 3, keepConditionIds: ['kept'] })
    expect(slim.markets.map((market) => market.condition_id)).toEqual(['kept', 'top', 'second'])
    expect(slim.total_markets_count).toBe(5)
  })

  it('leaves the market list alone without a cap', () => {
    const event = buildEvent([buildMarket('a', 0.1), buildMarket('b', 0.2), buildMarket('c', 0.3)])
    expect(slimEventForCard(event).markets).toHaveLength(3)
  })
})
