import type { MarketResolutionEvidenceRow } from '@/lib/db/schema/communities/integrity'
import { and, desc, eq, sql } from 'drizzle-orm'
import { market_resolution_evidence } from '@/lib/db/schema/communities/integrity'
import { db } from '@/lib/drizzle'

/**
 * Editorial integrity + moderation helpers for community markets.
 * Columns added in migration 2026_06_15_001:
 *   community_markets.is_pinned, locked_at, locked_by, archived_at, archived_by
 *   communities.white_label
 * Are read/written here via raw SQL so the upstream Drizzle table objects
 * stay untouched (merge-safe).
 */

export interface MarketModerationFields {
  is_pinned: boolean
  locked_at: string | null
  locked_by: string | null
  archived_at: string | null
  archived_by: string | null
}

export interface EvidenceFeedItem {
  id: string
  url: string
  note: string | null
  submittedBy: string | null
  submittedLabel: string
  createdAt: string
}

export const CommunityIntegrityRepository = {
  // ─── Evidence ────────────────────────────────────────────────────────────

  async listEvidence(marketId: string, limit = 50): Promise<EvidenceFeedItem[]> {
    try {
      const rows = await db
        .select()
        .from(market_resolution_evidence)
        .where(eq(market_resolution_evidence.market_id, marketId))
        .orderBy(desc(market_resolution_evidence.created_at))
        .limit(Math.min(Math.max(limit, 1), 200))
      return rows.map(row => ({
        id: row.id,
        url: row.url,
        note: row.note,
        submittedBy: row.submitted_by,
        submittedLabel: row.submitted_label,
        createdAt: row.created_at.toISOString(),
      }))
    }
    catch (error) {
      console.error('Failed to load evidence', error)
      return []
    }
  },

  async addEvidence(input: {
    marketId: string
    communityId: string
    url: string
    note: string | null
    submittedBy: string
    submittedLabel: string
  }): Promise<MarketResolutionEvidenceRow> {
    const [row] = await db
      .insert(market_resolution_evidence)
      .values({
        market_id: input.marketId,
        community_id: input.communityId,
        url: input.url,
        note: input.note,
        submitted_by: input.submittedBy,
        submitted_label: input.submittedLabel,
      })
      .returning()
    return row
  },

  async removeEvidence(id: string, marketId: string): Promise<boolean> {
    const deleted = await db
      .delete(market_resolution_evidence)
      .where(and(eq(market_resolution_evidence.id, id), eq(market_resolution_evidence.market_id, marketId)))
      .returning({ id: market_resolution_evidence.id })
    return deleted.length > 0
  },

  // ─── Moderation ──────────────────────────────────────────────────────────

  async getModerationFields(marketId: string): Promise<MarketModerationFields | null> {
    try {
      const result = await db.execute(sql`
        SELECT is_pinned, locked_at::text AS locked_at, locked_by,
               archived_at::text AS archived_at, archived_by
        FROM community_markets WHERE id = ${marketId} LIMIT 1
      `)
      const row = ((result as unknown as { rows: MarketModerationFields[] }).rows
        ?? (result as unknown as MarketModerationFields[]))[0]
      return row ?? null
    }
    catch (error) {
      console.error('Failed to read moderation fields', error)
      return null
    }
  },

  async setPinned(marketId: string, pinned: boolean): Promise<void> {
    await db.execute(sql`
      UPDATE community_markets SET is_pinned = ${pinned} WHERE id = ${marketId}
    `)
  },

  async setLocked(marketId: string, locked: boolean, actorUserId: string): Promise<void> {
    if (locked) {
      await db.execute(sql`
        UPDATE community_markets
        SET locked_at = NOW(), locked_by = ${actorUserId}
        WHERE id = ${marketId}
      `)
    }
    else {
      await db.execute(sql`
        UPDATE community_markets SET locked_at = NULL, locked_by = NULL WHERE id = ${marketId}
      `)
    }
  },

  async setArchived(marketId: string, archived: boolean, actorUserId: string): Promise<void> {
    if (archived) {
      await db.execute(sql`
        UPDATE community_markets
        SET archived_at = NOW(), archived_by = ${actorUserId}
        WHERE id = ${marketId}
      `)
    }
    else {
      await db.execute(sql`
        UPDATE community_markets SET archived_at = NULL, archived_by = NULL WHERE id = ${marketId}
      `)
    }
  },

  // ─── White-label opt-in ─────────────────────────────────────────────────

  async getWhiteLabelFlag(communityId: string): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT white_label FROM communities WHERE id = ${communityId} LIMIT 1
      `)
      const row = ((result as unknown as { rows: Array<{ white_label: boolean }> }).rows
        ?? (result as unknown as Array<{ white_label: boolean }>))[0]
      return !!row?.white_label
    }
    catch {
      return false
    }
  },

  async setWhiteLabel(communityId: string, enabled: boolean): Promise<void> {
    await db.execute(sql`
      UPDATE communities SET white_label = ${enabled} WHERE id = ${communityId}
    `)
  },
}
