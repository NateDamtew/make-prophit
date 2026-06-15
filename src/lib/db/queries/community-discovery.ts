import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'

export interface DiscoveryCommunityRow {
  id: string
  slug: string
  name: string
  description: string | null
  icon_url: string | null
  banner_url: string | null
  type: string
  member_count: number
  market_count: number
  average_rating: string | null
  review_count: number
  jury_size: number
  created_at: Date
  creator_username: string | null
  creator_image: string | null
  is_verified: boolean
}

export interface DiscoveryCategoryRow {
  slug: string
  community_count: number
  market_count: number
}

const COMMUNITY_BASE_SELECT = sql`
  c.id, c.slug, c.name, c.description, c.icon_url, c.banner_url, c.type,
  c.member_count, c.market_count, c.average_rating::text AS average_rating,
  c.review_count, c.jury_size, c.created_at,
  COALESCE(u.username, NULL) AS creator_username,
  COALESCE(u.image, NULL) AS creator_image,
  COALESCE(c.is_verified, FALSE) AS is_verified
`

/**
 * Public listing for the /communities discovery surface. Supports a "trending"
 * sort backed by recent community_events activity. Read-only, public — no auth.
 */
export const CommunityDiscoveryRepository = {
  /** "Trending this week" — communities ranked by event volume over the last 7 days. */
  async listTrending(limit = 30): Promise<DiscoveryCommunityRow[]> {
    const bounded = Math.min(Math.max(limit, 1), 100)
    try {
      const result = await db.execute(sql`
        SELECT ${COMMUNITY_BASE_SELECT}
        FROM communities c
        LEFT JOIN users u ON u.id = c.creator_id
        LEFT JOIN (
          SELECT community_id, count(*)::int AS recent
          FROM community_events
          WHERE created_at >= now() - INTERVAL '7 days'
          GROUP BY community_id
        ) e ON e.community_id = c.id
        WHERE c.type = 'public' AND c.status = 'active'
        ORDER BY COALESCE(e.recent, 0) DESC, c.member_count DESC
        LIMIT ${bounded}
      `)
      const rows = (result as unknown as { rows: DiscoveryCommunityRow[] }).rows
        ?? (result as unknown as DiscoveryCommunityRow[])
      return rows
    }
    catch (error) {
      console.error('listTrending error', error)
      return []
    }
  },

  /** Available category facets derived from community_markets. */
  async listCategories(limit = 20): Promise<DiscoveryCategoryRow[]> {
    try {
      const result = await db.execute(sql`
        SELECT main_category_slug AS slug,
               count(DISTINCT community_id)::int AS community_count,
               count(*)::int AS market_count
        FROM community_markets
        WHERE main_category_slug IS NOT NULL AND char_length(main_category_slug) > 0
          AND archived_at IS NULL
        GROUP BY main_category_slug
        ORDER BY market_count DESC
        LIMIT ${Math.min(Math.max(limit, 1), 50)}
      `)
      const rows = (result as unknown as { rows: DiscoveryCategoryRow[] }).rows
        ?? (result as unknown as DiscoveryCategoryRow[])
      return rows.filter(r => r.slug && r.slug.trim().length > 0)
    }
    catch (error) {
      console.error('listCategories error', error)
      return []
    }
  },

  /** Communities filtered to a single category. */
  async listByCategory(category: string, limit = 30): Promise<DiscoveryCommunityRow[]> {
    const bounded = Math.min(Math.max(limit, 1), 100)
    try {
      const result = await db.execute(sql`
        SELECT ${COMMUNITY_BASE_SELECT}
        FROM communities c
        LEFT JOIN users u ON u.id = c.creator_id
        WHERE c.type = 'public' AND c.status = 'active'
          AND EXISTS (
            SELECT 1 FROM community_markets cm
            WHERE cm.community_id = c.id
              AND cm.main_category_slug = ${category}
              AND cm.archived_at IS NULL
          )
        ORDER BY c.member_count DESC, c.created_at DESC
        LIMIT ${bounded}
      `)
      const rows = (result as unknown as { rows: DiscoveryCommunityRow[] }).rows
        ?? (result as unknown as DiscoveryCommunityRow[])
      return rows
    }
    catch (error) {
      console.error('listByCategory error', error)
      return []
    }
  },

  // ─── Sitemap source ──────────────────────────────────────────────────────

  /** All public community slugs + last activity for sitemap generation. */
  async listAllForSitemap(): Promise<Array<{ slug: string, updated_at: string }>> {
    try {
      const result = await db.execute(sql`
        SELECT slug, GREATEST(updated_at, created_at)::text AS updated_at
        FROM communities
        WHERE type = 'public' AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 5000
      `)
      const rows = (result as unknown as { rows: Array<{ slug: string, updated_at: string }> }).rows
        ?? (result as unknown as Array<{ slug: string, updated_at: string }>)
      return rows
    }
    catch (error) {
      console.error('listAllForSitemap error', error)
      return []
    }
  },

  /** Community markets that are currently public for the sitemap. */
  async listMarketsForSitemap(): Promise<Array<{ community_slug: string, market_id: string, updated_at: string }>> {
    try {
      const result = await db.execute(sql`
        SELECT c.slug AS community_slug,
               cm.id AS market_id,
               GREATEST(cm.updated_at, cm.created_at)::text AS updated_at
        FROM community_markets cm
        JOIN communities c ON c.id = cm.community_id
        WHERE c.type = 'public' AND c.status = 'active'
          AND cm.status = 'active'
          AND cm.archived_at IS NULL
        ORDER BY cm.updated_at DESC
        LIMIT 20000
      `)
      const rows = (result as unknown as { rows: Array<{ community_slug: string, market_id: string, updated_at: string }> }).rows
        ?? (result as unknown as Array<{ community_slug: string, market_id: string, updated_at: string }>)
      return rows
    }
    catch (error) {
      console.error('listMarketsForSitemap error', error)
      return []
    }
  },
}
