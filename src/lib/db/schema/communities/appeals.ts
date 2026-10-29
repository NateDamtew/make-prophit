import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { pools } from '@/lib/db/schema/pools/tables'

/**
 * Appeals (Communities v1 step 5). A staker files one appeal per market
 * during the hold; other stakers back it with escrow (a ledger reservation
 * on their cash). When enough backers or enough escrow is in, payouts
 * freeze and Prophit rules: rejected, upheld or voided.
 */

export const APPEAL_STATUSES = [
  'open',
  'threshold_met',
  'under_review',
  'rejected',
  'upheld',
  'voided',
  'withdrawn',
  'expired',
] as const
export type AppealStatus = (typeof APPEAL_STATUSES)[number]

/** Statuses while the appeal still holds the market. */
export const ACTIVE_APPEAL_STATUSES: readonly AppealStatus[] = ['open', 'threshold_met', 'under_review']

export interface AppealEvidence {
  type: 'link' | 'photo'
  url: string
  label?: string | null
}

export const market_appeals = pgTable(
  'market_appeals',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'cascade' }),
    pool_id: char({ length: 26 })
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    filed_by: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The jury's result the appeal is against. */
    original_outcome: text().$type<'yes' | 'no'>().notNull(),
    /** What the appeal says the result should be; 'cancelled' asks for a void. */
    claimed_outcome: text().$type<'yes' | 'no' | 'cancelled'>().notNull(),
    reason: text().notNull(),
    evidence: jsonb().$type<AppealEvidence[]>().notNull().default([]),
    status: text().$type<AppealStatus>().notNull().default('open'),
    /** The two lines, snapshotted when the appeal was filed. */
    backers_needed: integer().notNull(),
    escrow_target: bigint({ mode: 'bigint' }).notNull(),
    backer_count: integer().notNull().default(0),
    escrow_total: bigint({ mode: 'bigint' }).notNull().default(0n),
    currency: char({ length: 3 }).notNull(),
    /** Backing closes here: the extended hold on the pool. */
    window_ends_at: timestamp({ withTimezone: true }).notNull(),
    threshold_met_at: timestamp({ withTimezone: true }),
    ruling: text().$type<'rejected' | 'upheld' | 'voided'>(),
    ruling_text: text(),
    ruled_by: text().references(() => users.id, { onDelete: 'set null' }),
    ruled_at: timestamp({ withTimezone: true }),
    ruling_tx_id: char({ length: 26 }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_market_appeals_market').on(table.community_market_id),
    index('idx_market_appeals_status').on(table.status),
    // One live appeal per market.
    uniqueIndex('uniq_market_appeal_active')
      .on(table.community_market_id)
      .where(sql`${table.status} IN ('open', 'threshold_met', 'under_review')`),
    check('chk_market_appeals_claim', sql`${table.claimed_outcome} IN ('yes', 'no', 'cancelled')`),
    check(
      'chk_market_appeals_status',
      sql`${table.status} IN ('open', 'threshold_met', 'under_review', 'rejected', 'upheld', 'voided', 'withdrawn', 'expired')`,
    ),
  ],
)

export const appeal_backers = pgTable(
  'appeal_backers',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    appeal_id: char({ length: 26 })
      .notNull()
      .references(() => market_appeals.id, { onDelete: 'cascade' }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: bigint({ mode: 'bigint' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** The ledger reservation holding the escrow on the backer's cash. */
    reservation_id: char({ length: 26 }).notNull(),
    state: text().$type<'held' | 'returned' | 'forfeited'>().notNull().default('held'),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    settled_at: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique('uniq_appeal_backer').on(table.appeal_id, table.user_id),
    check('chk_appeal_backers_state', sql`${table.state} IN ('held', 'returned', 'forfeited')`),
    check('chk_appeal_backers_amount', sql`${table.amount} > 0`),
  ],
)

export const appeal_juror_opinions = pgTable(
  'appeal_juror_opinions',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    appeal_id: char({ length: 26 })
      .notNull()
      .references(() => market_appeals.id, { onDelete: 'cascade' }),
    juror_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null until the juror has answered. */
    opinion: text().$type<'stand' | 'flip' | 'void'>(),
    reasoning: text(),
    asked_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    answered_at: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique('uniq_appeal_juror_opinion').on(table.appeal_id, table.juror_id),
    check('chk_appeal_juror_opinion', sql`${table.opinion} IS NULL OR ${table.opinion} IN ('stand', 'flip', 'void')`),
  ],
)

export type MarketAppealRow = typeof market_appeals.$inferSelect
export type AppealBackerRow = typeof appeal_backers.$inferSelect
