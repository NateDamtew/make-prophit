import type { LedgerEntrySide, LedgerNormalBalance } from '@/lib/db/schema/ledger/tables'

/**
 * Pure ledger arithmetic, kept free of the database so it can be property-tested.
 */

export interface EntryInput {
  accountId: string
  side: LedgerEntrySide
  amount: bigint
  currency: string
}

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerInvariantError'
  }
}

/** Debits must equal credits per currency, every amount positive, at least two entries. */
export function assertBalancedEntries(entries: readonly EntryInput[]): void {
  if (entries.length < 2) {
    throw new LedgerInvariantError('A transaction needs at least two entries.')
  }
  const totals = new Map<string, bigint>()
  for (const entry of entries) {
    if (entry.amount <= 0n) {
      throw new LedgerInvariantError(`Entry amounts must be positive (got ${entry.amount}).`)
    }
    if (!/^[A-Z]{3}$/.test(entry.currency)) {
      throw new LedgerInvariantError(`Invalid currency code: ${entry.currency}`)
    }
    const delta = entry.side === 'debit' ? entry.amount : -entry.amount
    totals.set(entry.currency, (totals.get(entry.currency) ?? 0n) + delta)
  }
  for (const [currency, total] of totals) {
    if (total !== 0n) {
      throw new LedgerInvariantError(`Entries do not balance for ${currency}: net debit ${total}.`)
    }
  }
}

/** Signed effect of an entry on an account's cached balance given its normal side. */
export function balanceDelta(normalBalance: LedgerNormalBalance, side: LedgerEntrySide, amount: bigint): bigint {
  return normalBalance === side ? amount : -amount
}

/** Available = balance − reserved; never negative for display purposes. */
export function availableBalance(balance: bigint, reserved: bigint): bigint {
  const available = balance - reserved
  return available < 0n ? 0n : available
}

/**
 * Sum a list of entries for one account into its balance, used by the nightly
 * reconciliation to recompute cached balances from the append-only log.
 */
export function recomputeBalance(
  normalBalance: LedgerNormalBalance,
  entries: readonly Pick<EntryInput, 'side' | 'amount'>[],
): bigint {
  let balance = 0n
  for (const entry of entries) {
    balance += balanceDelta(normalBalance, entry.side, entry.amount)
  }
  return balance
}
