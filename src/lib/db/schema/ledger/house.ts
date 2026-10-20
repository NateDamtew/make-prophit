import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { ledger_reservations, ledger_transactions } from '@/lib/db/schema/ledger/tables'

export const USER_ORDER_STATES = ['pending', 'filled', 'rejected', 'failed', 'cancelled'] as const
export type UserOrderState = (typeof USER_ORDER_STATES)[number]

export const user_orders = pgTable(
  'user_orders',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: char({ length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    condition_id: text().notNull(),
    market_slug: text(),
    token_id: text().notNull(),
    outcome_index: smallint().notNull(),
    side: text().notNull().$type<'buy' | 'sell'>(),
    currency: char({ length: 3 }).notNull(),
    local_stake: bigint({ mode: 'bigint' }).notNull(),
    usd_cents: bigint({ mode: 'bigint' }).notNull(),
    rate_per_usd: numeric({ precision: 18, scale: 6 }).notNull(),
    margin_bps: integer().notNull(),
    price_cents: integer().notNull(),
    shares_micro: bigint({ mode: 'bigint' }).notNull(),
    fixed_local_payout: bigint({ mode: 'bigint' }).notNull(),
    state: text().notNull().default('pending').$type<UserOrderState>(),
    failure_message: text(),
    reservation_id: char({ length: 26 }).references(() => ledger_reservations.id, { onDelete: 'set null' }),
    ledger_transaction_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index('idx_user_orders_user_created').on(table.user_id, table.created_at),
    conditionIdx: index('idx_user_orders_condition').on(table.condition_id, table.state),
  }),
)

export const house_orders = pgTable(
  'house_orders',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_order_id: char({ length: 26 })
      .notNull()
      .references(() => user_orders.id, { onDelete: 'restrict' }),
    clob_order_id: text(),
    maker: text().notNull(),
    token_id: text().notNull(),
    side: smallint().notNull(),
    maker_amount: bigint({ mode: 'bigint' }).notNull(),
    taker_amount: bigint({ mode: 'bigint' }).notNull(),
    order_type: text().notNull(),
    state: text().notNull().default('submitted').$type<'submitted' | 'filled' | 'rejected' | 'failed'>(),
    clob_response: jsonb().$type<Record<string, unknown>>(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userOrderIdx: uniqueIndex('house_orders_user_order_id_key').on(table.user_order_id),
  }),
)

export const positions = pgTable(
  'positions',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: char({ length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    condition_id: text().notNull(),
    token_id: text().notNull(),
    outcome_index: smallint().notNull(),
    currency: char({ length: 3 }).notNull(),
    shares_micro: bigint({ mode: 'bigint' }).notNull().default(0n),
    local_stake: bigint({ mode: 'bigint' }).notNull().default(0n),
    fixed_local_payout: bigint({ mode: 'bigint' }).notNull().default(0n),
    settled_payout: bigint({ mode: 'bigint' }),
    settled_at: timestamp({ withTimezone: true }),
    settlement_tx_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userTokenIdx: uniqueIndex('positions_user_token_key').on(table.user_id, table.token_id),
    conditionIdx: index('idx_positions_condition').on(table.condition_id),
    userIdx: index('idx_positions_user').on(table.user_id),
  }),
)
