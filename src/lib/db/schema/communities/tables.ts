import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  integer,
  jsonb,
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
    // 'active' | 'paused' (frozen by Prophit) | 'dormant' | 'archived' — see lib/communities/rules.ts
    status: text().notNull().default('active'),
    jury_size: smallint().notNull().default(3), // fork: pool communities need at least 3 (see lib/pools/jury.ts)
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
    // Market engine tier (fork): 'pool' = in-house parimutuel, 'orderbook' = Kuest. New markets only.
    tier: text().notNull().default('pool'),
    currency: char({ length: 3 }),
    tier_changed_at: timestamp({ withTimezone: true }),
    tier_override: text(),
    // ─── Trust ladder (fork, Communities v1) ────────────────────────────────
    // 0 New | 1 Proven | 2 Established. Independent of `tier`. See lib/communities/rules.ts.
    level: smallint().notNull().default(0),
    level_changed_at: timestamp({ withTimezone: true }),
    trust_score: smallint(), // 0–100, null until the nightly job has scored it
    trust_updated_at: timestamp({ withTimezone: true }),
    joins_paused: boolean().notNull().default(false),
    joins_paused_reason: text(),
    last_market_at: timestamp({ withTimezone: true }),
    upheld_appeal_count: integer().notNull().default(0),
    caps_override: jsonb().$type<{
      maxMembers?: number
      maxPoolPerMarketMinor?: string
      maxPerPersonMinor?: string
    }>(),
    review_mode_override: text(), // 'every' | 'spot' | 'none' | null
    leader_type: text(), // 'news' | 'sports' | 'creator' | 'show' | 'group' | 'event' | null
    frozen_reason: text(),
    frozen_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugLowerIdx: uniqueIndex('idx_communities_slug').on(sql`LOWER(${table.slug})`),
    jurySizeCheck: check('chk_jury_size', sql`${table.jury_size} BETWEEN 1 AND 10`),
    levelCheck: check('chk_communities_level', sql`${table.level} BETWEEN 0 AND 2`),
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
    role: text().notNull().default('member'), // see lib/communities/roles.ts: admin | co_owner | editor | moderator | juror | member
    joined_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    invited_by: text().references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    uniqueMember: unique('uniq_community_member').on(table.community_id, table.user_id),
  }),
)

// ─── Community Markets ───────────────────────────────────────────────────────
// Links platform events into a community. Community jury resolves independently.

export const community_markets = pgTable('community_markets', {
  id: char({ length: 26 })
    .primaryKey()
    .default(sql`generate_ulid()`),
  community_id: char({ length: 26 })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  event_id: char({ length: 26 }).references(() => events.id, { onDelete: 'set null' }),
  // Custom market fields (for AI-assisted creation when not pulling from platform)
  title: text().notNull(),
  slug: text(),
  image_url: text(),
  description: text(),
  resolution_source: text(),
  resolution_rules: text(),
  resolution_date: timestamp({ withTimezone: true }),
  // Market structure mirrors the admin event creation form
  market_mode: text().notNull().default('binary'),
  binary_question: text(),
  binary_outcome_yes: text().notNull().default('Yes'),
  binary_outcome_no: text().notNull().default('No'),
  options: jsonb()
    .$type<Array<{ id: string; question: string; title: string; shortName: string; slug: string }>>()
    .default([]),
  status: text().notNull().default('active'), // 'active' | 'resolved' | 'disputed' | 'cancelled'
  resolved_outcome: text(), // 'yes' | 'no' | 'cancelled'
  resolved_at: timestamp({ withTimezone: true }),
  created_by: text()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // ─── Review workflow ─────────────────────────────────────────────────────
  // null | 'pending' | 'approved' | 'rejected'
  // | 'deploying' | 'deploy_failed' | 'deploy_retry' | 'deploy_blocked'
  review_status: text(),
  review_feedback: text(),
  reviewed_by: text().references(() => users.id, { onDelete: 'set null' }),
  reviewed_at: timestamp({ withTimezone: true }),
  submitted_at: timestamp({ withTimezone: true }),
  main_category_slug: text(),
  category_slugs: text()
    .array()
    .default(sql`'{}'::text[]`),
  deploy_attempts: integer().notNull().default(0),
  last_deploy_error: text(),
  event_creation_draft_id: char({ length: 26 }),
  // Engine the market was created on; immutable. 'pool' | 'orderbook'
  engine: text().notNull().default('pool'),
  // Imported from the main catalogue: settles from the source condition, no jury.
  source_event_id: char({ length: 26 }),
  source_condition_id: text(),
  source_platform: text(),
  // ─── Jury (step 4): seats assigned at go-live, votes sealed until all are in or the deadline passes.
  jury_seat_count: smallint(),
  jury_required_votes: smallint(),
  jury_deadline_at: timestamp({ withTimezone: true }),
  votes_revealed_at: timestamp({ withTimezone: true }),
  result_announced_at: timestamp({ withTimezone: true }),
  jury_notified_at: timestamp({ withTimezone: true }),
  resolution_kind: text(), // 'jury' | 'source' | 'late' | 'admin'
  late_resolution: boolean().notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

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
    // Sealed-vote fields (step 4). `source_type` says what evidence_url is: 'link' | 'photo'.
    source_type: text(),
    sealed_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revealed_at: timestamp({ withTimezone: true }),
    correction_note: text(),
    correction_note_at: timestamp({ withTimezone: true }),
    was_late: boolean().notNull().default(false),
    agreed_with_outcome: boolean(),
    overturned: boolean().notNull().default(false),
  },
  (table) => ({
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
  (table) => ({
    uniqueReview: unique('uniq_community_review').on(table.community_id, table.user_id),
    ratingCheck: check('chk_rating', sql`${table.rating} BETWEEN 1 AND 5`),
  }),
)

// ─── Community Invites ───────────────────────────────────────────────────────

export const community_invites = pgTable('community_invites', {
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
})
