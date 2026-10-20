import { describe, expect, it } from 'bun:test'

import type { EntryInput } from '@/lib/ledger/invariants'

import {
  assertBalancedEntries,
  availableBalance,
  balanceDelta,
  LedgerInvariantError,
  recomputeBalance,
} from '@/lib/ledger/invariants'

function entry(accountId: string, side: 'debit' | 'credit', amount: bigint, currency = 'KES'): EntryInput {
  return { accountId, side, amount, currency }
}

describe('assertBalancedEntries', () => {
  it('accepts balanced transactions, including multi-currency ones balanced per currency', () => {
    expect(() =>
      assertBalancedEntries([entry('float', 'debit', 100_000n), entry('user', 'credit', 100_000n)]),
    ).not.toThrow()
    expect(() =>
      assertBalancedEntries([
        entry('user', 'debit', 100_000n),
        entry('float', 'credit', 97_500n),
        entry('fees', 'credit', 2_500n),
        entry('settlement', 'debit', 770n, 'USD'),
        entry('fx_clearing', 'credit', 770n, 'USD'),
      ]),
    ).not.toThrow()
  })

  it('rejects unbalanced, single-entry, non-positive and bad-currency inputs', () => {
    expect(() => assertBalancedEntries([entry('a', 'debit', 10n), entry('b', 'credit', 9n)])).toThrow(
      LedgerInvariantError,
    )
    expect(() => assertBalancedEntries([entry('a', 'debit', 10n)])).toThrow(LedgerInvariantError)
    expect(() => assertBalancedEntries([entry('a', 'debit', 0n), entry('b', 'credit', 0n)])).toThrow(
      LedgerInvariantError,
    )
    expect(() => assertBalancedEntries([entry('a', 'debit', -5n), entry('b', 'credit', -5n)])).toThrow(
      LedgerInvariantError,
    )
    expect(() => assertBalancedEntries([entry('a', 'debit', 5n, 'kes'), entry('b', 'credit', 5n, 'kes')])).toThrow(
      LedgerInvariantError,
    )
    // balanced overall but not per currency
    expect(() => assertBalancedEntries([entry('a', 'debit', 5n, 'KES'), entry('b', 'credit', 5n, 'USD')])).toThrow(
      LedgerInvariantError,
    )
  })

  it('holds under random balanced sequences (property check)', () => {
    let seed = 42
    function rand() {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
      return seed
    }
    for (let round = 0; round < 500; round++) {
      const count = 2 + (rand() % 6)
      const entries: EntryInput[] = []
      let debitTotal = 0n
      for (let i = 0; i < count - 1; i++) {
        const amount = BigInt(1 + (rand() % 1_000_000))
        const side = rand() % 2 === 0 ? 'debit' : 'credit'
        entries.push(entry(`acc${i}`, side, amount))
        debitTotal += side === 'debit' ? amount : -amount
      }
      // closing entry brings the transaction to balance
      if (debitTotal === 0n) {
        entries.push(entry('x', 'debit', 1n), entry('y', 'credit', 1n))
      } else {
        entries.push(entry('closing', debitTotal > 0n ? 'credit' : 'debit', debitTotal > 0n ? debitTotal : -debitTotal))
      }
      expect(() => assertBalancedEntries(entries)).not.toThrow()
      // and breaking any single amount by one breaks the invariant
      const broken = entries.map((e, i) => (i === 0 ? { ...e, amount: e.amount + 1n } : e))
      expect(() => assertBalancedEntries(broken)).toThrow(LedgerInvariantError)
    }
  })
})

describe('balanceDelta / recomputeBalance / availableBalance', () => {
  it('applies the normal-balance sign convention', () => {
    expect(balanceDelta('credit', 'credit', 100n)).toBe(100n)
    expect(balanceDelta('credit', 'debit', 100n)).toBe(-100n)
    expect(balanceDelta('debit', 'debit', 100n)).toBe(100n)
    expect(balanceDelta('debit', 'credit', 100n)).toBe(-100n)
  })

  it('recomputes a user liability balance from its entries', () => {
    const balance = recomputeBalance('credit', [
      { side: 'credit', amount: 100_000n }, // deposit 1,000
      { side: 'debit', amount: 65_000n }, // stake 650
      { side: 'credit', amount: 100_000n }, // won 1,000
      { side: 'debit', amount: 90_000n }, // withdrew 900
    ])
    expect(balance).toBe(45_000n)
    expect(availableBalance(45_000n, 20_000n)).toBe(25_000n)
    expect(availableBalance(10n, 20n)).toBe(0n)
  })
})
