import { describe, expect, it } from 'bun:test'

import {
  computeJoinGate,
  DEFAULT_JURY_BANDS,
  DEFAULT_LEVEL_CAPS,
  getEffectiveCaps,
  juryBandForMembers,
  jurySeatsForMembers,
  majorityOf,
} from '@/lib/communities/rules'

describe('communities/rules: jury bands', () => {
  it('grows the jury with the community, odd sizes only', () => {
    expect(jurySeatsForMembers(0)).toBe(3)
    expect(jurySeatsForMembers(1)).toBe(3)
    expect(jurySeatsForMembers(500)).toBe(3)
    expect(jurySeatsForMembers(501)).toBe(5)
    expect(jurySeatsForMembers(2_000)).toBe(5)
    expect(jurySeatsForMembers(2_001)).toBe(7)
    expect(jurySeatsForMembers(5_000)).toBe(7)
    expect(jurySeatsForMembers(5_001)).toBe(9)
    expect(jurySeatsForMembers(1_000_000)).toBe(9)
  })

  it('never exceeds ten seats even with a custom band', () => {
    expect(jurySeatsForMembers(10, [{ maxMembers: null, seats: 15 }])).toBe(10)
  })

  it('reports the band a community is in', () => {
    expect(juryBandForMembers(38)).toEqual({ minMembers: 0, maxMembers: 500, seats: 3 })
    expect(juryBandForMembers(1_240)).toEqual({ minMembers: 501, maxMembers: 2_000, seats: 5 })
    expect(juryBandForMembers(9_000)).toEqual({ minMembers: 5_001, maxMembers: null, seats: 9 })
  })
})

describe('communities/rules: majority', () => {
  it('needs a simple majority of the seats', () => {
    expect(majorityOf(3)).toBe(2)
    expect(majorityOf(5)).toBe(3)
    expect(majorityOf(7)).toBe(4)
    expect(majorityOf(9)).toBe(5)
    expect(majorityOf(10)).toBe(6)
    expect(majorityOf(1)).toBe(1)
  })

  it('is always more than half and never more than the seats', () => {
    for (let seats = 1; seats <= 10; seats++) {
      const needed = majorityOf(seats)
      expect(needed * 2).toBeGreaterThan(seats)
      expect(needed).toBeLessThanOrEqual(seats)
    }
  })
})

describe('communities/rules: join gate', () => {
  const base = { activeJurors: 3, maxMembers: 5_000, status: 'active' as const, bands: DEFAULT_JURY_BANDS }

  it('lets a new community fill its first band with three jurors', () => {
    expect(computeJoinGate({ ...base, memberCount: 0 })).toEqual({ allowed: true, reason: null, seatsNeeded: 3 })
    expect(computeJoinGate({ ...base, memberCount: 499 })).toEqual({ allowed: true, reason: null, seatsNeeded: 3 })
  })

  it('pauses joins at the band edge until the jury is big enough', () => {
    expect(computeJoinGate({ ...base, memberCount: 500 })).toEqual({
      allowed: false,
      reason: 'jury_too_small',
      seatsNeeded: 5,
    })
    expect(computeJoinGate({ ...base, memberCount: 500, activeJurors: 5 })).toEqual({
      allowed: true,
      reason: null,
      seatsNeeded: 5,
    })
  })

  it('respects the level member cap and the lifecycle status', () => {
    expect(computeJoinGate({ ...base, memberCount: 200, maxMembers: 200 }).reason).toBe('full')
    expect(computeJoinGate({ ...base, memberCount: 10, status: 'paused' }).reason).toBe('paused')
    expect(computeJoinGate({ ...base, memberCount: 10, status: 'dormant' }).reason).toBe('dormant')
    expect(computeJoinGate({ ...base, memberCount: 10, status: 'archived' }).reason).toBe('archived')
  })
})

describe('communities/rules: effective caps', () => {
  it('applies per-community overrides on top of the level defaults', () => {
    const caps = getEffectiveCaps(DEFAULT_LEVEL_CAPS[0], { maxMembers: 1_000, maxPerPersonMinor: 500_000n }, 'spot')
    expect(caps.maxMembers).toBe(1_000)
    expect(caps.maxPerPersonMinor).toBe(500_000n)
    expect(caps.maxPoolPerMarketMinor).toBe(DEFAULT_LEVEL_CAPS[0].maxPoolPerMarketMinor)
    expect(caps.reviewMode).toBe('spot')
    expect(caps.rakeBps).toBe(800)
  })

  it('leaves the defaults alone without an override', () => {
    expect(getEffectiveCaps(DEFAULT_LEVEL_CAPS[2], null, null)).toEqual(DEFAULT_LEVEL_CAPS[2])
  })
})
