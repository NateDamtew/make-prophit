/**
 * Parimutuel arithmetic, pure and unit-tested. All amounts are integer minor
 * units. Rounding always favours the house: winner shares are floored and the
 * residue goes to the rounding account.
 */

export type PoolSide = 'yes' | 'no'

export interface StakeLike {
  id: string
  userId: string
  outcome: PoolSide
  amount: bigint
}

export interface SettlementPlan {
  outcome: PoolSide | 'cancelled'
  totalPool: bigint
  rake: bigint
  creatorShare: bigint
  /** Pool distributed to winners (totalPool - rake), or 0 when refunded. */
  distributable: bigint
  /** payout per stake id; losers 0, refunds = original amount. */
  payouts: Map<string, bigint>
  residue: bigint
  refunded: boolean
}

export function impliedOdds(totalYes: bigint, totalNo: bigint): { yes: number; no: number } {
  const total = totalYes + totalNo
  if (total <= 0n) {
    return { yes: 0.5, no: 0.5 }
  }
  const yes = Number((totalYes * 10_000n) / total) / 10_000
  return { yes, no: 1 - yes }
}

/**
 * What a new stake of `amount` on `side` would pay if the pool closed now
 * and that side won, after rake. Shown as "estimated".
 */
export function estimatePayout(params: {
  totalYes: bigint
  totalNo: bigint
  side: PoolSide
  amount: bigint
  rakeBps: number
}): bigint {
  const { amount, rakeBps } = params
  if (amount <= 0n) {
    return 0n
  }
  const totalYes = params.totalYes + (params.side === 'yes' ? amount : 0n)
  const totalNo = params.totalNo + (params.side === 'no' ? amount : 0n)
  const total = totalYes + totalNo
  const distributable = total - (total * BigInt(rakeBps)) / 10_000n
  const sideTotal = params.side === 'yes' ? totalYes : totalNo
  if (sideTotal <= 0n) {
    return 0n
  }
  return (distributable * amount) / sideTotal
}

/**
 * Build the settlement. Rules:
 * - cancelled → everyone refunded, no rake.
 * - winning side has no stakes → treat as cancelled (nobody to pay; refund).
 * - otherwise rake = total * rakeBps, creatorShare = rake * creatorShareBps,
 *   winners split (total - rake) pro rata by stake, floored.
 */
export function planSettlement(params: {
  outcome: PoolSide | 'cancelled'
  stakes: readonly StakeLike[]
  rakeBps: number
  creatorShareBps: number
}): SettlementPlan {
  const { stakes, rakeBps, creatorShareBps } = params
  const totalPool = stakes.reduce((sum, stake) => sum + stake.amount, 0n)
  const payouts = new Map<string, bigint>()

  const winners = params.outcome === 'cancelled' ? [] : stakes.filter((stake) => stake.outcome === params.outcome)
  const refunded = params.outcome === 'cancelled' || winners.length === 0

  if (refunded) {
    for (const stake of stakes) {
      payouts.set(stake.id, stake.amount)
    }
    return {
      outcome: params.outcome,
      totalPool,
      rake: 0n,
      creatorShare: 0n,
      distributable: 0n,
      payouts,
      residue: 0n,
      refunded: true,
    }
  }

  const rake = (totalPool * BigInt(Math.max(0, Math.min(rakeBps, 10_000)))) / 10_000n
  const creatorShare = (rake * BigInt(Math.max(0, Math.min(creatorShareBps, 10_000)))) / 10_000n
  const distributable = totalPool - rake
  const winningTotal = winners.reduce((sum, stake) => sum + stake.amount, 0n)
  let distributed = 0n
  for (const stake of stakes) {
    if (stake.outcome !== params.outcome) {
      payouts.set(stake.id, 0n)
      continue
    }
    const payout = (distributable * stake.amount) / winningTotal
    payouts.set(stake.id, payout)
    distributed += payout
  }
  return {
    outcome: params.outcome,
    totalPool,
    rake,
    creatorShare,
    distributable,
    payouts,
    residue: distributable - distributed,
    refunded: false,
  }
}

/** Sanity check: every unit of the pool ends up somewhere. */
export function settlementIsConserved(plan: SettlementPlan): boolean {
  let paid = 0n
  for (const value of plan.payouts.values()) {
    paid += value
  }
  if (plan.refunded) {
    return paid === plan.totalPool && plan.rake === 0n && plan.residue === 0n
  }
  return paid + plan.rake + plan.residue === plan.totalPool && plan.creatorShare <= plan.rake
}
