import { sql } from 'drizzle-orm'
import { bigint, char, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { communities } from '@/lib/db/schema/communities/tables'
import { ledger_transactions } from '@/lib/db/schema/ledger/tables'
import { pools } from '@/lib/db/schema/pools/tables'

/**
 * What a community owner or juror earned from one pool (or one appeal
 * ruling), in the pool's currency. Written when the pool's payouts are
 * released; read for "your pay this month" and the owner's earnings page.
 */
export const community_earnings = pgTable(
  'community_earnings',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().$type<'owner' | 'juror' | 'appeal_juror'>().notNull(),
    pool_id: char({ length: 26 }).references(() => pools.id, { onDelete: 'set null' }),
    appeal_id: char({ length: 26 }),
    amount: bigint({ mode: 'bigint' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    ledger_transaction_id: char({ length: 26 }).references(() => ledger_transactions.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_community_earnings_user').on(table.user_id, table.created_at.desc()),
    index('idx_community_earnings_community').on(table.community_id, table.created_at.desc()),
    check('chk_community_earnings_role', sql`${table.role} IN ('owner', 'juror', 'appeal_juror')`),
    check('chk_community_earnings_amount', sql`${table.amount} >= 0`),
  ],
)

export type CommunityEarningRow = typeof community_earnings.$inferSelect
