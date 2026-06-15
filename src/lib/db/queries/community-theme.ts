import type { CommunityThemeRow, FontHint, LayoutPreset, SurfaceMode } from '@/lib/db/schema/communities/themes'
import { eq, sql } from 'drizzle-orm'
import { community_themes, LAYOUT_PRESETS } from '@/lib/db/schema/communities/themes'
import { db } from '@/lib/drizzle'

// FontHint and SurfaceMode are re-used by callers via this module's type
// surface (CommunityThemeState); we re-export them so they don't have to
// reach into schema/communities/themes directly.
export type { FontHint, SurfaceMode } from '@/lib/db/schema/communities/themes'

export interface CommunityThemeState {
  layout_preset: LayoutPreset
  accent: string | null
  surface_mode: SurfaceMode
  font_hint: FontHint
  hidden_sections: string[]
  featured_market_id: string | null
}

const DEFAULT_THEME: CommunityThemeState = {
  layout_preset: 'classic',
  accent: null,
  surface_mode: 'auto',
  font_hint: 'sans',
  hidden_sections: [],
  featured_market_id: null,
}

function isLayoutPreset(value: unknown): value is LayoutPreset {
  return typeof value === 'string' && (LAYOUT_PRESETS as readonly string[]).includes(value)
}

/**
 * Validate an accent color string. We accept hex (#fff / #ffffff), rgb()/oklch()
 * functional notation, and a small allow-list of plain CSS names. Anything else
 * is rejected so a community admin can't inject arbitrary CSS via the accent.
 */
export function isSafeAccent(value: string | null | undefined): value is string {
  if (!value) {
    return false
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) {
    return false
  }
  // Hex
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    return true
  }
  // CSS color functions — must look like name(...) with only safe chars inside
  if (/^[a-z]{1,12}\([\d.,%\s/-]+\)$/i.test(trimmed)) {
    return true
  }
  // OKLCH with optional alpha
  if (/^oklch\(\s*[\d.%]+\s+[\d.%]+\s+[\d.%]+(?:\s*\/\s*[\d.%]+)?\s*\)$/i.test(trimmed)) {
    return true
  }
  return false
}

export const CommunityThemeRepository = {
  /**
   * Read the effective theme + layout preset for a community. Falls back to
   * defaults when no theme row exists. Cheap to call; degrades to defaults on
   * any DB error so a partial outage never breaks rendering.
   */
  async get(communityId: string): Promise<CommunityThemeState> {
    try {
      const [themeRow, presetRow] = await Promise.all([
        db
          .select()
          .from(community_themes)
          .where(eq(community_themes.community_id, communityId))
          .limit(1)
          .then(rows => rows[0] ?? null),
        readLayoutPreset(communityId),
      ])

      return {
        layout_preset: presetRow ?? 'classic',
        accent: themeRow?.accent ?? null,
        surface_mode: themeRow?.surface_mode ?? 'auto',
        font_hint: themeRow?.font_hint ?? 'sans',
        hidden_sections: themeRow?.hidden_sections ?? [],
        featured_market_id: themeRow?.featured_market_id ?? null,
      }
    }
    catch (error) {
      console.error('Failed to load community theme', error)
      return DEFAULT_THEME
    }
  },

  /** Upsert the theme row. Always returns the new state. */
  async upsert(input: {
    community_id: string
    accent: string | null
    surface_mode: SurfaceMode
    font_hint: FontHint
    hidden_sections: string[]
    featured_market_id: string | null
  }): Promise<CommunityThemeRow> {
    const [row] = await db
      .insert(community_themes)
      .values({
        community_id: input.community_id,
        accent: input.accent,
        surface_mode: input.surface_mode,
        font_hint: input.font_hint,
        hidden_sections: input.hidden_sections,
        featured_market_id: input.featured_market_id,
      })
      .onConflictDoUpdate({
        target: community_themes.community_id,
        set: {
          accent: input.accent,
          surface_mode: input.surface_mode,
          font_hint: input.font_hint,
          hidden_sections: input.hidden_sections,
          featured_market_id: input.featured_market_id,
        },
      })
      .returning()
    return row
  },

  /** Switch the community's layout preset. Validated against the union. */
  async setLayoutPreset(communityId: string, preset: LayoutPreset): Promise<void> {
    if (!isLayoutPreset(preset)) {
      throw new Error(`Invalid preset: ${preset}`)
    }
    await db.execute(sql`
      UPDATE communities SET layout_preset = ${preset} WHERE id = ${communityId}
    `)
  },
}

async function readLayoutPreset(communityId: string): Promise<LayoutPreset | null> {
  try {
    const result = await db.execute(sql`
      SELECT layout_preset FROM communities WHERE id = ${communityId} LIMIT 1
    `)
    const row = ((result as unknown as { rows: Array<{ layout_preset: string }> }).rows
      ?? (result as unknown as Array<{ layout_preset: string }>))[0]
    if (!row) {
      return null
    }
    return isLayoutPreset(row.layout_preset) ? row.layout_preset : 'classic'
  }
  catch {
    return null
  }
}
