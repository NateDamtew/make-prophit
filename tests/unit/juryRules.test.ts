import { describe, expect, it } from 'bun:test'

import {
  canRateResolution,
  computeJuryDeadline,
  decideVerdict,
  estimateJurorPay,
  summarizeJuror,
} from '@/lib/communities/jury-rules'

const now = new Date('2026-12-14T18:00:00Z')
const later = new Date('2026-12-15T00:00:00Z')
const earlier = new Date('2026-12-14T12:00:00Z')

function votes(...values: Array<'yes' | 'no' | 'disputed'>) {
  return values.map((vote, index) => ({ jurorId: `j${index}`, vote }))
}

describe('decideVerdict', () => {
  it('stays sealed until every seat has voted, even with a majority in hand', () => {
    const verdict = decideVerdict({ seats: 3, votes: votes('yes', 'yes'), deadline: later, now })
    expect(verdict.status).toBe('pending')
    expect(verdict.reveal).toBe(false)
    expect(verdict.outcome).toBeNull()
    expect(verdict.required).toBe(2)
  })

  it('opens and resolves once the last seat votes', () => {
    expect(decideVerdict({ seats: 3, votes: votes('yes', 'yes', 'no'), deadline: later, now })).toMatchObject({
      status: 'resolved',
      outcome: 'yes',
      reveal: true,
      yes: 2,
      no: 1,
    })
    expect(
      decideVerdict({ seats: 5, votes: votes('no', 'no', 'no', 'yes', 'yes'), deadline: later, now }),
    ).toMatchObject({ status: 'resolved', outcome: 'no', required: 3 })
    expect(
      decideVerdict({ seats: 7, votes: votes('yes', 'yes', 'yes', 'yes', 'no', 'no', 'no'), deadline: later, now }),
    ).toMatchObject({ status: 'resolved', outcome: 'yes', required: 4 })
    expect(
      decideVerdict({
        seats: 9,
        votes: votes('no', 'no', 'no', 'no', 'no', 'yes', 'yes', 'yes', 'yes'),
        deadline: later,
        now,
      }),
    ).toMatchObject({ status: 'resolved', outcome: 'no', required: 5 })
  })

  it('voids the market when every seat voted but nothing reached a majority', () => {
    const verdict = decideVerdict({
      seats: 5,
      votes: votes('yes', 'yes', 'disputed', 'disputed', 'no'),
      deadline: later,
      now,
    })
    expect(verdict.status).toBe('void')
    expect(verdict.outcome).toBe('cancelled')
    expect(verdict.disputed).toBe(2)
  })

  it('opens at the deadline and resolves with the votes that are in', () => {
    const verdict = decideVerdict({ seats: 5, votes: votes('yes', 'yes', 'yes'), deadline: earlier, now })
    expect(verdict).toMatchObject({ status: 'resolved', outcome: 'yes', reveal: true, voted: 3 })
  })

  it('refunds as late when the deadline passes short of a majority', () => {
    const verdict = decideVerdict({ seats: 5, votes: votes('yes', 'no'), deadline: earlier, now })
    expect(verdict.status).toBe('late')
    expect(verdict.outcome).toBe('cancelled')
  })

  it('counts each juror once', () => {
    const verdict = decideVerdict({
      seats: 3,
      votes: [
        { jurorId: 'a', vote: 'yes' },
        { jurorId: 'a', vote: 'yes' },
        { jurorId: 'b', vote: 'no' },
      ],
      deadline: later,
      now,
    })
    expect(verdict.voted).toBe(2)
    expect(verdict.status).toBe('pending')
  })

  it('a legacy market without a deadline only opens when every seat has voted', () => {
    expect(decideVerdict({ seats: 3, votes: votes('yes', 'yes'), deadline: null, now }).status).toBe('pending')
    expect(decideVerdict({ seats: 3, votes: votes('yes', 'yes', 'yes'), deadline: null, now }).status).toBe('resolved')
  })
})

describe('computeJuryDeadline', () => {
  it('adds the voting window to the close', () => {
    expect(computeJuryDeadline(new Date('2026-12-13T21:00:00Z'), 72).toISOString()).toBe('2026-12-16T21:00:00.000Z')
  })
})

describe('estimateJurorPay', () => {
  it('splits the jury slice of the pool share across the seats', () => {
    // 52,900 KES pool, 6% rake, jury 20% of it, 5 seats → 127 KES each (in cents).
    expect(estimateJurorPay({ poolMinor: 5_290_000n, rakeBps: 600, juryShareBps: 2_000, seats: 5 })).toBe(12_696n)
    expect(estimateJurorPay({ poolMinor: 0n, rakeBps: 600, juryShareBps: 2_000, seats: 3 })).toBe(0n)
  })
})

describe('summarizeJuror', () => {
  it('reads an empty record as blanks, not zeros', () => {
    expect(summarizeJuror(null)).toMatchObject({ markets: 0, agreementPct: null, onTimePct: null, rating: null })
  })

  it('turns counts into the public record', () => {
    const summary = summarizeJuror({
      marketsVoted: 47,
      onTime: 46,
      late: 1,
      agreed: 45,
      overturned: 1,
      ratingSum: 975,
      ratingCount: 212,
      dissentProven: 1,
    })
    expect(summary.markets).toBe(47)
    expect(summary.agreementPct).toBe(96)
    expect(summary.onTimePct).toBe(98)
    expect(summary.rating).toBe(4.6)
    expect(summary.ratings).toBe(212)
  })
})

describe('canRateResolution', () => {
  it('only losers rate, once the result is in', () => {
    expect(canRateResolution({ viewerResult: 'lost', phase: 'hold' })).toBe(true)
    expect(canRateResolution({ viewerResult: 'lost', phase: 'settled' })).toBe(true)
    expect(canRateResolution({ viewerResult: 'won', phase: 'settled' })).toBe(false)
    expect(canRateResolution({ viewerResult: 'lost', phase: 'awaiting' })).toBe(false)
    expect(canRateResolution({ viewerResult: null, phase: 'settled' })).toBe(false)
  })
})
