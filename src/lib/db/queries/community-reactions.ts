import type { CommentReactionKind } from '@/lib/db/schema/communities/engagement'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { community_reactions } from '@/lib/db/schema/communities/engagement'
import { db } from '@/lib/drizzle'

export interface ReactionSummary {
  kind: CommentReactionKind
  count: number
  mine: boolean
}

export interface TargetSummary {
  targetId: string
  reactions: ReactionSummary[]
}

export const CommunityReactionRepository = {
  /**
   * Toggle a reaction. Returns the new state (added or removed) and the
   * updated count for the (target, kind).
   */
  async toggle(input: {
    communityId: string
    targetType: 'market' | 'comment'
    targetId: string
    userId: string
    kind: CommentReactionKind
  }): Promise<{ active: boolean }> {
    const existing = await db
      .select({ id: community_reactions.id })
      .from(community_reactions)
      .where(and(
        eq(community_reactions.target_type, input.targetType),
        eq(community_reactions.target_id, input.targetId),
        eq(community_reactions.user_id, input.userId),
        eq(community_reactions.kind, input.kind),
      ))
      .limit(1)

    if (existing.length > 0) {
      await db.delete(community_reactions).where(eq(community_reactions.id, existing[0].id))
      return { active: false }
    }

    await db.insert(community_reactions).values({
      community_id: input.communityId,
      target_type: input.targetType,
      target_id: input.targetId,
      user_id: input.userId,
      kind: input.kind,
    })
    return { active: true }
  },

  /**
   * Fetch reaction summaries for a set of targets in one round-trip. Used by
   * the market view (one target) and the comments list (many targets).
   */
  async summariseTargets(input: {
    targetType: 'market' | 'comment'
    targetIds: string[]
    viewerId?: string | null
  }): Promise<TargetSummary[]> {
    if (input.targetIds.length === 0) {
      return []
    }
    const rows = await db
      .select({
        target_id: community_reactions.target_id,
        kind: community_reactions.kind,
        count: sql<number>`count(*)::int`,
        mine: input.viewerId
          ? sql<boolean>`bool_or(${community_reactions.user_id} = ${input.viewerId})`
          : sql<boolean>`FALSE`,
      })
      .from(community_reactions)
      .where(and(
        eq(community_reactions.target_type, input.targetType),
        inArray(community_reactions.target_id, input.targetIds),
      ))
      .groupBy(community_reactions.target_id, community_reactions.kind)

    const byTarget = new Map<string, ReactionSummary[]>()
    for (const row of rows) {
      const list = byTarget.get(row.target_id) ?? []
      list.push({
        kind: row.kind as CommentReactionKind,
        count: Number(row.count),
        mine: Boolean(row.mine),
      })
      byTarget.set(row.target_id, list)
    }

    return input.targetIds.map(id => ({ targetId: id, reactions: byTarget.get(id) ?? [] }))
  },
}
