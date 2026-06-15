import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordCommunityEvent } from '@/lib/communities/events'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityIntegrityRepository } from '@/lib/db/queries/community-integrity'
import { UserRepository } from '@/lib/db/queries/user'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

const patchSchema = z.object({
  is_pinned: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  is_archived: z.boolean().optional(),
})

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to moderate.' }, { status: 401 })
  }

  const [market] = await db
    .select({ id: community_markets.id, community_id: community_markets.community_id, title: community_markets.title })
    .from(community_markets)
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!market) {
    return NextResponse.json({ error: 'Market not found.' }, { status: 404 })
  }

  const { data: role } = await CommunityRepository.getMemberRole(market.community_id, viewer.id)
  if (role !== 'admin' && !viewer.is_admin) {
    return NextResponse.json({ error: 'Only community admins can moderate.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  try {
    const ops: Array<{ kind: string, did: string }> = []

    if (parsed.data.is_pinned !== undefined) {
      await CommunityIntegrityRepository.setPinned(marketId, parsed.data.is_pinned)
      ops.push({ kind: 'moderation.pinned', did: parsed.data.is_pinned ? 'pinned' : 'unpinned' })
    }
    if (parsed.data.is_locked !== undefined) {
      await CommunityIntegrityRepository.setLocked(marketId, parsed.data.is_locked, viewer.id)
      ops.push({ kind: 'moderation.locked', did: parsed.data.is_locked ? 'locked' : 'unlocked' })
    }
    if (parsed.data.is_archived !== undefined) {
      await CommunityIntegrityRepository.setArchived(marketId, parsed.data.is_archived, viewer.id)
      ops.push({ kind: 'moderation.archived', did: parsed.data.is_archived ? 'archived' : 'restored' })
    }

    // Log each as a market.disputed-flavored event for the activity feed.
    for (const op of ops) {
      await recordCommunityEvent({
        communityId: market.community_id,
        actor: { id: viewer.id, label: actorLabel(viewer) },
        kind: 'market.disputed',
        targetType: 'market',
        targetId: marketId,
        payload: { moderation: op.kind, did: op.did, market_title: market.title },
      })
    }

    const after = await CommunityIntegrityRepository.getModerationFields(marketId)
    return NextResponse.json({ data: after })
  }
  catch (error) {
    console.error('Moderation update error', error)
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 })
  }
}
