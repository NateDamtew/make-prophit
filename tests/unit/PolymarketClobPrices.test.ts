import { afterEach, describe, expect, it } from 'bun:test'

import { hasHomeCardMarketChance } from '@/app/[locale]/(platform)/(home)/_utils/homeCardMarketDisplay'
import {
  fetchPolymarketLastTradePrices,
  fetchPolymarketOutcomePrices,
  toOutcomePrices,
} from '@/lib/polymarket/clob-prices'
import { isPolymarketClobUrl } from '@/lib/polymarket/endpoints'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(handler: (url: string, body: any) => unknown) {
  const calls: Array<{ url: string; body: any }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? 'null'))
    calls.push({ url, body })
    return new Response(JSON.stringify(handler(url, body)), { status: 200 })
  }) as typeof fetch
  return calls
}

describe('polymarket clob prices', () => {
  it('reads BUY as the bid and SELL as the ask', () => {
    // Arsenal-like two-sided book and a long shot with no bids.
    expect(toOutcomePrices({ BUY: '0.64', SELL: '0.66' })).toEqual({ buy: 0.66, sell: 0.64 })
    expect(toOutcomePrices({ BUY: '0', SELL: '0.001' })).toEqual({ buy: 0.001, sell: 0 })
    expect(toOutcomePrices({ SELL: '0.2' })).toEqual({ buy: 0.2, sell: 0.2 })
    expect(toOutcomePrices(undefined)).toBeNull()
    expect(toOutcomePrices({ BUY: 'oops' })).toBeNull()
  })

  it('asks for both sides and stays within 500 entries per request', async () => {
    const tokens = Array.from({ length: 600 }, (_, index) => `t${index}`)
    const calls = mockFetch((_url, body: Array<{ token_id: string; side: string }>) =>
      Object.fromEntries(
        body.filter((entry) => entry.side === 'BUY').map((entry) => [entry.token_id, { BUY: '0.4', SELL: '0.42' }]),
      ),
    )
    const prices = await fetchPolymarketOutcomePrices(tokens)
    expect(calls.every((call) => call.url.endsWith('/prices') && call.body.length <= 500)).toBe(true)
    expect(calls.reduce((sum, call) => sum + call.body.length, 0)).toBe(1200)
    expect(prices.size).toBe(600)
    expect(prices.get('t599')).toEqual({ buy: 0.42, sell: 0.4 })
  })

  it('chunks last trades to 500 tokens and keeps valid prices only', async () => {
    const tokens = Array.from({ length: 1001 }, (_, index) => `t${index}`)
    const calls = mockFetch((_url, body: Array<{ token_id: string }>) =>
      body.map((entry, index) => ({ token_id: entry.token_id, price: index === 0 ? 'nope' : '0.25' })),
    )
    const trades = await fetchPolymarketLastTradePrices(tokens)
    expect(calls.map((call) => call.body.length).sort((a, b) => b - a)).toEqual([500, 500, 1])
    expect(trades.size).toBe(1001 - 3)
  })

  it('recognises Polymarket’s CLOB url', () => {
    expect(isPolymarketClobUrl('https://clob.polymarket.com')).toBe(true)
    expect(isPolymarketClobUrl('https://clob.polymarket.com/')).toBe(true)
    expect(isPolymarketClobUrl('https://clob.kuest.com')).toBe(false)
    expect(isPolymarketClobUrl(null)).toBe(false)
  })

  it('never gives an unpriced market a chance, even with volume', () => {
    const market = {
      volume: 5_000,
      volume_24h: 100,
      condition: undefined,
      outcomes: [],
      price_unavailable: true,
    } as any
    expect(hasHomeCardMarketChance(market)).toBe(false)
    expect(hasHomeCardMarketChance(market, 0.3)).toBe(true)
    expect(hasHomeCardMarketChance({ ...market, price_unavailable: undefined })).toBe(true)
  })
})
