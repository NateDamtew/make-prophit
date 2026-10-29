import { and, eq, inArray, sql } from 'drizzle-orm'

import type { CommunityLevel, CommunityStatus } from '@/lib/communities/rules'

import { recomputeAllJurorStats } from '@/lib/communities/jury-service'
import { isCommunityLevel, jurySeatsForMembers } from '@/lib/communities/rules'
import { getCommunitySettings } from '@/lib/communities/settings'
import { expireSuggestions } from '@/lib/communities/suggestions'
import { computeTrustScore, decideLevel, decideStatus } from '@/lib/communities/trust'
import { community_trust_events } from '@/lib/db/schema/communities/governance'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

/**
 * The nightly trust pass. For every community that is not archived: read
 * its record, write the trust score, promote when earned, flip active ↔
 * dormant, and keep jury seats and the member cap in step with its level
 * and size. Every change leaves a trust event.
 */

export interface TrustSyncResult {
  scanned: number
  promoted: string[]
  dormant: string[]
  reactivated: string[]
  /** Jurors whose public record was rebuilt. */
  jurorsRecomputed: number
  /** Suggestions that stopped being offered. */
  suggestionsExpired: number
  errors: Array<{ communityId: string; error: string }>
}

export async function syncCommunityTrust(now = new Date()): Promise<TrustSyncResult> {
  const rows = await db
    .select({
      id: communities.id,
      level: communities.level,
      status: communities.status,
      trust_score: communities.trust_score,
      member_count: communities.member_count,
      jury_size: communities.jury_size,
      max_members: communities.max_members,
      currency: communities.currency,
      caps_override: communities.caps_override,
      upheld_appeal_count: communities.upheld_appeal_count,
      last_market_at: communities.last_market_at,
      resolved: sql<number>`(
        select count(*)::int from ${community_markets} m
        where m.community_id = ${communities}.id and m.status = 'resolved'
      )`,
      late: sql<number>`(
        select count(*)::int from ${community_markets} m
        where m.community_id = ${communities}.id and m.late_resolution = true
      )`,
      latest_market: sql<Date | null>`(
        select max(m.created_at) from ${community_markets} m
        where m.community_id = ${communities}.id and m.status <> 'rejected'
      )`,
    })
    .from(communities)
    .where(inArray(communities.status, ['active', 'dormant', 'paused']))

  const result: TrustSyncResult = {
    scanned: rows.length,
    promoted: [],
    dormant: [],
    reactivated: [],
    jurorsRecomputed: 0,
    suggestionsExpired: 0,
    errors: [],
  }
  const settingsByCurrency = new Map<string, Awaited<ReturnType<typeof getCommunitySettings>>>()

  for (const row of rows) {
    try {
      const currency = row.currency ?? 'KES'
      let settings = settingsByCurrency.get(currency)
      if (!settings) {
        settings = await getCommunitySettings(currency)
        settingsByCurrency.set(currency, settings)
      }
      const level: CommunityLevel = isCommunityLevel(row.level) ? row.level : 0
      const status = row.status as CommunityStatus
      const lastMarketAt = row.latest_market ? new Date(row.latest_market) : row.last_market_at
      const record = {
        resolved: row.resolved ?? 0,
        late: row.late ?? 0,
        overturned: row.upheld_appeal_count,
        rating: null,
        lastMarketAt,
        now,
      }
      const score = computeTrustScore(record)
      const nextLevel = decideLevel(level, record)
      const nextStatus = decideStatus(status, record)
      const caps = settings.levels[nextLevel]
      const maxMembers = row.caps_override?.maxMembers ?? caps.maxMembers
      const jurySize = Math.max(row.jury_size, jurySeatsForMembers(row.member_count, settings.jury.bands))

      await db.transaction(async (tx) => {
        await tx
          .update(communities)
          .set({
            trust_score: score,
            level: nextLevel,
            level_changed_at: nextLevel !== level ? now : undefined,
            status: nextStatus,
            max_members: maxMembers,
            jury_size: jurySize,
            last_market_at: lastMarketAt ?? undefined,
            updated_at: now,
          })
          .where(and(eq(communities.id, row.id), eq(communities.status, row.status)))

        if (nextLevel !== level) {
          await tx.insert(community_trust_events).values({
            community_id: row.id,
            kind: 'promoted',
            from_level: level,
            to_level: nextLevel,
            trust_before: row.trust_score,
            trust_after: score,
            reason: `${record.resolved} resolved, ${record.overturned} overturned`,
          })
          result.promoted.push(row.id)
        }
        if (nextStatus !== status) {
          await tx.insert(community_trust_events).values({
            community_id: row.id,
            kind: nextStatus === 'dormant' ? 'dormant' : 'reactivated',
            from_level: level,
            to_level: nextLevel,
            trust_before: row.trust_score,
            trust_after: score,
            reason: nextStatus === 'dormant' ? 'No market in 30 days' : 'A market opened',
          })
          ;(nextStatus === 'dormant' ? result.dormant : result.reactivated).push(row.id)
        } else if (row.trust_score !== score) {
          await tx.insert(community_trust_events).values({
            community_id: row.id,
            kind: 'trust_recomputed',
            from_level: level,
            to_level: nextLevel,
            trust_before: row.trust_score,
            trust_after: score,
            reason: null,
          })
        }
      })
    } catch (error) {
      result.errors.push({ communityId: row.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  try {
    result.suggestionsExpired = await expireSuggestions(now)
  } catch (error) {
    result.errors.push({
      communityId: '*',
      error: `suggestions: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  try {
    result.jurorsRecomputed = await recomputeAllJurorStats()
  } catch (error) {
    result.errors.push({
      communityId: '*',
      error: `juror stats: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  return result
}
