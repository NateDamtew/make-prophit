import { and, desc, eq } from 'drizzle-orm'

import type { ReferenceRateStatus } from '@/lib/fx/rules'
import type { MobileMoneySettings } from '@/lib/mobile-money/settings'

import { fx_rate_snapshots } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { evaluateReferenceRate, parseUsdRatesResponse } from '@/lib/fx/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'

/**
 * Reference-rate feed and snapshot store. The feed is only ever used for
 * order-book trades and treasury conversions; deposits, payouts and pools
 * never touch it (see LOCAL-PAYMENTS-DESIGN.md §8).
 *
 * Providers (both return `{ result, rates }` keyed off USD):
 * - exchangerate-api.com keyed endpoint when FX_RATES_API_KEY is set
 *   (hourly updates on paid tiers)
 * - open.er-api.com otherwise (free, no key, daily updates)
 */

const FX_REQUEST_TIMEOUT_MS = 15_000

export interface FxSnapshotRow {
  id: string
  currency: string
  rate_per_usd: string
  source: string
  is_override: boolean
  fetched_at: Date
}

export function resolveFxFeedUrl(env: NodeJS.ProcessEnv = process.env): { url: string; source: string } {
  const override = env.FX_RATES_API_URL?.trim()
  if (override) {
    return { url: override, source: 'custom' }
  }
  const key = env.FX_RATES_API_KEY?.trim()
  if (key) {
    return {
      url: `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/USD`,
      source: 'exchangerate-api',
    }
  }
  return { url: 'https://open.er-api.com/v6/latest/USD', source: 'open-er-api' }
}

export async function fetchUsdRates(
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ rates: Record<string, number>; source: string }> {
  const { url, source } = resolveFxFeedUrl(env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FX_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`FX feed ${source} responded ${response.status}`)
    }
    const rates = parseUsdRatesResponse(await response.json())
    if (!rates) {
      throw new Error(`FX feed ${source} returned an unexpected payload`)
    }
    return { rates, source }
  } finally {
    clearTimeout(timer)
  }
}

export const FxRateRepository = {
  async insertSnapshot(input: {
    currency: string
    ratePerUsd: number
    source: string
    isOverride?: boolean
  }): Promise<FxSnapshotRow> {
    const [row] = await db
      .insert(fx_rate_snapshots)
      .values({
        currency: input.currency.toUpperCase(),
        rate_per_usd: input.ratePerUsd.toFixed(6),
        source: input.source,
        is_override: input.isOverride ?? false,
      })
      .returning()
    return row as FxSnapshotRow
  },

  /** Latest two feed snapshots (overrides excluded; they live in settings). */
  async latestFeedSnapshots(currency: string, limit = 2): Promise<FxSnapshotRow[]> {
    return (await db
      .select()
      .from(fx_rate_snapshots)
      .where(and(eq(fx_rate_snapshots.currency, currency.toUpperCase()), eq(fx_rate_snapshots.is_override, false)))
      .orderBy(desc(fx_rate_snapshots.fetched_at))
      .limit(limit)) as FxSnapshotRow[]
  },

  async history(currency: string, limit = 48): Promise<FxSnapshotRow[]> {
    return (await db
      .select()
      .from(fx_rate_snapshots)
      .where(eq(fx_rate_snapshots.currency, currency.toUpperCase()))
      .orderBy(desc(fx_rate_snapshots.fetched_at))
      .limit(Math.min(Math.max(limit, 1), 500))) as FxSnapshotRow[]
  },
}

function toLike(row: FxSnapshotRow | undefined) {
  return row
    ? {
        ratePerUsd: Number(row.rate_per_usd),
        fetchedAt: row.fetched_at,
        isOverride: row.is_override,
        source: row.source,
      }
    : null
}

/** Reference rate for one currency with the safety rails applied. Null when nothing is known yet. */
export async function getReferenceRate(
  currency: string,
  settings?: MobileMoneySettings,
): Promise<ReferenceRateStatus | null> {
  const resolvedSettings = settings ?? (await getMobileMoneySettings())
  const config = resolvedSettings.currencies[currency.toUpperCase()]
  const [latest, previous] = await FxRateRepository.latestFeedSnapshots(currency, 2)
  return evaluateReferenceRate({
    latest: toLike(latest),
    previous: toLike(previous),
    overridePerUsd: config?.rateOverridePerUsd ?? null,
    marginBps: config?.marginBps ?? 0,
  })
}

/** Fetch the feed once and store one snapshot per enabled currency. */
export async function refreshFxSnapshots(options: { fetchImpl?: typeof fetch; settings?: MobileMoneySettings } = {}) {
  const settings = options.settings ?? (await getMobileMoneySettings())
  const { rates, source } = await fetchUsdRates(options.fetchImpl)
  const stored: Array<{ currency: string; ratePerUsd: number }> = []
  const missing: string[] = []
  for (const currency of settings.enabledCurrencies) {
    const rate = rates[currency]
    if (!rate) {
      missing.push(currency)
      continue
    }
    await FxRateRepository.insertSnapshot({ currency, ratePerUsd: rate, source })
    stored.push({ currency, ratePerUsd: rate })
  }
  return { source, stored, missing }
}
