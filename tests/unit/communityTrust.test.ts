import { describe, expect, test } from 'bun:test'

import { computeTrustScore, decideLevel, decideStatus, isDormant, nextLevelRequirements } from '@/lib/communities/trust'

const now = new Date('2026-10-29T00:00:00Z')
function daysAgo(days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('computeTrustScore', () => {
  test('a new community sits at 50', () => {
    expect(computeTrustScore({ resolved: 0, late: 0, overturned: 0, rating: null, lastMarketAt: null, now })).toBe(50)
  })

  test('a clean record with recent activity scores high', () => {
    expect(
      computeTrustScore({ resolved: 12, late: 0, overturned: 0, rating: 4.6, lastMarketAt: daysAgo(2), now }),
    ).toBeGreaterThanOrEqual(95)
  })

  test('late refunds and overturned results cost points', () => {
    const clean = computeTrustScore({
      resolved: 10,
      late: 0,
      overturned: 0,
      rating: null,
      lastMarketAt: daysAgo(1),
      now,
    })
    const late = computeTrustScore({ resolved: 7, late: 3, overturned: 0, rating: null, lastMarketAt: daysAgo(1), now })
    const overturned = computeTrustScore({
      resolved: 10,
      late: 0,
      overturned: 1,
      rating: null,
      lastMarketAt: daysAgo(1),
      now,
    })
    expect(late).toBeLessThan(clean)
    expect(overturned).toBeLessThan(clean)
    expect(overturned).toBeLessThan(late)
  })

  test('stays within 0 and 100', () => {
    expect(computeTrustScore({ resolved: 0, late: 20, overturned: 5, rating: 1, lastMarketAt: daysAgo(90), now })).toBe(
      0,
    )
  })
})

describe('isDormant / decideStatus', () => {
  test('30 days without a market is dormant', () => {
    expect(isDormant({ lastMarketAt: daysAgo(31), now })).toBe(true)
    expect(isDormant({ lastMarketAt: daysAgo(10), now })).toBe(false)
    expect(isDormant({ lastMarketAt: null, now })).toBe(false)
  })

  test('paused and archived communities are left alone', () => {
    expect(decideStatus('paused', { lastMarketAt: daysAgo(40), now })).toBe('paused')
    expect(decideStatus('archived', { lastMarketAt: daysAgo(40), now })).toBe('archived')
    expect(decideStatus('dormant', { lastMarketAt: daysAgo(1), now })).toBe('active')
    expect(decideStatus('active', { lastMarketAt: daysAgo(45), now })).toBe('dormant')
  })
})

describe('decideLevel', () => {
  test('promotes 0 → 1 after 10 clean resolutions', () => {
    expect(decideLevel(0, { resolved: 9, overturned: 0, rating: null })).toBe(0)
    expect(decideLevel(0, { resolved: 10, overturned: 0, rating: null })).toBe(1)
    expect(decideLevel(0, { resolved: 10, overturned: 1, rating: null })).toBe(0)
    expect(decideLevel(0, { resolved: 10, overturned: 0, rating: 3.2 })).toBe(0)
  })

  test('promotes 1 → 2 after 30, and never demotes', () => {
    expect(decideLevel(1, { resolved: 29, overturned: 0, rating: 4.5 })).toBe(1)
    expect(decideLevel(1, { resolved: 30, overturned: 0, rating: 4.5 })).toBe(2)
    expect(decideLevel(0, { resolved: 40, overturned: 0, rating: null })).toBe(2)
    expect(decideLevel(2, { resolved: 0, overturned: 3, rating: 1 })).toBe(2)
  })

  test('nextLevelRequirements reports progress', () => {
    expect(nextLevelRequirements(0, { resolved: 4, overturned: 0, rating: null })).toEqual({
      nextLevel: 1,
      resolvedNeeded: 10,
      resolvedHave: 4,
      overturnedOk: true,
      ratingOk: true,
    })
    expect(nextLevelRequirements(2, { resolved: 4, overturned: 0, rating: null })).toBeNull()
  })
})
