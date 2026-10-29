/**
 * Pure appeal rules for Communities v1: when an appeal reaches Prophit
 * review, and where the money goes under each ruling. Integer minor units,
 * every plan conserves the pool and the escrow. No database imports.
 *
 * See notes/COMMUNITIES-CONCEPT.md §6 (hold and appeals).
 */

import type { StakeLike } from '@/lib/pools/math'

import { planSettlement } from '@/lib/pools/math'

export type AppealRuling = 'rejected' | 'upheld' | 'voided'
export type AppealClaim = 'yes' | 'no' | 'cancelled'

export interface AppealSettings {
  /** Smallest escrow one backer may put up. */
  minBackMinor: bigint
  /** Backers that send the appeal to review, whichever line fills first. */
  backersNeeded: number
  /** Escrow that sends the appeal to review, as basis points of the pool (1,000 = 10%). */
  poolShareBps: number
  /** Jurors from other communities asked for an opinion. */
  appealJurors: number
}

export const DEFAULT_APPEAL_SETTINGS: AppealSettings = {
  minBackMinor: 20_000n, // 200 KES
  backersNeeded: 12,
  poolShareBps: 1_000,
  appealJurors: 3,
}

/** The two lines an appeal has to fill one of: a count of backers, or an amount in escrow. */
export function computeAppealTargets(poolMinor: bigint, settings: AppealSettings = DEFAULT_APPEAL_SETTINGS) {
  const share = (poolMinor * BigInt(Math.max(0, settings.poolShareBps))) / 10_000n
  return {
    backersNeeded: Math.max(1, Math.floor(settings.backersNeeded)),
    escrowTargetMinor: share > settings.minBackMinor ? share : settings.minBackMinor,
  }
}

/** Either line filled: enough backers, or enough held in escrow. */
export function appealThresholdReached(input: {
  backers: number
  backersNeeded: number
  escrowMinor: bigint
  escrowTargetMinor: bigint
}): boolean {
  return input.backers >= input.backersNeeded || input.escrowMinor >= input.escrowTargetMinor
}

export interface AppealBacker {
  userId: string
  amount: bigint
}

export interface AppealRulingInput {
  ruling: AppealRuling
  /** What the appeal says the result should be; 'cancelled' asks for a void. */
  claimedOutcome: AppealClaim
  /** The jury's result the appeal is against. */
  originalOutcome: 'yes' | 'no'
  stakes: readonly StakeLike[]
  backers: readonly AppealBacker[]
  rakeBps: number
  ownerShareBps: number
  juryShareBps: number
  /** Every seat on the jury, with what each voted. */
  jurors: ReadonlyArray<{ userId: string; vote: 'yes' | 'no' | 'disputed' }>
  /** Jurors from other communities who gave an opinion on the appeal. */
  appealJurorIds: readonly string[]
  ownerUserId: string
}

export interface MoneyMove {
  to: { kind: 'user'; userId: string } | { kind: 'prophit' } | { kind: 'rounding' }
  amount: bigint
  reason: 'payout' | 'refund' | 'owner_share' | 'jury_share' | 'escrow_forfeit' | 'overturned_pot' | 'residue'
}

export interface AppealRulingPlan {
  ruling: AppealRuling
  /** The outcome the pool pays on after the ruling. */
  outcome: 'yes' | 'no' | 'cancelled'
  refunded: boolean
  /** Payout per stake id (refunds = the stake back). */
  payouts: Map<string, bigint>
  /** Movements out of the pool: winners, owner, jurors, Prophit, rounding. */
  poolMoves: MoneyMove[]
  /** Movements of the backers' escrow: returned (release) or forfeited to someone. */
  escrowMoves: MoneyMove[]
  escrowReturned: boolean
  totalPool: bigint
  totalEscrow: bigint
}

function sum(values: Iterable<bigint>): bigint {
  let total = 0n
  for (const value of values) {
    total += value
  }
  return total
}

/** Split `amount` evenly across `ids`, floored; the remainder goes back to the caller. */
function splitEvenly(amount: bigint, ids: readonly string[]): { per: bigint; moves: MoneyMove[]; leftover: bigint } {
  if (ids.length === 0 || amount <= 0n) {
    return { per: 0n, moves: [], leftover: amount }
  }
  const per = amount / BigInt(ids.length)
  return {
    per,
    moves: ids.map((userId) => ({ to: { kind: 'user' as const, userId }, amount: per, reason: 'jury_share' as const })),
    leftover: amount - per * BigInt(ids.length),
  }
}

/**
 * Where the money goes under a ruling.
 *
 * - rejected: the result stands. Winners, owner and the jurors who voted with
 *   it are paid as planned. The backers' escrow is forfeited: half to the
 *   owner, half split across the jurors who were right.
 * - upheld: the result flips to the claim. Escrow goes back. The pool pays the
 *   new winners; the jury pool is split one share per seat, the jurors who
 *   voted the claim (the dissent) keep theirs, and the rest of the jury pool
 *   plus the owner's share form a pot that goes half to Prophit and half to
 *   the appeal jurors (all to Prophit when there are none).
 * - voided: every stake goes back, escrow goes back, nobody earns a fee.
 */
export function planAppealRuling(input: AppealRulingInput): AppealRulingPlan {
  const totalEscrow = sum(input.backers.map((backer) => backer.amount))
  const totalPool = sum(input.stakes.map((stake) => stake.amount))

  if (input.ruling === 'voided' || (input.ruling === 'upheld' && input.claimedOutcome === 'cancelled')) {
    const plan = planSettlement({ outcome: 'cancelled', stakes: input.stakes, rakeBps: 0, creatorShareBps: 0 })
    return {
      ruling: input.ruling,
      outcome: 'cancelled',
      refunded: true,
      payouts: plan.payouts,
      poolMoves: input.stakes.map((stake) => ({
        to: { kind: 'user', userId: stake.userId },
        amount: stake.amount,
        reason: 'refund',
      })),
      escrowMoves: [],
      escrowReturned: true,
      totalPool,
      totalEscrow,
    }
  }

  const outcome: 'yes' | 'no' =
    input.ruling === 'rejected' ? input.originalOutcome : (input.claimedOutcome as 'yes' | 'no')
  const plan = planSettlement({ outcome, stakes: input.stakes, rakeBps: input.rakeBps, creatorShareBps: 0 })
  const poolMoves: MoneyMove[] = []
  for (const stake of input.stakes) {
    const payout = plan.payouts.get(stake.id) ?? 0n
    if (payout > 0n) {
      poolMoves.push({
        to: { kind: 'user', userId: stake.userId },
        amount: payout,
        reason: plan.refunded ? 'refund' : 'payout',
      })
    }
  }
  if (plan.refunded) {
    // Nobody on the ruled side: everyone is refunded, no fees, escrow back.
    return {
      ruling: input.ruling,
      outcome: 'cancelled',
      refunded: true,
      payouts: plan.payouts,
      poolMoves,
      escrowMoves: [],
      escrowReturned: true,
      totalPool,
      totalEscrow,
    }
  }

  const rake = plan.rake
  const ownerBps = BigInt(Math.max(0, Math.min(input.ownerShareBps, 10_000)))
  const juryBps = BigInt(Math.max(0, Math.min(input.juryShareBps, 10_000 - Number(ownerBps))))
  const ownerShare = (rake * ownerBps) / 10_000n
  const juryPool = (rake * juryBps) / 10_000n
  const seats = Math.max(1, input.jurors.length)
  const perSeat = juryPool / BigInt(seats)
  const agreeing = input.jurors.filter((juror) => juror.vote === outcome).map((juror) => juror.userId)
  let prophit = rake - ownerShare - juryPool
  const escrowMoves: MoneyMove[] = []

  if (input.ruling === 'rejected') {
    if (ownerShare > 0n) {
      poolMoves.push({ to: { kind: 'user', userId: input.ownerUserId }, amount: ownerShare, reason: 'owner_share' })
    }
    // The jury pool goes to the jurors who were right, as before.
    const jury = splitEvenly(juryPool, agreeing)
    poolMoves.push(...jury.moves)
    prophit += jury.leftover
    // Forfeited escrow: half to the owner, half across the jurors who were right.
    const half = totalEscrow / 2n
    if (half > 0n) {
      escrowMoves.push({ to: { kind: 'user', userId: input.ownerUserId }, amount: half, reason: 'escrow_forfeit' })
    }
    const jurorsHalf = splitEvenly(totalEscrow - half, agreeing)
    escrowMoves.push(...jurorsHalf.moves.map((move) => ({ ...move, reason: 'escrow_forfeit' as const })))
    if (jurorsHalf.leftover > 0n) {
      escrowMoves.push({ to: { kind: 'prophit' }, amount: jurorsHalf.leftover, reason: 'escrow_forfeit' })
    }
  } else {
    // Upheld: the dissent keeps its seat share; the owner's share and the
    // other seats form the pot for Prophit and the appeal jurors.
    let pot = ownerShare
    for (const juror of input.jurors) {
      if (juror.vote === outcome) {
        if (perSeat > 0n) {
          poolMoves.push({ to: { kind: 'user', userId: juror.userId }, amount: perSeat, reason: 'jury_share' })
        }
      } else {
        pot += perSeat
      }
    }
    pot += juryPool - perSeat * BigInt(seats)
    const half = pot / 2n
    const appeal = splitEvenly(pot - half, input.appealJurorIds)
    poolMoves.push(...appeal.moves.map((move) => ({ ...move, reason: 'overturned_pot' as const })))
    prophit += half + appeal.leftover
  }

  if (prophit > 0n) {
    poolMoves.push({ to: { kind: 'prophit' }, amount: prophit, reason: 'overturned_pot' })
  }
  if (plan.residue > 0n) {
    poolMoves.push({ to: { kind: 'rounding' }, amount: plan.residue, reason: 'residue' })
  }

  return {
    ruling: input.ruling,
    outcome,
    refunded: false,
    payouts: plan.payouts,
    poolMoves,
    escrowMoves,
    escrowReturned: input.ruling !== 'rejected',
    totalPool,
    totalEscrow,
  }
}

/** Every unit of the pool and of the escrow ends up somewhere. */
export function appealRulingIsConserved(plan: AppealRulingPlan): boolean {
  const poolOut = sum(plan.poolMoves.map((move) => move.amount))
  const escrowOut = sum(plan.escrowMoves.map((move) => move.amount))
  if (poolOut !== plan.totalPool) {
    return false
  }
  if (plan.escrowReturned) {
    return escrowOut === 0n
  }
  return escrowOut === plan.totalEscrow
}
