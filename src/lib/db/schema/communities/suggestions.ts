import { sql } from 'drizzle-orm'
import { char, check, index, jsonb, numeric, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'

/**
 * The suggestion pool (Communities v1, step 7): market drafts Prophit
 * prepares from news, fixtures and release calendars (by hand or from a
 * link through the AI drafter), checks and approves, and offers to
 * communities. An owner adds one as drafted or edits it first.
 */

export const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

export interface SuggestionChecksJson {
  dated: boolean
  publicSource: boolean
  closesBeforeEvent: boolean
}

export const market_suggestions = pgTable(
  'market_suggestions',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    title: text().notNull(),
    description: text(),
    /** 'binary' (Yes / No) or 'list' (3–5 outcomes in `outcomes`). */
    market_mode: text().$type<'binary' | 'list'>().notNull().default('binary'),
    outcomes: jsonb().$type<string[]>().notNull().default([]),
    resolution_rules: text(),
    resolution_source: text(),
    source_url: text(),
    source_name: text(),
    source_published_at: timestamp({ withTimezone: true }),
    closes_at: timestamp({ withTimezone: true }),
    /** When the thing it measures happens; the market must close before it. */
    event_at: timestamp({ withTimezone: true }),
    main_category_slug: text(),
    category_slugs: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    checks: jsonb()
      .$type<SuggestionChecksJson>()
      .notNull()
      .default({ dated: false, publicSource: false, closesBeforeEvent: false }),
    confidence: numeric({ precision: 4, scale: 2 }).notNull().default('0'),
    status: text().$type<SuggestionStatus>().notNull().default('pending'),
    /** 'ai' (drafted from a link or question), 'admin' (written by hand). */
    origin: text().$type<'ai' | 'admin'>().notNull().default('admin'),
    /** Approved suggestions stop being offered after this. */
    expires_at: timestamp({ withTimezone: true }),
    created_by: text().references(() => users.id, { onDelete: 'set null' }),
    reviewed_by: text().references(() => users.id, { onDelete: 'set null' }),
    reviewed_at: timestamp({ withTimezone: true }),
    review_note: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_market_suggestions_status').on(table.status, table.created_at.desc()),
    check('chk_market_suggestions_status', sql`${table.status} IN ('pending', 'approved', 'rejected', 'expired')`),
    check('chk_market_suggestions_mode', sql`${table.market_mode} IN ('binary', 'list')`),
    check('chk_market_suggestions_origin', sql`${table.origin} IN ('ai', 'admin')`),
  ],
)

export const market_suggestion_targets = pgTable(
  'market_suggestion_targets',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    suggestion_id: char({ length: 26 })
      .notNull()
      .references(() => market_suggestions.id, { onDelete: 'cascade' }),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** 'suggested' (offered to this community), 'added' (became a market), 'dismissed'. */
    status: text().$type<'suggested' | 'added' | 'dismissed'>().notNull().default('suggested'),
    community_market_id: char({ length: 26 }).references(() => community_markets.id, { onDelete: 'set null' }),
    added_by: text().references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uniq_market_suggestion_target').on(table.suggestion_id, table.community_id),
    index('idx_market_suggestion_targets_community').on(table.community_id, table.status),
    check('chk_market_suggestion_targets_status', sql`${table.status} IN ('suggested', 'added', 'dismissed')`),
  ],
)

export type MarketSuggestionRow = typeof market_suggestions.$inferSelect
