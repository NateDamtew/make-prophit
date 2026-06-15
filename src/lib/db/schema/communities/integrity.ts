import { sql } from 'drizzle-orm'
import { char, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from '@/lib/db/schema/auth/tables'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'

/**
 * Per-market resolution evidence. Distinct from jury_votes.evidence_url:
 * jurors attach one URL per their vote; this table is the community-level
 * source-of-truth audit trail (multiple URLs, optional note per entry).
 */
export const market_resolution_evidence = pgTable(
  'market_resolution_evidence',
  {
    id: char({ length: 26 }).primaryKey().default(sql`generate_ulid()`),
    market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'cascade' }),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    url: text().notNull(),
    note: text(),
    submitted_by: text().references(() => users.id, { onDelete: 'set null' }),
    submitted_label: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_market_resolution_evidence_market').on(table.market_id, table.created_at.desc()),
    index('idx_market_resolution_evidence_community').on(table.community_id, table.created_at.desc()),
    check('chk_market_resolution_evidence_url_len', sql`char_length(${table.url}) BETWEEN 8 AND 2048`),
    check('chk_market_resolution_evidence_note_len', sql`${table.note} IS NULL OR char_length(${table.note}) <= 500`),
  ],
)

export type MarketResolutionEvidenceRow = typeof market_resolution_evidence.$inferSelect
