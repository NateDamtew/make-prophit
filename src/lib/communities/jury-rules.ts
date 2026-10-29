/**
 * Pure jury rules for Communities v1: when sealed votes open, what the
 * verdict is, what a juror earns and how a juror's record reads. No
 * database imports, safe for client components and unit tests.
 *
 * See notes/COMMUNITIES-CONCEPT.md §4 (jury) and the jury boards.
 */

import { majorityOf } from '@/lib/communities/rules'

export type JuryVoteValue = 'yes' | 'no' | 'disputed'

export interface SealedVote {
  jurorId: string
  vote: JuryVoteValue
}

export interface VerdictInput {
  /** Jurors seated on the market. */
  seats: number
  /** Votes needed to decide; defaults to a simple majority of the seats. */
  required?: number
  votes: SealedVote[]
  /** When the jury must have voted by; null means no deadline (legacy markets). */
  deadline: Date | null
  now: Date
}

export type VerdictStatus =
  /** Still sealed: not every seat has voted and the deadline has not passed. */
  | 'pending'
  /** A majority agreed on Yes or No. */
  | 'resolved'
  /** Every seat voted but no outcome reached a majority (void votes, or a split): refund. */
  | 'void'
  /** The deadline passed before enough votes: refund, and the missing jurors were late. */
  | 'late'

export interface Verdict {
  status: VerdictStatus
  outcome: 'yes' | 'no' | 'cancelled' | null
  /** Votes open together when every seat has voted or the deadline passes. */
  reveal: boolean
  required: number
  voted: number
  yes: number
  no: number
  disputed: number
}

/**
 * Decide a market from sealed votes. Nothing is read before every seat has
 * voted or the deadline passes, so a juror cannot copy the first vote. Once
 * open, a simple majority of the seats decides; anything short of it refunds.
 */
export function decideVerdict(input: VerdictInput): Verdict {
  const seats = Math.max(1, Math.floor(input.seats))
  const required = Math.max(1, Math.floor(input.required ?? majorityOf(seats)))
  const seen = new Set<string>()
  let yes = 0
  let no = 0
  let disputed = 0
  for (const vote of input.votes) {
    if (seen.has(vote.jurorId)) {
      continue
    }
    seen.add(vote.jurorId)
    if (vote.vote === 'yes') {
      yes += 1
    } else if (vote.vote === 'no') {
      no += 1
    } else {
      disputed += 1
    }
  }
  const voted = seen.size
  const deadlinePassed = input.deadline !== null && input.now.getTime() >= input.deadline.getTime()
  const allVoted = voted >= seats
  const reveal = allVoted || deadlinePassed
  const base = { required, voted, yes, no, disputed, reveal }

  if (!reveal) {
    return { ...base, status: 'pending', outcome: null }
  }
  if (yes >= required) {
    return { ...base, status: 'resolved', outcome: 'yes' }
  }
  if (no >= required) {
    return { ...base, status: 'resolved', outcome: 'no' }
  }
  if (allVoted) {
    return { ...base, status: 'void', outcome: 'cancelled' }
  }
  return { ...base, status: 'late', outcome: 'cancelled' }
}

/** When a jury's votes are due: the market's close plus the voting window. */
export function computeJuryDeadline(closesAt: Date, windowHours: number): Date {
  return new Date(closesAt.getTime() + Math.max(1, windowHours) * 60 * 60 * 1000)
}

/**
 * What one juror can expect from a market: the jury's slice of the pool
 * share, split evenly across the seats. "About", because the pool moves until
 * close and only jurors who vote with the result are paid.
 */
export function estimateJurorPay(input: {
  poolMinor: bigint
  rakeBps: number
  juryShareBps: number
  seats: number
}): bigint {
  const seats = BigInt(Math.max(1, Math.floor(input.seats)))
  const rake = (input.poolMinor * BigInt(Math.max(0, input.rakeBps))) / 10_000n
  const jury = (rake * BigInt(Math.max(0, input.juryShareBps))) / 10_000n
  return jury / seats
}

export interface JurorRecord {
  marketsVoted: number
  onTime: number
  late: number
  agreed: number
  overturned: number
  ratingSum: number
  ratingCount: number
  dissentProven: number
}

export interface JurorSummary {
  markets: number
  /** Share of decided markets where the juror voted with the final result, 0–100; null before any decided market. */
  agreementPct: number | null
  /** Share of seated markets voted before the deadline, 0–100; null before any seat. */
  onTimePct: number | null
  /** Average loser rating 1–5, null until rated. */
  rating: number | null
  ratings: number
  overturned: number
  dissentProven: number
}

/** The headline numbers on a juror's public record. */
export function summarizeJuror(record: JurorRecord | null | undefined): JurorSummary {
  if (!record) {
    return {
      markets: 0,
      agreementPct: null,
      onTimePct: null,
      rating: null,
      ratings: 0,
      overturned: 0,
      dissentProven: 0,
    }
  }
  const seated = record.onTime + record.late
  const decided = record.marketsVoted
  return {
    markets: record.marketsVoted,
    agreementPct: decided > 0 ? Math.round((record.agreed / decided) * 100) : null,
    onTimePct: seated > 0 ? Math.round((record.onTime / seated) * 100) : null,
    rating: record.ratingCount > 0 ? Math.round((record.ratingSum / record.ratingCount) * 10) / 10 : null,
    ratings: record.ratingCount,
    overturned: record.overturned,
    dissentProven: record.dissentProven,
  }
}

/** Who may rate a resolution: a staker on the losing side, once the result is in. */
export function canRateResolution(input: { viewerResult: 'won' | 'lost' | 'refunded' | null; phase: string }): boolean {
  return (
    input.viewerResult === 'lost' && (input.phase === 'hold' || input.phase === 'settled' || input.phase === 'review')
  )
}
