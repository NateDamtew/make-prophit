import { describe, expect, it } from 'bun:test'

import { resolveFxFeedUrl } from '@/lib/fx/rates'
import {
  bpsBetween,
  evaluateReferenceRate,
  localToUsdCents,
  parseUsdRatesResponse,
  usdCentsToLocal,
} from '@/lib/fx/rules'

const NOW = new Date('2026-10-20T12:00:00Z')

function snap(ratePerUsd: number, minutesAgo: number, source = 'open-er-api') {
  return { ratePerUsd, fetchedAt: new Date(NOW.getTime() - minutesAgo * 60_000), isOverride: false, source }
}

describe('evaluateReferenceRate', () => {
  it('uses the feed with the configured margin when fresh and steady', () => {
    const status = evaluateReferenceRate({
      latest: snap(129.5, 5),
      previous: snap(129.3, 15),
      overridePerUsd: null,
      marginBps: 150,
      now: NOW,
    })
    expect(status).toMatchObject({
      ratePerUsd: 129.5,
      stale: false,
      paused: false,
      effectiveMarginBps: 150,
      isOverride: false,
    })
    expect(status?.jumpBps).toBe(15)
  })

  it('widens the margin by one point when the feed is stale', () => {
    const status = evaluateReferenceRate({
      latest: snap(129.5, 45),
      previous: null,
      overridePerUsd: null,
      marginBps: 150,
      now: NOW,
    })
    expect(status?.stale).toBe(true)
    expect(status?.effectiveMarginBps).toBe(250)
  })

  it('pauses on a jump above 2% and never pauses an admin override', () => {
    const jumped = evaluateReferenceRate({
      latest: snap(135, 1),
      previous: snap(129, 11),
      overridePerUsd: null,
      marginBps: 150,
      now: NOW,
    })
    expect(jumped?.paused).toBe(true)
    expect(jumped?.jumpBps).toBe(465)
    const override = evaluateReferenceRate({
      latest: snap(135, 1),
      previous: snap(129, 11),
      overridePerUsd: 130,
      marginBps: 150,
      now: NOW,
    })
    expect(override).toMatchObject({
      ratePerUsd: 130,
      isOverride: true,
      paused: false,
      stale: false,
      source: 'admin_override',
    })
    expect(evaluateReferenceRate({ latest: null, previous: null, overridePerUsd: null, marginBps: 150 })).toBeNull()
  })
})

describe('conversions', () => {
  it('converts local stakes to USD cents with margin, flooring', () => {
    // 650 KES at 130 KES/USD = $5.00; 1.5% margin → $4.925 → 492 cents
    expect(localToUsdCents(65_000n, 130, 150)).toBe(492n)
    expect(localToUsdCents(65_000n, 130, 0)).toBe(500n)
    expect(localToUsdCents(0n, 130, 150)).toBe(0n)
    expect(localToUsdCents(65_000n, 0, 150)).toBe(0n)
  })

  it('converts USD cents back to local minor units, flooring', () => {
    expect(usdCentsToLocal(769n, 130)).toBe(99_970n) // $7.69 → 999.70 KES
    expect(usdCentsToLocal(100n, 129.4567)).toBe(12_945n)
  })

  it('bpsBetween is symmetric in sign and guards zero', () => {
    expect(bpsBetween(100, 102)).toBe(200)
    expect(bpsBetween(100, 98)).toBe(200)
    expect(bpsBetween(0, 98)).toBe(0)
  })
})

describe('feed parsing and selection', () => {
  it('parses both provider shapes and drops junk', () => {
    expect(parseUsdRatesResponse({ result: 'success', rates: { KES: 129.4, UGX: 3700, bad: 1, ZZZ: -1 } })).toEqual({
      KES: 129.4,
      UGX: 3700,
    })
    expect(parseUsdRatesResponse({ result: 'success', conversion_rates: { KES: 129.4 } })).toEqual({ KES: 129.4 })
    expect(parseUsdRatesResponse({ result: 'error' })).toBeNull()
    expect(parseUsdRatesResponse(null)).toBeNull()
  })

  it('prefers a custom URL, then the keyed provider, then the free feed', () => {
    expect(resolveFxFeedUrl({})).toEqual({ url: 'https://open.er-api.com/v6/latest/USD', source: 'open-er-api' })
    expect(resolveFxFeedUrl({ FX_RATES_API_KEY: 'abc' })).toEqual({
      url: 'https://v6.exchangerate-api.com/v6/abc/latest/USD',
      source: 'exchangerate-api',
    })
    expect(resolveFxFeedUrl({ FX_RATES_API_URL: 'https://x.test/rates', FX_RATES_API_KEY: 'abc' })).toEqual({
      url: 'https://x.test/rates',
      source: 'custom',
    })
  })
})
