import { describe, expect, it } from 'bun:test'

import { decideTier, DEFAULT_TIER_THRESHOLDS, meetsThresholds, parseTierThresholds } from '@/lib/pools/tiering'

const NOW = new Date('2026-10-20T00:00:00Z')
const strong = { members: 1_500, traders30d: 150, avgPool90dMinor: 8_000_000n }
const weak = { members: 200, traders30d: 10, avgPool90dMinor: 100_000n }

describe('tiering', () => {
  it('parses thresholds with safe fallbacks', () => {
    expect(parseTierThresholds(undefined)).toEqual(DEFAULT_TIER_THRESHOLDS)
    expect(parseTierThresholds('{bad')).toEqual(DEFAULT_TIER_THRESHOLDS)
    expect(
      parseTierThresholds(JSON.stringify({ minMembers: 200, minAvgPoolMinor: '1000000', demoteAfterDays: 30 })),
    ).toEqual({
      minMembers: 200,
      minTraders30d: 100,
      minAvgPoolMinor: 1_000_000n,
      demoteAfterDays: 30,
    })
  })

  it('requires every threshold to promote', () => {
    expect(meetsThresholds(strong, DEFAULT_TIER_THRESHOLDS)).toBe(true)
    expect(meetsThresholds({ ...strong, traders30d: 99 }, DEFAULT_TIER_THRESHOLDS)).toBe(false)
    expect(
      decideTier({
        current: 'pool',
        override: null,
        metrics: strong,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: null,
        now: NOW,
      }),
    ).toEqual({
      tier: 'orderbook',
      reason: 'promoted: thresholds met',
    })
    expect(
      decideTier({
        current: 'pool',
        override: null,
        metrics: weak,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: null,
        now: NOW,
      }).tier,
    ).toBe('pool')
  })

  it('demotes only after the grace period and respects overrides', () => {
    const recent = new Date(NOW.getTime() - 10 * 86_400_000)
    const old = new Date(NOW.getTime() - 90 * 86_400_000)
    expect(
      decideTier({
        current: 'orderbook',
        override: null,
        metrics: weak,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: recent,
        now: NOW,
      }).tier,
    ).toBe('orderbook')
    expect(
      decideTier({
        current: 'orderbook',
        override: null,
        metrics: weak,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: old,
        now: NOW,
      }).tier,
    ).toBe('pool')
    expect(
      decideTier({
        current: 'orderbook',
        override: null,
        metrics: strong,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: old,
        now: NOW,
      }).tier,
    ).toBe('orderbook')
    expect(
      decideTier({
        current: 'pool',
        override: 'orderbook',
        metrics: weak,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: null,
        now: NOW,
      }),
    ).toEqual({ tier: 'orderbook', reason: 'override' })
    expect(
      decideTier({
        current: 'orderbook',
        override: 'pool',
        metrics: strong,
        thresholds: DEFAULT_TIER_THRESHOLDS,
        tierChangedAt: null,
        now: NOW,
      }),
    ).toEqual({ tier: 'pool', reason: 'override' })
  })
})
