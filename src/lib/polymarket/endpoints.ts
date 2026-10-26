import type { PublicRuntimeConfig } from '@/lib/public-runtime-config.shared'

/**
 * Polymarket's public services. Kuest runs API-compatible clones of these, so
 * pages for venue = 'polymarket' events reuse the same hooks with these URLs.
 */
export const POLYMARKET_ENDPOINTS = {
  clob: 'https://clob.polymarket.com',
  data: 'https://data-api.polymarket.com',
  gamma: 'https://gamma-api.polymarket.com',
  bridge: 'https://bridge.polymarket.com',
  wsClob: 'wss://ws-subscriptions-clob.polymarket.com',
  site: 'https://polymarket.com',
} as const

export type EventVenue = 'kuest' | 'polymarket'

export function isPolymarketClobUrl(url: string | null | undefined) {
  return Boolean(url) && url!.replace(/\/+$/, '') === POLYMARKET_ENDPOINTS.clob
}

export function normalizeEventVenue(value: unknown): EventVenue {
  return value === 'polymarket' ? 'polymarket' : 'kuest'
}

/** Runtime-config fields that point at Polymarket for a venue = 'polymarket' subtree. */
export function polymarketRuntimeConfigOverrides(): Pick<
  PublicRuntimeConfig,
  'clobUrl' | 'dataUrl' | 'gammaUrl' | 'wsClobUrl'
> {
  return {
    clobUrl: POLYMARKET_ENDPOINTS.clob,
    dataUrl: POLYMARKET_ENDPOINTS.data,
    gammaUrl: POLYMARKET_ENDPOINTS.gamma,
    wsClobUrl: POLYMARKET_ENDPOINTS.wsClob,
  }
}
