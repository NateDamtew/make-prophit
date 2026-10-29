import { describe, expect, it } from 'bun:test'

import type { AppealRulingInput } from '@/lib/communities/appeals-math'

import {
  appealRulingIsConserved,
  appealThresholdReached,
  computeAppealTargets,
  planAppealRuling,
} from '@/lib/communities/appeals-math'

const stakes = [
  { id: 's1', userId: 'alice', outcome: 'yes' as const, amount: 100_000n },
  { id: 's2', userId: 'bob', outcome: 'yes' as const, amount: 50_000n },
  { id: 's3', userId: 'carol', outcome: 'no' as const, amount: 80_000n },
  { id: 's4', userId: 'dan', outcome: 'no' as const, amount: 20_000n },
]
const jurors = [
  { userId: 'j1', vote: 'yes' as const },
  { userId: 'j2', vote: 'yes' as const },
  { userId: 'j3', vote: 'no' as const },
]
const base: Omit<AppealRulingInput, 'ruling'> = {
  claimedOutcome: 'no',
  originalOutcome: 'yes',
  stakes,
  backers: [
    { userId: 'carol', amount: 20_000n },
    { userId: 'dan', amount: 30_000n },
  ],
  rakeBps: 800,
  ownerShareBps: 4_000,
  juryShareBps: 2_000,
  jurors,
  appealJurorIds: ['a1', 'a2', 'a3'],
  ownerUserId: 'owner',
}

function paidTo(moves: Array<{ to: { kind: string; userId?: string }; amount: bigint }>, userId: string) {
  return moves
    .filter((move) => move.to.kind === 'user' && move.to.userId === userId)
    .reduce((sum, move) => sum + move.amount, 0n)
}
function paidToProphit(moves: Array<{ to: { kind: string }; amount: bigint }>) {
  return moves.filter((move) => move.to.kind === 'prophit').reduce((sum, move) => sum + move.amount, 0n)
}

describe('computeAppealTargets', () => {
  it('needs 12 backers or 10% of the pool, never below the minimum back', () => {
    expect(computeAppealTargets(5_290_000n)).toEqual({ backersNeeded: 12, escrowTargetMinor: 529_000n })
    expect(computeAppealTargets(100_000n)).toEqual({ backersNeeded: 12, escrowTargetMinor: 20_000n })
  })
})

describe('appealThresholdReached', () => {
  it('fills on either line', () => {
    expect(appealThresholdReached({ backers: 12, backersNeeded: 12, escrowMinor: 0n, escrowTargetMinor: 100n })).toBe(
      true,
    )
    expect(appealThresholdReached({ backers: 3, backersNeeded: 12, escrowMinor: 100n, escrowTargetMinor: 100n })).toBe(
      true,
    )
    expect(appealThresholdReached({ backers: 3, backersNeeded: 12, escrowMinor: 99n, escrowTargetMinor: 100n })).toBe(
      false,
    )
  })
})

describe('planAppealRuling', () => {
  it('rejected: the result stands, the escrow goes half to the owner and half to the jurors who were right', () => {
    const plan = planAppealRuling({ ...base, ruling: 'rejected' })
    expect(plan.outcome).toBe('yes')
    expect(plan.refunded).toBe(false)
    expect(appealRulingIsConserved(plan)).toBe(true)
    // 250,000 pool, 8% rake = 20,000; 230,000 to Yes stakers pro rata.
    expect(plan.payouts.get('s1')).toBe(153_333n)
    expect(plan.payouts.get('s2')).toBe(76_666n)
    expect(plan.payouts.get('s3')).toBe(0n)
    // Owner 40% of rake = 8,000; jury 20% = 4,000 across j1 and j2; Prophit the rest.
    expect(paidTo(plan.poolMoves, 'owner')).toBe(8_000n)
    expect(paidTo(plan.poolMoves, 'j1')).toBe(2_000n)
    expect(paidTo(plan.poolMoves, 'j3')).toBe(0n)
    expect(paidToProphit(plan.poolMoves)).toBe(8_000n)
    // Escrow 50,000: 25,000 to the owner, 12,500 each to j1 and j2.
    expect(plan.escrowReturned).toBe(false)
    expect(paidTo(plan.escrowMoves, 'owner')).toBe(25_000n)
    expect(paidTo(plan.escrowMoves, 'j1')).toBe(12_500n)
    expect(paidTo(plan.escrowMoves, 'j2')).toBe(12_500n)
  })

  it('upheld: the result flips, escrow goes back, the dissent keeps its seat share and the pot is split with the appeal jurors', () => {
    const plan = planAppealRuling({ ...base, ruling: 'upheld' })
    expect(plan.outcome).toBe('no')
    expect(appealRulingIsConserved(plan)).toBe(true)
    expect(plan.escrowReturned).toBe(true)
    expect(plan.escrowMoves).toHaveLength(0)
    // No stakers paid now: 230,000 across carol and dan.
    expect(plan.payouts.get('s3')).toBe(184_000n)
    expect(plan.payouts.get('s4')).toBe(46_000n)
    expect(plan.payouts.get('s1')).toBe(0n)
    // Jury pool 4,000 over 3 seats = 1,333 per seat; j3 voted No and keeps it.
    expect(paidTo(plan.poolMoves, 'j3')).toBe(1_333n)
    expect(paidTo(plan.poolMoves, 'j1')).toBe(0n)
    expect(paidTo(plan.poolMoves, 'owner')).toBe(0n)
    // Pot = owner 8,000 + two seats 2,666 + rounding 1 = 10,667: 5,333 to Prophit, 5,334 across a1–a3.
    expect(paidTo(plan.poolMoves, 'a1')).toBe(1_778n)
    expect(paidTo(plan.poolMoves, 'a2')).toBe(1_778n)
    expect(paidTo(plan.poolMoves, 'a3')).toBe(1_778n)
    // Prophit: its own 8,000 + the 5,333 half.
    expect(paidToProphit(plan.poolMoves)).toBe(13_333n)
  })

  it('upheld with no appeal jurors sends the whole pot to Prophit', () => {
    const plan = planAppealRuling({ ...base, ruling: 'upheld', appealJurorIds: [] })
    expect(appealRulingIsConserved(plan)).toBe(true)
    expect(paidToProphit(plan.poolMoves)).toBe(8_000n + 10_667n)
  })

  it('voided: every stake and every backer gets their money back, nobody earns a fee', () => {
    const plan = planAppealRuling({ ...base, ruling: 'voided' })
    expect(plan.outcome).toBe('cancelled')
    expect(plan.refunded).toBe(true)
    expect(appealRulingIsConserved(plan)).toBe(true)
    expect(plan.payouts.get('s1')).toBe(100_000n)
    expect(plan.payouts.get('s3')).toBe(80_000n)
    expect(paidToProphit(plan.poolMoves)).toBe(0n)
    expect(plan.escrowReturned).toBe(true)
  })

  it('upheld to a side nobody staked on becomes a refund', () => {
    const plan = planAppealRuling({
      ...base,
      ruling: 'upheld',
      stakes: stakes.filter((stake) => stake.outcome === 'yes'),
    })
    expect(plan.refunded).toBe(true)
    expect(plan.outcome).toBe('cancelled')
    expect(appealRulingIsConserved(plan)).toBe(true)
  })
})
