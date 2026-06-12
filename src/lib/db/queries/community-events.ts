import { desc, eq, sql } from 'drizzle-orm'
import { community_events } from '@/lib/db/schema/communities/engagement'
import { db } from '@/lib/drizzle'

export interface FeedItem {
  id: string
  kind: string
  actorLabel: string | null
  actorUserId: string | null
  targetType: string | null
  targetId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export const CommunityEventsRepository = {
  async listForCommunity(communityId: string, limit = 50, offset = 0): Promise<{ items: FeedItem[], totalCount: number }> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200)

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(community_events)
        .where(eq(community_events.community_id, communityId))
        .orderBy(desc(community_events.created_at))
        .limit(boundedLimit)
        .offset(Math.max(offset, 0)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(community_events)
        .where(eq(community_events.community_id, communityId)),
    ])

    return {
      items: rows.map(row => ({
        id: row.id,
        kind: row.kind,
        actorLabel: row.actor_label,
        actorUserId: row.actor_user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        payload: row.payload ?? {},
        createdAt: row.created_at.toISOString(),
      })),
      totalCount: Number(count),
    }
  },
}
