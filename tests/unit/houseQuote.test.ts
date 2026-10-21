import { describe, expect, it } from 'bun:test'

import { quoteBuy, quoteSell, settledPayout } from '@/lib/house/quote'

describe('house quote', () => {
  it('converts a local stake to shares and a fixed local payout', () => {
    // 650 KES at 130/USD = $5.00; 1.5% margin → $4.92; at 65¢ → 7.569230 shares → payout $7.56 → 983.60 KES... floors
    const quote = quoteBuy({ localStake: 65_000n, ratePerUsd: 130, marginBps: 150, priceCents: 65 })
    expect(quote).not.toBeNull()
    expect(quote!.usdCents).toBe(492n)
    expect(quote!.sharesMicro).toBe(7_569_230n)
    expect(quote!.fixedLocalPayout).toBe(98_280n) // 756 cents × 130 = 982.80 KES
    expect(quote!.fixedLocalPayout).toBeGreaterThan(65_000n)
  })

  it('rejects invalid inputs', () => {
    expect(quoteBuy({ localStake: 0n, ratePerUsd: 130, marginBps: 150, priceCents: 65 })).toBeNull()
    expect(quoteBuy({ localStake: 65_000n, ratePerUsd: 0, marginBps: 150, priceCents: 65 })).toBeNull()
    expect(quoteBuy({ localStake: 65_000n, ratePerUsd: 130, marginBps: 150, priceCents: 100 })).toBeNull()
    expect(quoteBuy({ localStake: 1n, ratePerUsd: 130, marginBps: 150, priceCents: 65 })).toBeNull() // rounds to 0 cents
  })

  it('values a sell back into local currency with margin', () => {
    const sell = quoteSell({ sharesMicro: 7_569_230n, ratePerUsd: 130, marginBps: 150, priceCents: 70 })
    expect(sell!.usdCents).toBe(529n)
    expect(sell!.localProceeds).toBe(67_738n) // 529¢ × 130 = 687.70 KES, less 1.5%
  })

  it('settles fixed payouts by payout fraction', () => {
    expect(settledPayout(100_000n, 1)).toBe(100_000n)
    expect(settledPayout(100_000n, 0)).toBe(0n)
    expect(settledPayout(100_000n, 0.5)).toBe(50_000n)
    expect(settledPayout(100_000n, 2)).toBe(100_000n)
  })
})
