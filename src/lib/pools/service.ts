import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { CapsOverride, CommunityLevel, LevelCaps } from '@/lib/communities/rules'
import type { PoolOutcome } from '@/lib/db/schema/pools/tables'
import type { EntryInput } from '@/lib/ledger/invariants'

import { computeAppealHoldUntil, computeHoldUntil, decideRelease } from '@/lib/communities/hold'
import { getEffectiveCaps, isCommunityLevel } from '@/lib/communities/rules'
import { getCommunitySettings } from '@/lib/communities/settings'
import { community_earnings } from '@/lib/db/schema/communities/earnings'
import { communities, community_markets, jury_votes } from '@/lib/db/schema/communities/tables'
import { ledger_user_profiles } from '@/lib/db/schema/ledger/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { LedgerError, LedgerService } from '@/lib/ledger/service'
import { recordConsent } from '@/lib/mobile-money/consent'
import { hasCurrentConsent } from '@/lib/mobile-money/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import {
  estimatePayout,
  impliedOdds,
  planSettlement,
  rakeSplitIsConserved,
  settlementIsConserved,
  splitRake,
} from '@/lib/pools/math'

/**
 * Pool engine: open → stake → (close) → held → settle. Every money movement
 * is a balanced ledger transaction against the pool's own house account
 * (kind 'pool', owner_id = pool id), so a pool's ledger balance always equals
 * total_yes + total_no until payouts are released, and zero after.
 *
 * Between the jury's result and the payout the pool is `held`: payouts are
 * computed and written to pool_stakes.payout at once, the ledger posts only
 * when the hold ends (lib/communities/hold.ts) or an admin ruling forces it.
 */

export type PoolRow = typeof pools.$inferSelect
export type PoolStakeRow = typeof pool_stakes.$inferSelect
export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// The market creator's own slice (legacy, pre-Communities v1); owners and jurors are paid from the level's split.
const DEFAULT_POOL_CREATOR_SHARE_BPS = 0

export class PoolError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'pool_not_found'
      | 'pool_closed'
      | 'pool_settled'
      | 'pool_held'
      | 'community_paused'
      | 'currency_mismatch'
      | 'no_profile'
      | 'frozen'
      | 'below_minimum'
      | 'per_person_cap'
      | 'pool_cap'
      | 'insufficient_funds'
      | 'market_not_resolved'
      | 'invalid',
  ) {
    super(message)
    this.name = 'PoolError'
  }
}

export const POOL_ERROR_MESSAGES: Record<PoolError['code'], string> = {
  pool_not_found: 'This market does not have a pool.',
  pool_closed: 'This market is closed for new stakes.',
  pool_settled: 'This market has already been settled.',
  pool_held: 'The result is in. Payouts are on hold while anyone can appeal.',
  community_paused: 'This community is paused by Prophit. No new stakes for now.',
  currency_mismatch: 'Your balance is in a different currency from this community.',
  no_profile: 'Make a deposit first to start staking.',
  frozen: 'Trading is temporarily unavailable on your account. Please contact support.',
  below_minimum: 'That stake is below the minimum.',
  per_person_cap: 'That takes you over the cap for one person on this market.',
  pool_cap: 'This pool has reached its limit for now.',
  insufficient_funds: 'You do not have enough available balance for that stake.',
  market_not_resolved: 'The market has not been resolved yet.',
  invalid: 'Something went wrong. Please try again.',
}

/** Resolve the currency a community's pools run in: explicit, else the first enabled currency. */
export async function resolveCommunityCurrency(communityId: string): Promise<string> {
  const [row] = await db
    .select({ currency: communities.currency })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)
  if (row?.currency) {
    return row.currency
  }
  const settings = await getMobileMoneySettings()
  return settings.enabledCurrencies[0] ?? 'KES'
}

interface PoolCommunityContext {
  id: string
  creatorId: string
  level: CommunityLevel
  status: string
  currency: string
  caps: LevelCaps
  minStakeMinor: bigint
  holdHours: number
  appealMaxHours: number
}

/** The community's level, caps and money settings, as the pool engine needs them. */
async function loadPoolCommunity(tx: LedgerTx, communityId: string, currency: string): Promise<PoolCommunityContext> {
  const [row] = await tx
    .select({
      id: communities.id,
      creator_id: communities.creator_id,
      level: communities.level,
      status: communities.status,
      caps_override: communities.caps_override,
      review_mode_override: communities.review_mode_override,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)
  if (!row) {
    throw new PoolError(POOL_ERROR_MESSAGES.pool_not_found, 'pool_not_found')
  }
  const settings = await getCommunitySettings(currency)
  const level: CommunityLevel = isCommunityLevel(row.level) ? row.level : 0
  const override: CapsOverride | null = row.caps_override
    ? {
        maxMembers: row.caps_override.maxMembers,
        maxPoolPerMarketMinor: row.caps_override.maxPoolPerMarketMinor
          ? BigInt(row.caps_override.maxPoolPerMarketMinor)
          : undefined,
        maxPerPersonMinor: row.caps_override.maxPerPersonMinor
          ? BigInt(row.caps_override.maxPerPersonMinor)
          : undefined,
      }
    : null
  const reviewOverride =
    row.review_mode_override === 'every' || row.review_mode_override === 'spot' || row.review_mode_override === 'none'
      ? row.review_mode_override
      : null
  return {
    id: row.id,
    creatorId: row.creator_id,
    level,
    status: row.status,
    currency,
    caps: getEffectiveCaps(settings.levels[level], override, reviewOverride),
    minStakeMinor: settings.stakes.minStakeMinor,
    holdHours: settings.hold.holdHours,
    appealMaxHours: settings.hold.appealMaxHours,
  }
}

/** Open a pool for an approved community market. Idempotent per market. */
export async function openPoolForMarket(params: {
  communityMarketId: string
  communityId: string
  closesAt: Date | null
  currency?: string
  rakeBps?: number
  creatorShareBps?: number
  /** Imported from a main-platform market: settles from its source, no jury share, no hold. */
  isImported?: boolean
}): Promise<PoolRow> {
  const currency = (params.currency ?? (await resolveCommunityCurrency(params.communityId))).toUpperCase()
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, params.communityMarketId))
      .limit(1)
    if (existing) {
      return existing
    }
    // The pool share and its split come from the community's trust level at
    // the moment the market opens; a later level change affects new markets only.
    const community = await loadPoolCommunity(tx, params.communityId, currency)
    const [created] = await tx
      .insert(pools)
      .values({
        community_market_id: params.communityMarketId,
        community_id: params.communityId,
        currency,
        rake_bps: params.rakeBps ?? community.caps.rakeBps,
        creator_share_bps: params.creatorShareBps ?? DEFAULT_POOL_CREATOR_SHARE_BPS,
        owner_share_bps: community.caps.ownerShareBps,
        jury_share_bps: community.caps.juryShareBps,
        is_imported: params.isImported ?? false,
        state: 'open',
        closes_at: params.closesAt,
      })
      .onConflictDoNothing()
      .returning()
    if (created) {
      // Create the pool's ledger account up front so reconciliation can see it.
      await LedgerService.getOrCreateHouseAccount('pool', currency, tx, created.id)
      return created
    }
    const [raced] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, params.communityMarketId))
      .limit(1)
    return raced!
  })
}

export async function getPoolByMarket(communityMarketId: string, tx?: LedgerTx): Promise<PoolRow | null> {
  const t = tx ?? db
  const [row] = await t.select().from(pools).where(eq(pools.community_market_id, communityMarketId)).limit(1)
  return row ?? null
}

export interface PoolSummary {
  pool: {
    id: string
    state: PoolRow['state']
    currency: string
    rakeBps: number
    closesAt: string | null
    totalYes: string
    totalNo: string
    stakeCount: number
    settledOutcome: PoolRow['settled_outcome']
    settledAt: string | null
    odds: { yes: number; no: number }
    acceptingStakes: boolean
    /** Hold: when the result was announced and when payouts land (null until held). */
    resultAnnouncedAt: string | null
    holdUntil: string | null
    holdExtendedUntil: string | null
    payoutsFrozen: boolean
    releasedAt: string | null
    isImported: boolean
    ownerShareBps: number
    juryShareBps: number
  }
  user: {
    currency: string | null
    availableMinor: string
    stakes: Array<{
      id: string
      outcome: PoolOutcome
      amountMinor: string
      payoutMinor: string | null
      createdAt: string
    }>
    totalYes: string
    totalNo: string
    /** Computed payout once the result is in (held or paid); null while open. */
    totalPayout: string | null
    /** How much more this person may stake on this market under the per-person cap. */
    stakeCapRemainingMinor: string
  } | null
  minStakeMinor: string
  caps: { maxPerPersonMinor: string; maxPoolPerMarketMinor: string }
  level: CommunityLevel
  holdHours: number
}

export function isPoolAcceptingStakes(pool: Pick<PoolRow, 'state' | 'closes_at'>, now = new Date()): boolean {
  return pool.state === 'open' && (!pool.closes_at || pool.closes_at.getTime() > now.getTime())
}

export async function getPoolSummary(communityMarketId: string, userId: string | null): Promise<PoolSummary | null> {
  const pool = await getPoolByMarket(communityMarketId)
  if (!pool) {
    return null
  }
  const community = await loadPoolCommunity(db as unknown as LedgerTx, pool.community_id, pool.currency)
  let user: PoolSummary['user'] = null
  if (userId) {
    const profile = await LedgerService.getUserProfile(userId)
    const balance = profile ? await LedgerService.getUserBalance(userId, profile.currency) : null
    const stakes = await db
      .select()
      .from(pool_stakes)
      .where(and(eq(pool_stakes.pool_id, pool.id), eq(pool_stakes.user_id, userId)))
      .orderBy(desc(pool_stakes.created_at))
    let totalYes = 0n
    let totalNo = 0n
    const resultIn = pool.state === 'held' || pool.state === 'settled' || pool.state === 'cancelled'
    let totalPayout: bigint | null = resultIn ? 0n : null
    for (const stake of stakes) {
      if (stake.outcome === 'yes') {
        totalYes += stake.amount
      } else {
        totalNo += stake.amount
      }
      if (totalPayout !== null) {
        totalPayout += stake.payout ?? 0n
      }
    }
    const staked = totalYes + totalNo
    const remaining = community.caps.maxPerPersonMinor - staked
    user = {
      currency: profile?.currency ?? null,
      availableMinor: (balance?.available ?? 0n).toString(),
      stakes: stakes.map((stake) => ({
        id: stake.id,
        outcome: stake.outcome,
        amountMinor: stake.amount.toString(),
        payoutMinor: stake.payout?.toString() ?? null,
        createdAt: stake.created_at.toISOString(),
      })),
      totalYes: totalYes.toString(),
      totalNo: totalNo.toString(),
      totalPayout: totalPayout?.toString() ?? null,
      stakeCapRemainingMinor: (remaining > 0n ? remaining : 0n).toString(),
    }
  }
  return {
    pool: {
      id: pool.id,
      state: pool.state,
      currency: pool.currency,
      rakeBps: pool.rake_bps,
      closesAt: pool.closes_at?.toISOString() ?? null,
      totalYes: pool.total_yes.toString(),
      totalNo: pool.total_no.toString(),
      stakeCount: pool.stake_count,
      settledOutcome: pool.settled_outcome,
      settledAt: pool.settled_at?.toISOString() ?? null,
      odds: impliedOdds(pool.total_yes, pool.total_no),
      acceptingStakes: isPoolAcceptingStakes(pool),
      resultAnnouncedAt: pool.result_announced_at?.toISOString() ?? null,
      holdUntil: pool.hold_until?.toISOString() ?? null,
      holdExtendedUntil: pool.hold_extended_until?.toISOString() ?? null,
      payoutsFrozen: pool.payouts_frozen,
      releasedAt: pool.released_at?.toISOString() ?? null,
      isImported: pool.is_imported,
      ownerShareBps: pool.owner_share_bps,
      juryShareBps: pool.jury_share_bps,
    },
    user,
    minStakeMinor: community.minStakeMinor.toString(),
    caps: {
      maxPerPersonMinor: community.caps.maxPerPersonMinor.toString(),
      maxPoolPerMarketMinor: community.caps.maxPoolPerMarketMinor.toString(),
    },
    level: community.level,
    holdHours: community.holdHours,
  }
}

export function estimateStakePayout(
  pool: Pick<PoolRow, 'total_yes' | 'total_no' | 'rake_bps'>,
  side: PoolOutcome,
  amount: bigint,
): bigint {
  return estimatePayout({ totalYes: pool.total_yes, totalNo: pool.total_no, side, amount, rakeBps: pool.rake_bps })
}

/** Place a stake: debit the user's cash, credit the pool account, record the stake, bump totals. */
export async function stakeInPool(params: {
  communityMarketId: string
  userId: string
  outcome: PoolOutcome
  amountMinor: bigint
}): Promise<{ stake: PoolStakeRow; pool: PoolRow }> {
  if (params.amountMinor <= 0n) {
    throw new PoolError(POOL_ERROR_MESSAGES.invalid, 'invalid')
  }
  return db.transaction(async (tx) => {
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, params.communityMarketId))
      .for('update')
      .limit(1)
    if (!pool) {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_not_found, 'pool_not_found')
    }
    if (pool.state === 'settled' || pool.state === 'cancelled') {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_settled, 'pool_settled')
    }
    if (pool.state === 'held') {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_held, 'pool_held')
    }
    if (!isPoolAcceptingStakes(pool)) {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_closed, 'pool_closed')
    }
    const community = await loadPoolCommunity(tx, pool.community_id, pool.currency)
    if (community.status === 'paused' || community.status === 'archived') {
      throw new PoolError(POOL_ERROR_MESSAGES.community_paused, 'community_paused')
    }
    if (params.amountMinor < community.minStakeMinor) {
      throw new PoolError(POOL_ERROR_MESSAGES.below_minimum, 'below_minimum')
    }
    // Caps from the community's level: per person on this market, and the pool as a whole.
    const [mine] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${pool_stakes.amount}), 0)::text` })
      .from(pool_stakes)
      .where(and(eq(pool_stakes.pool_id, pool.id), eq(pool_stakes.user_id, params.userId)))
    if (BigInt(mine?.total ?? '0') + params.amountMinor > community.caps.maxPerPersonMinor) {
      throw new PoolError(POOL_ERROR_MESSAGES.per_person_cap, 'per_person_cap')
    }
    if (pool.total_yes + pool.total_no + params.amountMinor > community.caps.maxPoolPerMarketMinor) {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_cap, 'pool_cap')
    }
    const [profile] = await tx
      .select()
      .from(ledger_user_profiles)
      .where(eq(ledger_user_profiles.user_id, params.userId))
      .limit(1)
    if (!profile) {
      throw new PoolError(POOL_ERROR_MESSAGES.no_profile, 'no_profile')
    }
    if (profile.trading_frozen) {
      throw new PoolError(POOL_ERROR_MESSAGES.frozen, 'frozen')
    }
    // Signing up is the age + Terms acceptance; re-record it when the Terms version moved.
    if (!hasCurrentConsent(profile)) {
      await recordConsent(params.userId, tx)
    }
    if (profile.currency !== pool.currency) {
      throw new PoolError(POOL_ERROR_MESSAGES.currency_mismatch, 'currency_mismatch')
    }
    const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, pool.currency, tx)
    const poolAccount = await LedgerService.getOrCreateHouseAccount('pool', pool.currency, tx, pool.id)

    const [stake] = await tx
      .insert(pool_stakes)
      .values({
        pool_id: pool.id,
        user_id: params.userId,
        outcome: params.outcome,
        amount: params.amountMinor,
        currency: pool.currency,
      })
      .returning()

    let posted
    try {
      posted = await LedgerService.postTransaction(
        {
          kind: 'pool_stake',
          referenceType: 'pool_stake',
          referenceId: stake!.id,
          idempotencyKey: `pool_stake:${stake!.id}`,
          description: `Stake ${params.outcome.toUpperCase()} in community market`,
          metadata: { poolId: pool.id, communityMarketId: params.communityMarketId, outcome: params.outcome },
          entries: [
            { accountId: cash.id, side: 'debit', amount: params.amountMinor, currency: pool.currency },
            { accountId: poolAccount.id, side: 'credit', amount: params.amountMinor, currency: pool.currency },
          ],
        },
        tx,
      )
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'insufficient_funds') {
        throw new PoolError(POOL_ERROR_MESSAGES.insufficient_funds, 'insufficient_funds')
      }
      throw error
    }

    await tx
      .update(pool_stakes)
      .set({ ledger_transaction_id: posted.transactionId })
      .where(eq(pool_stakes.id, stake!.id))
    const [updatedPool] = await tx
      .update(pools)
      .set({
        total_yes: params.outcome === 'yes' ? pool.total_yes + params.amountMinor : pool.total_yes,
        total_no: params.outcome === 'no' ? pool.total_no + params.amountMinor : pool.total_no,
        stake_count: pool.stake_count + 1,
      })
      .where(eq(pools.id, pool.id))
      .returning()
    return { stake: { ...stake!, ledger_transaction_id: posted.transactionId }, pool: updatedPool! }
  })
}

/** Stop accepting stakes (used when the resolution date passes before the jury votes). */
export async function closePool(poolId: string): Promise<void> {
  await db
    .update(pools)
    .set({ state: 'closed' })
    .where(and(eq(pools.id, poolId), eq(pools.state, 'open')))
}

export interface SettlementResult {
  poolId: string
  outcome: 'yes' | 'no' | 'cancelled'
  refunded: boolean
  paidStakes: number
  totalPool: string
  rake: string
  creatorShare: string
  ownerShare: string
  juryShare: string
  residue: string
  transactionId: string | null
  alreadySettled: boolean
  /** True when payouts are computed but still on hold (no ledger movement yet). */
  held: boolean
  holdUntil: string | null
}

function settledResult(pool: PoolRow): SettlementResult {
  return {
    poolId: pool.id,
    outcome: pool.settled_outcome ?? 'cancelled',
    refunded: pool.state === 'cancelled' || pool.settled_outcome === 'cancelled',
    paidStakes: 0,
    totalPool: (pool.total_yes + pool.total_no).toString(),
    rake: pool.rake_paid.toString(),
    creatorShare: pool.creator_paid.toString(),
    ownerShare: pool.owner_paid.toString(),
    juryShare: pool.jury_paid.toString(),
    residue: '0',
    transactionId: pool.settlement_tx_id,
    alreadySettled: true,
    held: pool.state === 'held',
    holdUntil: pool.hold_until?.toISOString() ?? null,
  }
}

/**
 * Step one of settlement: read the jury's result, compute every payout and
 * put the pool on hold. Nothing moves in the ledger yet. Refunds (cancelled
 * market, or nobody on the winning side) and imported markets have nothing
 * to appeal, so they are released in the same call.
 */
export async function computePoolSettlement(
  communityMarketId: string,
  options: { now?: Date } = {},
): Promise<SettlementResult | null> {
  const now = options.now ?? new Date()
  const computed = await db.transaction(async (tx) => {
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, communityMarketId))
      .for('update')
      .limit(1)
    if (!pool) {
      return null
    }
    if (pool.state === 'settled' || pool.state === 'cancelled' || pool.state === 'held') {
      return settledResult(pool)
    }
    const [market] = await tx
      .select({
        status: community_markets.status,
        resolved_outcome: community_markets.resolved_outcome,
      })
      .from(community_markets)
      .where(eq(community_markets.id, communityMarketId))
      .limit(1)
    if (!market || (market.status !== 'resolved' && market.status !== 'disputed' && market.status !== 'cancelled')) {
      throw new PoolError(POOL_ERROR_MESSAGES.market_not_resolved, 'market_not_resolved')
    }
    const outcome: 'yes' | 'no' | 'cancelled' =
      market.status === 'resolved' && (market.resolved_outcome === 'yes' || market.resolved_outcome === 'no')
        ? market.resolved_outcome
        : 'cancelled'

    const stakes = await tx.select().from(pool_stakes).where(eq(pool_stakes.pool_id, pool.id))
    const plan = planSettlement({
      outcome,
      stakes: stakes.map((stake) => ({
        id: stake.id,
        userId: stake.user_id,
        outcome: stake.outcome,
        amount: stake.amount,
      })),
      rakeBps: pool.rake_bps,
      creatorShareBps: pool.creator_share_bps,
    })
    if (!settlementIsConserved(plan)) {
      throw new PoolError('Settlement plan does not conserve the pool.', 'invalid')
    }

    // Jurors who voted with the result share the jury slice of the pool share.
    const votes =
      outcome === 'cancelled'
        ? []
        : await tx
            .select({ juror_id: jury_votes.juror_id })
            .from(jury_votes)
            .where(and(eq(jury_votes.community_market_id, communityMarketId), eq(jury_votes.vote, outcome)))
    const community = await loadPoolCommunity(tx, pool.community_id, pool.currency)
    const holdSettings = { holdHours: community.holdHours, appealMaxHours: community.appealMaxHours }

    for (const stake of stakes) {
      await tx
        .update(pool_stakes)
        .set({ payout: plan.payouts.get(stake.id) ?? 0n })
        .where(eq(pool_stakes.id, stake.id))
    }
    const [held] = await tx
      .update(pools)
      .set({
        state: 'held',
        planned_outcome: outcome,
        settled_outcome: outcome,
        result_announced_at: now,
        hold_until: computeHoldUntil(now, holdSettings),
        hold_extended_until: computeAppealHoldUntil(now, holdSettings),
        voting_juror_ids: votes.map((vote) => vote.juror_id),
      })
      .where(eq(pools.id, pool.id))
      .returning()
    return settledResult(held!)
  })
  if (!computed || !computed.held) {
    return computed
  }
  // Nothing to appeal on a refund or an imported market: pay out at once.
  const released = await releasePoolPayouts(computed.poolId, { now })
  return released ?? computed
}

/**
 * Step two of settlement: once the hold has run out (or an admin ruling
 * forces it), post the one balanced ledger transaction that moves the pool
 * to winners, the owner, the voting jurors, Prophit and rounding. Idempotent
 * on the pool id: a crash after the ledger write finishes the row updates
 * on the next call instead of paying twice.
 */
export async function releasePoolPayouts(
  poolId: string,
  options: { now?: Date; force?: boolean } = {},
): Promise<SettlementResult | null> {
  const now = options.now ?? new Date()
  return db.transaction(async (tx) => {
    const [pool] = await tx.select().from(pools).where(eq(pools.id, poolId)).for('update').limit(1)
    if (!pool) {
      return null
    }
    if (pool.state === 'settled' || pool.state === 'cancelled') {
      return settledResult(pool)
    }
    if (pool.state !== 'held') {
      throw new PoolError(POOL_ERROR_MESSAGES.market_not_resolved, 'market_not_resolved')
    }
    const decision = decideRelease({
      state: pool.state,
      holdUntil: pool.hold_until,
      holdExtendedUntil: pool.hold_extended_until,
      payoutsFrozen: pool.payouts_frozen,
      // An open appeal (step 5) extends the wait to hold_extended_until; until
      // the appeals table exists only a frozen flag can stop a release.
      appealActive: false,
      isImported: pool.is_imported,
      now,
    })
    const refunded = pool.planned_outcome === 'cancelled' || pool.planned_outcome === null
    if (!options.force && !refunded && decision !== 'release') {
      return settledResult(pool)
    }
    const outcome: 'yes' | 'no' | 'cancelled' = pool.planned_outcome ?? 'cancelled'
    const stakes = await tx.select().from(pool_stakes).where(eq(pool_stakes.pool_id, pool.id))
    const totalPool = stakes.reduce((sum, stake) => sum + stake.amount, 0n)
    const winnersPaid = stakes.reduce((sum, stake) => sum + (stake.payout ?? 0n), 0n)
    const rake = refunded ? 0n : (totalPool * BigInt(pool.rake_bps)) / 10_000n
    const residue = refunded ? 0n : totalPool - rake - winnersPaid
    if (residue < 0n) {
      throw new PoolError('Held payouts exceed the pool.', 'invalid')
    }
    const community = await loadPoolCommunity(tx, pool.community_id, pool.currency)
    const split = refunded
      ? { owner: 0n, juryPerJuror: 0n, juryTotal: 0n, prophit: 0n }
      : splitRake({
          rake,
          ownerShareBps: pool.owner_share_bps,
          juryShareBps: pool.jury_share_bps,
          votingJurorIds: pool.voting_juror_ids,
          imported: pool.is_imported,
        })
    if (!refunded && !rakeSplitIsConserved(split, rake)) {
      throw new PoolError('Rake split does not conserve the rake.', 'invalid')
    }

    let transactionId: string | null = null
    const earnings: Array<{ userId: string; role: 'owner' | 'juror'; amount: bigint }> = []
    if (totalPool > 0n) {
      const poolAccount = await LedgerService.getOrCreateHouseAccount('pool', pool.currency, tx, pool.id)
      const entries: EntryInput[] = [
        { accountId: poolAccount.id, side: 'debit', amount: totalPool, currency: pool.currency },
      ]
      const perUser = new Map<string, bigint>()
      for (const stake of stakes) {
        const payout = stake.payout ?? 0n
        if (payout > 0n) {
          perUser.set(stake.user_id, (perUser.get(stake.user_id) ?? 0n) + payout)
        }
      }
      for (const [userId, amount] of perUser) {
        const cash = await LedgerService.getOrCreateUserCashAccount(userId, pool.currency, tx)
        entries.push({ accountId: cash.id, side: 'credit', amount, currency: pool.currency })
      }
      if (!refunded) {
        // Owner and jurors are paid into their cash balance when they hold one in
        // this currency; otherwise the amount accrues to a payable account for them.
        async function payeeAccountId(userId: string) {
          const [profile] = await tx
            .select({ currency: ledger_user_profiles.currency })
            .from(ledger_user_profiles)
            .where(eq(ledger_user_profiles.user_id, userId))
            .limit(1)
          if (profile && profile.currency === pool!.currency) {
            return (await LedgerService.getOrCreateUserCashAccount(userId, pool!.currency, tx)).id
          }
          return (await LedgerService.getOrCreateHouseAccount('earnings_payable', pool!.currency, tx, userId)).id
        }
        if (split.owner > 0n) {
          entries.push({
            accountId: await payeeAccountId(community.creatorId),
            side: 'credit',
            amount: split.owner,
            currency: pool.currency,
          })
          earnings.push({ userId: community.creatorId, role: 'owner', amount: split.owner })
        }
        if (split.juryPerJuror > 0n) {
          for (const jurorId of pool.voting_juror_ids) {
            entries.push({
              accountId: await payeeAccountId(jurorId),
              side: 'credit',
              amount: split.juryPerJuror,
              currency: pool.currency,
            })
            earnings.push({ userId: jurorId, role: 'juror', amount: split.juryPerJuror })
          }
        }
        if (split.prophit > 0n) {
          const rakeAccount = await LedgerService.getOrCreateHouseAccount('pool_rake', pool.currency, tx)
          entries.push({ accountId: rakeAccount.id, side: 'credit', amount: split.prophit, currency: pool.currency })
        }
        if (residue > 0n) {
          const rounding = await LedgerService.getOrCreateHouseAccount('rounding', pool.currency, tx)
          entries.push({ accountId: rounding.id, side: 'credit', amount: residue, currency: pool.currency })
        }
      }
      const posted = await LedgerService.postTransaction(
        {
          kind: refunded ? 'pool_refund' : 'pool_settlement',
          referenceType: 'pool',
          referenceId: pool.id,
          idempotencyKey: `pool_settlement:${pool.id}`,
          description: refunded
            ? 'Community market cancelled: stakes refunded'
            : `Community market settled ${outcome.toUpperCase()}`,
          metadata: {
            communityMarketId: pool.community_market_id,
            outcome,
            rake: rake.toString(),
            ownerShare: split.owner.toString(),
            juryShare: split.juryTotal.toString(),
            prophitShare: split.prophit.toString(),
            residue: residue.toString(),
          },
          entries,
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
            currency: pool.currency,
            ledger_transaction_id: transactionId,
          })
        }
      }
    }

    await tx.update(pool_stakes).set({ paid_at: now }).where(eq(pool_stakes.pool_id, pool.id))
    const [done] = await tx
      .update(pools)
      .set({
        state: refunded ? 'cancelled' : 'settled',
        settled_outcome: outcome,
        settled_at: now,
        released_at: now,
        settlement_tx_id: transactionId,
        rake_paid: rake,
        creator_paid: 0n,
        owner_paid: split.owner,
        jury_paid: split.juryTotal,
        payouts_frozen: false,
      })
      .where(eq(pools.id, pool.id))
      .returning()

    return {
      poolId: pool.id,
      outcome,
      refunded,
      paidStakes: stakes.filter((stake) => (stake.payout ?? 0n) > 0n).length,
      totalPool: totalPool.toString(),
      rake: rake.toString(),
      creatorShare: '0',
      ownerShare: split.owner.toString(),
      juryShare: split.juryTotal.toString(),
      residue: residue.toString(),
      transactionId,
      alreadySettled: false,
      held: false,
      holdUntil: done?.hold_until?.toISOString() ?? null,
    }
  })
}

/**
 * Settle the pool for a resolved community market: compute and hold, then
 * release if the hold allows it (refunds and imported markets release at
 * once; everything else waits for the cron). Idempotent.
 */
export async function settlePoolForMarket(
  communityMarketId: string,
  options: { now?: Date } = {},
): Promise<SettlementResult | null> {
  const computed = await computePoolSettlement(communityMarketId, options)
  if (!computed || !computed.held) {
    return computed
  }
  return (await releasePoolPayouts(computed.poolId, options)) ?? computed
}

/** Held pools whose hold has run out and whose payouts are not frozen by an appeal. */
export async function listHeldPoolsDueForRelease(now = new Date(), limit = 50) {
  return db
    .select()
    .from(pools)
    .where(
      and(
        eq(pools.state, 'held'),
        eq(pools.payouts_frozen, false),
        sql`${pools.hold_until} IS NOT NULL AND ${pools.hold_until} <= ${now}`,
      ),
    )
    .limit(limit)
}

/** Pools whose market is resolved/disputed/cancelled but which are not yet settled (cron fallback). */
export async function listUnsettledResolvedPools(limit = 50) {
  return db
    .select({ pool: pools, marketStatus: community_markets.status })
    .from(pools)
    .innerJoin(community_markets, eq(pools.community_market_id, community_markets.id))
    .where(
      and(
        inArray(pools.state, ['open', 'closed']),
        inArray(community_markets.status, ['resolved', 'disputed', 'cancelled']),
      ),
    )
    .limit(limit)
}

/** Pools past their close time that are still open (cron: stop accepting stakes). */
export async function closeExpiredPools(): Promise<number> {
  const result = await db
    .update(pools)
    .set({ state: 'closed' })
    .where(and(eq(pools.state, 'open'), sql`${pools.closes_at} IS NOT NULL AND ${pools.closes_at} < NOW()`))
    .returning({ id: pools.id })
  return result.length
}
