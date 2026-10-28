import { describe, expect, it } from 'bun:test'

import { computeAppealHoldUntil, computeHoldUntil, decideRelease } from '@/lib/communities/hold'

const announced = new Date('2026-12-14T17:40:00Z')
const hour = 60 * 60 * 1000

describe('communities/hold: timings', () => {
  it('holds payouts 24 hours by default and 48 with an appeal', () => {
    expect(computeHoldUntil(announced).getTime()).toBe(announced.getTime() + 24 * hour)
    expect(computeAppealHoldUntil(announced).getTime()).toBe(announced.getTime() + 48 * hour)
  })

  it('never lets the appeal window be shorter than the hold', () => {
    const until = computeAppealHoldUntil(announced, { holdHours: 30, appealMaxHours: 12 })
    expect(until.getTime()).toBe(announced.getTime() + 30 * hour)
  })
})

describe('communities/hold: release decision', () => {
  const base = {
    state: 'held',
    holdUntil: computeHoldUntil(announced),
    holdExtendedUntil: computeAppealHoldUntil(announced),
    payoutsFrozen: false,
    appealActive: false,
    isImported: false,
  }

  it('waits until the hold runs out, then releases', () => {
    expect(decideRelease({ ...base, now: new Date(announced.getTime() + 18 * hour) })).toBe('wait')
    expect(decideRelease({ ...base, now: new Date(announced.getTime() + 24 * hour) })).toBe('release')
  })

  it('waits for the extended window while an appeal is open', () => {
    const now = new Date(announced.getTime() + 30 * hour)
    expect(decideRelease({ ...base, appealActive: true, now })).toBe('wait')
    expect(decideRelease({ ...base, appealActive: true, now: new Date(announced.getTime() + 48 * hour) })).toBe(
      'release',
    )
  })

  it('stays frozen once an appeal reached its threshold, whatever the clock says', () => {
    expect(decideRelease({ ...base, payoutsFrozen: true, now: new Date(announced.getTime() + 100 * hour) })).toBe(
      'frozen',
    )
  })

  it('releases imported markets at once and ignores pools that are not held', () => {
    expect(decideRelease({ ...base, isImported: true, now: announced })).toBe('release')
    expect(decideRelease({ ...base, state: 'open', now: announced })).toBe('not_held')
  })
})
