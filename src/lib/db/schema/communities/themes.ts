import { sql } from 'drizzle-orm'
import { char, check, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'

/**
 * Layout presets a community admin can pick. Adding a new preset is a code +
 * migration change (the CHECK constraint in the SQL is the gate).
 */
export const LAYOUT_PRESETS = ['classic', 'newsroom', 'sports', 'forum'] as const
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number]

export const SURFACE_MODES = ['auto', 'light', 'dark'] as const
export type SurfaceMode = (typeof SURFACE_MODES)[number]

export const FONT_HINTS = ['sans', 'serif', 'mono'] as const
export type FontHint = (typeof FONT_HINTS)[number]

/**
 * Optional per-community theme + bounded layout tweaks. Absent row = defaults.
 *
 * Kept additive (not edited into the upstream communities/tables.ts) so future
 * `git merge upstream/main` never touches it.
 */
export const community_themes = pgTable(
  'community_themes',
  {
    community_id: char({ length: 26 })
      .primaryKey()
      .references(() => communities.id, { onDelete: 'cascade' }),
    accent: text(),
    surface_mode: text().$type<SurfaceMode>().notNull().default('auto'),
    font_hint: text().$type<FontHint>().notNull().default('sans'),
    /** Section ids the admin chose to hide for this community's preset. */
    hidden_sections: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Optional pinned market for the Newsroom hero. */
    featured_market_id: char({ length: 26 }).references(() => community_markets.id, { onDelete: 'set null' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check('chk_community_themes_surface_mode', sql`${table.surface_mode} IN ('auto', 'light', 'dark')`),
    check('chk_community_themes_font_hint', sql`${table.font_hint} IN ('sans', 'serif', 'mono')`),
  ],
)

export type CommunityThemeRow = typeof community_themes.$inferSelect
