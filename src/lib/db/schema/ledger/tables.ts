import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'

/**
 * Local-currency ledger (double-entry) + mobile-money payment intents.
 *
 * Conventions:
 * - Amounts are integer minor units (`bigint`), two decimals for every currency.
 * - Every account has a `normal_balance` ('debit' assets/expenses, 'credit'
 *   liabilities/revenue). An entry is (side, amount > 0); a transaction's
 *   debits equal its credits per currency. `balance` is derived and cached.
 * - User balances are liabilities (credit-normal): a positive balance is money
 *   owed to the user. `reserved` is the slice of that balance held for in-flight
 *   orders, stakes and payouts; available = balance - reserved.
 *
 * Fork-only tables; see LOCAL-PAYMENTS-DESIGN.md §4 and §9.
 */

export const LEDGER_ACCOUNT_KINDS = [
  'user_cash',
  'float',
  'fees',
  'rounding',
  'pool_rake',
  'pool',
  'fx',
  'fx_clearing',
  'settlement',
  'suspense',
] as const
export type LedgerAccountKind = (typeof LEDGER_ACCOUNT_KINDS)[number]

export const LEDGER_NORMAL_BALANCES = ['debit', 'credit'] as const
export type LedgerNormalBalance = (typeof LEDGER_NORMAL_BALANCES)[number]

export const LEDGER_ENTRY_SIDES = ['debit', 'credit'] as const
export type LedgerEntrySide = (typeof LEDGER_ENTRY_SIDES)[number]

export const LEDGER_RESERVATION_STATES = ['active', 'consumed', 'released'] as const
export type LedgerReservationState = (typeof LEDGER_RESERVATION_STATES)[number]

export const PAYMENT_INTENT_KINDS = ['deposit', 'payout'] as const
export type PaymentIntentKind = (typeof PAYMENT_INTENT_KINDS)[number]

export const PAYMENT_INTENT_STATES = ['initiated', 'pending', 'completed', 'failed', 'rejected', 'cancelled'] as const
export type PaymentIntentState = (typeof PAYMENT_INTENT_STATES)[number]

export const ledger_user_profiles = pgTable('ledger_user_profiles', {
  user_id: char({ length: 26 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currency: char({ length: 3 }).notNull(),
  country: char({ length: 3 }),
  withdrawals_frozen: boolean().notNull().default(false),
  trading_frozen: boolean().notNull().default(false),
  // Age + Terms consent, required before the first deposit, stake or withdrawal.
  terms_accepted_at: timestamp({ withTimezone: true }),
  age_confirmed_at: timestamp({ withTimezone: true }),
  terms_version: text(),
  created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const ledger_accounts = pgTable(
  'ledger_accounts',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    owner_type: text().notNull(), // 'user' | 'house'
    owner_id: text(), // user id for user accounts; pool id for pool accounts; null for house books
    kind: text().notNull().$type<LedgerAccountKind>(),
    currency: char({ length: 3 }).notNull(),
    normal_balance: text().notNull().$type<LedgerNormalBalance>(),
    balance: bigint({ mode: 'bigint' }).notNull().default(0n),
    reserved: bigint({ mode: 'bigint' }).notNull().default(0n),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ownerKindCurrencyIdx: uniqueIndex('idx_ledger_accounts_owner_kind_currency').on(
      table.owner_type,
      sql`COALESCE(${table.owner_id}, '')`,
      table.kind,
      table.currency,
    ),
    ownerIdx: index('idx_ledger_accounts_owner').on(table.owner_type, table.owner_id),
  }),
)

export const ledger_transactions = pgTable(
  'ledger_transactions',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    kind: text().notNull(),
    reference_type: text(),
    reference_id: text(),
    idempotency_key: text(),
    description: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    created_by_user_id: char({ length: 26 }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('idx_ledger_transactions_idempotency').on(table.idempotency_key),
    referenceIdx: index('idx_ledger_transactions_reference').on(table.reference_type, table.reference_id),
    createdAtIdx: index('idx_ledger_transactions_created_at').on(table.created_at),
  }),
)

export const ledger_entries = pgTable(
  'ledger_entries',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    transaction_id: char({ length: 26 })
      .notNull()
      .references(() => ledger_transactions.id, { onDelete: 'restrict' }),
    account_id: char({ length: 26 })
      .notNull()
      .references(() => ledger_accounts.id, { onDelete: 'restrict' }),
    side: text().notNull().$type<LedgerEntrySide>(),
    amount: bigint({ mode: 'bigint' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Account balance after this entry was applied (for statements and audits). */
    balance_after: bigint({ mode: 'bigint' }).notNull(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    accountIdx: index('idx_ledger_entries_account_created').on(table.account_id, table.created_at),
    transactionIdx: index('idx_ledger_entries_transaction').on(table.transaction_id),
  }),
)

export const ledger_reservations = pgTable(
  'ledger_reservations',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    account_id: char({ length: 26 })
      .notNull()
      .references(() => ledger_accounts.id, { onDelete: 'restrict' }),
    amount: bigint({ mode: 'bigint' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    reference_type: text().notNull(),
    reference_id: text().notNull(),
    state: text().notNull().default('active').$type<LedgerReservationState>(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    settled_at: timestamp({ withTimezone: true }),
  },
  (table) => ({
    referenceIdx: uniqueIndex('idx_ledger_reservations_reference').on(table.reference_type, table.reference_id),
    accountStateIdx: index('idx_ledger_reservations_account_state').on(table.account_id, table.state),
  }),
)

export const mobile_money_accounts = pgTable(
  'mobile_money_accounts',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: char({ length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    msisdn: text().notNull(),
    provider: text().notNull(),
    country: char({ length: 3 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Set once a deposit from this number completed; payouts prefer verified numbers. */
    verified_at: timestamp({ withTimezone: true }),
    last_used_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userMsisdnIdx: uniqueIndex('idx_mobile_money_accounts_user_msisdn').on(table.user_id, table.msisdn, table.provider),
    userIdx: index('idx_mobile_money_accounts_user').on(table.user_id),
  }),
)

export const payment_intents = pgTable(
  'payment_intents',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: char({ length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text().notNull().$type<PaymentIntentKind>(),
    /** The UUID we generated and sent to pawaPay as depositId / payoutId. */
    provider_ref: uuid().notNull(),
    provider: text().notNull(),
    msisdn: text().notNull(),
    country: char({ length: 3 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Gross amount in minor units: what the user pays (deposit) or what leaves their balance (payout). */
    amount: bigint({ mode: 'bigint' }).notNull(),
    fee: bigint({ mode: 'bigint' }).notNull().default(0n),
    /** Amount sent to the provider for payouts (gross - fee); equals amount for deposits. */
    net_amount: bigint({ mode: 'bigint' }).notNull(),
    state: text().notNull().$type<PaymentIntentState>(),
    provider_status: text(),
    failure_code: text(),
    failure_message: text(),
    provider_transaction_id: text(),
    customer_message: text(),
    reservation_id: char({ length: 26 }).references(() => ledger_reservations.id, { onDelete: 'set null' }),
    ledger_transaction_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    callback_count: integer().notNull().default(0),
    status_check_count: integer().notNull().default(0),
    last_status_check_at: timestamp({ withTimezone: true }),
    last_raw_status: jsonb().$type<Record<string, unknown>>(),
    completed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerRefIdx: uniqueIndex('idx_payment_intents_provider_ref').on(table.provider_ref),
    userCreatedIdx: index('idx_payment_intents_user_created').on(table.user_id, table.created_at),
    stateCreatedIdx: index('idx_payment_intents_state_created').on(table.state, table.created_at),
    kindStateIdx: index('idx_payment_intents_kind_state').on(table.kind, table.state),
  }),
)

export const payment_callback_events = pgTable(
  'payment_callback_events',
  {
    fingerprint: text().primaryKey(),
    intent_id: char({ length: 26 }).references(() => payment_intents.id, { onDelete: 'set null' }),
    provider_ref: uuid(),
    kind: text(),
    status: text(),
    signature_key_id: text(),
    signature_verified: boolean().notNull().default(false),
    payload: jsonb().$type<Record<string, unknown>>(),
    received_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    intentIdx: index('idx_payment_callback_events_intent').on(table.intent_id),
  }),
)

export const fx_rate_snapshots = pgTable(
  'fx_rate_snapshots',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    currency: char({ length: 3 }).notNull(),
    /** Local minor-currency units per 1 USD, e.g. 129.450000 for KES. */
    rate_per_usd: numeric({ precision: 18, scale: 6 }).notNull(),
    source: text().notNull(),
    is_override: boolean().notNull().default(false),
    fetched_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    currencyFetchedIdx: index('idx_fx_rate_snapshots_currency_fetched').on(table.currency, table.fetched_at),
  }),
)
