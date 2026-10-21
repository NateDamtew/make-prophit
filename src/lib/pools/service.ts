import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { PoolOutcome } from '@/lib/db/schema/pools/tables'
import type { EntryInput } from '@/lib/ledger/invariants'

import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { ledger_user_profiles } from '@/lib/db/schema/ledger/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { LedgerError, LedgerService } from '@/lib/ledger/service'
import { recordConsent } from '@/lib/mobile-money/consent'
import { CONSENT_REQUIRED_MESSAGE, hasCurrentConsent } from '@/lib/mobile-money/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { estimatePayout, impliedOdds, planSettlement, settlementIsConserved } from '@/lib/pools/math'

/**
 * Pool engine: open → stake → (close) → settle. Every money movement is a
 * balanced ledger transaction against the pool's own house account
 * (kind 'pool', owner_id = pool id), so a pool's ledger balance always equals
 * total_yes + total_no until settlement, and zero after.
 */

export type PoolRow = typeof pools.$inferSelect
export type PoolStakeRow = typeof pool_stakes.$inferSelect
export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const DEFAULT_POOL_RAKE_BPS = 400
export const DEFAULT_POOL_CREATOR_SHARE_BPS = 0
export const DEFAULT_MIN_STAKE_MINOR = 5_000n // 50.00 in a two-decimal currency

export class PoolError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'pool_not_found'
      | 'pool_closed'
      | 'pool_settled'
      | 'currency_mismatch'
      | 'no_profile'
      | 'frozen'
      | 'below_minimum'
      | 'insufficient_funds'
      | 'market_not_resolved'
      | 'consent_required'
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
  currency_mismatch: 'Your balance is in a different currency from this community.',
  no_profile: 'Make a deposit first to start staking.',
  frozen: 'Trading is temporarily unavailable on your account. Please contact support.',
  below_minimum: 'That stake is below the minimum.',
  insufficient_funds: 'You do not have enough available balance for that stake.',
  market_not_resolved: 'The market has not been resolved yet.',
  consent_required: CONSENT_REQUIRED_MESSAGE,
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

/** Open a pool for an approved community market. Idempotent per market. */
export async function openPoolForMarket(params: {
  communityMarketId: string
  communityId: string
  closesAt: Date | null
  currency?: string
  rakeBps?: number
  creatorShareBps?: number
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
    const [created] = await tx
      .insert(pools)
      .values({
        community_market_id: params.communityMarketId,
        community_id: params.communityId,
        currency,
        rake_bps: params.rakeBps ?? DEFAULT_POOL_RAKE_BPS,
        creator_share_bps: params.creatorShareBps ?? DEFAULT_POOL_CREATOR_SHARE_BPS,
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
  }
  user: {
    currency: string | null
    availableMinor: string
    /** True until the user has confirmed their age and accepted the current Terms. */
    consentRequired: boolean
    stakes: Array<{
      id: string
      outcome: PoolOutcome
      amountMinor: string
      payoutMinor: string | null
      createdAt: string
    }>
    totalYes: string
    totalNo: string
    totalPayout: string | null
  } | null
  minStakeMinor: string
}

export function isPoolAcceptingStakes(pool: Pick<PoolRow, 'state' | 'closes_at'>, now = new Date()): boolean {
  return pool.state === 'open' && (!pool.closes_at || pool.closes_at.getTime() > now.getTime())
}

export async function getPoolSummary(communityMarketId: string, userId: string | null): Promise<PoolSummary | null> {
  const pool = await getPoolByMarket(communityMarketId)
  if (!pool) {
    return null
  }
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
    let totalPayout: bigint | null = pool.state === 'settled' || pool.state === 'cancelled' ? 0n : null
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
    user = {
      currency: profile?.currency ?? null,
      availableMinor: (balance?.available ?? 0n).toString(),
      consentRequired: !hasCurrentConsent(profile),
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
    },
    user,
    minStakeMinor: DEFAULT_MIN_STAKE_MINOR.toString(),
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
  /** Set when the user ticked the age + Terms box on this request; recorded with the stake. */
  acceptTerms?: boolean
}): Promise<{ stake: PoolStakeRow; pool: PoolRow }> {
  if (params.amountMinor <= 0n) {
    throw new PoolError(POOL_ERROR_MESSAGES.invalid, 'invalid')
  }
  if (params.amountMinor < DEFAULT_MIN_STAKE_MINOR) {
    throw new PoolError(POOL_ERROR_MESSAGES.below_minimum, 'below_minimum')
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
    if (!isPoolAcceptingStakes(pool)) {
      throw new PoolError(POOL_ERROR_MESSAGES.pool_closed, 'pool_closed')
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
    if (!hasCurrentConsent(profile)) {
      if (!params.acceptTerms) {
        throw new PoolError(POOL_ERROR_MESSAGES.consent_required, 'consent_required')
      }
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
  residue: string
  transactionId: string | null
  alreadySettled: boolean
}

/**
 * Settle the pool for a resolved community market. Idempotent: a settled pool
 * returns immediately. One balanced ledger transaction moves the whole pool to
 * winners (or refunds), rake, creator share and rounding.
 */
export async function settlePoolForMarket(communityMarketId: string): Promise<SettlementResult | null> {
  return db.transaction(async (tx) => {
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.community_market_id, communityMarketId))
      .for('update')
      .limit(1)
    if (!pool) {
      return null
    }
    if (pool.state === 'settled' || pool.state === 'cancelled') {
      return {
        poolId: pool.id,
        outcome: pool.settled_outcome ?? 'cancelled',
        refunded: pool.state === 'cancelled' || pool.settled_outcome === 'cancelled',
        paidStakes: 0,
        totalPool: (pool.total_yes + pool.total_no).toString(),
        rake: pool.rake_paid.toString(),
        creatorShare: pool.creator_paid.toString(),
        residue: '0',
        transactionId: pool.settlement_tx_id,
        alreadySettled: true,
      }
    }
    const [market] = await tx
      .select({
        status: community_markets.status,
        resolved_outcome: community_markets.resolved_outcome,
        created_by: community_markets.created_by,
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

    let transactionId: string | null = null
    if (plan.totalPool > 0n) {
      const poolAccount = await LedgerService.getOrCreateHouseAccount('pool', pool.currency, tx, pool.id)
      const entries: EntryInput[] = [
        { accountId: poolAccount.id, side: 'debit', amount: plan.totalPool, currency: pool.currency },
      ]

      // Aggregate payouts per user so each user gets one credit entry.
      const perUser = new Map<string, bigint>()
      for (const stake of stakes) {
        const payout = plan.payouts.get(stake.id) ?? 0n
        if (payout > 0n) {
          perUser.set(stake.user_id, (perUser.get(stake.user_id) ?? 0n) + payout)
        }
      }
      for (const [userId, amount] of perUser) {
        const cash = await LedgerService.getOrCreateUserCashAccount(userId, pool.currency, tx)
        entries.push({ accountId: cash.id, side: 'credit', amount, currency: pool.currency })
      }
      if (!plan.refunded) {
        const houseRake = plan.rake - plan.creatorShare
        if (houseRake > 0n) {
          const rakeAccount = await LedgerService.getOrCreateHouseAccount('pool_rake', pool.currency, tx)
          entries.push({ accountId: rakeAccount.id, side: 'credit', amount: houseRake, currency: pool.currency })
        }
        if (plan.creatorShare > 0n) {
          // Creator share goes to the market creator's cash account when they have one in this currency; else to the house.
          const [creatorProfile] = await tx
            .select()
            .from(ledger_user_profiles)
            .where(eq(ledger_user_profiles.user_id, market.created_by))
            .limit(1)
          if (creatorProfile && creatorProfile.currency === pool.currency) {
            const creatorCash = await LedgerService.getOrCreateUserCashAccount(market.created_by, pool.currency, tx)
            entries.push({
              accountId: creatorCash.id,
              side: 'credit',
              amount: plan.creatorShare,
              currency: pool.currency,
            })
          } else {
            const rakeAccount = await LedgerService.getOrCreateHouseAccount('pool_rake', pool.currency, tx)
            entries.push({
              accountId: rakeAccount.id,
              side: 'credit',
              amount: plan.creatorShare,
              currency: pool.currency,
            })
          }
        }
        if (plan.residue > 0n) {
          const rounding = await LedgerService.getOrCreateHouseAccount('rounding', pool.currency, tx)
          entries.push({ accountId: rounding.id, side: 'credit', amount: plan.residue, currency: pool.currency })
        }
      }
      const posted = await LedgerService.postTransaction(
        {
          kind: plan.refunded ? 'pool_refund' : 'pool_settlement',
          referenceType: 'pool',
          referenceId: pool.id,
          idempotencyKey: `pool_settlement:${pool.id}`,
          description: plan.refunded
            ? 'Community market cancelled: stakes refunded'
            : `Community market settled ${outcome.toUpperCase()}`,
          metadata: {
            communityMarketId,
            outcome,
            rake: plan.rake.toString(),
            creatorShare: plan.creatorShare.toString(),
            residue: plan.residue.toString(),
          },
          entries,
        },
        tx,
      )
      transactionId = posted.transactionId
    }

    for (const stake of stakes) {
      await tx
        .update(pool_stakes)
        .set({ payout: plan.payouts.get(stake.id) ?? 0n })
        .where(eq(pool_stakes.id, stake.id))
    }
    await tx
      .update(pools)
      .set({
        state: plan.refunded ? 'cancelled' : 'settled',
        settled_outcome: outcome,
        settled_at: new Date(),
        settlement_tx_id: transactionId,
        rake_paid: plan.refunded ? 0n : plan.rake,
        creator_paid: plan.refunded ? 0n : plan.creatorShare,
      })
      .where(eq(pools.id, pool.id))

    return {
      poolId: pool.id,
      outcome,
      refunded: plan.refunded,
      paidStakes: [...plan.payouts.values()].filter((value) => value > 0n).length,
      totalPool: plan.totalPool.toString(),
      rake: plan.refunded ? '0' : plan.rake.toString(),
      creatorShare: plan.refunded ? '0' : plan.creatorShare.toString(),
      residue: plan.refunded ? '0' : plan.residue.toString(),
      transactionId,
      alreadySettled: false,
    }
  })
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
