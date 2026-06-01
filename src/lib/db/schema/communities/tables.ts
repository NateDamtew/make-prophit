import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/tables'
import { events } from '../events/tables'

// ─── Communities ──────────────────────────────────────────────────────────────

export const communities = pgTable(
  'communities',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    banner_url: text(),
    icon_url: text(),
    type: text().notNull().default('public'), // 'public' | 'private'
    status: text().notNull().default('active'), // 'active' | 'archived'
    jury_size: smallint().notNull().default(1),
    max_members: integer().notNull().default(5),
    rules: text(), // Community rules (free text)
    terms: text(), // Custom T&Cs
    creator_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    member_count: integer().notNull().default(1),
    market_count: integer().notNull().default(0),
    average_rating: numeric({ precision: 3, scale: 2 }).default('0'),
    review_count: integer().notNull().default(0),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    slugLowerIdx: uniqueIndex('idx_communities_slug').on(sql`LOWER(${table.slug})`),
    jurySizeCheck: check('chk_jury_size', sql`${table.jury_size} BETWEEN 1 AND 10`),
  }),
)

// ─── Members ─────────────────────────────────────────────────────────────────

export const community_members = pgTable(
  'community_members',
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
    role: text().notNull().default('member'), // 'admin' | 'juror' | 'member'
    joined_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    invited_by: text()
      .references(() => users.id, { onDelete: 'set null' }),
  },
  table => ({
    uniqueMember: unique('uniq_community_member').on(table.community_id, table.user_id),
  }),
)

// ─── Community Markets ───────────────────────────────────────────────────────
// Links platform events into a community. Community jury resolves independently.

export const community_markets = pgTable(
  'community_markets',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    event_id: char({ length: 26 })
      .references(() => events.id, { onDelete: 'set null' }),
    // Custom market fields (for AI-assisted creation when not pulling from platform)
    title: text().notNull(),
    description: text(),
    resolution_source: text(),
    resolution_rules: text(),
    resolution_date: timestamp({ withTimezone: true }),
    status: text().notNull().default('active'), // 'active' | 'resolved' | 'disputed' | 'cancelled'
    resolved_outcome: text(), // 'yes' | 'no' | 'cancelled'
    resolved_at: timestamp({ withTimezone: true }),
    created_by: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
)

// ─── Jury Votes ──────────────────────────────────────────────────────────────

export const jury_votes = pgTable(
  'jury_votes',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'cascade' }),
    juror_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vote: text().notNull(), // 'yes' | 'no' | 'disputed'
    reasoning: text().notNull(),
    evidence_url: text(),
    voted_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    uniqueVote: unique('uniq_jury_vote').on(table.community_market_id, table.juror_id),
  }),
)

// ─── Community Reviews ───────────────────────────────────────────────────────

export const community_reviews = pgTable(
  'community_reviews',
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
    rating: smallint().notNull(), // 1-5
    review_text: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    uniqueReview: unique('uniq_community_review').on(table.community_id, table.user_id),
    ratingCheck: check('chk_rating', sql`${table.rating} BETWEEN 1 AND 5`),
  }),
)

// ─── Community Invites ───────────────────────────────────────────────────────

export const community_invites = pgTable(
  'community_invites',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_id: char({ length: 26 })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    code: text().notNull().unique(),
    created_by: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    max_uses: integer(),
    use_count: integer().notNull().default(0),
    expires_at: timestamp({ withTimezone: true }),
    is_active: boolean().notNull().default(true),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
)
