/**
 * Pool engine against the dev database: open → stake → settle (winners paid,
 * rake booked) and cancel → refund. Runs ONLY with LEDGER_INTEGRATION_TESTS=1
 * and a non-production POSTGRES_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

const ENABLED = process.env.LEDGER_INTEGRATION_TESTS === '1' && Boolean(process.env.POSTGRES_URL)
const IS_PRODUCTION_DB = (process.env.POSTGRES_URL ?? '').includes('vsytshpanaxxqadgecap')

describe.skipIf(!ENABLED || IS_PRODUCTION_DB)('pool engine (integration)', () => {
  let service: typeof import('@/lib/pools/service')
  let LedgerService: typeof import('@/lib/ledger/service').LedgerService
  let recordConsent: typeof import('@/lib/mobile-money/consent').recordConsent
  let db: typeof import('@/lib/drizzle').db
  let users: typeof import('@/lib/db/schema/auth/tables').users
  let communitySchema: typeof import('@/lib/db/schema/communities/tables')
  let ledgerSchema: typeof import('@/lib/db/schema/ledger/tables')
  let poolSchema: typeof import('@/lib/db/schema/pools/tables')
  let eq: typeof import('drizzle-orm').eq
  let inArray: typeof import('drizzle-orm').inArray

  const suffix = Date.now().toString(36)
  const userIds: string[] = []
  let communityId: string
  let marketIds: string[] = []
  const houseKinds = ['pool_rake', 'rounding'] as const

  async function fund(userId: string, amount: bigint, { consent = true } = {}) {
    await LedgerService.ensureUserProfile(userId, 'KES')
    if (consent) {
      await recordConsent(userId)
    }
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    const suspense = await LedgerService.getOrCreateHouseAccount('suspense', 'KES')
    await LedgerService.postTransaction({
      kind: 'test_funding',
      idempotencyKey: `pooltest:${suffix}:${userId}:${amount}`,
      entries: [
        { accountId: suspense.id, side: 'debit', amount, currency: 'KES' },
        { accountId: cash.id, side: 'credit', amount, currency: 'KES' },
      ],
    })
  }

  async function createMarket(title: string) {
    const [market] = await db
      .insert(communitySchema.community_markets)
      .values({ community_id: communityId, title, created_by: userIds[0]!, status: 'active', engine: 'pool' } as never)
      .returning({ id: communitySchema.community_markets.id })
    marketIds.push(market!.id)
    return market!.id
  }

  beforeAll(async () => {
    service = await import('@/lib/pools/service')
    ;({ LedgerService } = await import('@/lib/ledger/service'))
    ;({ recordConsent } = await import('@/lib/mobile-money/consent'))
    ;({ db } = await import('@/lib/drizzle'))
    ;({ users } = await import('@/lib/db/schema/auth/tables'))
    communitySchema = await import('@/lib/db/schema/communities/tables')
    ledgerSchema = await import('@/lib/db/schema/ledger/tables')
    poolSchema = await import('@/lib/db/schema/pools/tables')
    ;({ eq, inArray } = await import('drizzle-orm'))

    for (let i = 0; i < 4; i++) {
      const [user] = await db
        .insert(users)
        .values({
          address: `0xpool${i}${suffix}`,
          email: `pool-${i}-${suffix}@example.test`,
          username: `pool_${i}_${suffix}`,
        } as never)
        .returning({ id: users.id })
      userIds.push(user!.id)
    }
    const [community] = await db
      .insert(communitySchema.communities)
      .values({
        slug: `pool-test-${suffix}`,
        name: `Pool test ${suffix}`,
        creator_id: userIds[0]!,
        jury_size: 1,
        currency: 'KES',
      } as never)
      .returning({ id: communitySchema.communities.id })
    communityId = community!.id
    await fund(userIds[0]!, 100_000n)
    await fund(userIds[1]!, 100_000n)
    await fund(userIds[2]!, 100_000n)
    // userIds[3] has a balance but has not accepted the Terms yet.
    await fund(userIds[3]!, 20_000n, { consent: false })
  })

  afterAll(async () => {
    await db.execute(`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_no_update` as never)
    try {
      const poolRows = marketIds.length
        ? await db
            .select({ id: poolSchema.pools.id })
            .from(poolSchema.pools)
            .where(inArray(poolSchema.pools.community_market_id, marketIds))
        : []
      const poolIds = poolRows.map((r) => r.id)
      if (poolIds.length) {
        await db.delete(poolSchema.pool_stakes).where(inArray(poolSchema.pool_stakes.pool_id, poolIds))
      }
      // collect all ledger accounts touched: users + pool accounts + house suspense/pool_rake/rounding deltas
      const accountIds = (
        await db
          .select({ id: ledgerSchema.ledger_accounts.id })
          .from(ledgerSchema.ledger_accounts)
          .where(inArray(ledgerSchema.ledger_accounts.owner_id, [...userIds, ...poolIds]))
      ).map((r) => r.id)
      const txIds = new Set<string>()
      for (const id of accountIds) {
        for (const row of await db
          .select({ t: ledgerSchema.ledger_entries.transaction_id })
          .from(ledgerSchema.ledger_entries)
          .where(eq(ledgerSchema.ledger_entries.account_id, id))) {
          txIds.add(row.t)
        }
      }
      // pools reference settlement tx; null them before deleting txs
      if (poolIds.length) {
        await db.update(poolSchema.pools).set({ settlement_tx_id: null }).where(inArray(poolSchema.pools.id, poolIds))
      }
      if (txIds.size) {
        await db
          .delete(ledgerSchema.ledger_entries)
          .where(inArray(ledgerSchema.ledger_entries.transaction_id, [...txIds]))
        await db
          .delete(ledgerSchema.ledger_transactions)
          .where(inArray(ledgerSchema.ledger_transactions.id, [...txIds]))
      }
      if (poolIds.length) {
        await db.delete(poolSchema.pools).where(inArray(poolSchema.pools.id, poolIds))
      }
      for (const id of accountIds) {
        await db.delete(ledgerSchema.ledger_reservations).where(eq(ledgerSchema.ledger_reservations.account_id, id))
        await db.delete(ledgerSchema.ledger_accounts).where(eq(ledgerSchema.ledger_accounts.id, id))
      }
      if (marketIds.length) {
        await db
          .delete(communitySchema.community_markets)
          .where(inArray(communitySchema.community_markets.id, marketIds))
      }
      await db.delete(communitySchema.communities).where(eq(communitySchema.communities.id, communityId))
      await db
        .delete(ledgerSchema.ledger_user_profiles)
        .where(inArray(ledgerSchema.ledger_user_profiles.user_id, userIds))
      await db.delete(users).where(inArray(users.id, userIds))
      // resync shared house books whose entries we deleted
      for (const kind of [...houseKinds, 'suspense'] as const) {
        const house = await LedgerService.getOrCreateHouseAccount(kind, 'KES')
        const check = await LedgerService.recomputeAccountBalance(house.id)
        await db
          .update(ledgerSchema.ledger_accounts)
          .set({ balance: check.recomputed, reserved: check.reservedRecomputed })
          .where(eq(ledgerSchema.ledger_accounts.id, house.id))
      }
    } finally {
      await db.execute(`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_no_update` as never)
    }
  })

  it('opens a pool once, takes stakes, and settles YES with rake and pro-rata payouts', async () => {
    const marketId = await createMarket(`Will it rain ${suffix}`)
    const pool = await service.openPoolForMarket({
      communityMarketId: marketId,
      communityId,
      closesAt: new Date(Date.now() + 86_400_000),
    })
    const again = await service.openPoolForMarket({ communityMarketId: marketId, communityId, closesAt: null })
    expect(again.id).toBe(pool.id)
    expect(pool.currency).toBe('KES')

    await service.stakeInPool({
      communityMarketId: marketId,
      userId: userIds[0]!,
      outcome: 'yes',
      amountMinor: 60_000n,
    })
    await service.stakeInPool({
      communityMarketId: marketId,
      userId: userIds[1]!,
      outcome: 'yes',
      amountMinor: 40_000n,
    })
    await service.stakeInPool({ communityMarketId: marketId, userId: userIds[2]!, outcome: 'no', amountMinor: 75_000n })

    const summary = await service.getPoolSummary(marketId, userIds[0]!)
    expect(summary?.pool.totalYes).toBe('100000')
    expect(summary?.pool.totalNo).toBe('75000')
    expect(summary?.pool.odds.yes).toBeCloseTo(100_000 / 175_000, 3)
    expect(summary?.user?.availableMinor).toBe('40000')

    // read models behind the market page (chart, holders, activity, cards)
    const activity = await import('@/lib/pools/activity')
    const history = await activity.getPoolOddsHistory(pool.id)
    expect(history.map((point) => Math.round(point.yes))).toEqual([50, 100, 100, 57])
    const holders = await activity.getPoolTopHolders(pool.id)
    expect(holders.yes.map((holder) => holder.amountMinor)).toEqual(['60000', '40000'])
    expect(holders.no[0]?.amountMinor).toBe('75000')
    expect(holders.yes[0]?.username).toBe(`pool_0_${suffix}`)
    const feed = await activity.getPoolActivity(pool.id)
    expect(feed.map((item) => item.amountMinor)).toEqual(['75000', '40000', '60000'])
    expect(Math.round(feed[0]!.yesChanceAfter)).toBe(57)
    expect((await activity.getPoolActivity(pool.id, { outcome: 'no' })).length).toBe(1)
    const cards = await activity.getPoolCardSummaries([marketId, 'missing'])
    expect(cards[marketId]?.totalYesMinor).toBe('100000')
    expect(Math.round(cards[marketId]!.yesChance)).toBe(57)
    expect(cards.missing).toBeUndefined()

    const poolAccount = await LedgerService.getOrCreateHouseAccount('pool', 'KES', undefined, pool.id)
    expect((await LedgerService.getAccount(poolAccount.id))?.balance).toBe(175_000n)

    // over-stake refused, below-minimum refused
    await expect(
      service.stakeInPool({ communityMarketId: marketId, userId: userIds[0]!, outcome: 'yes', amountMinor: 50_000n }),
    ).rejects.toMatchObject({ code: 'insufficient_funds' })
    await expect(
      service.stakeInPool({ communityMarketId: marketId, userId: userIds[0]!, outcome: 'yes', amountMinor: 100n }),
    ).rejects.toMatchObject({ code: 'below_minimum' })

    // not resolved yet → settlement refuses
    await expect(service.settlePoolForMarket(marketId)).rejects.toMatchObject({ code: 'market_not_resolved' })

    const rakeBefore = await LedgerService.recomputeAccountBalance(
      (await LedgerService.getOrCreateHouseAccount('pool_rake', 'KES')).id,
    )
    await db
      .update(communitySchema.community_markets)
      .set({ status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date() })
      .where(eq(communitySchema.community_markets.id, marketId))
    const settlement = await service.settlePoolForMarket(marketId)
    expect(settlement?.refunded).toBe(false)
    expect(settlement?.rake).toBe('7000') // 4% of 175,000
    expect(settlement?.paidStakes).toBe(2)

    // winners: 168,000 split 60/40 → 100,800 and 67,200
    expect((await LedgerService.getUserBalance(userIds[0]!, 'KES')).balance).toBe(40_000n + 100_800n)
    expect((await LedgerService.getUserBalance(userIds[1]!, 'KES')).balance).toBe(60_000n + 67_200n)
    expect((await LedgerService.getUserBalance(userIds[2]!, 'KES')).balance).toBe(25_000n)
    expect((await LedgerService.getAccount(poolAccount.id))?.balance).toBe(0n)
    const rakeAfter = await LedgerService.recomputeAccountBalance(
      rakeBefore === null ? '' : (await LedgerService.getOrCreateHouseAccount('pool_rake', 'KES')).id,
    )
    expect(rakeAfter.cached - rakeBefore.cached).toBe(7_000n)
    expect(rakeAfter.recomputed - rakeBefore.recomputed).toBe(7_000n)

    // idempotent
    const replay = await service.settlePoolForMarket(marketId)
    expect(replay?.alreadySettled).toBe(true)
    await expect(
      service.stakeInPool({ communityMarketId: marketId, userId: userIds[0]!, outcome: 'yes', amountMinor: 10_000n }),
    ).rejects.toMatchObject({ code: 'pool_settled' })

    const after = await service.getPoolSummary(marketId, userIds[0]!)
    expect(after?.pool.state).toBe('settled')
    expect(after?.user?.totalPayout).toBe('100800')
  })

  it('refuses a stake until the age + terms box is ticked, then records the acceptance once', async () => {
    const marketId = await createMarket(`Consent ${suffix}`)
    await service.openPoolForMarket({ communityMarketId: marketId, communityId, closesAt: null })
    await expect(
      service.stakeInPool({ communityMarketId: marketId, userId: userIds[3]!, outcome: 'yes', amountMinor: 5_000n }),
    ).rejects.toMatchObject({ code: 'consent_required' })
    const summaryBefore = await service.getPoolSummary(marketId, userIds[3]!)
    expect(summaryBefore?.user?.consentRequired).toBe(true)

    await service.stakeInPool({
      communityMarketId: marketId,
      userId: userIds[3]!,
      outcome: 'yes',
      amountMinor: 5_000n,
      acceptTerms: true,
    })
    const profile = await LedgerService.getUserProfile(userIds[3]!)
    expect(profile?.terms_accepted_at).toBeInstanceOf(Date)
    expect(profile?.age_confirmed_at).toBeInstanceOf(Date)
    expect(profile?.terms_version).toBeTruthy()
    const summaryAfter = await service.getPoolSummary(marketId, userIds[3]!)
    expect(summaryAfter?.user?.consentRequired).toBe(false)

    // Later stakes no longer need the flag.
    await service.stakeInPool({ communityMarketId: marketId, userId: userIds[3]!, outcome: 'no', amountMinor: 5_000n })
  })

  it('refunds every stake when the jury cancels, and closes expired pools', async () => {
    const marketId = await createMarket(`Disputed ${suffix}`)
    await service.openPoolForMarket({
      communityMarketId: marketId,
      communityId,
      closesAt: new Date(Date.now() - 1_000),
    })
    // already past close → refuse
    await expect(
      service.stakeInPool({ communityMarketId: marketId, userId: userIds[2]!, outcome: 'no', amountMinor: 5_000n }),
    ).rejects.toMatchObject({ code: 'pool_closed' })
    expect(await service.closeExpiredPools()).toBeGreaterThanOrEqual(1)

    const marketId2 = await createMarket(`Cancelled ${suffix}`)
    await service.openPoolForMarket({ communityMarketId: marketId2, communityId, closesAt: null })
    const before2 = (await LedgerService.getUserBalance(userIds[2]!, 'KES')).balance
    await service.stakeInPool({
      communityMarketId: marketId2,
      userId: userIds[2]!,
      outcome: 'no',
      amountMinor: 10_000n,
    })
    expect((await LedgerService.getUserBalance(userIds[2]!, 'KES')).balance).toBe(before2 - 10_000n)
    await db
      .update(communitySchema.community_markets)
      .set({ status: 'disputed', resolved_outcome: 'cancelled', resolved_at: new Date() })
      .where(eq(communitySchema.community_markets.id, marketId2))
    const settlement = await service.settlePoolForMarket(marketId2)
    expect(settlement?.refunded).toBe(true)
    expect(settlement?.rake).toBe('0')
    expect((await LedgerService.getUserBalance(userIds[2]!, 'KES')).balance).toBe(before2)

    const unsettled = await service.listUnsettledResolvedPools()
    expect(unsettled.some((row) => row.pool.community_market_id === marketId2)).toBe(false)
  })
})
