import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordCommunityEvent } from '@/lib/communities/events'
import { dispatchCommunityNotification } from '@/lib/communities/notifications'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/communities/rate-limit'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityCommentRepository } from '@/lib/db/queries/community-comments'
import { UserRepository } from '@/lib/db/queries/user'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

const createSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(2000, 'Comment is too long'),
  parent_id: z.string().length(26).nullable().optional(),
})

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

/** List comments for a market (public read; viewer optional to flag own reactions). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 100)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)

    const viewer = await UserRepository.getCurrentUser({ minimal: true })
    const result = await CommunityCommentRepository.listForMarket({
      marketId,
      limit,
      offset: pageIndex * limit,
      viewerId: viewer?.id ?? null,
    })

    return NextResponse.json(result)
  }
  catch (error) {
    console.error('List community comments error', error)
    return NextResponse.json({ error: 'Failed to load comments.' }, { status: 500 })
  }
}

/** Post a new comment or reply. Requires community membership. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params

  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  // Look up the market to find its community + verify it exists.
  const [market] = await db
    .select({ id: community_markets.id, community_id: community_markets.community_id, title: community_markets.title })
    .from(community_markets)
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!market) {
    return NextResponse.json({ error: 'Market not found.' }, { status: 404 })
  }

  // Membership / permission check.
  const { data: role } = await CommunityRepository.getMemberRole(market.community_id, viewer.id)
  if (!role) {
    return NextResponse.json({ error: 'Join the community to comment.' }, { status: 403 })
  }

  // Depth-2 cap: if posting a reply, ensure the parent is itself top-level.
  let parentAuthorId: string | null = null
  if (parsed.data.parent_id) {
    const parent = await CommunityCommentRepository.getById(parsed.data.parent_id)
    if (!parent || parent.market_id !== marketId) {
      return NextResponse.json({ error: 'Reply target not found.' }, { status: 404 })
    }
    if (parent.parent_id !== null) {
      return NextResponse.json({ error: 'Replies can only be one level deep.' }, { status: 400 })
    }
    if (parent.deleted_at) {
      return NextResponse.json({ error: 'Cannot reply to a deleted comment.' }, { status: 400 })
    }
    parentAuthorId = parent.user_id
  }

  // Rate-limit per user.
  const rl = consumeRateLimit(`comments:${viewer.id}`, RATE_LIMITS.comments)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many comments. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const created = await CommunityCommentRepository.create({
      marketId,
      communityId: market.community_id,
      userId: viewer.id,
      parentId: parsed.data.parent_id ?? null,
      body: parsed.data.body,
    })

    await recordCommunityEvent({
      communityId: market.community_id,
      actor: { id: viewer.id, label: actorLabel(viewer) },
      kind: parsed.data.parent_id ? 'comment.replied' : 'comment.posted',
      targetType: 'comment',
      targetId: created.id,
      payload: {
        market_id: marketId,
        market_title: market.title,
        parent_id: parsed.data.parent_id ?? null,
        excerpt: parsed.data.body.slice(0, 140),
      },
    })

    // Reply notification: target the parent's author (skip self-replies).
    if (parentAuthorId && parentAuthorId !== viewer.id) {
      await dispatchCommunityNotification({
        communityId: market.community_id,
        category: 'community.comment_reply',
        title: `${actorLabel(viewer)} replied to your comment`,
        description: parsed.data.body.slice(0, 140),
        link: { type: 'internal', url: `/community/markets/${marketId}`, label: 'View thread' },
        recipientUserId: parentAuthorId,
        payload: { market_id: marketId, comment_id: created.id },
      })
    }

    return NextResponse.json({ data: { id: created.id } }, { status: 201 })
  }
  catch (error) {
    console.error('Create community comment error', error)
    return NextResponse.json({ error: 'Failed to post comment.' }, { status: 500 })
  }
}
