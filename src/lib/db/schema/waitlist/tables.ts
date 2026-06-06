import { sql } from 'drizzle-orm'
import {
  char,
  pgTable,
  timestamp,
  text,
} from 'drizzle-orm/pg-core'

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
    created_at: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)
