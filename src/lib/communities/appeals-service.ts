import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'

import type { AppealRuling, AppealRulingPlan } from '@/lib/communities/appeals-math'
import type { AppealEvidence, AppealStatus, MarketAppealRow } from '@/lib/db/schema/communities/appeals'
import type { EntryInput } from '@/lib/ledger/invariants'
import type { LedgerTx } from '@/lib/pools/service'

import { applyCommunityControls } from '@/lib/communities/admin-controls'
import {
  appealRulingIsConserved,
  appealThresholdReached,
  computeAppealTargets,
  planAppealRuling,
} from '@/lib/communities/appeals-math'
import { computeAppealHoldUntil } from '@/lib/communities/hold'
import { recomputeJurorStats } from '@/lib/communities/jury-service'
import { getCommunitySettings } from '@/lib/communities/settings'
import { users } from '@/lib/db/schema/auth/tables'
import {
  ACTIVE_APPEAL_STATUSES,
  appeal_backers,
  appeal_juror_opinions,
  market_appeals,
} from '@/lib/db/schema/communities/appeals'
import { community_earnings } from '@/lib/db/schema/communities/earnings'
import { juror_stats, market_jury_seats } from '@/lib/db/schema/communities/jury'
import { communities, community_markets, community_members, jury_votes } from '@/lib/db/schema/communities/tables'
import { ledger_user_profiles } from '@/lib/db/schema/ledger/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { LedgerService } from '@/lib/ledger/service'

/**
 * Appeals, end to end: a staker files one during the hold, other stakers
 * back it with escrow held on their cash, the threshold freezes payouts,
 * and a Prophit ruling moves the money (result stands, flips, or the market
 * is voided) and adjusts the community's trust ladder.
 */

export class AppealError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'market_not_found'
      | 'not_held'
      | 'window_closed'
      | 'not_a_staker'
      | 'appeal_exists'
      | 'appeal_not_found'
      | 'not_open'
      | 'below_minimum'
      | 'insufficient_funds'
      | 'already_backed'
      | 'not_filer'
      | 'already_ruled'
      | 'invalid',
  ) {
    super(message)
    this.name = 'AppealError'
  }
}

const ACTIVE = [...ACTIVE_APPEAL_STATUSES]

async function stakeOf(tx: LedgerTx | typeof db, poolId: string, userId: string) {
  const rows = await tx
    .select({ outcome: pool_stakes.outcome, amount: pool_stakes.amount })
    .from(pool_stakes)
    .where(and(eq(pool_stakes.pool_id, poolId), eq(pool_stakes.user_id, userId)))
  if (rows.length === 0) {
    return null
  }
  const yes = rows.filter((row) => row.outcome === 'yes').reduce((sum, row) => sum + row.amount, 0n)
  const no = rows.filter((row) => row.outcome === 'no').reduce((sum, row) => sum + row.amount, 0n)
  return {
    yes,
    no,
    total: yes + no,
    side: yes > 0n && no > 0n ? ('mixed' as const) : yes > 0n ? ('yes' as const) : ('no' as const),
  }
}

/** The one live appeal on a market, if any. */
async function getActiveAppeal(marketId: string, tx: LedgerTx | typeof db = db): Promise<MarketAppealRow | null> {
  const [row] = await tx
    .select()
    .from(market_appeals)
    .where(and(eq(market_appeals.community_market_id, marketId), inArray(market_appeals.status, ACTIVE)))
    .limit(1)
  return row ?? null
}

/** The latest appeal on a market, live or ruled, for the market and appeal pages. */
async function getLatestAppeal(marketId: string): Promise<MarketAppealRow | null> {
  const [row] = await db
    .select()
    .from(market_appeals)
    .where(eq(market_appeals.community_market_id, marketId))
    .orderBy(desc(market_appeals.created_at))
    .limit(1)
  return row ?? null
}

/**
 * File an appeal: any staker on the market, while the pool is held and the
 * hold has not run out, one live appeal per market. Filing is free; the
 * window to back it is the extended hold.
 */
export async function fileAppeal(params: {
  marketId: string
  userId: string
  claimedOutcome: 'yes' | 'no' | 'cancelled'
  reason: string
  evidence: AppealEvidence[]
  now?: Date
}): Promise<MarketAppealRow> {
  const now = params.now ?? new Date()
  const reason = params.reason.trim()
  if (reason.length < 40) {
    throw new AppealError('Say why the jury is wrong in at least 40 characters.', 'invalid')
  }
  return db.transaction(async (tx) => {
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, params.marketId))
      .for('update')
      .limit(1)
    if (!pool) {
      throw new AppealError('Market not found.', 'market_not_found')
    }
    if (pool.state !== 'held' || pool.payouts_frozen) {
      throw new AppealError('Appeals are open only while payouts are on hold.', 'not_held')
    }
    const announcedAt = pool.result_announced_at ?? now
    if (pool.hold_until && now.getTime() >= pool.hold_until.getTime()) {
      throw new AppealError('The appeal window on this market has closed.', 'window_closed')
    }
    if (pool.settled_outcome !== 'yes' && pool.settled_outcome !== 'no') {
      throw new AppealError('There is no result to appeal.', 'not_held')
    }
    if (params.claimedOutcome === pool.settled_outcome) {
      throw new AppealError('Your claim is the same as the result.', 'invalid')
    }
    if (await getActiveAppeal(params.marketId, tx)) {
      throw new AppealError('An appeal is already open on this market. Back it instead.', 'appeal_exists')
    }
    const stake = await stakeOf(tx, pool.id, params.userId)
    if (!stake) {
      throw new AppealError('Only stakers on this market can appeal.', 'not_a_staker')
    }
    const settings = await getCommunitySettings(pool.currency)
    const targets = computeAppealTargets(pool.total_yes + pool.total_no, settings.appeals)
    const windowEndsAt = pool.hold_extended_until ?? computeAppealHoldUntil(announcedAt, settings.hold)
    const [appeal] = await tx
      .insert(market_appeals)
      .values({
        community_market_id: params.marketId,
        pool_id: pool.id,
        filed_by: params.userId,
        original_outcome: pool.settled_outcome,
        claimed_outcome: params.claimedOutcome,
        reason,
        evidence: params.evidence.slice(0, 5),
        backers_needed: targets.backersNeeded,
        escrow_target: targets.escrowTargetMinor,
        currency: pool.currency,
        window_ends_at: windowEndsAt,
        created_at: now,
        updated_at: now,
      })
      .returning()
    if (!pool.hold_extended_until) {
      await tx.update(pools).set({ hold_extended_until: windowEndsAt }).where(eq(pools.id, pool.id))
    }
    await notifyStakers(tx, params.marketId, {
      kind: 'appeal_opened',
      title: 'An appeal is open on a market you staked on',
      description: 'Read the claim and back it if you agree. Payouts wait until the window closes.',
      excludeUserId: params.userId,
    })
    return appeal!
  })
}

/** Back an open appeal with escrow: a reservation on the backer's cash, returned or forfeited at the ruling. */
export async function backAppeal(params: { appealId: string; userId: string; amountMinor: bigint; now?: Date }) {
  const now = params.now ?? new Date()
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .select()
      .from(market_appeals)
      .where(eq(market_appeals.id, params.appealId))
      .for('update')
      .limit(1)
    if (!appeal) {
      throw new AppealError('Appeal not found.', 'appeal_not_found')
    }
    if (appeal.status !== 'open') {
      throw new AppealError(
        appeal.status === 'threshold_met' || appeal.status === 'under_review'
          ? 'This appeal has enough backing and is with Prophit.'
          : 'This appeal is no longer open.',
        'not_open',
      )
    }
    if (now.getTime() >= appeal.window_ends_at.getTime()) {
      throw new AppealError('The window to back this appeal has closed.', 'window_closed')
    }
    const stake = await stakeOf(tx, appeal.pool_id, params.userId)
    if (!stake) {
      throw new AppealError('Only stakers on this market can back an appeal.', 'not_a_staker')
    }
    const settings = await getCommunitySettings(appeal.currency)
    if (params.amountMinor < settings.appeals.minBackMinor) {
      throw new AppealError('That is below the minimum escrow.', 'below_minimum')
    }
    const [existing] = await tx
      .select({ id: appeal_backers.id })
      .from(appeal_backers)
      .where(and(eq(appeal_backers.appeal_id, appeal.id), eq(appeal_backers.user_id, params.userId)))
      .limit(1)
    if (existing) {
      throw new AppealError('You have already backed this appeal.', 'already_backed')
    }
    const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, appeal.currency, tx)
    if (cash.balance - cash.reserved < params.amountMinor) {
      throw new AppealError('You do not have enough available balance for that.', 'insufficient_funds')
    }
    const reservation = await LedgerService.reserve(
      {
        accountId: cash.id,
        amount: params.amountMinor,
        referenceType: 'appeal_back',
        referenceId: `${appeal.id}:${params.userId}`,
      },
      tx,
    )
    await tx.insert(appeal_backers).values({
      appeal_id: appeal.id,
      user_id: params.userId,
      amount: params.amountMinor,
      currency: appeal.currency,
      reservation_id: reservation.id,
      created_at: now,
    })
    const backerCount = appeal.backer_count + 1
    const escrowTotal = appeal.escrow_total + params.amountMinor
    const met = appealThresholdReached({
      backers: backerCount,
      backersNeeded: appeal.backers_needed,
      escrowMinor: escrowTotal,
      escrowTargetMinor: appeal.escrow_target,
    })
    const [updated] = await tx
      .update(market_appeals)
      .set({
        backer_count: backerCount,
        escrow_total: escrowTotal,
        status: met ? 'threshold_met' : 'open',
        threshold_met_at: met ? now : null,
        updated_at: now,
      })
      .where(eq(market_appeals.id, appeal.id))
      .returning()
    if (met) {
      await tx.update(pools).set({ payouts_frozen: true }).where(eq(pools.id, appeal.pool_id))
      await notifyStakers(tx, appeal.community_market_id, {
        kind: 'appeal_review',
        title: 'Payouts paused: Prophit is reviewing an appeal',
        description: 'Enough stakers backed the appeal. Nothing moves until Prophit rules.',
      })
    }
    return { appeal: updated!, thresholdMet: met }
  })
}

/** The filer takes the appeal back while it is still open; every backer's escrow is released. */
export async function withdrawAppeal(params: { appealId: string; userId: string; now?: Date }) {
  const now = params.now ?? new Date()
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .select()
      .from(market_appeals)
      .where(eq(market_appeals.id, params.appealId))
      .for('update')
      .limit(1)
    if (!appeal) {
      throw new AppealError('Appeal not found.', 'appeal_not_found')
    }
    if (appeal.filed_by !== params.userId) {
      throw new AppealError('Only the person who filed this appeal can withdraw it.', 'not_filer')
    }
    if (appeal.status !== 'open') {
      throw new AppealError('This appeal can no longer be withdrawn.', 'not_open')
    }
    await returnEscrow(tx, appeal.id, now)
    await tx
      .update(market_appeals)
      .set({ status: 'withdrawn', updated_at: now })
      .where(eq(market_appeals.id, appeal.id))
    return { ok: true }
  })
}

/** Appeals still open past their window: the result stands, the escrow goes back. Run by the pool cron. */
export async function expireAppeals(now = new Date()): Promise<string[]> {
  const stale = await db
    .select({ id: market_appeals.id })
    .from(market_appeals)
    .where(and(eq(market_appeals.status, 'open'), lte(market_appeals.window_ends_at, now)))
    .limit(50)
  const expired: string[] = []
  for (const row of stale) {
    await db.transaction(async (tx) => {
      const [appeal] = await tx
        .select({ id: market_appeals.id, status: market_appeals.status })
        .from(market_appeals)
        .where(eq(market_appeals.id, row.id))
        .for('update')
        .limit(1)
      if (!appeal || appeal.status !== 'open') {
        return
      }
      await returnEscrow(tx, appeal.id, now)
      await tx
        .update(market_appeals)
        .set({ status: 'expired', updated_at: now })
        .where(eq(market_appeals.id, appeal.id))
      expired.push(appeal.id)
    })
  }
  return expired
}

async function returnEscrow(tx: LedgerTx, appealId: string, now: Date) {
  const backers = await tx
    .select()
    .from(appeal_backers)
    .where(and(eq(appeal_backers.appeal_id, appealId), eq(appeal_backers.state, 'held')))
  for (const backer of backers) {
    await LedgerService.releaseReservation(backer.reservation_id, tx)
    await tx.update(appeal_backers).set({ state: 'returned', settled_at: now }).where(eq(appeal_backers.id, backer.id))
  }
}

/**
 * Move an appeal to review: jurors from other communities are asked for an
 * opinion (top-rated, no seat on this jury, no stake on the market).
 */
export async function startAppealReview(params: { appealId: string; count?: number; now?: Date }) {
  const now = params.now ?? new Date()
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .select()
      .from(market_appeals)
      .where(eq(market_appeals.id, params.appealId))
      .for('update')
      .limit(1)
    if (!appeal) {
      throw new AppealError('Appeal not found.', 'appeal_not_found')
    }
    if (!ACTIVE.includes(appeal.status)) {
      throw new AppealError('This appeal has already been decided.', 'already_ruled')
    }
    const [market] = await tx
      .select({ community_id: community_markets.community_id })
      .from(community_markets)
      .where(eq(community_markets.id, appeal.community_market_id))
      .limit(1)
    const settings = await getCommunitySettings(appeal.currency)
    const count = Math.max(0, params.count ?? settings.appeals.appealJurors)
    const already = await tx
      .select({ juror_id: appeal_juror_opinions.juror_id })
      .from(appeal_juror_opinions)
      .where(eq(appeal_juror_opinions.appeal_id, appeal.id))
    if (count > already.length && market) {
      const candidates = await tx
        .select({ user_id: juror_stats.user_id })
        .from(juror_stats)
        .where(
          and(
            sql`${juror_stats.user_id} NOT IN (SELECT user_id FROM ${community_members} WHERE community_id = ${market.community_id})`,
            sql`${juror_stats.user_id} NOT IN (SELECT user_id FROM ${pool_stakes} WHERE pool_id = ${appeal.pool_id})`,
            sql`${juror_stats.user_id} NOT IN (SELECT juror_id FROM ${market_jury_seats} WHERE community_market_id = ${appeal.community_market_id})`,
            sql`${juror_stats.markets_voted} > 0`,
          ),
        )
        .orderBy(
          desc(
            sql`CASE WHEN ${juror_stats.rating_count} > 0 THEN ${juror_stats.rating_sum}::float / ${juror_stats.rating_count} ELSE 0 END`,
          ),
          desc(juror_stats.markets_voted),
        )
        .limit(count - already.length)
      if (candidates.length > 0) {
        await tx
          .insert(appeal_juror_opinions)
          .values(candidates.map((row) => ({ appeal_id: appeal.id, juror_id: row.user_id, asked_at: now })))
          .onConflictDoNothing()
        await tx.insert(notifications).values(
          candidates.map((row) => ({
            user_id: row.user_id,
            category: 'general',
            title: 'Prophit is asking for your opinion on an appeal',
            description: 'A result in another community is under appeal. Your read on the verdicts helps the ruling.',
            link_type: 'custom',
            link_url: `/community/${appeal.community_market_id}`,
            link_label: 'Read the appeal',
            metadata: { kind: 'appeal_opinion_due', appeal_id: appeal.id, market_id: appeal.community_market_id },
          })),
        )
      }
    }
    const [updated] = await tx
      .update(market_appeals)
      .set({ status: 'under_review', updated_at: now })
      .where(eq(market_appeals.id, appeal.id))
      .returning()
    return updated!
  })
}

interface RulingContext {
  appeal: MarketAppealRow
  pool: typeof pools.$inferSelect
  community: { id: string; creator_id: string; level: number; upheld_appeal_count: number }
  stakes: Array<typeof pool_stakes.$inferSelect>
  backers: Array<typeof appeal_backers.$inferSelect>
  jurors: Array<{ userId: string; vote: 'yes' | 'no' | 'disputed' }>
  appealJurorIds: string[]
}

async function loadRulingContext(tx: LedgerTx, appealId: string, forUpdate: boolean): Promise<RulingContext> {
  const appealQuery = tx.select().from(market_appeals).where(eq(market_appeals.id, appealId)).limit(1)
  const [appeal] = forUpdate ? await appealQuery.for('update') : await appealQuery
  if (!appeal) {
    throw new AppealError('Appeal not found.', 'appeal_not_found')
  }
  const poolQuery = tx.select().from(pools).where(eq(pools.id, appeal.pool_id)).limit(1)
  const [pool] = forUpdate ? await poolQuery.for('update') : await poolQuery
  if (!pool) {
    throw new AppealError('Market not found.', 'market_not_found')
  }
  const [community] = await tx
    .select({
      id: communities.id,
      creator_id: communities.creator_id,
      level: communities.level,
      upheld_appeal_count: communities.upheld_appeal_count,
    })
    .from(communities)
    .where(eq(communities.id, pool.community_id))
    .limit(1)
  if (!community) {
    throw new AppealError('Community not found.', 'market_not_found')
  }
  const [stakes, backers, seats, votes, opinions] = await Promise.all([
    tx.select().from(pool_stakes).where(eq(pool_stakes.pool_id, pool.id)),
    tx
      .select()
      .from(appeal_backers)
      .where(and(eq(appeal_backers.appeal_id, appeal.id), eq(appeal_backers.state, 'held'))),
    tx
      .select({ juror_id: market_jury_seats.juror_id })
      .from(market_jury_seats)
      .where(eq(market_jury_seats.community_market_id, appeal.community_market_id)),
    tx
      .select({ juror_id: jury_votes.juror_id, vote: jury_votes.vote })
      .from(jury_votes)
      .where(eq(jury_votes.community_market_id, appeal.community_market_id)),
    tx
      .select({ juror_id: appeal_juror_opinions.juror_id, opinion: appeal_juror_opinions.opinion })
      .from(appeal_juror_opinions)
      .where(eq(appeal_juror_opinions.appeal_id, appeal.id)),
  ])
  const voteByJuror = new Map(votes.map((vote) => [vote.juror_id, vote.vote as 'yes' | 'no' | 'disputed']))
  const seatIds = seats.length > 0 ? seats.map((seat) => seat.juror_id) : votes.map((vote) => vote.juror_id)
  return {
    appeal,
    pool,
    community,
    stakes,
    backers,
    jurors: seatIds.map((userId) => ({ userId, vote: voteByJuror.get(userId) ?? 'disputed' })),
    appealJurorIds: opinions.filter((row) => row.opinion !== null).map((row) => row.juror_id),
  }
}

function buildPlan(context: RulingContext, ruling: AppealRuling): AppealRulingPlan {
  const plan = planAppealRuling({
    ruling,
    claimedOutcome: context.appeal.claimed_outcome,
    originalOutcome: context.appeal.original_outcome,
    stakes: context.stakes.map((stake) => ({
      id: stake.id,
      userId: stake.user_id,
      outcome: stake.outcome,
      amount: stake.amount,
    })),
    backers: context.backers.map((backer) => ({ userId: backer.user_id, amount: backer.amount })),
    rakeBps: context.pool.rake_bps,
    ownerShareBps: context.pool.owner_share_bps,
    juryShareBps: context.pool.jury_share_bps,
    jurors: context.jurors,
    appealJurorIds: context.appealJurorIds,
    ownerUserId: context.community.creator_id,
  })
  if (!appealRulingIsConserved(plan)) {
    throw new AppealError('The ruling plan does not conserve the pool.', 'invalid')
  }
  return plan
}

export interface RulingPreview {
  ruling: AppealRuling
  outcome: 'yes' | 'no' | 'cancelled'
  refunded: boolean
  totalPoolMinor: string
  totalEscrowMinor: string
  escrowReturned: boolean
  /** Per person, what the ruling pays or returns, with the reasons behind it. */
  lines: Array<{ to: string; amountMinor: string; reason: string }>
  currency: string
}

function summarize(plan: AppealRulingPlan, currency: string): RulingPreview {
  const lines = [...plan.poolMoves, ...plan.escrowMoves].map((move) => ({
    to: move.to.kind === 'user' ? move.to.userId : move.to.kind,
    amountMinor: move.amount.toString(),
    reason: move.reason,
  }))
  return {
    ruling: plan.ruling,
    outcome: plan.outcome,
    refunded: plan.refunded,
    totalPoolMinor: plan.totalPool.toString(),
    totalEscrowMinor: plan.totalEscrow.toString(),
    escrowReturned: plan.escrowReturned,
    lines,
    currency,
  }
}

/** What each ruling would do with the money, for the admin's desk before they decide. */
export async function previewAppealRuling(appealId: string): Promise<Record<AppealRuling, RulingPreview>> {
  return db.transaction(async (tx) => {
    const context = await loadRulingContext(tx, appealId, false)
    return {
      rejected: summarize(buildPlan(context, 'rejected'), context.pool.currency),
      upheld: summarize(buildPlan(context, 'upheld'), context.pool.currency),
      voided: summarize(buildPlan(context, 'voided'), context.pool.currency),
    }
  })
}

/**
 * The ruling. One balanced ledger transaction (`appeal_ruling:<id>`) moves
 * the pool and settles the escrow; the pool is marked settled or cancelled;
 * on an upheld appeal the overturned votes are marked, the community loses
 * a level and a second upheld appeal pauses it.
 */
export async function ruleAppeal(params: {
  appealId: string
  adminId: string
  ruling: AppealRuling
  text: string
  now?: Date
}) {
  const now = params.now ?? new Date()
  const text = params.text.trim()
  if (text.length < 20) {
    throw new AppealError('Write the ruling in at least 20 characters; the stakers read it.', 'invalid')
  }
  const result = await db.transaction(async (tx) => {
    const context = await loadRulingContext(tx, params.appealId, true)
    const { appeal, pool, community, stakes, backers } = context
    if (!ACTIVE.includes(appeal.status)) {
      throw new AppealError('This appeal has already been decided.', 'already_ruled')
    }
    if (pool.state !== 'held') {
      throw new AppealError('The pool is no longer on hold.', 'not_held')
    }
    const plan = buildPlan(context, params.ruling)
    const currency = pool.currency

    async function payeeAccountId(userId: string) {
      const [profile] = await tx
        .select({ currency: ledger_user_profiles.currency })
        .from(ledger_user_profiles)
        .where(eq(ledger_user_profiles.user_id, userId))
        .limit(1)
      if (profile && profile.currency === currency) {
        return (await LedgerService.getOrCreateUserCashAccount(userId, currency, tx)).id
      }
      return (await LedgerService.getOrCreateHouseAccount('earnings_payable', currency, tx, userId)).id
    }
    const prophitAccount = await LedgerService.getOrCreateHouseAccount('pool_rake', currency, tx)
    const roundingAccount = await LedgerService.getOrCreateHouseAccount('rounding', currency, tx)
    async function accountFor(to: AppealRulingPlan['poolMoves'][number]['to']) {
      if (to.kind === 'user') {
        return payeeAccountId(to.userId)
      }
      return to.kind === 'prophit' ? prophitAccount.id : roundingAccount.id
    }

    const entries: EntryInput[] = []
    const earnings: Array<{ userId: string; role: 'owner' | 'juror' | 'appeal_juror'; amount: bigint }> = []
    let ownerPaid = 0n
    let juryPaid = 0n
    if (plan.totalPool > 0n) {
      const poolAccount = await LedgerService.getOrCreateHouseAccount('pool', currency, tx, pool.id)
      entries.push({ accountId: poolAccount.id, side: 'debit', amount: plan.totalPool, currency })
      for (const move of plan.poolMoves) {
        entries.push({ accountId: await accountFor(move.to), side: 'credit', amount: move.amount, currency })
        if (move.to.kind === 'user' && move.reason === 'owner_share') {
          ownerPaid += move.amount
          earnings.push({ userId: move.to.userId, role: 'owner', amount: move.amount })
        } else if (move.to.kind === 'user' && move.reason === 'jury_share') {
          juryPaid += move.amount
          earnings.push({ userId: move.to.userId, role: 'juror', amount: move.amount })
        } else if (move.to.kind === 'user' && move.reason === 'overturned_pot') {
          earnings.push({ userId: move.to.userId, role: 'appeal_juror', amount: move.amount })
        }
      }
    }
    const consume: Array<{ reservationId: string; amountUsed: bigint }> = []
    if (!plan.escrowReturned && plan.totalEscrow > 0n) {
      // Forfeited escrow leaves each backer's cash and lands with the owner and the jurors who were right.
      for (const backer of backers) {
        const cash = await LedgerService.getOrCreateUserCashAccount(backer.user_id, currency, tx)
        entries.push({ accountId: cash.id, side: 'debit', amount: backer.amount, currency })
        consume.push({ reservationId: backer.reservation_id, amountUsed: backer.amount })
      }
      for (const move of plan.escrowMoves) {
        entries.push({ accountId: await accountFor(move.to), side: 'credit', amount: move.amount, currency })
        if (move.to.kind === 'user') {
          earnings.push({
            userId: move.to.userId,
            role: move.to.userId === community.creator_id ? 'owner' : 'juror',
            amount: move.amount,
          })
        }
      }
    }

    let transactionId: string | null = null
    if (entries.length > 0) {
      const posted = await LedgerService.postTransaction(
        {
          kind: plan.refunded ? 'pool_refund' : 'pool_settlement',
          referenceType: 'appeal',
          referenceId: appeal.id,
          idempotencyKey: `appeal_ruling:${appeal.id}`,
          description: `Appeal ${params.ruling}: market ${plan.refunded ? 'voided' : `settled ${plan.outcome.toUpperCase()}`}`,
          metadata: {
            communityMarketId: appeal.community_market_id,
            poolId: pool.id,
            ruling: params.ruling,
            outcome: plan.outcome,
            escrow: plan.totalEscrow.toString(),
            escrowReturned: plan.escrowReturned,
          },
          entries,
          consumeReservations: consume,
          createdByUserId: params.adminId,
        },
        tx,
      )
      transactionId = posted.transactionId
      if (!posted.alreadyPosted) {
        for (const earning of earnings) {
          await tx.insert(community_earnings).values({
            community_id: pool.community_id,
            user_id: earning.userId,
            role: earning.role,
            pool_id: pool.id,
            amount: earning.amount,
            currency,
            ledger_transaction_id: transactionId,
          })
        }
      }
    }
    if (plan.escrowReturned) {
      await returnEscrow(tx, appeal.id, now)
    } else {
      await tx
        .update(appeal_backers)
        .set({ state: 'forfeited', settled_at: now })
        .where(and(eq(appeal_backers.appeal_id, appeal.id), eq(appeal_backers.state, 'held')))
    }

    for (const stake of stakes) {
      await tx
        .update(pool_stakes)
        .set({ payout: plan.payouts.get(stake.id) ?? 0n, paid_at: now })
        .where(eq(pool_stakes.id, stake.id))
    }
    const rake = plan.refunded ? 0n : (plan.totalPool * BigInt(pool.rake_bps)) / 10_000n
    await tx
      .update(pools)
      .set({
        state: plan.refunded ? 'cancelled' : 'settled',
        planned_outcome: plan.outcome,
        settled_outcome: plan.outcome,
        settled_at: now,
        released_at: now,
        settlement_tx_id: transactionId,
        rake_paid: rake,
        owner_paid: ownerPaid,
        jury_paid: juryPaid,
        payouts_frozen: false,
        voting_juror_ids: context.jurors.filter((juror) => juror.vote === plan.outcome).map((juror) => juror.userId),
      })
      .where(eq(pools.id, pool.id))
    await tx
      .update(community_markets)
      .set({
        status: plan.refunded ? 'disputed' : 'resolved',
        resolved_outcome: plan.outcome,
        resolution_kind: 'admin',
        updated_at: now,
      })
      .where(eq(community_markets.id, appeal.community_market_id))
    if (params.ruling === 'upheld' || params.ruling === 'voided') {
      // The jurors who voted the overturned result carry it on their record.
      const original = appeal.original_outcome
      await tx
        .update(jury_votes)
        .set({
          overturned: sql<boolean>`${jury_votes.vote} = ${original}`,
          agreed_with_outcome: plan.outcome === 'cancelled' ? null : sql<boolean>`${jury_votes.vote} = ${plan.outcome}`,
        })
        .where(eq(jury_votes.community_market_id, appeal.community_market_id))
    }
    const [ruled] = await tx
      .update(market_appeals)
      .set({
        status: params.ruling,
        ruling: params.ruling,
        ruling_text: text,
        ruled_by: params.adminId,
        ruled_at: now,
        ruling_tx_id: transactionId,
        updated_at: now,
      })
      .where(eq(market_appeals.id, appeal.id))
      .returning()
    if (params.ruling === 'upheld') {
      await tx
        .update(communities)
        .set({ upheld_appeal_count: community.upheld_appeal_count + 1, updated_at: now })
        .where(eq(communities.id, community.id))
    }
    await notifyStakers(tx, appeal.community_market_id, {
      kind: 'appeal_ruled',
      title:
        params.ruling === 'rejected'
          ? 'Appeal rejected: the result stands'
          : params.ruling === 'upheld'
            ? `Appeal upheld: the result is now ${plan.outcome === 'cancelled' ? 'void' : plan.outcome.toUpperCase()}`
            : 'Market voided: every stake is back',
      description: text,
    })
    return { appeal: ruled!, plan, community }
  })

  // After the money: records and the trust ladder. Each is best effort.
  const seatedIds =
    result.plan.ruling === 'rejected'
      ? []
      : Array.from(new Set(result.plan.poolMoves.map((m) => (m.to.kind === 'user' ? m.to.userId : '')).filter(Boolean)))
  const jurorIds = await db
    .select({ juror_id: market_jury_seats.juror_id })
    .from(market_jury_seats)
    .where(eq(market_jury_seats.community_market_id, result.appeal.community_market_id))
  await recomputeJurorStats([...jurorIds.map((row) => row.juror_id), ...seatedIds]).catch((error) =>
    console.error('[appeals] stats recompute failed', error),
  )
  if (params.ruling === 'upheld') {
    const upheld = result.community.upheld_appeal_count + 1
    const nextLevel = Math.max(0, result.community.level - 1) as 0 | 1 | 2
    await applyCommunityControls(
      result.community.id,
      {
        level: nextLevel !== result.community.level ? nextLevel : undefined,
        status: upheld >= 2 ? 'paused' : undefined,
        reason: `Appeal upheld on market ${result.appeal.community_market_id}${upheld >= 2 ? ' (second upheld appeal)' : ''}`,
      },
      params.adminId,
    ).catch((error) => console.error('[appeals] trust effect failed', error))
  }
  return result.appeal
}

async function notifyStakers(
  tx: LedgerTx,
  marketId: string,
  notice: { kind: string; title: string; description: string; excludeUserId?: string },
) {
  const [market] = await tx
    .select({ title: community_markets.title, slug: communities.slug })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(eq(community_markets.id, marketId))
    .limit(1)
  const stakers = await tx
    .selectDistinct({ user_id: pool_stakes.user_id })
    .from(pool_stakes)
    .innerJoin(pools, eq(pools.id, pool_stakes.pool_id))
    .where(eq(pools.community_market_id, marketId))
  const recipients = stakers.map((row) => row.user_id).filter((id) => id !== notice.excludeUserId)
  if (!market || recipients.length === 0) {
    return
  }
  await tx.insert(notifications).values(
    recipients.map((userId) => ({
      user_id: userId,
      category: 'general',
      title: notice.title,
      description: `${market.title}. ${notice.description}`,
      link_type: 'custom',
      link_url: `/community/${market.slug}/market/${marketId}/appeal`,
      link_label: 'See the appeal',
      metadata: { kind: notice.kind, market_id: marketId },
    })),
  )
}

export interface AppealView {
  id: string
  status: AppealStatus
  originalOutcome: 'yes' | 'no'
  claimedOutcome: 'yes' | 'no' | 'cancelled'
  reason: string
  evidence: AppealEvidence[]
  filedBy: {
    userId: string
    username: string | null
    image: string | null
    stakeSide: 'yes' | 'no' | 'mixed' | null
    stakeMinor: string
  }
  backersNeeded: number
  escrowTargetMinor: string
  backerCount: number
  escrowTotalMinor: string
  currency: string
  windowEndsAt: string
  createdAt: string
  thresholdMetAt: string | null
  ruling: AppealRuling | null
  rulingText: string | null
  ruledAt: string | null
  backers: Array<{
    userId: string
    username: string | null
    image: string | null
    amountMinor: string
    stakeSide: 'yes' | 'no' | 'mixed' | null
    stakeMinor: string
    isFiler: boolean
  }>
  opinions: Array<{ username: string | null; image: string | null; opinion: 'stand' | 'flip' | 'void' | null }>
}

/** Everything the appeal page and the market's appeal section show, as client-safe data. */
export async function getAppealView(marketId: string): Promise<AppealView | null> {
  const appeal = await getLatestAppeal(marketId)
  if (!appeal) {
    return null
  }
  const [filer] = await db
    .select({ username: users.username, image: users.image })
    .from(users)
    .where(eq(users.id, appeal.filed_by))
    .limit(1)
  const backers = await db
    .select({
      user_id: appeal_backers.user_id,
      amount: appeal_backers.amount,
      username: users.username,
      image: users.image,
    })
    .from(appeal_backers)
    .innerJoin(users, eq(users.id, appeal_backers.user_id))
    .where(eq(appeal_backers.appeal_id, appeal.id))
    .orderBy(appeal_backers.created_at)
  const opinions = await db
    .select({ opinion: appeal_juror_opinions.opinion, username: users.username, image: users.image })
    .from(appeal_juror_opinions)
    .innerJoin(users, eq(users.id, appeal_juror_opinions.juror_id))
    .where(eq(appeal_juror_opinions.appeal_id, appeal.id))
  const stakeIds = Array.from(new Set([appeal.filed_by, ...backers.map((row) => row.user_id)]))
  const stakeRows = stakeIds.length
    ? await db
        .select({ user_id: pool_stakes.user_id, outcome: pool_stakes.outcome, amount: pool_stakes.amount })
        .from(pool_stakes)
        .where(and(eq(pool_stakes.pool_id, appeal.pool_id), inArray(pool_stakes.user_id, stakeIds)))
    : []
  const stakeByUser = new Map<string, { yes: bigint; no: bigint }>()
  for (const row of stakeRows) {
    const entry = stakeByUser.get(row.user_id) ?? { yes: 0n, no: 0n }
    if (row.outcome === 'yes') {
      entry.yes += row.amount
    } else {
      entry.no += row.amount
    }
    stakeByUser.set(row.user_id, entry)
  }
  function stakeOfUser(userId: string) {
    const entry = stakeByUser.get(userId)
    if (!entry) {
      return { side: null, minor: '0' }
    }
    const side = entry.yes > 0n && entry.no > 0n ? 'mixed' : entry.yes > 0n ? 'yes' : 'no'
    return { side: side as 'yes' | 'no' | 'mixed', minor: (entry.yes + entry.no).toString() }
  }
  const filerStake = stakeOfUser(appeal.filed_by)
  return {
    id: appeal.id,
    status: appeal.status,
    originalOutcome: appeal.original_outcome,
    claimedOutcome: appeal.claimed_outcome,
    reason: appeal.reason,
    evidence: appeal.evidence,
    filedBy: {
      userId: appeal.filed_by,
      username: filer?.username ?? null,
      image: filer?.image ?? null,
      stakeSide: filerStake.side,
      stakeMinor: filerStake.minor,
    },
    backersNeeded: appeal.backers_needed,
    escrowTargetMinor: appeal.escrow_target.toString(),
    backerCount: appeal.backer_count,
    escrowTotalMinor: appeal.escrow_total.toString(),
    currency: appeal.currency,
    windowEndsAt: appeal.window_ends_at.toISOString(),
    createdAt: appeal.created_at.toISOString(),
    thresholdMetAt: appeal.threshold_met_at?.toISOString() ?? null,
    ruling: appeal.ruling,
    rulingText: appeal.ruling_text,
    ruledAt: appeal.ruled_at?.toISOString() ?? null,
    backers: backers.map((row) => {
      const stake = stakeOfUser(row.user_id)
      return {
        userId: row.user_id,
        username: row.username,
        image: row.image,
        amountMinor: row.amount.toString(),
        stakeSide: stake.side,
        stakeMinor: stake.minor,
        isFiler: row.user_id === appeal.filed_by,
      }
    }),
    opinions: opinions.map((row) => ({ username: row.username, image: row.image, opinion: row.opinion })),
  }
}

/** What the viewer may do on this appeal: file, back, withdraw. */
export async function getAppealViewerState(marketId: string, userId: string | null, now = new Date()) {
  if (!userId) {
    return {
      staked: false,
      stakeSide: null,
      stakeMinor: '0',
      backedMinor: '0',
      availableMinor: '0',
      canFile: false,
      canBack: false,
      isFiler: false,
    }
  }
  const [pool] = await db.select().from(pools).where(eq(pools.community_market_id, marketId)).limit(1)
  if (!pool) {
    return {
      staked: false,
      stakeSide: null,
      stakeMinor: '0',
      backedMinor: '0',
      availableMinor: '0',
      canFile: false,
      canBack: false,
      isFiler: false,
    }
  }
  const [stake, appeal, balance] = await Promise.all([
    stakeOf(db, pool.id, userId),
    getActiveAppeal(marketId),
    LedgerService.getUserBalance(userId, pool.currency).catch(() => null),
  ])
  let backedMinor = 0n
  if (appeal) {
    const [backer] = await db
      .select({ amount: appeal_backers.amount })
      .from(appeal_backers)
      .where(and(eq(appeal_backers.appeal_id, appeal.id), eq(appeal_backers.user_id, userId)))
      .limit(1)
    backedMinor = backer?.amount ?? 0n
  }
  const held = pool.state === 'held' && !pool.payouts_frozen
  const windowOpen = pool.hold_until ? now.getTime() < pool.hold_until.getTime() : held
  return {
    staked: Boolean(stake),
    stakeSide: stake?.side ?? null,
    stakeMinor: stake?.total.toString() ?? '0',
    backedMinor: backedMinor.toString(),
    availableMinor: (balance?.available ?? 0n).toString(),
    canFile: Boolean(stake) && held && windowOpen && !appeal,
    canBack:
      Boolean(stake) &&
      appeal?.status === 'open' &&
      backedMinor === 0n &&
      now.getTime() < (appeal?.window_ends_at.getTime() ?? 0),
    isFiler: appeal?.filed_by === userId,
  }
}
