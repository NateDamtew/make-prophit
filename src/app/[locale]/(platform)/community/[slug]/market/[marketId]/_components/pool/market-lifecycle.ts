import type { PoolSummary } from '@/lib/pools/service'

import type { PoolJuryVote, PoolMarketRecord } from './pool-market-types'

/**
 * One pure function turns the market row, the pool summary and the jury
 * votes into the state the page draws. Every screen on the market page
 * (hero, position card, side panel, bottom bar, footer strip) reads from
 * this rather than poking at raw fields.
 */

export type MarketPhase = 'open' | 'closing' | 'awaiting' | 'hold' | 'appeal' | 'review' | 'settled' | 'refunded'

export type MarketShape = 'binary' | 'multi'
export type MarketSource = 'community' | 'imported'
export type ViewerResult = 'won' | 'lost' | 'refunded' | null

export interface MarketLifecycle {
  phase: MarketPhase
  shape: MarketShape
  source: MarketSource
  /** The result, once the jury has decided. */
  outcome: 'yes' | 'no' | null
  refundReason: 'voided' | 'late' | null
  closesAt: number | null
  juryDueAt: number | null
  jury: { size: number; required: number; voted: number; revealed: boolean }
  hold: { announcedAt: number; paysAt: number; extended: boolean } | null
  viewer: {
    stake: { side: 'yes' | 'no' | 'mixed'; amountMinor: bigint; payoutMinor: bigint | null } | null
    result: ViewerResult
  }
  /** Odds for the Yes side, 0–1; null when the pool has no stakes. */
  chance: number | null
  poolMinor: bigint
  stakeCount: number
  currency: string | null
}

const CLOSING_WINDOW_MS = 2 * 60 * 60 * 1000

export function deriveMarketLifecycle(input: {
  market: PoolMarketRecord
  summary: PoolSummary | null
  votes: PoolJuryVote[]
  jurySize: number
  juryRequired: number
  now: number
}): MarketLifecycle {
  const { market, summary, votes, now } = input
  const pool = summary?.pool ?? null
  const closesAt = pool?.closesAt
    ? new Date(pool.closesAt).getTime()
    : market.resolution_date
      ? new Date(market.resolution_date).getTime()
      : null
  // The jury's deadline is the close plus the voting window; markets from before seats existed only have the close.
  const juryDueAt = market.jury_deadline_at
    ? new Date(market.jury_deadline_at).getTime()
    : market.resolution_date
      ? new Date(market.resolution_date).getTime()
      : null
  const totalYes = pool ? BigInt(pool.totalYes) : 0n
  const totalNo = pool ? BigInt(pool.totalNo) : 0n
  const poolMinor = totalYes + totalNo
  const chance = poolMinor > 0n && pool ? pool.odds.yes : null
  const source: MarketSource = pool?.isImported ? 'imported' : 'community'
  const shape: MarketShape = market.market_mode && market.market_mode !== 'binary' ? 'multi' : 'binary'

  const settledOutcome = pool?.settledOutcome ?? market.resolved_outcome ?? null
  const outcome: 'yes' | 'no' | null = settledOutcome === 'yes' || settledOutcome === 'no' ? settledOutcome : null
  const marketDone = market.status === 'resolved' || market.status === 'disputed' || market.status === 'cancelled'
  const refunded =
    pool?.state === 'cancelled' ||
    (marketDone && settledOutcome === 'cancelled') ||
    market.status === 'cancelled' ||
    market.status === 'disputed'
  const lateRefund =
    refunded &&
    (market.late_resolution === true ||
      (juryDueAt !== null && votes.length < input.juryRequired && market.status === 'cancelled'))

  let phase: MarketPhase
  if (refunded) {
    phase = 'refunded'
  } else if (pool?.state === 'settled') {
    phase = 'settled'
  } else if (pool?.state === 'held') {
    phase = pool.payoutsFrozen ? 'review' : 'hold'
  } else if (marketDone && outcome) {
    // The market resolved but the pool has not been computed yet: treat as held.
    phase = 'hold'
  } else if (pool && !pool.acceptingStakes) {
    phase = 'awaiting'
  } else if (closesAt !== null && closesAt <= now) {
    phase = 'awaiting'
  } else if (closesAt !== null && closesAt - now < CLOSING_WINDOW_MS) {
    phase = 'closing'
  } else {
    phase = 'open'
  }

  const hold =
    pool?.resultAnnouncedAt && pool.holdUntil
      ? {
          announcedAt: new Date(pool.resultAnnouncedAt).getTime(),
          paysAt: new Date(pool.holdUntil).getTime(),
          extended: false,
        }
      : null

  // Viewer position.
  let stake: MarketLifecycle['viewer']['stake'] = null
  let result: ViewerResult = null
  const user = summary?.user ?? null
  if (user && user.stakes.length > 0) {
    const yes = BigInt(user.totalYes)
    const no = BigInt(user.totalNo)
    const side: 'yes' | 'no' | 'mixed' = yes > 0n && no > 0n ? 'mixed' : yes > 0n ? 'yes' : 'no'
    const payout = user.totalPayout !== null ? BigInt(user.totalPayout) : null
    stake = { side, amountMinor: yes + no, payoutMinor: payout }
    if (phase === 'refunded') {
      result = 'refunded'
    } else if (phase === 'settled' || phase === 'hold' || phase === 'review') {
      result = payout !== null && payout > 0n ? 'won' : 'lost'
    }
  }

  return {
    phase,
    shape,
    source,
    outcome,
    refundReason: refunded ? (lateRefund ? 'late' : 'voided') : null,
    closesAt,
    juryDueAt,
    jury: {
      size: market.jury_seat_count ?? input.jurySize,
      required: market.jury_required_votes ?? input.juryRequired,
      voted: votes.length,
      revealed: marketDone || Boolean(market.votes_revealed_at) || votes.some((vote) => Boolean(vote.revealed_at)),
    },
    hold,
    viewer: { stake, result },
    chance,
    poolMinor,
    stakeCount: pool?.stakeCount ?? 0,
    currency: pool?.currency ?? null,
  }
}
