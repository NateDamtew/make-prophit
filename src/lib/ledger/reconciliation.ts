import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'

import type { ReconciliationStatus } from '@/lib/db/schema/ledger/reconciliation'
import type { MobileMoneySettings } from '@/lib/mobile-money/settings'

import { listAdminUserIds } from '@/lib/admin-users'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { reconciliation_runs } from '@/lib/db/schema/ledger/reconciliation'
import { ledger_accounts, ledger_entries, ledger_reservations, payment_intents } from '@/lib/db/schema/ledger/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import {
  getMobileMoneySettings,
  MOBILE_MONEY_CURRENCY_KEY_PREFIX,
  MOBILE_MONEY_SETTINGS_GROUP,
  serializeCurrencyConfig,
} from '@/lib/mobile-money/settings'
import { getPawaPayClient, isPawaPayConfigured } from '@/lib/pawapay/client'

/**
 * Nightly reconciliation (LOCAL-PAYMENTS-DESIGN.md §12). Five checks:
 *  1. cached balances/reserved = recomputed from entries, every account
 *  2. accounting identity per currency: Σ debit-normal balances = Σ credit-normal balances
 *  3. pool accounts: open pools hold total_yes + total_no; settled pools hold 0
 *  4. payment intents: nothing pending > 24h, completed intents have ledger txs,
 *     no active holds on closed intents
 *  5. float vs pawaPay wallet per currency (informational: pawaPay deducts its
 *     own fees from the wallet, so a gap is expected to grow slowly)
 * A `fail` pauses payouts and trading for the affected currency and notifies
 * platform admins. Deposits stay on: money arriving is never the problem.
 */

export interface ReconciliationCheckResult {
  check: string
  currency: string | null
  status: ReconciliationStatus
  expected?: string
  actual?: string
  delta?: string
  details?: Record<string, unknown>
}

export interface ReconciliationReport {
  runId: string
  ranAt: Date
  results: ReconciliationCheckResult[]
  failed: ReconciliationCheckResult[]
  pausedCurrencies: string[]
}

const STUCK_INTENT_HOURS = 24

export function compareTotals(expected: bigint, actual: bigint): { status: ReconciliationStatus; delta: bigint } {
  const delta = actual - expected
  return { status: delta === 0n ? 'ok' : 'fail', delta }
}

async function checkCachedBalances(): Promise<ReconciliationCheckResult[]> {
  const accounts = await db
    .select({
      id: ledger_accounts.id,
      kind: ledger_accounts.kind,
      currency: ledger_accounts.currency,
      normal: ledger_accounts.normal_balance,
      balance: ledger_accounts.balance,
      reserved: ledger_accounts.reserved,
    })
    .from(ledger_accounts)
  const sums = await db
    .select({
      accountId: ledger_entries.account_id,
      debits: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_entries.side} = 'debit' THEN ${ledger_entries.amount} ELSE 0 END), 0)`,
      credits: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_entries.side} = 'credit' THEN ${ledger_entries.amount} ELSE 0 END), 0)`,
    })
    .from(ledger_entries)
    .groupBy(ledger_entries.account_id)
  const holds = await db
    .select({
      accountId: ledger_reservations.account_id,
      total: sql<string>`COALESCE(SUM(${ledger_reservations.amount}), 0)`,
    })
    .from(ledger_reservations)
    .where(eq(ledger_reservations.state, 'active'))
    .groupBy(ledger_reservations.account_id)
  const sumByAccount = new Map(
    sums.map((row) => [row.accountId, { debits: BigInt(row.debits), credits: BigInt(row.credits) }]),
  )
  const holdByAccount = new Map(holds.map((row) => [row.accountId, BigInt(row.total)]))

  const drift: Array<Record<string, string>> = []
  for (const row of accounts) {
    const totals = sumByAccount.get(row.id) ?? { debits: 0n, credits: 0n }
    const recomputed = row.normal === 'debit' ? totals.debits - totals.credits : totals.credits - totals.debits
    const reservedRecomputed = holdByAccount.get(row.id) ?? 0n
    if (recomputed !== row.balance || reservedRecomputed !== row.reserved) {
      drift.push({
        accountId: row.id,
        kind: row.kind,
        currency: row.currency,
        cached: row.balance.toString(),
        recomputed: recomputed.toString(),
        reservedCached: row.reserved.toString(),
        reservedRecomputed: reservedRecomputed.toString(),
      })
    }
  }
  return [
    {
      check: 'cached_balances',
      currency: null,
      status: drift.length === 0 ? 'ok' : 'fail',
      expected: `${accounts.length} accounts consistent`,
      actual: `${drift.length} drifted`,
      delta: drift.length.toString(),
      details: { drift: drift.slice(0, 50) },
    },
  ]
}

async function checkIdentityPerCurrency(currencies: string[]): Promise<ReconciliationCheckResult[]> {
  const results: ReconciliationCheckResult[] = []
  for (const currency of currencies) {
    const [row] = await db
      .select({
        debitSide: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_accounts.normal_balance} = 'debit' THEN ${ledger_accounts.balance} ELSE 0 END), 0)`,
        creditSide: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_accounts.normal_balance} = 'credit' THEN ${ledger_accounts.balance} ELSE 0 END), 0)`,
      })
      .from(ledger_accounts)
      .where(eq(ledger_accounts.currency, currency))
    const debitSide = BigInt(row?.debitSide ?? '0')
    const creditSide = BigInt(row?.creditSide ?? '0')
    const { status, delta } = compareTotals(debitSide, creditSide)
    results.push({
      check: 'accounting_identity',
      currency,
      status,
      expected: debitSide.toString(),
      actual: creditSide.toString(),
      delta: delta.toString(),
    })
  }
  return results
}

async function checkPools(): Promise<ReconciliationCheckResult[]> {
  const rows = await db
    .select({
      poolId: pools.id,
      state: pools.state,
      currency: pools.currency,
      totalYes: pools.total_yes,
      totalNo: pools.total_no,
    })
    .from(pools)
  const poolAccounts = await db
    .select({ ownerId: ledger_accounts.owner_id, balance: ledger_accounts.balance })
    .from(ledger_accounts)
    .where(and(eq(ledger_accounts.owner_type, 'house'), eq(ledger_accounts.kind, 'pool')))
  const balanceByPool = new Map(poolAccounts.map((row) => [row.ownerId ?? '', row.balance]))
  const mismatches: Array<Record<string, string>> = []
  for (const row of rows) {
    const expected = row.state === 'open' || row.state === 'closed' ? row.totalYes + row.totalNo : 0n
    const actual = balanceByPool.get(row.poolId) ?? 0n
    if (expected !== actual) {
      mismatches.push({
        poolId: row.poolId,
        state: row.state,
        currency: row.currency,
        expected: expected.toString(),
        actual: actual.toString(),
      })
    }
  }
  return [
    {
      check: 'pool_balances',
      currency: null,
      status: mismatches.length === 0 ? 'ok' : 'fail',
      expected: `${rows.length} pools consistent`,
      actual: `${mismatches.length} mismatched`,
      delta: mismatches.length.toString(),
      details: { mismatches: mismatches.slice(0, 50) },
    },
  ]
}

async function checkIntents(): Promise<ReconciliationCheckResult[]> {
  const stuck = await db
    .select({ id: payment_intents.id, kind: payment_intents.kind, created_at: payment_intents.created_at })
    .from(payment_intents)
    .where(
      and(
        inArray(payment_intents.state, ['initiated', 'pending']),
        sql`${payment_intents.created_at} < NOW() - INTERVAL '${sql.raw(String(STUCK_INTENT_HOURS))} hours'`,
      ),
    )
    .limit(200)
  const missingTx = await db
    .select({ id: payment_intents.id, kind: payment_intents.kind })
    .from(payment_intents)
    .where(and(eq(payment_intents.state, 'completed'), isNull(payment_intents.ledger_transaction_id)))
    .limit(200)
  const orphanHolds = await db
    .select({ reservationId: ledger_reservations.id, intentId: payment_intents.id, state: payment_intents.state })
    .from(ledger_reservations)
    .innerJoin(payment_intents, eq(payment_intents.reservation_id, ledger_reservations.id))
    .where(
      and(
        eq(ledger_reservations.state, 'active'),
        or(
          eq(payment_intents.state, 'completed'),
          eq(payment_intents.state, 'failed'),
          eq(payment_intents.state, 'rejected'),
          eq(payment_intents.state, 'cancelled'),
        ),
      ),
    )
    .limit(200)
  return [
    {
      check: 'stuck_intents',
      currency: null,
      status: stuck.length === 0 ? 'ok' : 'warn',
      expected: '0',
      actual: stuck.length.toString(),
      delta: stuck.length.toString(),
      details: {
        intents: stuck
          .slice(0, 50)
          .map((row) => ({ id: row.id, kind: row.kind, createdAt: row.created_at.toISOString() })),
      },
    },
    {
      check: 'intents_ledger_integrity',
      currency: null,
      status: missingTx.length === 0 && orphanHolds.length === 0 ? 'ok' : 'fail',
      expected: '0 anomalies',
      actual: `${missingTx.length} completed without ledger tx, ${orphanHolds.length} orphan holds`,
      delta: (missingTx.length + orphanHolds.length).toString(),
      details: { missingTx: missingTx.slice(0, 50), orphanHolds: orphanHolds.slice(0, 50) },
    },
  ]
}

async function checkFloatVsPawaPay(currencies: string[]): Promise<ReconciliationCheckResult[]> {
  if (!isPawaPayConfigured()) {
    return currencies.map((currency) => ({
      check: 'float_vs_pawapay',
      currency,
      status: 'skipped' as const,
      details: { reason: 'pawaPay not configured' },
    }))
  }
  let wallets: Array<{ currency: string; balance: string }>
  try {
    wallets = await getPawaPayClient().getWalletBalances()
  } catch (error) {
    return currencies.map((currency) => ({
      check: 'float_vs_pawapay',
      currency,
      status: 'warn' as const,
      details: { reason: error instanceof Error ? error.message : 'wallet balances unavailable' },
    }))
  }
  const results: ReconciliationCheckResult[] = []
  for (const currency of currencies) {
    const [row] = await db
      .select({ balance: ledger_accounts.balance })
      .from(ledger_accounts)
      .where(
        and(
          eq(ledger_accounts.owner_type, 'house'),
          isNull(ledger_accounts.owner_id),
          eq(ledger_accounts.kind, 'float'),
          eq(ledger_accounts.currency, currency),
        ),
      )
      .limit(1)
    const ledgerFloat = row?.balance ?? 0n
    const wallet = wallets.find((item) => item.currency === currency)
    const walletMinor = wallet ? BigInt(Math.round(Number(wallet.balance) * 100)) : null
    results.push({
      check: 'float_vs_pawapay',
      currency,
      status: walletMinor === null ? 'warn' : 'ok',
      expected: ledgerFloat.toString(),
      actual: walletMinor?.toString(),
      delta: walletMinor === null ? undefined : (walletMinor - ledgerFloat).toString(),
      details: {
        note: 'informational: pawaPay deducts provider fees from the wallet; a slowly growing negative delta is expected',
      },
    })
  }
  return results
}

async function pauseCurrency(currency: string, reason: string, settings: MobileMoneySettings) {
  const config = settings.currencies[currency]
  if (!config) {
    return
  }
  if (config.payoutsPaused && config.tradingPaused) {
    return
  }
  await SettingsRepository.updateSettings([
    {
      group: MOBILE_MONEY_SETTINGS_GROUP,
      key: `${MOBILE_MONEY_CURRENCY_KEY_PREFIX}${currency}`,
      value: serializeCurrencyConfig({ ...config, payoutsPaused: true, tradingPaused: true }),
    },
  ])
  console.error(`[reconciliation] paused payouts + trading for ${currency}: ${reason}`)
}

async function notifyAdmins(title: string, description: string) {
  for (const adminId of await listAdminUserIds()) {
    try {
      await db.insert(notifications).values({
        user_id: adminId,
        category: 'system',
        title,
        description,
        link_type: 'custom',
        link_url: '/admin/reconciliation',
        link_label: 'Open reconciliation',
        metadata: { kind: 'reconciliation_failed' },
      })
    } catch (error) {
      console.error('[reconciliation] admin notification failed', error)
    }
  }
}

export async function runReconciliation(
  options: { pauseOnFailure?: boolean; notify?: boolean; settings?: MobileMoneySettings } = {},
): Promise<ReconciliationReport> {
  const settings = options.settings ?? (await getMobileMoneySettings())
  const currencies = settings.enabledCurrencies
  const results: ReconciliationCheckResult[] = [
    ...(await checkCachedBalances()),
    ...(await checkIdentityPerCurrency(currencies)),
    ...(await checkPools()),
    ...(await checkIntents()),
    ...(await checkFloatVsPawaPay(currencies)),
    { check: 'positions_vs_kuest', currency: null, status: 'skipped', details: { reason: 'house trading not live' } },
  ]
  const runId = await persistResults(results)
  const failed = results.filter((result) => result.status === 'fail')
  const pausedCurrencies: string[] = []
  if (failed.length > 0 && (options.pauseOnFailure ?? true)) {
    const affected = new Set<string>(failed.map((result) => result.currency ?? '').filter(Boolean))
    // Global failures (no currency) pause everything enabled.
    const targets = affected.size > 0 && failed.every((result) => result.currency) ? [...affected] : currencies
    for (const currency of targets) {
      await pauseCurrency(currency, failed.map((result) => result.check).join(', '), settings)
      pausedCurrencies.push(currency)
    }
  }
  if (failed.length > 0 && (options.notify ?? true)) {
    await notifyAdmins(
      'Ledger reconciliation failed',
      `${failed.length} check(s) failed: ${failed.map((result) => `${result.check}${result.currency ? ` (${result.currency})` : ''}`).join(', ')}.${pausedCurrencies.length ? ` Payouts and trading paused for ${pausedCurrencies.join(', ')}.` : ''}`,
    )
  }
  return { runId, ranAt: new Date(), results, failed, pausedCurrencies }
}

async function persistResults(results: ReconciliationCheckResult[]): Promise<string> {
  const [first] = await db
    .insert(reconciliation_runs)
    .values({
      run_id: sql`generate_ulid()`,
      check_name: results[0]!.check,
      currency: results[0]!.currency,
      status: results[0]!.status,
      expected: results[0]!.expected ?? null,
      actual: results[0]!.actual ?? null,
      delta: results[0]!.delta ?? null,
      details: results[0]!.details ?? null,
    })
    .returning({ runId: reconciliation_runs.run_id })
  const runId = first!.runId
  for (const result of results.slice(1)) {
    await db.insert(reconciliation_runs).values({
      run_id: runId,
      check_name: result.check,
      currency: result.currency,
      status: result.status,
      expected: result.expected ?? null,
      actual: result.actual ?? null,
      delta: result.delta ?? null,
      details: result.details ?? null,
    })
  }
  return runId
}

export const ReconciliationRepository = {
  async listRuns(limit = 20) {
    const rows = await db
      .select()
      .from(reconciliation_runs)
      .orderBy(desc(reconciliation_runs.ran_at))
      .limit(Math.min(Math.max(limit, 1), 100) * 12)
    const byRun = new Map<string, { runId: string; ranAt: Date; checks: (typeof rows)[number][] }>()
    for (const row of rows) {
      const existing = byRun.get(row.run_id)
      if (existing) {
        existing.checks.push(row)
      } else {
        byRun.set(row.run_id, { runId: row.run_id, ranAt: row.ran_at, checks: [row] })
      }
    }
    return [...byRun.values()].slice(0, limit)
  },

  async latestRunAt(): Promise<Date | null> {
    const [row] = await db
      .select({ ranAt: reconciliation_runs.ran_at })
      .from(reconciliation_runs)
      .orderBy(desc(reconciliation_runs.ran_at))
      .limit(1)
    return row?.ranAt ?? null
  },

  async acknowledge(id: string, userId: string, note: string) {
    const [row] = await db
      .update(reconciliation_runs)
      .set({ acknowledged_by: userId, acknowledged_at: new Date(), note })
      .where(eq(reconciliation_runs.id, id))
      .returning()
    return row ?? null
  },
}
