import { sql } from 'drizzle-orm'
import { char, check, index, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { communities } from '@/lib/db/schema/communities/tables'

/**
 * Phase 2 monetization ledger. One row per payout period per community. The
 * actual payout pipeline (wire / USDC) is deferred — this table is the source
 * of truth for the Insights UI and any future automated payout job.
 */
export const community_payouts = pgTable(
  'community_payouts',
  {
    id: char({ length: 26 }).primaryKey().default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    period_start: timestamp({ withTimezone: true }).notNull(),
    period_end: timestamp({ withTimezone: true }).notNull(),
    gross_volume_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    community_fee_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    status: text().$type<'pending' | 'paid' | 'voided'>().notNull().default('pending'),
    paid_at: timestamp({ withTimezone: true }),
    paid_tx_hash: text(),
    notes: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_community_payouts_community_period').on(table.community_id, table.period_end.desc()),
    index('idx_community_payouts_status').on(table.status, table.created_at.desc()),
    check('chk_community_payouts_status', sql`${table.status} IN ('pending', 'paid', 'voided')`),
    check('chk_community_payouts_period', sql`${table.period_end} > ${table.period_start}`),
  ],
)

export type CommunityPayoutRow = typeof community_payouts.$inferSelect
