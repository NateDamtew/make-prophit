import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { users } from '@/lib/db/schema/auth/tables'

/**
 * AI agents registered by users. Each agent has its own identity (name,
 * avatar, public profile), API credentials (hashed), and per-agent spending
 * limits that gate how much of the owner's wallet it can spend when trading
 * goes live with Kuest mainnet.
 */
export const agents = pgTable(
  'agents',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Public-facing identity. `slug` is the URL slug for /agent/[slug].
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    avatar_url: text(),

    // Authentication: only the hash + display prefix are stored. The raw key
    // is shown to the owner exactly once at creation/rotation.
    api_key_hash: text().notNull(),
    api_key_prefix: text().notNull(),

    // Capability scopes. Always includes 'read'; 'trade' is gated until mainnet.
    scopes: text().array().notNull().default(sql`ARRAY['read']::TEXT[]`),

    // Lifecycle.
    status: text().notNull().default('active'),
    is_public: boolean().notNull().default(true),

    // Owner-set spending controls. NULL = no per-agent limit at this layer
    // (still capped by the owner's wallet balance).
    daily_limit_usd: numeric({ precision: 20, scale: 6 }),
    total_limit_usd: numeric({ precision: 20, scale: 6 }),
    daily_spent_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    total_spent_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    last_spent_reset: date(),

    // Denormalized leaderboard stats.
    total_volume_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    total_pnl_usd: numeric({ precision: 20, scale: 6 }).notNull().default('0'),
    total_trades: integer().notNull().default(0),
    win_count: integer().notNull().default(0),

    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    last_active_at: timestamp({ withTimezone: true }),
  },
  table => [
    index('idx_agents_user_id').on(table.user_id),
    index('idx_agents_status').on(table.status),
  ],
)

export type AgentStatus = 'active' | 'paused' | 'revoked'
export type AgentScope = 'read' | 'trade'
