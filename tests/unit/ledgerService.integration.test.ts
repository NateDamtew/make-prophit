/**
 * Ledger service against a real Postgres. Runs ONLY when both are set:
 *   LEDGER_INTEGRATION_TESTS=1  and  POSTGRES_URL (dev project, never beta).
 * From the worktree: LEDGER_INTEGRATION_TESTS=1 bun test tests/unit/ledgerService.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

const ENABLED = process.env.LEDGER_INTEGRATION_TESTS === '1' && Boolean(process.env.POSTGRES_URL)
const IS_PRODUCTION_DB = (process.env.POSTGRES_URL ?? '').includes('vsytshpanaxxqadgecap')

describe.skipIf(!ENABLED || IS_PRODUCTION_DB)('LedgerService (integration)', () => {
  let LedgerService: typeof import('@/lib/ledger/service').LedgerService
  let LedgerError: typeof import('@/lib/ledger/service').LedgerError
  let db: typeof import('@/lib/drizzle').db
  let users: typeof import('@/lib/db/schema/auth/tables').users
  let schema: typeof import('@/lib/db/schema/ledger/tables')
  let eq: typeof import('drizzle-orm').eq
  const suffix = Date.now().toString(36)
  let userId: string
  const createdAccountIds: string[] = []

  beforeAll(async () => {
    ;({ LedgerService, LedgerError } = await import('@/lib/ledger/service'))
    ;({ db } = await import('@/lib/drizzle'))
    ;({ users } = await import('@/lib/db/schema/auth/tables'))
    schema = await import('@/lib/db/schema/ledger/tables')
    ;({ eq } = await import('drizzle-orm'))
    const [user] = await db
      .insert(users)
      .values({
        address: `0xledgertest${suffix}`,
        email: `ledger-test-${suffix}@example.test`,
        username: `ledger_${suffix}`,
      } as never)
      .returning({ id: users.id })
    userId = user!.id
  })

  afterAll(async () => {
    if (!userId) {
      return
    }
    // Entries are append-only (trigger), so delete in dependency order after dropping the trigger guard for this test data.
    await db.execute(`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_no_update` as never)
    try {
      const accountIds = (
        await db
          .select({ id: schema.ledger_accounts.id })
          .from(schema.ledger_accounts)
          .where(eq(schema.ledger_accounts.owner_id, userId))
      ).map((r) => r.id)
      const allIds = [...new Set([...accountIds, ...createdAccountIds])]
      for (const id of allIds) {
        await db.delete(schema.ledger_entries).where(eq(schema.ledger_entries.account_id, id))
        await db.delete(schema.ledger_reservations).where(eq(schema.ledger_reservations.account_id, id))
      }
      for (const id of allIds) {
        await db.delete(schema.ledger_accounts).where(eq(schema.ledger_accounts.id, id))
      }
      await db.delete(schema.ledger_user_profiles).where(eq(schema.ledger_user_profiles.user_id, userId))
      await db.delete(users).where(eq(users.id, userId))
    } finally {
      await db.execute(`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_no_update` as never)
    }
  })

  it('creates accounts idempotently and posts a deposit', async () => {
    const profile = await LedgerService.ensureUserProfile(userId, 'kes')
    expect(profile.currency).toBe('KES')
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    const again = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    expect(again.id).toBe(cash.id)
    expect(cash.normal_balance).toBe('credit')

    const float = await LedgerService.getOrCreateHouseAccount('float', 'KES', undefined, `test-${suffix}`)
    createdAccountIds.push(float.id)
    expect(float.normal_balance).toBe('debit')

    const result = await LedgerService.postTransaction({
      kind: 'deposit',
      idempotencyKey: `dep-${suffix}`,
      entries: [
        { accountId: float.id, side: 'debit', amount: 100_000n, currency: 'KES' },
        { accountId: cash.id, side: 'credit', amount: 100_000n, currency: 'KES' },
      ],
    })
    expect(result.alreadyPosted).toBe(false)
    expect(result.balances[cash.id]).toBe(100_000n)
    expect(result.balances[float.id]).toBe(100_000n)

    const replay = await LedgerService.postTransaction({
      kind: 'deposit',
      idempotencyKey: `dep-${suffix}`,
      entries: [
        { accountId: float.id, side: 'debit', amount: 100_000n, currency: 'KES' },
        { accountId: cash.id, side: 'credit', amount: 100_000n, currency: 'KES' },
      ],
    })
    expect(replay.alreadyPosted).toBe(true)
    expect(replay.transactionId).toBe(result.transactionId)

    const balance = await LedgerService.getUserBalance(userId, 'KES')
    expect(balance).toEqual({ currency: 'KES', balance: 100_000n, reserved: 0n, available: 100_000n })
  })

  it('reserves, refuses over-spend, consumes partially and releases', async () => {
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    const float = await LedgerService.getOrCreateHouseAccount('float', 'KES', undefined, `test-${suffix}`)
    const fees = await LedgerService.getOrCreateHouseAccount('fees', 'KES', undefined, `test-${suffix}`)
    createdAccountIds.push(fees.id)

    const reservation = await LedgerService.reserve({
      accountId: cash.id,
      amount: 90_000n,
      referenceType: 'test-payout',
      referenceId: `p-${suffix}`,
    })
    expect((await LedgerService.getUserBalance(userId, 'KES')).available).toBe(10_000n)

    await expect(
      LedgerService.reserve({
        accountId: cash.id,
        amount: 20_000n,
        referenceType: 'test-order',
        referenceId: `o-${suffix}`,
      }),
    ).rejects.toBeInstanceOf(LedgerError)

    // Debiting past the reservation floor without consuming it must fail.
    await expect(
      LedgerService.postTransaction({
        kind: 'test',
        entries: [
          { accountId: cash.id, side: 'debit', amount: 50_000n, currency: 'KES' },
          { accountId: float.id, side: 'credit', amount: 50_000n, currency: 'KES' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'insufficient_funds' })

    // Payout: consume the hold, debit the user 90,000, send 87,500, keep 2,500 fee.
    const payout = await LedgerService.postTransaction({
      kind: 'payout',
      consumeReservations: [{ reservationId: reservation.id }],
      entries: [
        { accountId: cash.id, side: 'debit', amount: 90_000n, currency: 'KES' },
        { accountId: float.id, side: 'credit', amount: 87_500n, currency: 'KES' },
        { accountId: fees.id, side: 'credit', amount: 2_500n, currency: 'KES' },
      ],
    })
    expect(payout.balances[cash.id]).toBe(10_000n)
    expect(payout.balances[float.id]).toBe(12_500n)
    expect(payout.balances[fees.id]).toBe(2_500n)
    expect((await LedgerService.getReservation(reservation.id))?.state).toBe('consumed')
    expect((await LedgerService.getUserBalance(userId, 'KES')).reserved).toBe(0n)

    const second = await LedgerService.reserve({
      accountId: cash.id,
      amount: 5_000n,
      referenceType: 'test-order',
      referenceId: `o2-${suffix}`,
    })
    const released = await LedgerService.releaseReservation(second.id)
    expect(released?.state).toBe('released')
    expect((await LedgerService.getUserBalance(userId, 'KES')).available).toBe(10_000n)
    expect((await LedgerService.releaseReservation(second.id))?.state).toBe('released')
  })

  it('keeps cached balances equal to recomputed sums and entries immutable', async () => {
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    const check = await LedgerService.recomputeAccountBalance(cash.id)
    expect(check.recomputed).toBe(check.cached)
    expect(check.reservedRecomputed).toBe(check.reservedCached)

    const entries = await LedgerService.listEntries(cash.id, { limit: 10 })
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries[0]!.balance_after).toBe(check.cached)
    let deleteError: unknown
    try {
      await db.delete(schema.ledger_entries).where(eq(schema.ledger_entries.id, entries[0]!.id))
    } catch (error) {
      deleteError = error
    }
    expect(deleteError).toBeInstanceOf(Error)
    const cause = (deleteError as Error & { cause?: { message?: string } }).cause
    expect(`${(deleteError as Error).message} ${cause?.message ?? ''}`).toMatch(/append-only/)
  })

  it('rejects unbalanced and cross-currency postings', async () => {
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    const float = await LedgerService.getOrCreateHouseAccount('float', 'KES', undefined, `test-${suffix}`)
    await expect(
      LedgerService.postTransaction({
        kind: 'bad',
        entries: [
          { accountId: cash.id, side: 'credit', amount: 10n, currency: 'KES' },
          { accountId: float.id, side: 'debit', amount: 11n, currency: 'KES' },
        ],
      }),
    ).rejects.toThrow(/do not balance/)
    await expect(
      LedgerService.postTransaction({
        kind: 'bad',
        entries: [
          { accountId: cash.id, side: 'credit', amount: 10n, currency: 'USD' },
          { accountId: float.id, side: 'debit', amount: 10n, currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(/is KES, entry is USD/)
  })
})
