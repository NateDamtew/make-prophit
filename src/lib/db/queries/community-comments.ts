import type { CommunityCommentRow } from '@/lib/db/schema/communities/engagement'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { users } from '@/lib/db/schema/auth/tables'
import { community_comments, community_reactions } from '@/lib/db/schema/communities/engagement'
import { db } from '@/lib/drizzle'

export interface CommentTree {
  id: string
  market_id: string
  community_id: string
  user_id: string
  parent_id: string | null
  body: string
  edited_at: string | null
  deleted_at: string | null
  reply_count: number
  reaction_count: number
  created_at: string
  author: {
    username: string | null
    image: string | null
  }
  /** Reactions: map of kind -> { count, mine }. */
  reactions: Record<string, { count: number, mine: boolean }>
  /** One level of replies, oldest-first. */
  replies: CommentTree[]
}

export interface ListCommentsParams {
  marketId: string
  limit?: number
  offset?: number
  /** When provided, includes a `mine: true` flag on the viewer's reactions. */
  viewerId?: string | null
}

/**
 * Soft-delete: keep the row, blank the body, mark deleted_at. Preserves the
 * thread shape so replies don't orphan.
 */
const DELETED_BODY = '[deleted]'

function serializeReactionMap(
  rows: Array<{ target_id: string, kind: string, user_id: string }>,
  viewerId: string | null | undefined,
): Map<string, Record<string, { count: number, mine: boolean }>> {
  const map = new Map<string, Record<string, { count: number, mine: boolean }>>()
  for (const row of rows) {
    const forTarget = map.get(row.target_id) ?? {}
    const slot = forTarget[row.kind] ?? { count: 0, mine: false }
    slot.count += 1
    if (viewerId && row.user_id === viewerId) {
      slot.mine = true
    }
    forTarget[row.kind] = slot
    map.set(row.target_id, forTarget)
  }
  return map
}

export const CommunityCommentRepository = {
  /**
   * Returns top-level comments newest-first, each with their replies attached
   * oldest-first (so the conversation reads top-down). Reactions are folded in
   * for both top-level and reply rows in a single second query.
   */
  async listForMarket({ marketId, limit = 50, offset = 0, viewerId }: ListCommentsParams): Promise<{
    items: CommentTree[]
    totalCount: number
  }> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100)

    // Top-level comments (newest-first). We don't filter out deleted ones —
    // the UI renders them as "[deleted]" with replies still intact.
    const topLevelRows = await db
      .select({
        id: community_comments.id,
        market_id: community_comments.market_id,
        community_id: community_comments.community_id,
        user_id: community_comments.user_id,
        parent_id: community_comments.parent_id,
        body: community_comments.body,
        edited_at: community_comments.edited_at,
        deleted_at: community_comments.deleted_at,
        reply_count: community_comments.reply_count,
        reaction_count: community_comments.reaction_count,
        created_at: community_comments.created_at,
        author_username: users.username,
        author_image: users.image,
      })
      .from(community_comments)
      .leftJoin(users, eq(community_comments.user_id, users.id))
      .where(and(eq(community_comments.market_id, marketId), isNull(community_comments.parent_id)))
      .orderBy(sql`${community_comments.created_at} DESC`)
      .limit(boundedLimit)
      .offset(Math.max(offset, 0))

    const topLevelIds = topLevelRows.map(r => r.id)

    // Replies for those top-level comments (oldest-first per thread).
    const replyRows = topLevelIds.length === 0
      ? []
      : await db
          .select({
            id: community_comments.id,
            market_id: community_comments.market_id,
            community_id: community_comments.community_id,
            user_id: community_comments.user_id,
            parent_id: community_comments.parent_id,
            body: community_comments.body,
            edited_at: community_comments.edited_at,
            deleted_at: community_comments.deleted_at,
            reply_count: community_comments.reply_count,
            reaction_count: community_comments.reaction_count,
            created_at: community_comments.created_at,
            author_username: users.username,
            author_image: users.image,
          })
          .from(community_comments)
          .leftJoin(users, eq(community_comments.user_id, users.id))
          .where(inArray(community_comments.parent_id, topLevelIds))
          .orderBy(asc(community_comments.created_at))

    // Reactions for the union of all comment ids.
    const allIds = [...topLevelIds, ...replyRows.map(r => r.id)]
    const reactionRows = allIds.length === 0
      ? []
      : await db
          .select({
            target_id: community_reactions.target_id,
            kind: community_reactions.kind,
            user_id: community_reactions.user_id,
          })
          .from(community_reactions)
          .where(and(
            eq(community_reactions.target_type, 'comment'),
            inArray(community_reactions.target_id, allIds),
          ))
    const reactionsByTarget = serializeReactionMap(reactionRows, viewerId)

    function toTree(row: typeof topLevelRows[number]): CommentTree {
      return {
        id: row.id,
        market_id: row.market_id,
        community_id: row.community_id,
        user_id: row.user_id,
        parent_id: row.parent_id,
        body: row.deleted_at ? DELETED_BODY : row.body,
        edited_at: row.edited_at ? row.edited_at.toISOString() : null,
        deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
        reply_count: row.reply_count,
        reaction_count: row.reaction_count,
        created_at: row.created_at.toISOString(),
        author: { username: row.author_username, image: row.author_image },
        reactions: reactionsByTarget.get(row.id) ?? {},
        replies: [],
      }
    }

    const repliesByParent = new Map<string, CommentTree[]>()
    for (const reply of replyRows) {
      const tree = toTree(reply)
      const list = repliesByParent.get(reply.parent_id!) ?? []
      list.push(tree)
      repliesByParent.set(reply.parent_id!, list)
    }

    const items = topLevelRows.map((row) => {
      const tree = toTree(row)
      tree.replies = repliesByParent.get(row.id) ?? []
      return tree
    })

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(community_comments)
      .where(and(eq(community_comments.market_id, marketId), isNull(community_comments.parent_id)))

    return { items, totalCount: Number(count) }
  },

  async getById(id: string): Promise<CommunityCommentRow | null> {
    const [row] = await db.select().from(community_comments).where(eq(community_comments.id, id)).limit(1)
    return row ?? null
  },

  async create(input: {
    marketId: string
    communityId: string
    userId: string
    parentId: string | null
    body: string
  }): Promise<CommunityCommentRow> {
    const [row] = await db
      .insert(community_comments)
      .values({
        market_id: input.marketId,
        community_id: input.communityId,
        user_id: input.userId,
        parent_id: input.parentId,
        body: input.body,
      })
      .returning()
    return row
  },

  async edit(id: string, body: string): Promise<CommunityCommentRow | null> {
    const [row] = await db
      .update(community_comments)
      .set({ body, edited_at: new Date() })
      .where(eq(community_comments.id, id))
      .returning()
    return row ?? null
  },

  async softDelete(id: string): Promise<CommunityCommentRow | null> {
    const [row] = await db
      .update(community_comments)
      .set({ deleted_at: new Date(), body: DELETED_BODY })
      .where(eq(community_comments.id, id))
      .returning()
    return row ?? null
  },
}
