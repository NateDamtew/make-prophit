import { sql } from 'drizzle-orm'
import { char, check, index, jsonb, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { communities } from '@/lib/db/schema/communities/tables'

/**
 * A request to lead a community. Prophit reads it, asks for more, or
 * approves it at a starting level; approval creates the community.
 */
export const APPLICATION_STATUSES = ['pending', 'more_info', 'approved', 'rejected', 'withdrawn'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export interface ApplicationSampleMarket {
  title: string
  source: string
  closesAt: string | null
}

export const community_applications = pgTable(
  'community_applications',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leader_type: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text().notNull(),
    audience: text(),
    sample_markets: jsonb().$type<ApplicationSampleMarket[]>().notNull().default([]),
    links: jsonb().$type<string[]>().notNull().default([]),
    currency: char({ length: 3 }).notNull().default('KES'),
    status: text().$type<ApplicationStatus>().notNull().default('pending'),
    admin_note: text(),
    start_level: smallint(),
    community_id: char({ length: 26 }).references(() => communities.id, { onDelete: 'set null' }),
    reviewed_by: text().references(() => users.id, { onDelete: 'set null' }),
    reviewed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_community_applications_user').on(table.user_id, table.created_at.desc()),
    index('idx_community_applications_status').on(table.status, table.created_at.desc()),
    check(
      'chk_community_applications_status',
      sql`${table.status} IN ('pending', 'more_info', 'approved', 'rejected', 'withdrawn')`,
    ),
    check(
      'chk_community_applications_leader_type',
      sql`${table.leader_type} IN ('news', 'sports', 'creator', 'show', 'group', 'event')`,
    ),
  ],
)

export type CommunityApplicationRow = typeof community_applications.$inferSelect
