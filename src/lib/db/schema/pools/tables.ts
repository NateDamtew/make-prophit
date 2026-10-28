import { sql } from 'drizzle-orm'
import { bigint, boolean, char, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { ledger_transactions } from '@/lib/db/schema/ledger/tables'

/**
 * Parimutuel pools for community markets. All stakes in one local currency
 * go into the pool's ledger account; on resolution the jury's outcome splits
 * the pool pro rata among winning stakes after the rake. Zero FX.
 */

// 'held': the result is in and payouts are computed, but the money waits for
// the appeal window (see lib/communities/hold.ts) before the ledger posts.
export const POOL_STATES = ['open', 'closed', 'held', 'settled', 'cancelled'] as const
export type PoolState = (typeof POOL_STATES)[number]

export const POOL_OUTCOMES = ['yes', 'no'] as const
export type PoolOutcome = (typeof POOL_OUTCOMES)[number]

export const pools = pgTable(
  'pools',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'restrict' }),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    currency: char({ length: 3 }).notNull(),
    rake_bps: integer().notNull().default(400),
    creator_share_bps: integer().notNull().default(0),
    state: text().notNull().default('open').$type<PoolState>(),
    closes_at: timestamp({ withTimezone: true }),
    total_yes: bigint({ mode: 'bigint' }).notNull().default(0n),
    total_no: bigint({ mode: 'bigint' }).notNull().default(0n),
    stake_count: integer().notNull().default(0),
    settled_outcome: text().$type<'yes' | 'no' | 'cancelled'>(),
    settled_at: timestamp({ withTimezone: true }),
    settlement_tx_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    rake_paid: bigint({ mode: 'bigint' }).notNull().default(0n),
    creator_paid: bigint({ mode: 'bigint' }).notNull().default(0n),
    // ─── Hold + rake split (fork, Communities v1) ─────────────────────────
    /** Owner's and jury's share of the rake, in basis points of the rake; Prophit keeps the rest. */
    owner_share_bps: integer().notNull().default(0),
    jury_share_bps: integer().notNull().default(0),
    /** Imported markets settle from their source: no jury share, no hold, no appeal. */
    is_imported: boolean().notNull().default(false),
    /** The outcome the held payouts were computed for; becomes settled_outcome on release. */
    planned_outcome: text().$type<'yes' | 'no' | 'cancelled'>(),
    result_announced_at: timestamp({ withTimezone: true }),
    hold_until: timestamp({ withTimezone: true }),
    hold_extended_until: timestamp({ withTimezone: true }),
    /** Set when an appeal reaches its threshold; only an admin ruling releases. */
    payouts_frozen: boolean().notNull().default(false),
    released_at: timestamp({ withTimezone: true }),
    owner_paid: bigint({ mode: 'bigint' }).notNull().default(0n),
    jury_paid: bigint({ mode: 'bigint' }).notNull().default(0n),
    /** Jurors who voted with the result and share the jury slice. */
    voting_juror_ids: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    closing_notified_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    marketIdx: uniqueIndex('pools_community_market_id_key').on(table.community_market_id),
    communityIdx: index('idx_pools_community').on(table.community_id),
    stateIdx: index('idx_pools_state').on(table.state),
  }),
)

export const pool_stakes = pgTable(
  'pool_stakes',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    pool_id: char({ length: 26 })
      .notNull()
      .references(() => pools.id, { onDelete: 'restrict' }),
    user_id: char({ length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    outcome: text().notNull().$type<PoolOutcome>(),
    amount: bigint({ mode: 'bigint' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    payout: bigint({ mode: 'bigint' }),
    ledger_transaction_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    /** When the payout actually landed in the user's balance (null while held). */
    paid_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    poolUserIdx: index('idx_pool_stakes_pool_user').on(table.pool_id, table.user_id),
    userCreatedIdx: index('idx_pool_stakes_user_created').on(table.user_id, table.created_at),
  }),
)
