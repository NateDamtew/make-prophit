import { POLYMARKET_ENDPOINTS } from '@/lib/polymarket/endpoints'

/**
 * Typed reads from Polymarket's public Gamma API (no auth, CORS-open).
 * Only the fields Prophit uses are typed; Gamma returns many more.
 */

export interface GammaTag {
  id: string
  label: string
  slug: string
}

export interface GammaTeam {
  name?: string | null
  abbreviation?: string | null
  record?: string | null
  color?: string | null
  logo?: string | null
  league?: string | null
  ordering?: string | null
}

export interface GammaMarket {
  id: string
  conditionId: string
  questionID?: string | null
  question: string
  slug: string
  description?: string | null
  groupItemTitle?: string | null
  groupItemThreshold?: string | null
  /** JSON-encoded string arrays, e.g. '["Yes", "No"]'. */
  outcomes?: string | null
  outcomePrices?: string | null
  clobTokenIds?: string | null
  endDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  umaResolutionStatus?: string | null
  resolutionSource?: string | null
  resolvedBy?: string | null
  negRisk?: boolean
  negRiskOther?: boolean
  negRiskMarketID?: string | null
  negRiskRequestID?: string | null
  sportsMarketType?: string | null
  line?: number | string | null
  gameStartTime?: string | null
  icon?: string | null
  image?: string | null
  volume?: string | number | null
  volume24hr?: string | number | null
  liquidity?: string | number | null
  orderMinSize?: number | null
  orderPriceMinTickSize?: number | null
}

export interface GammaEvent {
  id: string
  slug: string
  title: string
  description?: string | null
  resolutionSource?: string | null
  icon?: string | null
  image?: string | null
  startDate?: string | null
  endDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  active?: boolean
  closed?: boolean
  archived?: boolean
  negRisk?: boolean
  enableNegRisk?: boolean
  negRiskAugmented?: boolean
  negRiskMarketID?: string | null
  showMarketImages?: boolean
  volume?: number | null
  volume24hr?: number | null
  liquidity?: number | null
  tags?: GammaTag[]
  markets?: GammaMarket[]
  // Sports games only
  /** Gamma sends the sport as an object on game events ({ sport: 'nba', name, image… }); older payloads used a plain code. */
  sport?: string | { sport?: string | null; name?: string | null } | null
  gameId?: number | null
  startTime?: string | null
  eventDate?: string | null
  eventWeek?: number | null
  seriesSlug?: string | null
  series?: { id?: string; slug?: string; recurrence?: string | null }[] | null
  teams?: GammaTeam[] | null
  score?: string | null
  period?: string | null
  elapsed?: string | null
  live?: boolean | null
  ended?: boolean | null
}

export interface GammaSport {
  id: number
  sport: string
  name?: string | null
  image?: string | null
  /** Comma-separated tag ids. */
  tags?: string | null
  primaryTagId?: number | null
  series?: string | null
}

export interface ListGammaEventsParams {
  tagSlug?: string
  ids?: string[]
  limit?: number
  offset?: number
  order?: 'volume24hr' | 'volume' | 'liquidity' | 'startDate' | 'endDate'
  ascending?: boolean
  active?: boolean
  closed?: boolean
  endDateMin?: string
  endDateMax?: string
}

const GAMMA_TIMEOUT_MS = 15_000
const GAMMA_MAX_PAGE = 100

async function gammaGet<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = new URL(path, POLYMARKET_ENDPOINTS.gamma)
  if (params) {
    url.search = params.toString()
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(GAMMA_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Gamma ${url.pathname} responded ${response.status}`)
  }
  return (await response.json()) as T
}

export async function listGammaEvents(params: ListGammaEventsParams): Promise<GammaEvent[]> {
  const search = new URLSearchParams()
  if (params.tagSlug) {
    search.set('tag_slug', params.tagSlug)
  }
  for (const id of params.ids ?? []) {
    search.append('id', id)
  }
  search.set('limit', String(Math.min(params.limit ?? GAMMA_MAX_PAGE, GAMMA_MAX_PAGE)))
  if (params.offset) {
    search.set('offset', String(params.offset))
  }
  if (params.order) {
    search.set('order', params.order)
    search.set('ascending', String(params.ascending ?? false))
  }
  if (params.active !== undefined) {
    search.set('active', String(params.active))
  }
  if (params.closed !== undefined) {
    search.set('closed', String(params.closed))
  }
  if (params.endDateMin) {
    search.set('end_date_min', params.endDateMin)
  }
  if (params.endDateMax) {
    search.set('end_date_max', params.endDateMax)
  }
  return await gammaGet<GammaEvent[]>('/events', search)
}

/** Fetches events by Gamma id in pages of 100 (closed ones included, for resolution). */
export async function getGammaEventsByIds(ids: string[]): Promise<GammaEvent[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const results: GammaEvent[] = []
  for (let i = 0; i < unique.length; i += GAMMA_MAX_PAGE) {
    results.push(...(await listGammaEvents({ ids: unique.slice(i, i + GAMMA_MAX_PAGE), limit: GAMMA_MAX_PAGE })))
  }
  return results
}

export async function searchGammaEvents(query: string, limit = 20): Promise<GammaEvent[]> {
  const search = new URLSearchParams({ q: query, limit_per_type: String(limit), events_status: 'active' })
  const result = await gammaGet<{ events?: GammaEvent[] }>('/public-search', search)
  return result.events ?? []
}

export async function getGammaTagBySlug(slug: string): Promise<GammaTag | null> {
  try {
    const tag = await gammaGet<GammaTag | null>(`/tags/slug/${encodeURIComponent(slug)}`)
    return tag?.slug ? tag : null
  } catch {
    return null
  }
}

export async function getGammaTagById(id: string | number): Promise<GammaTag | null> {
  try {
    const tag = await gammaGet<GammaTag | null>(`/tags/${encodeURIComponent(String(id))}`)
    return tag?.slug ? tag : null
  } catch {
    return null
  }
}

export async function listGammaSports(): Promise<GammaSport[]> {
  return await gammaGet<GammaSport[]>('/sports')
}

export function parseGammaStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String)
  }
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function toGammaNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}
