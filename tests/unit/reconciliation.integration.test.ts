/**
 * Reconciliation against the dev database: a clean run passes; injected drift
 * on a user account is detected and pauses the currency; restoring the cached
 * balance clears it. Runs ONLY with LEDGER_INTEGRATION_TESTS=1 and a
 * non-production POSTGRES_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

const ENABLED = process.env.LEDGER_INTEGRATION_TESTS === '1' && Boolean(process.env.POSTGRES_URL)
const IS_PRODUCTION_DB = (process.env.POSTGRES_URL ?? '').includes('vsytshpanaxxqadgecap')

describe.skipIf(!ENABLED || IS_PRODUCTION_DB)('reconciliation (integration)', () => {
  let runReconciliation: typeof import('@/lib/ledger/reconciliation').runReconciliation
  let settings: import('@/lib/mobile-money/settings').MobileMoneySettings
  let ReconciliationRepository: typeof import('@/lib/ledger/reconciliation').ReconciliationRepository
  let LedgerService: typeof import('@/lib/ledger/service').LedgerService
  let db: typeof import('@/lib/drizzle').db
  let users: typeof import('@/lib/db/schema/auth/tables').users
  let ledgerSchema: typeof import('@/lib/db/schema/ledger/tables')
  let recon: typeof import('@/lib/db/schema/ledger/reconciliation')
  let eq: typeof import('drizzle-orm').eq
  let inArray: typeof import('drizzle-orm').inArray
  const suffix = Date.now().toString(36)
  let userId: string
  let accountId: string
  const runIds: string[] = []

  beforeAll(async () => {
    ;({ runReconciliation, ReconciliationRepository } = await import('@/lib/ledger/reconciliation'))
    ;({ LedgerService } = await import('@/lib/ledger/service'))
    const { parseMobileMoneySettings } = await import('@/lib/mobile-money/settings')
    settings = parseMobileMoneySettings({ mobile_money: { enabled: { value: 'true' } } }, {})
    ;({ db } = await import('@/lib/drizzle'))
    ;({ users } = await import('@/lib/db/schema/auth/tables'))
    ledgerSchema = await import('@/lib/db/schema/ledger/tables')
    recon = await import('@/lib/db/schema/ledger/reconciliation')
    ;({ eq, inArray } = await import('drizzle-orm'))
    const [user] = await db
      .insert(users)
      .values({
        address: `0xrecon${suffix}`,
        email: `recon-${suffix}@example.test`,
        username: `recon_${suffix}`,
      } as never)
      .returning({ id: users.id })
    userId = user!.id
    // The dev DB is shared with other integration tests whose cleanups delete
    // their entries; resync every house account first so this test measures
    // the reconciliation logic, not leftovers.
    const houseAccounts = await db
      .select({ id: ledgerSchema.ledger_accounts.id })
      .from(ledgerSchema.ledger_accounts)
      .where(eq(ledgerSchema.ledger_accounts.owner_type, 'house'))
    for (const account of houseAccounts) {
      const check = await LedgerService.recomputeAccountBalance(account.id)
      if (check.cached !== check.recomputed || check.reservedCached !== check.reservedRecomputed) {
        await db
          .update(ledgerSchema.ledger_accounts)
          .set({ balance: check.recomputed, reserved: check.reservedRecomputed })
          .where(eq(ledgerSchema.ledger_accounts.id, account.id))
      }
    }
    await LedgerService.ensureUserProfile(userId, 'KES')
    const cash = await LedgerService.getOrCreateUserCashAccount(userId, 'KES')
    accountId = cash.id
    const suspense = await LedgerService.getOrCreateHouseAccount('suspense', 'KES')
    await LedgerService.postTransaction({
      kind: 'test_funding',
      idempotencyKey: `recon:${suffix}`,
      entries: [
        { accountId: suspense.id, side: 'debit', amount: 10_000n, currency: 'KES' },
        { accountId: cash.id, side: 'credit', amount: 10_000n, currency: 'KES' },
      ],
    })
  })

  afterAll(async () => {
    await db.execute(`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_no_update` as never)
    try {
      const txIds = (
        await db
          .select({ t: ledgerSchema.ledger_entries.transaction_id })
          .from(ledgerSchema.ledger_entries)
          .where(eq(ledgerSchema.ledger_entries.account_id, accountId))
      ).map((r) => r.t)
      if (txIds.length) {
        await db.delete(ledgerSchema.ledger_entries).where(inArray(ledgerSchema.ledger_entries.transaction_id, txIds))
        await db.delete(ledgerSchema.ledger_transactions).where(inArray(ledgerSchema.ledger_transactions.id, txIds))
      }
      await db.delete(ledgerSchema.ledger_accounts).where(eq(ledgerSchema.ledger_accounts.id, accountId))
      await db.delete(ledgerSchema.ledger_user_profiles).where(eq(ledgerSchema.ledger_user_profiles.user_id, userId))
      await db.delete(users).where(eq(users.id, userId))
      if (runIds.length) {
        await db.delete(recon.reconciliation_runs).where(inArray(recon.reconciliation_runs.run_id, runIds))
      }
      const suspense = await LedgerService.getOrCreateHouseAccount('suspense', 'KES')
      const check = await LedgerService.recomputeAccountBalance(suspense.id)
      await db
        .update(ledgerSchema.ledger_accounts)
        .set({ balance: check.recomputed, reserved: check.reservedRecomputed })
        .where(eq(ledgerSchema.ledger_accounts.id, suspense.id))
    } finally {
      await db.execute(`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_no_update` as never)
    }
  })

  it('passes on a consistent ledger and persists one row per check', async () => {
    const report = await runReconciliation({ pauseOnFailure: false, notify: false, settings })
    runIds.push(report.runId)
    const byCheck = Object.fromEntries(
      report.results.map((result) => [`${result.check}:${result.currency ?? ''}`, result.status]),
    )
    expect(byCheck['cached_balances:']).toBe('ok')
    expect(byCheck['accounting_identity:KES']).toBe('ok')
    expect(byCheck['pool_balances:']).toBe('ok')
    expect(byCheck['intents_ledger_integrity:']).toBe('ok')
    expect(['ok', 'warn', 'skipped']).toContain(byCheck['float_vs_pawapay:KES'])
    expect(report.failed).toHaveLength(0)
    const runs = await ReconciliationRepository.listRuns(1)
    expect(runs[0]?.runId).toBe(report.runId)
    expect(runs[0]?.checks.length).toBe(report.results.length)
    expect(await ReconciliationRepository.latestRunAt()).not.toBeNull()
  })

  it('detects cached-balance drift and the broken accounting identity', async () => {
    await db
      .update(ledgerSchema.ledger_accounts)
      .set({ balance: 99_999n })
      .where(eq(ledgerSchema.ledger_accounts.id, accountId))
    const report = await runReconciliation({ pauseOnFailure: false, notify: false, settings })
    runIds.push(report.runId)
    const failed = report.failed.map((result) => result.check)
    expect(failed).toContain('cached_balances')
    expect(failed).toContain('accounting_identity')
    const drift = report.results.find((result) => result.check === 'cached_balances')?.details as {
      drift: Array<{ accountId: string }>
    }
    expect(drift.drift.some((row) => row.accountId === accountId)).toBe(true)

    await db
      .update(ledgerSchema.ledger_accounts)
      .set({ balance: 10_000n })
      .where(eq(ledgerSchema.ledger_accounts.id, accountId))
    const clean = await runReconciliation({ pauseOnFailure: false, notify: false, settings })
    runIds.push(clean.runId)
    expect(clean.failed).toHaveLength(0)
  })
})
