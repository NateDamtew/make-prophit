import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { users } from '@/lib/db/schema/auth/tables'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'

/**
 * Phase 1 community engagement layer. Kept in a dedicated additive file so
 * upstream merges never collide with it. Imported directly by the queries that
 * need them; the shared schema index is left untouched.
 */

/** Comment reactions live here too; reaction "kind" is constrained at the DB. */
export const COMMENT_REACTION_KINDS = ['like', 'fire', 'target', 'thinking'] as const
export type CommentReactionKind = (typeof COMMENT_REACTION_KINDS)[number]

/** Threaded comments on community markets. depth is enforced application-side. */
export const community_comments = pgTable(
  'community_comments',
  {
    id: char({ length: 26 }).primaryKey().default(sql`generate_ulid()`),
    market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'cascade' }),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parent_id: char({ length: 26 }),
    body: text().notNull(),
    edited_at: timestamp({ withTimezone: true }),
    deleted_at: timestamp({ withTimezone: true }),
    reply_count: integer().notNull().default(0),
    reaction_count: integer().notNull().default(0),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_community_comments_market_created').on(table.market_id, table.created_at.desc()),
    index('idx_community_comments_community_created').on(table.community_id, table.created_at.desc()),
    index('idx_community_comments_user').on(table.user_id, table.created_at.desc()),
    check('chk_community_comments_body_len', sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
  ],
)

export type CommunityCommentRow = typeof community_comments.$inferSelect
export type CommunityCommentInsert = typeof community_comments.$inferInsert

/** Generic reactions on either a market or a comment. */
export const community_reactions = pgTable(
  'community_reactions',
  {
    id: char({ length: 26 }).primaryKey().default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    target_type: text().notNull().$type<'market' | 'comment'>(),
    target_id: char({ length: 26 }).notNull(),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text().notNull().$type<CommentReactionKind>(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_community_reactions_target').on(table.target_type, table.target_id),
    index('idx_community_reactions_user_created').on(table.user_id, table.created_at.desc()),
    unique('uniq_community_reactions').on(table.target_type, table.target_id, table.user_id, table.kind),
    check(
      'chk_community_reactions_target_type',
      sql`${table.target_type} IN ('market', 'comment')`,
    ),
    check(
      'chk_community_reactions_kind',
      sql`${table.kind} IN ('like', 'fire', 'target', 'thinking')`,
    ),
  ],
)

export type CommunityReactionRow = typeof community_reactions.$inferSelect

/** Append-only activity log: every meaningful action records one event. */
export const community_events = pgTable(
  'community_events',
  {
    id: char({ length: 26 }).primaryKey().default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    actor_user_id: text().references(() => users.id, { onDelete: 'set null' }),
    actor_label: text(),
    kind: text().notNull(),
    target_type: text(),
    target_id: char({ length: 26 }),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_community_events_community_created').on(table.community_id, table.created_at.desc()),
    index('idx_community_events_kind').on(table.kind, table.created_at.desc()),
  ],
)

export type CommunityEventRow = typeof community_events.$inferSelect
export type CommunityEventInsert = typeof community_events.$inferInsert

/** Per-user per-community notification mute toggles. */
export const community_notification_prefs = pgTable(
  'community_notification_prefs',
  {
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    mute_comments: boolean().notNull().default(false),
    mute_markets: boolean().notNull().default(false),
    mute_resolutions: boolean().notNull().default(false),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.user_id, table.community_id] }),
  ],
)

export type CommunityNotificationPrefRow = typeof community_notification_prefs.$inferSelect
