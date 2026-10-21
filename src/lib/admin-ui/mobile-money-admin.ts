import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'

import type { PaymentIntentKind, PaymentIntentState } from '@/lib/db/schema/ledger/tables'
import type { MobileMoneySettings } from '@/lib/mobile-money/settings'

import { users } from '@/lib/db/schema/auth/tables'
import {
  ledger_accounts,
  ledger_reservations,
  ledger_user_profiles,
  payment_intents,
} from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { getReferenceRate } from '@/lib/fx/rates'
import { LedgerService } from '@/lib/ledger/service'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { getPawaPayClient, isPawaPayConfigured } from '@/lib/pawapay/client'

/**
 * Read models for the admin back office (Treasury, Payments, Ledger). All
 * amounts are returned as strings in minor units so bigint survives JSON.
 */

export interface TreasuryCurrencySummary {
  currency: string
  country: string
  userBalancesMinor: string
  userReservedMinor: string
  floatMinor: string
  feesMinor: string
  roundingMinor: string
  pawaPayWalletMinor: string | null
  pawaPayWalletProvider: string | null
  floatTargetMinor: string
  exposureCapMinor: string
  pendingDeposits: number
  pendingPayouts: number
  depositsToday: { count: number; amountMinor: string }
  payoutsToday: { count: number; amountMinor: string }
  marginBps: number
  withdrawalFeeMinor: string
  depositsPaused: boolean
  payoutsPaused: boolean
  tradingPaused: boolean
  rate: {
    ratePerUsd: number
    source: string
    fetchedAt: string
    stale: boolean
    paused: boolean
    isOverride: boolean
    jumpBps: number | null
    effectiveMarginBps: number
  } | null
}

export interface TreasurySummary {
  enabled: boolean
  pawaPayConfigured: boolean
  pawaPayEnvironment: 'sandbox' | 'production'
  pawaPayError: string | null
  currencies: TreasuryCurrencySummary[]
  generatedAt: string
}

async function houseBalance(kind: 'float' | 'fees' | 'rounding', currency: string): Promise<bigint> {
  const [row] = await db
    .select({ balance: ledger_accounts.balance })
    .from(ledger_accounts)
    .where(
      and(
        eq(ledger_accounts.owner_type, 'house'),
        sql`${ledger_accounts.owner_id} IS NULL`,
        eq(ledger_accounts.kind, kind),
        eq(ledger_accounts.currency, currency),
      ),
    )
    .limit(1)
  return row?.balance ?? 0n
}

async function userTotals(currency: string): Promise<{ balance: bigint; reserved: bigint }> {
  const [row] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${ledger_accounts.balance}), 0)`,
      reserved: sql<string>`COALESCE(SUM(${ledger_accounts.reserved}), 0)`,
    })
    .from(ledger_accounts)
    .where(
      and(
        eq(ledger_accounts.owner_type, 'user'),
        eq(ledger_accounts.kind, 'user_cash'),
        eq(ledger_accounts.currency, currency),
      ),
    )
  return { balance: BigInt(row?.balance ?? '0'), reserved: BigInt(row?.reserved ?? '0') }
}

async function intentStats(currency: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      kind: payment_intents.kind,
      state: payment_intents.state,
      count: sql<string>`COUNT(*)`,
      amount: sql<string>`COALESCE(SUM(${payment_intents.amount}), 0)`,
      recent: sql<string>`COALESCE(SUM(CASE WHEN ${payment_intents.created_at} >= ${since} THEN 1 ELSE 0 END), 0)`,
      recentAmount: sql<string>`COALESCE(SUM(CASE WHEN ${payment_intents.created_at} >= ${since} AND ${payment_intents.state} = 'completed' THEN ${payment_intents.amount} ELSE 0 END), 0)`,
    })
    .from(payment_intents)
    .where(eq(payment_intents.currency, currency))
    .groupBy(payment_intents.kind, payment_intents.state)
  const pending = { deposit: 0, payout: 0 }
  const today = { deposit: { count: 0, amount: 0n }, payout: { count: 0, amount: 0n } }
  for (const row of rows) {
    if (row.state === 'initiated' || row.state === 'pending') {
      pending[row.kind] += Number(row.count)
    }
    if (row.state === 'completed') {
      today[row.kind].count += Number(row.recent)
      today[row.kind].amount += BigInt(row.recentAmount)
    }
  }
  return { pending, today }
}

export async function getTreasurySummary(): Promise<TreasurySummary> {
  const settings = await getMobileMoneySettings()
  const configured = isPawaPayConfigured()
  let wallets: Array<{ currency: string; provider: string; balance: string }> = []
  let pawaPayError: string | null = null
  if (configured) {
    try {
      wallets = await getPawaPayClient().getWalletBalances()
    } catch (error) {
      pawaPayError = error instanceof Error ? error.message : String(error)
    }
  }
  const currencies: TreasuryCurrencySummary[] = []
  for (const currency of settings.enabledCurrencies) {
    const config = settings.currencies[currency]!
    const [totals, float, fees, rounding, stats, rate] = await Promise.all([
      userTotals(currency),
      houseBalance('float', currency),
      houseBalance('fees', currency),
      houseBalance('rounding', currency),
      intentStats(currency),
      getReferenceRate(currency, settings).catch(() => null),
    ])
    const wallet = wallets.find((item) => item.currency === currency)
    currencies.push({
      currency,
      country: config.country,
      userBalancesMinor: totals.balance.toString(),
      userReservedMinor: totals.reserved.toString(),
      floatMinor: float.toString(),
      feesMinor: fees.toString(),
      roundingMinor: rounding.toString(),
      pawaPayWalletMinor: wallet ? Math.round(Number(wallet.balance) * 100).toString() : null,
      pawaPayWalletProvider: wallet?.provider ?? null,
      floatTargetMinor: config.floatTargetMinor.toString(),
      exposureCapMinor: config.exposureCapMinor.toString(),
      pendingDeposits: stats.pending.deposit,
      pendingPayouts: stats.pending.payout,
      depositsToday: { count: stats.today.deposit.count, amountMinor: stats.today.deposit.amount.toString() },
      payoutsToday: { count: stats.today.payout.count, amountMinor: stats.today.payout.amount.toString() },
      marginBps: config.marginBps,
      withdrawalFeeMinor: config.withdrawalFeeMinor.toString(),
      depositsPaused: config.depositsPaused,
      payoutsPaused: config.payoutsPaused,
      tradingPaused: config.tradingPaused,
      rate: rate
        ? {
            ratePerUsd: rate.ratePerUsd,
            source: rate.source,
            fetchedAt: rate.fetchedAt.toISOString(),
            stale: rate.stale,
            paused: rate.paused,
            isOverride: rate.isOverride,
            jumpBps: rate.jumpBps,
            effectiveMarginBps: rate.effectiveMarginBps,
          }
        : null,
    })
  }
  return {
    enabled: settings.enabled,
    pawaPayConfigured: configured,
    pawaPayEnvironment: process.env.PAWAPAY_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox',
    pawaPayError,
    currencies,
    generatedAt: new Date().toISOString(),
  }
}

// ─── Payments console ────────────────────────────────────────────────────────

export interface AdminIntentRow {
  id: string
  userId: string
  userLabel: string
  kind: PaymentIntentKind
  state: PaymentIntentState
  providerStatus: string | null
  provider: string
  msisdn: string
  currency: string
  amountMinor: string
  feeMinor: string
  netMinor: string
  failureCode: string | null
  failureMessage: string | null
  providerTransactionId: string | null
  providerRef: string
  callbackCount: number
  statusCheckCount: number
  lastStatusCheckAt: string | null
  createdAt: string
  completedAt: string | null
}

function toAdminRow(row: typeof payment_intents.$inferSelect, userLabel: string): AdminIntentRow {
  return {
    id: row.id,
    userId: row.user_id,
    userLabel,
    kind: row.kind,
    state: row.state,
    providerStatus: row.provider_status,
    provider: row.provider,
    msisdn: row.msisdn,
    currency: row.currency,
    amountMinor: row.amount.toString(),
    feeMinor: row.fee.toString(),
    netMinor: row.net_amount.toString(),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    providerTransactionId: row.provider_transaction_id,
    providerRef: row.provider_ref,
    callbackCount: row.callback_count,
    statusCheckCount: row.status_check_count,
    lastStatusCheckAt: row.last_status_check_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
  }
}

export async function listAdminIntents(params: {
  limit?: number
  offset?: number
  search?: string
  kind?: PaymentIntentKind
  state?: PaymentIntentState | 'open' | 'stuck'
  currency?: string
}): Promise<{ rows: AdminIntentRow[]; totalCount: number }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)
  const conditions = []
  if (params.kind) {
    conditions.push(eq(payment_intents.kind, params.kind))
  }
  if (params.currency) {
    conditions.push(eq(payment_intents.currency, params.currency.toUpperCase()))
  }
  if (params.state === 'open') {
    conditions.push(inArray(payment_intents.state, ['initiated', 'pending']))
  } else if (params.state === 'stuck') {
    conditions.push(inArray(payment_intents.state, ['initiated', 'pending']))
    conditions.push(sql`${payment_intents.created_at} < NOW() - INTERVAL '24 hours'`)
  } else if (params.state) {
    conditions.push(eq(payment_intents.state, params.state))
  }
  if (params.search?.trim()) {
    const term = `%${params.search.trim()}%`
    conditions.push(
      or(
        ilike(payment_intents.msisdn, term),
        ilike(payment_intents.provider_ref, term),
        ilike(users.email, term),
        ilike(users.username, term),
        sql`${payment_intents.id} ILIKE ${term}`,
        sql`COALESCE(${payment_intents.provider_transaction_id}, '') ILIKE ${term}`,
      )!,
    )
  }
  const where = conditions.length ? and(...conditions) : undefined
  const base = db
    .select({ intent: payment_intents, email: users.email, username: users.username })
    .from(payment_intents)
    .innerJoin(users, eq(payment_intents.user_id, users.id))
  const rows = await (where ? base.where(where) : base)
    .orderBy(desc(payment_intents.created_at))
    .limit(limit)
    .offset(offset)
  const countBase = db
    .select({ count: sql<string>`COUNT(*)` })
    .from(payment_intents)
    .innerJoin(users, eq(payment_intents.user_id, users.id))
  const [countRow] = await (where ? countBase.where(where) : countBase)
  return {
    rows: rows.map((row) => toAdminRow(row.intent, row.username || row.email)),
    totalCount: Number(countRow?.count ?? '0'),
  }
}

export async function getAdminIntent(id: string) {
  const [row] = await db
    .select({ intent: payment_intents, email: users.email, username: users.username })
    .from(payment_intents)
    .innerJoin(users, eq(payment_intents.user_id, users.id))
    .where(eq(payment_intents.id, id))
    .limit(1)
  if (!row) {
    return null
  }
  return {
    ...toAdminRow(row.intent, row.username || row.email),
    lastRawStatus: row.intent.last_raw_status,
    reservationId: row.intent.reservation_id,
    ledgerTransactionId: row.intent.ledger_transaction_id,
  }
}

// ─── Ledger view ─────────────────────────────────────────────────────────────

export interface AdminLedgerUser {
  userId: string
  label: string
  email: string
  currency: string | null
  withdrawalsFrozen: boolean
  tradingFrozen: boolean
  accountId: string | null
  balanceMinor: string
  reservedMinor: string
  availableMinor: string
  activeReservations: Array<{
    id: string
    amountMinor: string
    referenceType: string
    referenceId: string
    createdAt: string
  }>
}

export async function findAdminLedgerUser(query: string): Promise<AdminLedgerUser | null> {
  const term = query.trim()
  if (!term) {
    return null
  }
  const [match] = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(
      or(
        eq(users.id, term),
        ilike(users.email, term),
        ilike(users.username, term),
        sql`${users.id} IN (SELECT user_id FROM payment_intents WHERE msisdn = ${term.replace(/\D/g, '')})`,
      ),
    )
    .limit(1)
  if (!match) {
    return null
  }
  const profile = await LedgerService.getUserProfile(match.id)
  const currency = profile?.currency ?? null
  const balance = currency ? await LedgerService.getUserBalance(match.id, currency) : null
  const [account] = currency
    ? await db
        .select({ id: ledger_accounts.id })
        .from(ledger_accounts)
        .where(
          and(
            eq(ledger_accounts.owner_type, 'user'),
            eq(ledger_accounts.owner_id, match.id),
            eq(ledger_accounts.kind, 'user_cash'),
            eq(ledger_accounts.currency, currency),
          ),
        )
        .limit(1)
    : []
  const reservations = account
    ? await db
        .select()
        .from(ledger_reservations)
        .where(and(eq(ledger_reservations.account_id, account.id), eq(ledger_reservations.state, 'active')))
        .orderBy(desc(ledger_reservations.created_at))
        .limit(50)
    : []
  return {
    userId: match.id,
    label: match.username || match.email,
    email: match.email,
    currency,
    withdrawalsFrozen: profile?.withdrawals_frozen ?? false,
    tradingFrozen: profile?.trading_frozen ?? false,
    accountId: account?.id ?? null,
    balanceMinor: (balance?.balance ?? 0n).toString(),
    reservedMinor: (balance?.reserved ?? 0n).toString(),
    availableMinor: (balance?.available ?? 0n).toString(),
    activeReservations: reservations.map((r) => ({
      id: r.id,
      amountMinor: r.amount.toString(),
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      createdAt: r.created_at.toISOString(),
    })),
  }
}

export async function listAdminLedgerEntries(accountId: string, params: { limit?: number; before?: string } = {}) {
  const rows = await LedgerService.listEntries(accountId, {
    limit: params.limit ?? 50,
    before: params.before ? new Date(params.before) : undefined,
  })
  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    side: row.side,
    amountMinor: row.amount.toString(),
    currency: row.currency,
    balanceAfterMinor: row.balance_after.toString(),
    kind: row.kind,
    description: row.description,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at.toISOString(),
  }))
}

export async function setUserFreezeFlags(
  userId: string,
  flags: { withdrawalsFrozen?: boolean; tradingFrozen?: boolean },
) {
  const profile = await LedgerService.getUserProfile(userId)
  if (!profile) {
    return null
  }
  const [updated] = await db
    .update(ledger_user_profiles)
    .set({
      ...(flags.withdrawalsFrozen !== undefined ? { withdrawals_frozen: flags.withdrawalsFrozen } : {}),
      ...(flags.tradingFrozen !== undefined ? { trading_frozen: flags.tradingFrozen } : {}),
      updated_at: new Date(),
    })
    .where(eq(ledger_user_profiles.user_id, userId))
    .returning()
  return updated ?? null
}

/**
 * Manual ledger adjustment by a finance admin. A credit moves money from the
 * house suspense account to the user (goodwill, correction); a debit moves it
 * back. Both are ordinary balanced transactions, so they show up in statements
 * and reconciliation like everything else.
 */
export async function postManualAdjustment(params: {
  userId: string
  currency: string
  amountMinor: bigint
  direction: 'credit' | 'debit'
  reason: string
  category: 'goodwill' | 'correction' | 'refund' | 'chargeback' | 'other'
  actorUserId: string
  idempotencyKey: string
}) {
  return db.transaction(async (tx) => {
    const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, params.currency, tx)
    const suspense = await LedgerService.getOrCreateHouseAccount('suspense', params.currency, tx)
    const entries =
      params.direction === 'credit'
        ? [
            { accountId: suspense.id, side: 'debit' as const, amount: params.amountMinor, currency: params.currency },
            { accountId: cash.id, side: 'credit' as const, amount: params.amountMinor, currency: params.currency },
          ]
        : [
            { accountId: cash.id, side: 'debit' as const, amount: params.amountMinor, currency: params.currency },
            { accountId: suspense.id, side: 'credit' as const, amount: params.amountMinor, currency: params.currency },
          ]
    return LedgerService.postTransaction(
      {
        kind: `adjustment_${params.category}`,
        referenceType: 'admin_adjustment',
        referenceId: params.idempotencyKey,
        idempotencyKey: `adjustment:${params.idempotencyKey}`,
        description: params.reason,
        metadata: { category: params.category, direction: params.direction },
        createdByUserId: params.actorUserId,
        entries,
      },
      tx,
    )
  })
}

export type { MobileMoneySettings }
