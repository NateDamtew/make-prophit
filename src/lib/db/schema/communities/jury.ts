import { sql } from 'drizzle-orm'
import { char, check, index, integer, pgTable, smallint, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { users } from '@/lib/db/schema/auth/tables'
import { community_markets } from '@/lib/db/schema/communities/tables'

/**
 * Jury seats, loser ratings and juror records (Communities v1 step 4).
 *
 * A market gets its seats when it goes live; only seated jurors vote, votes
 * stay sealed until every seat has voted or the deadline passes, and the
 * losers of a market rate how it was resolved. `juror_stats` is a cache of
 * each juror's public record, recomputed from seats, votes and ratings.
 */

export const market_jury_seats = pgTable(
  'market_jury_seats',
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
    seated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uniq_market_jury_seat').on(table.community_market_id, table.juror_id),
    index('idx_market_jury_seats_juror').on(table.juror_id),
  ],
)

export const market_resolution_ratings = pgTable(
  'market_resolution_ratings',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    community_market_id: char({ length: 26 })
      .notNull()
      .references(() => community_markets.id, { onDelete: 'cascade' }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uniq_market_resolution_rating').on(table.community_market_id, table.user_id),
    check('chk_market_resolution_rating', sql`${table.rating} BETWEEN 1 AND 5`),
  ],
)

export const juror_stats = pgTable('juror_stats', {
  user_id: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Revealed markets the juror voted on. */
  markets_voted: integer().notNull().default(0),
  on_time: integer().notNull().default(0),
  late: integer().notNull().default(0),
  /** Votes that matched the final result. */
  agreed: integer().notNull().default(0),
  /** Votes overturned on appeal. */
  overturned: integer().notNull().default(0),
  rating_sum: integer().notNull().default(0),
  rating_count: integer().notNull().default(0),
  /** Dissents an appeal later proved right. */
  dissent_proven: integer().notNull().default(0),
  first_voted_at: timestamp({ withTimezone: true }),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type JurorStatsRow = typeof juror_stats.$inferSelect
