/**
 * Pure FX rules: staleness, jump detection, and margin application.
 * Rates are "local minor-currency units per 1 USD" as a decimal string/number.
 */

export const FX_STALE_AFTER_MS = 30 * 60_000
export const FX_JUMP_PAUSE_BPS = 200 // 2%
export const FX_STALE_EXTRA_MARGIN_BPS = 100 // +1 point when the feed is stale

export interface RateSnapshotLike {
  ratePerUsd: number
  fetchedAt: Date
  isOverride: boolean
  source: string
}

export type ReferenceRateStatus = {
  ratePerUsd: number
  source: string
  fetchedAt: Date
  isOverride: boolean
  stale: boolean
  /** Set when the last two feed snapshots differ by more than FX_JUMP_PAUSE_BPS. */
  jumpBps: number | null
  paused: boolean
  /** Effective margin after safety rails, in bps. */
  effectiveMarginBps: number
}

export function bpsBetween(previous: number, current: number): number {
  if (!(previous > 0) || !(current > 0)) {
    return 0
  }
  return Math.round((Math.abs(current - previous) / previous) * 10_000)
}

/**
 * Combine the latest snapshots with the configured margin and an optional
 * admin override. Override wins and is never stale or paused.
 */
export function evaluateReferenceRate(params: {
  latest: RateSnapshotLike | null
  previous: RateSnapshotLike | null
  overridePerUsd: number | null
  marginBps: number
  now?: Date
}): ReferenceRateStatus | null {
  const now = params.now ?? new Date()
  if (params.overridePerUsd && params.overridePerUsd > 0) {
    return {
      ratePerUsd: params.overridePerUsd,
      source: 'admin_override',
      fetchedAt: now,
      isOverride: true,
      stale: false,
      jumpBps: null,
      paused: false,
      effectiveMarginBps: params.marginBps,
    }
  }
  if (!params.latest) {
    return null
  }
  const stale = now.getTime() - params.latest.fetchedAt.getTime() > FX_STALE_AFTER_MS
  const jumpBps = params.previous ? bpsBetween(params.previous.ratePerUsd, params.latest.ratePerUsd) : null
  const paused = jumpBps !== null && jumpBps > FX_JUMP_PAUSE_BPS
  return {
    ratePerUsd: params.latest.ratePerUsd,
    source: params.latest.source,
    fetchedAt: params.latest.fetchedAt,
    isOverride: false,
    stale,
    jumpBps,
    paused,
    effectiveMarginBps: params.marginBps + (stale ? FX_STALE_EXTRA_MARGIN_BPS : 0),
  }
}

/**
 * Convert a local stake (minor units) into USD cents at the reference rate
 * less the platform margin: the user gets slightly fewer dollars than
 * mid-market. Floors to whole cents.
 */
export function localToUsdCents(localMinor: bigint, ratePerUsd: number, marginBps: number): bigint {
  if (localMinor <= 0n || !(ratePerUsd > 0)) {
    return 0n
  }
  // cents = localMinor / rate * (1 - margin). Work in integers: scale rate by 1e6.
  const rateScaled = BigInt(Math.round(ratePerUsd * 1_000_000))
  const marginFactor = BigInt(10_000 - marginBps)
  return (localMinor * 1_000_000n * marginFactor) / (rateScaled * 10_000n)
}

/** USD cents → local minor units at the reference rate (no margin), floored. */
export function usdCentsToLocal(usdCents: bigint, ratePerUsd: number): bigint {
  if (usdCents <= 0n || !(ratePerUsd > 0)) {
    return 0n
  }
  const rateScaled = BigInt(Math.round(ratePerUsd * 1_000_000))
  return (usdCents * rateScaled) / 1_000_000n
}

/** Parse the response of open.er-api.com / exchangerate-api.com (both: { result, rates: { KES: 129.4 } }). */
export function parseUsdRatesResponse(body: unknown): Record<string, number> | null {
  if (!body || typeof body !== 'object') {
    return null
  }
  const record = body as {
    result?: string
    rates?: Record<string, unknown>
    conversion_rates?: Record<string, unknown>
  }
  if (record.result && record.result !== 'success') {
    return null
  }
  const rates = record.rates ?? record.conversion_rates
  if (!rates || typeof rates !== 'object') {
    return null
  }
  const parsed: Record<string, number> = {}
  for (const [code, value] of Object.entries(rates)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && /^[A-Z]{3}$/.test(code)) {
      parsed[code] = value
    }
  }
  return parsed
}
