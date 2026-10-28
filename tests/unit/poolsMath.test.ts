import { describe, expect, it } from 'bun:test'

import type { StakeLike } from '@/lib/pools/math'

import {
  estimatePayout,
  impliedOdds,
  planSettlement,
  rakeSplitIsConserved,
  settlementIsConserved,
  splitRake,
} from '@/lib/pools/math'

function stake(id: string, outcome: 'yes' | 'no', amount: bigint, userId = `u-${id}`): StakeLike {
  return { id, userId, outcome, amount }
}

describe('impliedOdds / estimatePayout', () => {
  it('derives odds from the pool split and defaults to 50/50 when empty', () => {
    expect(impliedOdds(0n, 0n)).toEqual({ yes: 0.5, no: 0.5 })
    const odds = impliedOdds(65_000n, 35_000n)
    expect(odds.yes).toBeCloseTo(0.65, 4)
    expect(odds.no).toBeCloseTo(0.35, 4)
  })

  it('estimates a payout including the new stake, after rake', () => {
    // pool 650 YES / 350 NO, stake 100 on NO → total 1100, 4% rake → 1056 distributable; NO total 450 → 100/450 of 1056 = 234.66
    expect(estimatePayout({ totalYes: 65_000n, totalNo: 35_000n, side: 'no', amount: 10_000n, rakeBps: 400 })).toBe(
      23_466n,
    )
    expect(estimatePayout({ totalYes: 0n, totalNo: 0n, side: 'yes', amount: 10_000n, rakeBps: 400 })).toBe(9_600n)
    expect(estimatePayout({ totalYes: 0n, totalNo: 0n, side: 'yes', amount: 0n, rakeBps: 400 })).toBe(0n)
  })
})

describe('planSettlement', () => {
  const stakes = [
    stake('a', 'yes', 60_000n),
    stake('b', 'yes', 40_000n),
    stake('c', 'no', 50_000n),
    stake('d', 'no', 25_000n),
  ]

  it('pays winners pro rata after rake, with the creator share carved from the rake', () => {
    const plan = planSettlement({ outcome: 'yes', stakes, rakeBps: 400, creatorShareBps: 2_500 })
    expect(plan.totalPool).toBe(175_000n)
    expect(plan.rake).toBe(7_000n)
    expect(plan.creatorShare).toBe(1_750n)
    expect(plan.distributable).toBe(168_000n)
    expect(plan.payouts.get('a')).toBe(100_800n) // 60% of 168,000
    expect(plan.payouts.get('b')).toBe(67_200n)
    expect(plan.payouts.get('c')).toBe(0n)
    expect(plan.payouts.get('d')).toBe(0n)
    expect(plan.residue).toBe(0n)
    expect(plan.refunded).toBe(false)
    expect(settlementIsConserved(plan)).toBe(true)
  })

  it('floors odd splits and books the residue', () => {
    const odd = [stake('a', 'yes', 1n), stake('b', 'yes', 1n), stake('c', 'yes', 1n), stake('d', 'no', 100n)]
    const plan = planSettlement({ outcome: 'yes', stakes: odd, rakeBps: 0, creatorShareBps: 0 })
    // 103 distributable / 3 winners = 34 each, residue 1
    expect(plan.payouts.get('a')).toBe(34n)
    expect(plan.residue).toBe(1n)
    expect(settlementIsConserved(plan)).toBe(true)
  })

  it('refunds everyone on cancelled outcomes and when nobody backed the winner', () => {
    const cancelled = planSettlement({ outcome: 'cancelled', stakes, rakeBps: 400, creatorShareBps: 0 })
    expect(cancelled.refunded).toBe(true)
    expect(cancelled.payouts.get('c')).toBe(50_000n)
    expect(cancelled.rake).toBe(0n)
    expect(settlementIsConserved(cancelled)).toBe(true)

    const onlyYes = [stake('a', 'yes', 10_000n), stake('b', 'yes', 5_000n)]
    const noWinners = planSettlement({ outcome: 'no', stakes: onlyYes, rakeBps: 400, creatorShareBps: 0 })
    expect(noWinners.refunded).toBe(true)
    expect(noWinners.payouts.get('a')).toBe(10_000n)
    expect(settlementIsConserved(noWinners)).toBe(true)
  })

  it('conserves value under random pools (property check)', () => {
    let seed = 7
    function rand() {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
      return seed
    }
    for (let round = 0; round < 300; round++) {
      const count = 1 + (rand() % 12)
      const random: StakeLike[] = []
      for (let i = 0; i < count; i++) {
        random.push(stake(`s${i}`, rand() % 2 === 0 ? 'yes' : 'no', BigInt(1 + (rand() % 5_000_000))))
      }
      const outcome = (['yes', 'no', 'cancelled'] as const)[rand() % 3]!
      const plan = planSettlement({ outcome, stakes: random, rakeBps: rand() % 2001, creatorShareBps: rand() % 10_001 })
      expect(settlementIsConserved(plan)).toBe(true)
      for (const value of plan.payouts.values()) {
        expect(value >= 0n).toBe(true)
      }
    }
  })
})

describe('splitRake', () => {
  it('splits the pool share between owner, voting jurors and Prophit, with rounding to Prophit', () => {
    // 6% of 52,900 = 3,174 → owner 40% = 1,269.6 → 1,269; jury 20% = 634.8 → 634 / 5 jurors = 126 each (630)
    const split = splitRake({
      rake: 317_400n,
      ownerShareBps: 4_000,
      juryShareBps: 2_000,
      votingJurorIds: ['a', 'b', 'c', 'd', 'e'],
    })
    expect(split.owner).toBe(126_960n)
    expect(split.juryPerJuror).toBe(12_696n)
    expect(split.juryTotal).toBe(63_480n)
    expect(split.prophit).toBe(317_400n - 126_960n - 63_480n)
    expect(rakeSplitIsConserved(split, 317_400n)).toBe(true)
  })

  it('leaves rounding residue with Prophit when the jury count does not divide evenly', () => {
    const split = splitRake({
      rake: 1_001n,
      ownerShareBps: 4_000,
      juryShareBps: 2_000,
      votingJurorIds: ['a', 'b', 'c'],
    })
    expect(split.owner).toBe(400n)
    expect(split.juryPerJuror).toBe(66n)
    expect(split.juryTotal).toBe(198n)
    expect(split.prophit).toBe(403n)
    expect(rakeSplitIsConserved(split, 1_001n)).toBe(true)
  })

  it('folds the jury share into Prophit for imported markets and when nobody voted', () => {
    const imported = splitRake({
      rake: 1_000n,
      ownerShareBps: 4_000,
      juryShareBps: 2_000,
      votingJurorIds: ['a'],
      imported: true,
    })
    expect(imported.juryTotal).toBe(0n)
    expect(imported.owner).toBe(400n)
    expect(imported.prophit).toBe(600n)
    const nobody = splitRake({ rake: 1_000n, ownerShareBps: 4_000, juryShareBps: 2_000, votingJurorIds: [] })
    expect(nobody.prophit).toBe(600n)
    expect(rakeSplitIsConserved(nobody, 1_000n)).toBe(true)
  })

  it('never pays more than the rake even with bad share settings', () => {
    const split = splitRake({ rake: 1_000n, ownerShareBps: 9_000, juryShareBps: 5_000, votingJurorIds: ['a'] })
    expect(split.owner + split.juryTotal + split.prophit).toBe(1_000n)
    expect(split.prophit).toBeGreaterThanOrEqual(0n)
  })
})
