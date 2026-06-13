import type { CommunityEmbedConfigRow, CommunityEmbedTheme } from '@/lib/db/schema/communities/embeds'
import type { CommunityPayoutRow } from '@/lib/db/schema/communities/monetization'
import { desc, eq, sql } from 'drizzle-orm'
import { community_embed_configs } from '@/lib/db/schema/communities/embeds'
import { community_payouts } from '@/lib/db/schema/communities/monetization'
import { db } from '@/lib/drizzle'

/**
 * Helpers for the Phase 2 monetization + verified + embed surface.
 *
 * `communities.is_verified`, `community_fee_bps`, `fee_payout_address`,
 * `verified_at`, `verified_by` are added in migration
 * 2026_06_13_001 but the upstream Drizzle table object (which we do not edit
 * to keep merges clean) doesn't know about them. We read/write them via raw
 * SQL through these helpers — the indirection is contained here.
 */

export interface CommunityMonetizationFields {
  is_verified: boolean
  community_fee_bps: number
  fee_payout_address: string | null
  verified_at: string | null
  verified_by: string | null
}

export const CommunityMonetizationRepository = {
  async getFields(communityId: string): Promise<CommunityMonetizationFields | null> {
    const rows = await db.execute(sql<CommunityMonetizationFields>`
      SELECT is_verified, community_fee_bps, fee_payout_address,
             verified_at::text AS verified_at, verified_by
      FROM communities
      WHERE id = ${communityId}
      LIMIT 1
    `)
    const row = (rows as unknown as { rows: CommunityMonetizationFields[] }).rows?.[0]
      ?? (rows as unknown as CommunityMonetizationFields[])[0]
    return row ?? null
  },

  async setVerified(communityId: string, isVerified: boolean, verifierUserId: string): Promise<void> {
    await db.execute(sql`
      UPDATE communities
      SET is_verified = ${isVerified},
          verified_at = ${isVerified ? sql`NOW()` : sql`NULL`},
          verified_by = ${isVerified ? verifierUserId : null}
      WHERE id = ${communityId}
    `)
  },

  async setFeeBps(communityId: string, bps: number): Promise<void> {
    const bounded = Math.max(0, Math.min(1000, Math.round(bps)))
    await db.execute(sql`
      UPDATE communities SET community_fee_bps = ${bounded} WHERE id = ${communityId}
    `)
  },

  async setPayoutAddress(communityId: string, address: string | null): Promise<void> {
    await db.execute(sql`
      UPDATE communities SET fee_payout_address = ${address} WHERE id = ${communityId}
    `)
  },

  /** Latest payouts, newest first, for the Insights payouts tab. */
  async listPayouts(communityId: string, limit = 50): Promise<CommunityPayoutRow[]> {
    return db
      .select()
      .from(community_payouts)
      .where(eq(community_payouts.community_id, communityId))
      .orderBy(desc(community_payouts.period_end))
      .limit(Math.min(limit, 200))
  },
}

export const CommunityEmbedRepository = {
  async get(communityId: string): Promise<CommunityEmbedConfigRow | null> {
    const [row] = await db
      .select()
      .from(community_embed_configs)
      .where(eq(community_embed_configs.community_id, communityId))
      .limit(1)
    return row ?? null
  },

  /** Upsert — creates the row on first save. */
  async upsert(input: {
    community_id: string
    theme: CommunityEmbedTheme
    allowed_domains: string[]
  }): Promise<CommunityEmbedConfigRow> {
    const [row] = await db
      .insert(community_embed_configs)
      .values({
        community_id: input.community_id,
        theme: input.theme,
        allowed_domains: input.allowed_domains,
      })
      .onConflictDoUpdate({
        target: community_embed_configs.community_id,
        set: {
          theme: input.theme,
          allowed_domains: input.allowed_domains,
        },
      })
      .returning()
    return row
  },

  /** True if `host` is allowed to frame this community's embed. */
  isHostAllowed(config: CommunityEmbedConfigRow | null, host: string): boolean {
    if (!config || config.allowed_domains.length === 0) {
      return true
    }
    const lower = host.toLowerCase()
    return config.allowed_domains.some((entry) => {
      const e = entry.trim().toLowerCase()
      if (!e) {
        return false
      }
      // Wildcard prefix: "*.example.com" matches any subdomain
      if (e.startsWith('*.')) {
        return lower === e.slice(2) || lower.endsWith(e.slice(1))
      }
      return lower === e
    })
  },
}
