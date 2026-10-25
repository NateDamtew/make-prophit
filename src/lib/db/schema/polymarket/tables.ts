import { sql } from 'drizzle-orm'
import { boolean, char, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { events } from '@/lib/db/schema/events/tables'

/**
 * Admin curation of the Polymarket catalogue. Nothing from Polymarket shows in
 * Prophit unless a rule includes it; the most specific rule wins
 * (market > event > tag) and an exclude beats an include at the same level.
 */

export const POLYMARKET_CURATION_SCOPES = ['tag', 'event', 'market'] as const
export type PolymarketCurationScope = (typeof POLYMARKET_CURATION_SCOPES)[number]

export const POLYMARKET_CURATION_MODES = ['include', 'exclude'] as const
export type PolymarketCurationMode = (typeof POLYMARKET_CURATION_MODES)[number]

export interface PolymarketCurationFilters {
  /** Most events imported for this rule, ranked by 24h volume. */
  maxEvents?: number
  minVolume?: number
  minLiquidity?: number
  /** Only events ending within this many days. */
  windowDays?: number
  /** Allowed sports market types (moneyline, spreads, totals…). Markets without a type always pass. */
  marketTypes?: string[]
}

export const polymarket_curation_rules = pgTable(
  'polymarket_curation_rules',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    scope: text().notNull().$type<PolymarketCurationScope>(),
    ref: text().notNull(),
    label: text().notNull().default(''),
    parent_ref: text(),
    mode: text().notNull().default('include').$type<PolymarketCurationMode>(),
    pinned: boolean().notNull().default(false),
    filters: jsonb().notNull().default({}).$type<PolymarketCurationFilters>(),
    sort_order: integer().notNull().default(0),
    updated_by: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_polymarket_curation_rules_scope_ref').on(table.scope, table.ref)],
)

/** "Notify me when trading opens" on Polymarket event pages. */
export const polymarket_trading_interest = pgTable(
  'polymarket_trading_interest',
  {
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    event_id: char({ length: 26 })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.event_id] })],
)

/** A user's Polymarket Deposit Wallet (public), saved when they set up Polymarket trading. */
export const polymarket_accounts = pgTable('polymarket_accounts', {
  user_id: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wallet_address: char({ length: 42 }).notNull(),
  signer_address: char({ length: 42 }).notNull(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
