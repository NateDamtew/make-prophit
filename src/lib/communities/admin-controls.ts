import { eq } from 'drizzle-orm'

import type { CommunityLevel, CommunityStatus, LeaderType } from '@/lib/communities/rules'

import { getCommunitySettings } from '@/lib/communities/settings'
import { community_trust_events } from '@/lib/db/schema/communities/governance'
import { communities } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

/**
 * What a Prophit admin may change on a community's trust ladder by hand:
 * level, status (pause / unpause / archive), leader type, joins. Every
 * change writes a trust event with the reason the admin gave.
 */

export interface CommunityControlPatch {
  level?: CommunityLevel
  status?: CommunityStatus
  leaderType?: LeaderType | null
  joinsPaused?: boolean
  reason?: string | null
}

export async function applyCommunityControls(
  communityId: string,
  patch: CommunityControlPatch,
  actorUserId: string,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  const [current] = await db
    .select({
      id: communities.id,
      level: communities.level,
      status: communities.status,
      leader_type: communities.leader_type,
      joins_paused: communities.joins_paused,
      trust_score: communities.trust_score,
      currency: communities.currency,
      caps_override: communities.caps_override,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)
  if (!current) {
    return null
  }
  const now = new Date()
  const reason = patch.reason?.trim() || null
  const events: Array<typeof community_trust_events.$inferInsert> = []
  const set: Partial<typeof communities.$inferInsert> = { updated_at: now }

  if (patch.level !== undefined && patch.level !== current.level) {
    const settings = await getCommunitySettings(current.currency ?? 'KES')
    set.level = patch.level
    set.level_changed_at = now
    set.max_members = current.caps_override?.maxMembers ?? settings.levels[patch.level].maxMembers
    events.push({
      community_id: communityId,
      kind: patch.level > current.level ? 'promoted' : 'demoted',
      from_level: current.level,
      to_level: patch.level,
      trust_before: current.trust_score,
      trust_after: current.trust_score,
      reason,
      actor_user_id: actorUserId,
    })
  }
  if (patch.status !== undefined && patch.status !== current.status) {
    set.status = patch.status
    set.frozen_reason = patch.status === 'paused' ? reason : null
    set.frozen_at = patch.status === 'paused' ? now : null
    events.push({
      community_id: communityId,
      kind:
        patch.status === 'paused'
          ? 'frozen'
          : current.status === 'paused'
            ? 'unfrozen'
            : patch.status === 'dormant'
              ? 'dormant'
              : 'reactivated',
      from_level: current.level,
      to_level: set.level ?? current.level,
      trust_before: current.trust_score,
      trust_after: current.trust_score,
      reason: reason ?? `Status ${current.status} → ${patch.status}`,
      actor_user_id: actorUserId,
    })
  }
  if (patch.joinsPaused !== undefined && patch.joinsPaused !== current.joins_paused) {
    set.joins_paused = patch.joinsPaused
    set.joins_paused_reason = patch.joinsPaused ? reason : null
    events.push({
      community_id: communityId,
      kind: patch.joinsPaused ? 'joins_paused' : 'joins_resumed',
      from_level: current.level,
      to_level: set.level ?? current.level,
      trust_before: current.trust_score,
      trust_after: current.trust_score,
      reason,
      actor_user_id: actorUserId,
    })
  }
  if (patch.leaderType !== undefined && patch.leaderType !== current.leader_type) {
    set.leader_type = patch.leaderType
  }

  await db.transaction(async (tx) => {
    await tx.update(communities).set(set).where(eq(communities.id, communityId))
    if (events.length > 0) {
      await tx.insert(community_trust_events).values(events)
    }
  })

  return {
    before: {
      level: current.level,
      status: current.status,
      leader_type: current.leader_type,
      joins_paused: current.joins_paused,
    },
    after: {
      level: set.level ?? current.level,
      status: set.status ?? current.status,
      leader_type: patch.leaderType !== undefined ? patch.leaderType : current.leader_type,
      joins_paused: set.joins_paused ?? current.joins_paused,
    },
  }
}
