import { sql } from 'drizzle-orm'
import {
  char,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

/** Lifecycle of a waitlist signup, managed from the admin dashboard. */
export const WAITLIST_STATUSES = ['pending', 'invited', 'joined', 'spam'] as const
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number]

export const waitlists = pgTable(
  'waitlists',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    name: text('name'),
    email: text('email')
      .notNull()
      .unique(),
    role: text('role'),
    country: text('country'),
    // Admin workflow fields (see migration 2026_06_11_002).
    status: text('status').$type<WaitlistStatus>().notNull().default('pending'),
    invited_at: timestamp('invited_at', { withTimezone: true }),
    invited_by: text('invited_by'),
    notes: text('notes'),
    created_at: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('waitlists_status_idx').on(table.status),
    index('waitlists_created_at_idx').on(table.created_at.desc()),
  ],
)

export type WaitlistRow = typeof waitlists.$inferSelect
