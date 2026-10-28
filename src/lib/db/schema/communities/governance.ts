import { sql } from 'drizzle-orm'
import { char, check, index, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { communities } from '@/lib/db/schema/communities/tables'

/**
 * Append-only log of every trust-ladder change on a community: level moves,
 * freezes, dormancy, trust recomputes, join pauses and cap changes. Prophit
 * admins and the owner read it; nothing updates a row after insert.
 */
export const community_trust_events = pgTable(
  'community_trust_events',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    kind: text()
      .$type<
        | 'promoted'
        | 'demoted'
        | 'frozen'
        | 'unfrozen'
        | 'dormant'
        | 'reactivated'
        | 'trust_recomputed'
        | 'joins_paused'
        | 'joins_resumed'
        | 'caps_changed'
      >()
      .notNull(),
    from_level: smallint(),
    to_level: smallint(),
    trust_before: smallint(),
    trust_after: smallint(),
    reason: text(),
    actor_user_id: text().references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_community_trust_events_community').on(table.community_id, table.created_at.desc()),
    check(
      'chk_community_trust_events_kind',
      sql`${table.kind} IN ('promoted', 'demoted', 'frozen', 'unfrozen', 'dormant', 'reactivated', 'trust_recomputed', 'joins_paused', 'joins_resumed', 'caps_changed')`,
    ),
  ],
)

export type CommunityTrustEventRow = typeof community_trust_events.$inferSelect
