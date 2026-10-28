import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm'

import type { LedgerAccountKind, LedgerEntrySide, LedgerNormalBalance } from '@/lib/db/schema/ledger/tables'
import type { EntryInput } from '@/lib/ledger/invariants'

import {
  ledger_accounts,
  ledger_entries,
  ledger_reservations,
  ledger_transactions,
  ledger_user_profiles,
} from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { assertBalancedEntries, availableBalance, balanceDelta, LedgerInvariantError } from '@/lib/ledger/invariants'

/**
 * The ledger service. Every mutating call runs inside a database transaction,
 * locks the touched accounts in a stable order (FOR UPDATE), validates the
 * double-entry invariant, appends entries, and updates cached balances in the
 * same transaction. Callers either pass their own `tx` (to combine with other
 * writes) or let the service open one.
 */

export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const HOUSE_ACCOUNT_NORMAL_BALANCE: Record<LedgerAccountKind, LedgerNormalBalance> = {
  user_cash: 'credit',
  float: 'debit',
  fees: 'credit',
  rounding: 'credit',
  pool_rake: 'credit',
  pool: 'credit',
  fx: 'credit',
  fx_clearing: 'credit',
  settlement: 'debit',
  suspense: 'credit',
  earnings_payable: 'credit',
}

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'insufficient_funds'
      | 'account_not_found'
      | 'reservation_not_found'
      | 'reservation_not_active'
      | 'duplicate_transaction'
      | 'frozen'
      | 'invalid',
  ) {
    super(message)
    this.name = 'LedgerError'
  }
}

export interface LedgerAccountRow {
  id: string
  owner_type: string
  owner_id: string | null
  kind: LedgerAccountKind
  currency: string
  normal_balance: LedgerNormalBalance
  balance: bigint
  reserved: bigint
}

export interface PostTransactionInput {
  kind: string
  entries: EntryInput[]
  referenceType?: string
  referenceId?: string
  /** Prevents double-posting: a second call with the same key returns the existing transaction id. */
  idempotencyKey?: string
  description?: string
  metadata?: Record<string, unknown>
  createdByUserId?: string
  /** Reservations to settle in the same transaction. */
  consumeReservations?: Array<{ reservationId: string; amountUsed?: bigint }>
  /** When true, user_cash accounts may be debited below available (used only for admin corrections). */
  allowNegativeUserBalance?: boolean
}

export interface PostTransactionResult {
  transactionId: string
  alreadyPosted: boolean
  balances: Record<string, bigint>
}

export interface ReservationRow {
  id: string
  account_id: string
  amount: bigint
  currency: string
  reference_type: string
  reference_id: string
  state: 'active' | 'consumed' | 'released'
}

async function withTx<T>(tx: LedgerTx | undefined, fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
  if (tx) {
    return fn(tx)
  }
  return db.transaction(async (inner) => fn(inner))
}

function normalizeCurrency(currency: string): string {
  const code = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new LedgerError(`Invalid currency ${currency}`, 'invalid')
  }
  return code
}

async function lockAccounts(tx: LedgerTx, accountIds: string[]): Promise<Map<string, LedgerAccountRow>> {
  const unique = [...new Set(accountIds)].sort()
  const rows = new Map<string, LedgerAccountRow>()
  // Lock one at a time in sorted order; FOR UPDATE on an IN() list does not
  // guarantee acquisition order, and a stable order is what prevents deadlocks.
  for (const id of unique) {
    const [row] = await tx.select().from(ledger_accounts).where(eq(ledger_accounts.id, id)).for('update').limit(1)
    if (!row) {
      throw new LedgerError(`Ledger account ${id} not found`, 'account_not_found')
    }
    rows.set(id, row as LedgerAccountRow)
  }
  return rows
}

export const LedgerService = {
  /** Ensure the user has a ledger currency; first caller wins, later calls with another currency are rejected. */
  async ensureUserProfile(userId: string, currency: string, tx?: LedgerTx, country?: string) {
    const code = normalizeCurrency(currency)
    return withTx(tx, async (t) => {
      const [existing] = await t
        .select()
        .from(ledger_user_profiles)
        .where(eq(ledger_user_profiles.user_id, userId))
        .limit(1)
      if (existing) {
        if (existing.currency !== code) {
          throw new LedgerError(`User ledger currency is ${existing.currency}, not ${code}`, 'invalid')
        }
        return existing
      }
      const [created] = await t
        .insert(ledger_user_profiles)
        .values({ user_id: userId, currency: code, country: country ?? null })
        .onConflictDoNothing()
        .returning()
      if (created) {
        return created
      }
      const [raced] = await t
        .select()
        .from(ledger_user_profiles)
        .where(eq(ledger_user_profiles.user_id, userId))
        .limit(1)
      return raced!
    })
  },

  async getUserProfile(userId: string, tx?: LedgerTx) {
    const t = tx ?? db
    const [row] = await t.select().from(ledger_user_profiles).where(eq(ledger_user_profiles.user_id, userId)).limit(1)
    return row ?? null
  },

  /** Find or create a user's cash account in a currency. */
  async getOrCreateUserCashAccount(userId: string, currency: string, tx?: LedgerTx): Promise<LedgerAccountRow> {
    return LedgerService.getOrCreateAccount({ ownerType: 'user', ownerId: userId, kind: 'user_cash', currency }, tx)
  },

  /** Find or create a house account (float, fees, …). `ownerId` scopes pool accounts to a pool. */
  async getOrCreateHouseAccount(
    kind: Exclude<LedgerAccountKind, 'user_cash'>,
    currency: string,
    tx?: LedgerTx,
    ownerId?: string,
  ) {
    return LedgerService.getOrCreateAccount({ ownerType: 'house', ownerId: ownerId ?? null, kind, currency }, tx)
  },

  async getOrCreateAccount(
    params: { ownerType: 'user' | 'house'; ownerId: string | null; kind: LedgerAccountKind; currency: string },
    tx?: LedgerTx,
  ): Promise<LedgerAccountRow> {
    const code = normalizeCurrency(params.currency)
    return withTx(tx, async (t) => {
      const ownerCondition =
        params.ownerId === null ? isNull(ledger_accounts.owner_id) : eq(ledger_accounts.owner_id, params.ownerId)
      const where = and(
        eq(ledger_accounts.owner_type, params.ownerType),
        ownerCondition,
        eq(ledger_accounts.kind, params.kind),
        eq(ledger_accounts.currency, code),
      )
      const [existing] = await t.select().from(ledger_accounts).where(where).limit(1)
      if (existing) {
        return existing as LedgerAccountRow
      }
      const [created] = await t
        .insert(ledger_accounts)
        .values({
          owner_type: params.ownerType,
          owner_id: params.ownerId,
          kind: params.kind,
          currency: code,
          normal_balance: HOUSE_ACCOUNT_NORMAL_BALANCE[params.kind],
        })
        .onConflictDoNothing()
        .returning()
      if (created) {
        return created as LedgerAccountRow
      }
      const [raced] = await t.select().from(ledger_accounts).where(where).limit(1)
      if (!raced) {
        throw new LedgerError('Failed to create ledger account', 'invalid')
      }
      return raced as LedgerAccountRow
    })
  },

  async getAccount(accountId: string, tx?: LedgerTx): Promise<LedgerAccountRow | null> {
    const t = tx ?? db
    const [row] = await t.select().from(ledger_accounts).where(eq(ledger_accounts.id, accountId)).limit(1)
    return (row as LedgerAccountRow | undefined) ?? null
  },

  /** Balance summary for a user in their ledger currency (zeros if no account yet). */
  async getUserBalance(userId: string, currency: string) {
    const code = normalizeCurrency(currency)
    const [row] = await db
      .select({ balance: ledger_accounts.balance, reserved: ledger_accounts.reserved })
      .from(ledger_accounts)
      .where(
        and(
          eq(ledger_accounts.owner_type, 'user'),
          eq(ledger_accounts.owner_id, userId),
          eq(ledger_accounts.kind, 'user_cash'),
          eq(ledger_accounts.currency, code),
        ),
      )
      .limit(1)
    const balance = row?.balance ?? 0n
    const reserved = row?.reserved ?? 0n
    return { currency: code, balance, reserved, available: availableBalance(balance, reserved) }
  },

  /**
   * Post a balanced transaction. Locks all involved accounts, optionally
   * consumes reservations first, enforces that user cash never goes below its
   * remaining reservations, appends entries with running balances, updates
   * cached balances. Idempotent on `idempotencyKey`.
   */
  async postTransaction(input: PostTransactionInput, tx?: LedgerTx): Promise<PostTransactionResult> {
    const entries = input.entries.map((entry) => ({ ...entry, currency: normalizeCurrency(entry.currency) }))
    assertBalancedEntries(entries)

    return withTx(tx, async (t) => {
      if (input.idempotencyKey) {
        const [existing] = await t
          .select({ id: ledger_transactions.id })
          .from(ledger_transactions)
          .where(eq(ledger_transactions.idempotency_key, input.idempotencyKey))
          .limit(1)
        if (existing) {
          return { transactionId: existing.id, alreadyPosted: true, balances: {} }
        }
      }

      const reservationIds = (input.consumeReservations ?? []).map((item) => item.reservationId)
      const reservations = new Map<string, ReservationRow>()
      for (const id of [...new Set(reservationIds)].sort()) {
        const [row] = await t
          .select()
          .from(ledger_reservations)
          .where(eq(ledger_reservations.id, id))
          .for('update')
          .limit(1)
        if (!row) {
          throw new LedgerError(`Reservation ${id} not found`, 'reservation_not_found')
        }
        if (row.state !== 'active') {
          throw new LedgerError(`Reservation ${id} is ${row.state}`, 'reservation_not_active')
        }
        reservations.set(id, row as ReservationRow)
      }

      const accountIds = [
        ...entries.map((entry) => entry.accountId),
        ...[...reservations.values()].map((r) => r.account_id),
      ]
      const accounts = await lockAccounts(t, accountIds)

      for (const entry of entries) {
        const account = accounts.get(entry.accountId)!
        if (account.currency !== entry.currency) {
          throw new LedgerInvariantError(`Account ${account.id} is ${account.currency}, entry is ${entry.currency}`)
        }
      }

      // 1. Settle reservations: release the hold (and any unused remainder).
      for (const item of input.consumeReservations ?? []) {
        const reservation = reservations.get(item.reservationId)!
        const account = accounts.get(reservation.account_id)!
        const used = item.amountUsed ?? reservation.amount
        if (used < 0n || used > reservation.amount) {
          throw new LedgerError('amountUsed must be between 0 and the reservation amount', 'invalid')
        }
        account.reserved -= reservation.amount
        if (account.reserved < 0n) {
          account.reserved = 0n
        }
        await t
          .update(ledger_reservations)
          .set({ state: used === 0n ? 'released' : 'consumed', settled_at: new Date() })
          .where(eq(ledger_reservations.id, reservation.id))
      }

      // 2. Apply entry deltas to in-memory balances and check user floors.
      const pending = new Map<string, bigint>()
      for (const entry of entries) {
        const account = accounts.get(entry.accountId)!
        const next =
          (pending.get(account.id) ?? account.balance) + balanceDelta(account.normal_balance, entry.side, entry.amount)
        pending.set(account.id, next)
      }
      for (const [accountId, next] of pending) {
        const account = accounts.get(accountId)!
        if (account.kind === 'user_cash' && !input.allowNegativeUserBalance && next < account.reserved) {
          throw new LedgerError('Insufficient available balance', 'insufficient_funds')
        }
      }

      // 3. Write the transaction, entries (with running balances) and cached balances.
      let transactionId: string
      try {
        const [transaction] = await t
          .insert(ledger_transactions)
          .values({
            kind: input.kind,
            reference_type: input.referenceType ?? null,
            reference_id: input.referenceId ?? null,
            idempotency_key: input.idempotencyKey ?? null,
            description: input.description ?? null,
            metadata: input.metadata ?? null,
            created_by_user_id: input.createdByUserId ?? null,
          })
          .returning({ id: ledger_transactions.id })
        transactionId = transaction!.id
      } catch (error) {
        if (
          input.idempotencyKey &&
          error instanceof Error &&
          /idx_ledger_transactions_idempotency|duplicate key/i.test(error.message)
        ) {
          throw new LedgerError('Transaction already posted', 'duplicate_transaction')
        }
        throw error
      }

      const running = new Map<string, bigint>()
      for (const [id, account] of accounts) {
        running.set(id, account.balance)
      }
      for (const entry of entries) {
        const account = accounts.get(entry.accountId)!
        const after = running.get(account.id)! + balanceDelta(account.normal_balance, entry.side, entry.amount)
        running.set(account.id, after)
        await t.insert(ledger_entries).values({
          transaction_id: transactionId,
          account_id: account.id,
          side: entry.side,
          amount: entry.amount,
          currency: entry.currency,
          balance_after: after,
        })
      }

      const balances: Record<string, bigint> = {}
      for (const [id, account] of accounts) {
        const balance = running.get(id)!
        balances[id] = balance
        await t
          .update(ledger_accounts)
          .set({ balance, reserved: account.reserved, updated_at: new Date() })
          .where(eq(ledger_accounts.id, id))
      }

      return { transactionId, alreadyPosted: false, balances }
    })
  },

  /** Hold part of a user's available balance for an in-flight operation. Unique per (referenceType, referenceId). */
  async reserve(
    params: { accountId: string; amount: bigint; referenceType: string; referenceId: string },
    tx?: LedgerTx,
  ): Promise<ReservationRow> {
    if (params.amount <= 0n) {
      throw new LedgerError('Reservation amount must be positive', 'invalid')
    }
    return withTx(tx, async (t) => {
      const accounts = await lockAccounts(t, [params.accountId])
      const account = accounts.get(params.accountId)!
      if (availableBalance(account.balance, account.reserved) < params.amount) {
        throw new LedgerError('Insufficient available balance', 'insufficient_funds')
      }
      const [reservation] = await t
        .insert(ledger_reservations)
        .values({
          account_id: account.id,
          amount: params.amount,
          currency: account.currency,
          reference_type: params.referenceType,
          reference_id: params.referenceId,
        })
        .returning()
      await t
        .update(ledger_accounts)
        .set({ reserved: account.reserved + params.amount, updated_at: new Date() })
        .where(eq(ledger_accounts.id, account.id))
      return reservation as ReservationRow
    })
  },

  /** Release a hold without posting anything (order cancelled, payout rejected). Idempotent. */
  async releaseReservation(reservationId: string, tx?: LedgerTx): Promise<ReservationRow | null> {
    return withTx(tx, async (t) => {
      const [row] = await t
        .select()
        .from(ledger_reservations)
        .where(eq(ledger_reservations.id, reservationId))
        .for('update')
        .limit(1)
      if (!row) {
        return null
      }
      if (row.state !== 'active') {
        return row as ReservationRow
      }
      const accounts = await lockAccounts(t, [row.account_id])
      const account = accounts.get(row.account_id)!
      const nextReserved = account.reserved - row.amount
      await t
        .update(ledger_accounts)
        .set({ reserved: nextReserved < 0n ? 0n : nextReserved, updated_at: new Date() })
        .where(eq(ledger_accounts.id, account.id))
      const [updated] = await t
        .update(ledger_reservations)
        .set({ state: 'released', settled_at: new Date() })
        .where(eq(ledger_reservations.id, reservationId))
        .returning()
      return updated as ReservationRow
    })
  },

  async getReservation(reservationId: string, tx?: LedgerTx): Promise<ReservationRow | null> {
    const t = tx ?? db
    const [row] = await t.select().from(ledger_reservations).where(eq(ledger_reservations.id, reservationId)).limit(1)
    return (row as ReservationRow | undefined) ?? null
  },

  /** Statement lines for an account, newest first, cursor by created_at. */
  async listEntries(accountId: string, params: { limit?: number; before?: Date } = {}) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
    const where = params.before
      ? and(eq(ledger_entries.account_id, accountId), lt(ledger_entries.created_at, params.before))
      : eq(ledger_entries.account_id, accountId)
    return db
      .select({
        id: ledger_entries.id,
        transaction_id: ledger_entries.transaction_id,
        side: ledger_entries.side,
        amount: ledger_entries.amount,
        currency: ledger_entries.currency,
        balance_after: ledger_entries.balance_after,
        created_at: ledger_entries.created_at,
        kind: ledger_transactions.kind,
        description: ledger_transactions.description,
        reference_type: ledger_transactions.reference_type,
        reference_id: ledger_transactions.reference_id,
      })
      .from(ledger_entries)
      .innerJoin(ledger_transactions, eq(ledger_entries.transaction_id, ledger_transactions.id))
      .where(where)
      .orderBy(desc(ledger_entries.created_at), desc(ledger_entries.id))
      .limit(limit)
  },

  /** Recompute an account's balance from its entries (reconciliation). */
  async recomputeAccountBalance(
    accountId: string,
  ): Promise<{ cached: bigint; recomputed: bigint; reservedCached: bigint; reservedRecomputed: bigint }> {
    const [account] = await db.select().from(ledger_accounts).where(eq(ledger_accounts.id, accountId)).limit(1)
    if (!account) {
      throw new LedgerError(`Ledger account ${accountId} not found`, 'account_not_found')
    }
    const [sums] = await db
      .select({
        debits: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_entries.side} = 'debit' THEN ${ledger_entries.amount} ELSE 0 END), 0)`,
        credits: sql<string>`COALESCE(SUM(CASE WHEN ${ledger_entries.side} = 'credit' THEN ${ledger_entries.amount} ELSE 0 END), 0)`,
      })
      .from(ledger_entries)
      .where(eq(ledger_entries.account_id, accountId))
    const debits = BigInt(sums?.debits ?? '0')
    const credits = BigInt(sums?.credits ?? '0')
    const recomputed = account.normal_balance === 'debit' ? debits - credits : credits - debits
    const [reservedRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${ledger_reservations.amount}), 0)` })
      .from(ledger_reservations)
      .where(and(eq(ledger_reservations.account_id, accountId), eq(ledger_reservations.state, 'active')))
    return {
      cached: account.balance,
      recomputed,
      reservedCached: account.reserved,
      reservedRecomputed: BigInt(reservedRow?.total ?? '0'),
    }
  },
}

export type LedgerEntrySideInput = LedgerEntrySide
