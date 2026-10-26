import type { OutcomePrices } from '@/lib/clob-event-prices'

import { POLYMARKET_ENDPOINTS } from '@/lib/polymarket/endpoints'

/**
 * Prices for venue = 'polymarket' tokens from Polymarket's CLOB. It differs
 * from Kuest's API-compatible clone in three ways that matter here:
 * - `/prices` answers only the side asked for, and BUY is the best bid while
 *   SELL is the best ask (Kuest returns both, BUY being the ask);
 * - each request takes at most 500 entries (`/prices`: token × side,
 *   `/last-trades-prices`: tokens), otherwise "Payload exceeds the limit";
 * - tokens with no order book or trades are simply absent from the answer.
 */

const MAX_ENTRIES_PER_REQUEST = 500
const PRICE_TOKENS_PER_REQUEST = MAX_ENTRIES_PER_REQUEST / 2
const CONCURRENT_REQUESTS = 4
const REQUEST_TIMEOUT_MS = 5_000

type PolymarketPriceResponse = Record<string, { BUY?: string; SELL?: string } | undefined>
type PolymarketLastTradeResponse = Array<{ token_id?: string; price?: string | number }>

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

/** Runs `worker` over the chunks with a small concurrency cap; failed chunks are skipped. */
async function forEachChunk<T>(chunks: T[][], worker: (items: T[]) => Promise<void>) {
  let next = 0
  async function run() {
    while (next < chunks.length) {
      const items = chunks[next++]!
      try {
        await worker(items)
      } catch (error) {
        if (!(error instanceof Error && error.name === 'TimeoutError')) {
          console.error('Polymarket price request failed', error)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_REQUESTS, chunks.length) }, run))
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const response = await fetch(`${POLYMARKET_ENDPOINTS.clob}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return response.ok ? ((await response.json()) as T) : null
}

function toPrice(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined
}

/** Converts Polymarket's BUY/SELL (bid/ask) into the app's convention: `buy` = ask, `sell` = bid. */
export function toOutcomePrices(sides: { BUY?: string; SELL?: string } | undefined): OutcomePrices | null {
  const bid = toPrice(sides?.BUY)
  const ask = toPrice(sides?.SELL)
  if (bid == null && ask == null) {
    return null
  }
  return { buy: ask ?? bid, sell: bid ?? ask }
}

export async function fetchPolymarketOutcomePrices(tokenIds: string[]): Promise<Map<string, OutcomePrices>> {
  const prices = new Map<string, OutcomePrices>()
  const unique = Array.from(new Set(tokenIds.filter(Boolean)))
  await forEachChunk(chunk(unique, PRICE_TOKENS_PER_REQUEST), async (tokens) => {
    const body = tokens.flatMap((tokenId) => [
      { token_id: tokenId, side: 'BUY' },
      { token_id: tokenId, side: 'SELL' },
    ])
    const data = await postJson<PolymarketPriceResponse>('/prices', body)
    for (const [tokenId, sides] of Object.entries(data ?? {})) {
      const outcomePrices = toOutcomePrices(sides)
      if (outcomePrices) {
        prices.set(tokenId, outcomePrices)
      }
    }
  })
  return prices
}

export async function fetchPolymarketLastTradePrices(tokenIds: string[]): Promise<Map<string, number>> {
  const lastTrades = new Map<string, number>()
  const unique = Array.from(new Set(tokenIds.filter(Boolean)))
  await forEachChunk(chunk(unique, MAX_ENTRIES_PER_REQUEST), async (tokens) => {
    const data = await postJson<PolymarketLastTradeResponse>(
      '/last-trades-prices',
      tokens.map((tokenId) => ({ token_id: tokenId })),
    )
    for (const entry of data ?? []) {
      const price = toPrice(entry?.price)
      if (entry?.token_id && price != null) {
        lastTrades.set(entry.token_id, price)
      }
    }
  })
  return lastTrades
}
