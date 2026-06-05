'use client'

import { useQuery } from '@tanstack/react-query'

interface UseCardPriceHistoryArgs {
  tokenId: string
  createdAtIso: string
  resolvedAtIso: string | null
  /** Only fetch when the card is the active/visible one. */
  enabled: boolean
}

export interface PricePoint {
  /** Unix seconds. */
  t: number
  /** 0–1 probability. */
  p: number
}

export interface CardPriceHistory {
  points: PricePoint[]
  /** First → last delta as a percentage (rounded). Positive = up, negative = down. */
  deltaPercent: number
}

const CLOB_URL = process.env.CLOB_URL ?? 'https://clob.kuest.com'
const MAX_POINTS = 28

/**
 * Sample the points down to a maximum count for a compact sparkline path.
 * Preserves first/last and evenly samples in between.
 */
function samplePoints(points: PricePoint[]): PricePoint[] {
  if (points.length <= MAX_POINTS) {
    return points
  }
  const sampled: PricePoint[] = []
  const seen = new Set<number>()
  for (let i = 0; i < MAX_POINTS; i += 1) {
    const idx = Math.round((i * (points.length - 1)) / (MAX_POINTS - 1))
    if (seen.has(idx)) {
      continue
    }
    seen.add(idx)
    const point = points[idx]
    if (point) {
      sampled.push(point)
    }
  }
  return sampled
}

/**
 * Pick a fidelity (minutes per bucket) appropriate to the market's age.
 * Mirrors the OG card route so the sparkline matches what social previews show.
 */
function fidelityForSpan(spanSeconds: number): number {
  if (spanSeconds <= 2 * 24 * 60 * 60) {
    return 5
  }
  if (spanSeconds <= 7 * 24 * 60 * 60) {
    return 30
  }
  if (spanSeconds <= 30 * 24 * 60 * 60) {
    return 180
  }
  return 720
}

async function fetchPriceHistory({
  tokenId,
  createdAtIso,
  resolvedAtIso,
}: Omit<UseCardPriceHistoryArgs, 'enabled'>): Promise<CardPriceHistory> {
  if (!tokenId) {
    return { points: [], deltaPercent: 0 }
  }

  const createdMs = new Date(createdAtIso).getTime()
  const resolvedMs = resolvedAtIso ? new Date(resolvedAtIso).getTime() : Number.NaN
  const nowMs = Math.min(
    Date.now(),
    Number.isFinite(resolvedMs) ? resolvedMs : Number.POSITIVE_INFINITY,
  )
  const createdSec = Number.isFinite(createdMs)
    ? Math.floor(createdMs / 1000)
    : Math.floor(Date.now() / 1000) - 24 * 60 * 60
  const endSec = Math.max(createdSec + 60, Math.floor(nowMs / 1000))
  const ageSec = Math.max(0, endSec - createdSec)

  const url = new URL(`${CLOB_URL}/prices-history`)
  url.searchParams.set('market', tokenId)
  url.searchParams.set('fidelity', fidelityForSpan(ageSec).toString())
  url.searchParams.set('startTs', createdSec.toString())
  url.searchParams.set('endTs', endSec.toString())

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) {
    return { points: [], deltaPercent: 0 }
  }

  const payload = await response.json() as { history?: PricePoint[] }
  const raw = (payload.history ?? [])
    .map(point => ({ t: Number(point.t), p: Number(point.p) }))
    .filter(point => Number.isFinite(point.t) && Number.isFinite(point.p))
    .filter(point => point.p >= 0 && point.p <= 1)
    .sort((a, b) => a.t - b.t)

  if (raw.length < 2) {
    return { points: raw, deltaPercent: 0 }
  }

  const first = raw[0]!.p
  const last = raw.at(-1)!.p
  const deltaPercent = Math.round((last - first) * 100)

  return { points: samplePoints(raw), deltaPercent }
}

/**
 * Fetch (and cache) price history for the YES side of a Flash Trade card.
 * Only enabled for the currently-active card so we don't hammer the CLOB while
 * the user is swiping. Cached for 5 minutes via React Query so revisiting a
 * recently-seen card is instant.
 */
export function useCardPriceHistory({
  tokenId,
  createdAtIso,
  resolvedAtIso,
  enabled,
}: UseCardPriceHistoryArgs) {
  const query = useQuery({
    queryKey: ['quick-view-history', tokenId],
    enabled: enabled && Boolean(tokenId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchPriceHistory({ tokenId, createdAtIso, resolvedAtIso }),
  })

  return {
    history: query.data ?? { points: [], deltaPercent: 0 },
    isLoading: query.isLoading,
  }
}
