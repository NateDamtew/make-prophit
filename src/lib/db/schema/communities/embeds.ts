import { sql } from 'drizzle-orm'
import { char, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { communities } from '@/lib/db/schema/communities/tables'

export interface CommunityEmbedTheme {
  /** Preferred color scheme on the embed page. `auto` follows the host page. */
  mode?: 'light' | 'dark' | 'auto'
  /** Optional accent color (OKLCH or hex). Falls back to community accent. */
  accent?: string
}

/**
 * One row per community. Theme is schemaless on purpose — we'll evolve it
 * without migrations as the embed format matures. `allowed_domains` empty
 * means embed-anywhere; populating it tightens X-Frame-Options at render time.
 */
export const community_embed_configs = pgTable('community_embed_configs', {
  community_id: char({ length: 26 })
    .primaryKey()
    .references(() => communities.id, { onDelete: 'cascade' }),
  theme: jsonb().$type<CommunityEmbedTheme>().notNull().default(sql`'{"mode":"auto"}'::jsonb`),
  allowed_domains: text().array().notNull().default(sql`'{}'::text[]`),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type CommunityEmbedConfigRow = typeof community_embed_configs.$inferSelect
