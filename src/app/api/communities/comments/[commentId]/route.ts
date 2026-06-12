import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordCommunityEvent } from '@/lib/communities/events'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityCommentRepository } from '@/lib/db/queries/community-comments'
import { UserRepository } from '@/lib/db/queries/user'

const patchSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

/** Author-only edit. Re-uses the body length constraint enforced at the DB. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to edit.' }, { status: 401 })
  }

  const existing = await CommunityCommentRepository.getById(commentId)
  if (!existing || existing.deleted_at) {
    return NextResponse.json({ error: 'Comment not found.' }, { status: 404 })
  }
  if (existing.user_id !== viewer.id) {
    return NextResponse.json({ error: 'You can only edit your own comments.' }, { status: 403 })
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
    const updated = await CommunityCommentRepository.edit(commentId, parsed.data.body)
    return NextResponse.json({ data: { id: updated?.id, edited_at: updated?.edited_at?.toISOString() ?? null } })
  }
  catch (error) {
    console.error('Edit community comment error', error)
    return NextResponse.json({ error: 'Failed to edit comment.' }, { status: 500 })
  }
}

/**
 * Author can delete their own. Community admin or juror can delete any.
 * Soft-delete keeps the thread shape intact.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to delete.' }, { status: 401 })
  }

  const existing = await CommunityCommentRepository.getById(commentId)
  if (!existing || existing.deleted_at) {
    return NextResponse.json({ error: 'Comment not found.' }, { status: 404 })
  }

  const isAuthor = existing.user_id === viewer.id
  let isMod = false
  if (!isAuthor) {
    const { data: role } = await CommunityRepository.getMemberRole(existing.community_id, viewer.id)
    isMod = role === 'admin' || role === 'juror'
  }
  if (!isAuthor && !isMod) {
    return NextResponse.json({ error: 'You cannot delete this comment.' }, { status: 403 })
  }

  try {
    await CommunityCommentRepository.softDelete(commentId)
    await recordCommunityEvent({
      communityId: existing.community_id,
      actor: { id: viewer.id, label: actorLabel(viewer) },
      kind: 'comment.posted', // Reusing the kind; payload.deleted=true distinguishes
      targetType: 'comment',
      targetId: commentId,
      payload: { deleted: true, by: isAuthor ? 'author' : 'moderator' },
    })
    return NextResponse.json({ success: true })
  }
  catch (error) {
    console.error('Delete community comment error', error)
    return NextResponse.json({ error: 'Failed to delete comment.' }, { status: 500 })
  }
}
