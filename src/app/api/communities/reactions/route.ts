import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordCommunityEvent } from '@/lib/communities/events'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/communities/rate-limit'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityCommentRepository } from '@/lib/db/queries/community-comments'
import { CommunityReactionRepository } from '@/lib/db/queries/community-reactions'
import { UserRepository } from '@/lib/db/queries/user'
import { COMMENT_REACTION_KINDS } from '@/lib/db/schema/communities/engagement'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

const toggleSchema = z.object({
  target_type: z.enum(['market', 'comment']),
  target_id: z.string().length(26),
  kind: z.enum(COMMENT_REACTION_KINDS),
})

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

/**
 * Toggle a reaction on a market or comment. Requires community membership.
 * Idempotent in effect: hitting twice returns the original state.
 */
export async function POST(request: NextRequest) {
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to react.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  // Resolve community_id from the target so we can verify membership.
  let communityId: string | null = null
  if (parsed.data.target_type === 'market') {
    const [row] = await db
      .select({ community_id: community_markets.community_id })
      .from(community_markets)
      .where(eq(community_markets.id, parsed.data.target_id))
      .limit(1)
    communityId = row?.community_id ?? null
  }
  else {
    const comment = await CommunityCommentRepository.getById(parsed.data.target_id)
    communityId = comment?.community_id ?? null
    if (comment?.deleted_at) {
      return NextResponse.json({ error: 'Cannot react to a deleted comment.' }, { status: 400 })
    }
  }
  if (!communityId) {
    return NextResponse.json({ error: 'Target not found.' }, { status: 404 })
  }

  const { data: role } = await CommunityRepository.getMemberRole(communityId, viewer.id)
  if (!role) {
    return NextResponse.json({ error: 'Join the community to react.' }, { status: 403 })
  }

  const rl = consumeRateLimit(`reactions:${viewer.id}`, RATE_LIMITS.reactions)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many reactions. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const result = await CommunityReactionRepository.toggle({
      communityId,
      targetType: parsed.data.target_type,
      targetId: parsed.data.target_id,
      userId: viewer.id,
      kind: parsed.data.kind,
    })

    // Only log additions; removals would be noise in the activity feed.
    if (result.active) {
      await recordCommunityEvent({
        communityId,
        actor: { id: viewer.id, label: actorLabel(viewer) },
        kind: 'reaction.added',
        targetType: parsed.data.target_type,
        targetId: parsed.data.target_id,
        payload: { kind: parsed.data.kind },
      })
    }

    return NextResponse.json({ active: result.active })
  }
  catch (error) {
    console.error('Toggle community reaction error', error)
    return NextResponse.json({ error: 'Failed to update reaction.' }, { status: 500 })
  }
}
