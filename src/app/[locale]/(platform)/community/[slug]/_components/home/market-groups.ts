import type { PresetMarket } from '../presets/types'

/**
 * Pure helpers that sort a community's markets into the groups every home
 * layout draws: open, closing soon, with the jury, held, and resolved.
 */

export type MarketGroup = 'open' | 'closing' | 'deciding' | 'held' | 'resolved'

const CLOSING_WINDOW_MS = 48 * 60 * 60 * 1000

function groupOf(market: PresetMarket, now: number): MarketGroup {
  const pool = market.pool ?? null
  if (
    market.status === 'resolved' ||
    market.status === 'cancelled' ||
    market.status === 'disputed' ||
    pool?.state === 'settled' ||
    pool?.state === 'cancelled'
  ) {
    return 'resolved'
  }
  if (pool?.state === 'held') {
    return 'held'
  }
  const closesAt = market.resolution_date ? new Date(market.resolution_date).getTime() : null
  if (pool?.state === 'closed' || (closesAt !== null && closesAt <= now)) {
    return 'deciding'
  }
  if (closesAt !== null && closesAt - now < CLOSING_WINDOW_MS) {
    return 'closing'
  }
  return 'open'
}

export function poolTotal(market: PresetMarket): bigint {
  const pool = market.pool ?? null
  return pool ? BigInt(pool.totalYesMinor) + BigInt(pool.totalNoMinor) : 0n
}

function byClose(a: PresetMarket, b: PresetMarket) {
  const aT = a.resolution_date ? new Date(a.resolution_date).getTime() : Number.POSITIVE_INFINITY
  const bT = b.resolution_date ? new Date(b.resolution_date).getTime() : Number.POSITIVE_INFINITY
  return aT - bT
}

export function groupMarkets(markets: PresetMarket[], now: number): Record<MarketGroup, PresetMarket[]> {
  const groups: Record<MarketGroup, PresetMarket[]> = { open: [], closing: [], deciding: [], held: [], resolved: [] }
  for (const market of markets) {
    groups[groupOf(market, now)].push(market)
  }
  groups.closing.sort(byClose)
  groups.deciding.sort(byClose)
  groups.open.sort((a, b) => {
    const diff = poolTotal(b) - poolTotal(a)
    if (diff !== 0n) {
      return diff > 0n ? 1 : -1
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  groups.resolved.sort((a, b) => {
    const aT = a.resolved_at ? new Date(a.resolved_at).getTime() : new Date(a.created_at).getTime()
    const bT = b.resolved_at ? new Date(b.resolved_at).getTime() : new Date(b.created_at).getTime()
    return bT - aT
  })
  return groups
}

/** The market with the most money in it, among the ones still open. */
export function leadMarket(markets: PresetMarket[], now: number, pinnedId: string | null = null): PresetMarket | null {
  if (pinnedId) {
    const pinned = markets.find((market) => market.id === pinnedId)
    if (pinned) {
      return pinned
    }
  }
  const live = markets.filter((market) => {
    const group = groupOf(market, now)
    return group === 'open' || group === 'closing'
  })
  if (live.length === 0) {
    return null
  }
  return live.reduce((best, market) => (poolTotal(market) > poolTotal(best) ? market : best), live[0]!)
}

/** Markets grouped by the calendar day they close (for fixtures). */
export function groupByCloseDay(
  markets: PresetMarket[],
  locale: string,
): Array<{ key: string; label: string; markets: PresetMarket[] }> {
  const map = new Map<string, { label: string; markets: PresetMarket[] }>()
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' })
  for (const market of markets) {
    const date = market.resolution_date ? new Date(market.resolution_date) : null
    const key = date ? date.toISOString().slice(0, 10) : 'none'
    const label = date ? formatter.format(date) : 'No close date'
    const entry = map.get(key) ?? { label, markets: [] }
    entry.markets.push(market)
    map.set(key, entry)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value }))
}
