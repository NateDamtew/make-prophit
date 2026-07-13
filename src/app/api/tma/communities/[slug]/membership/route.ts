import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { CommunityRepository } from '@/lib/db/queries/community'
import { requireTmaUser } from '../../../_lib'

/**
 * GET /api/tma/communities/[slug]/membership
 * Returns the authenticated user's role in the community, or null.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  const { slug } = await params
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
  }

  const { data: role } = await CommunityRepository.getMemberRole(community.id, guard.user.id)
  return NextResponse.json({ role: role ?? null, memberCount: community.member_count })
}

/**
 * POST /api/tma/communities/[slug]/membership
 * Body: { action: 'join' | 'leave' }. Wraps CommunityRepository.join/leave.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  const { slug } = await params
  let body: { action?: string }
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (body.action !== 'join' && body.action !== 'leave') {
    return NextResponse.json({ error: 'action must be join or leave.' }, { status: 400 })
  }

  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community || community.status !== 'active') {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
  }
  if (community.type !== 'public') {
    return NextResponse.json({ error: 'This community is invite-only.' }, { status: 403 })
  }

  const result = body.action === 'join'
    ? await CommunityRepository.join(community.id, guard.user.id)
    : await CommunityRepository.leave(community.id, guard.user.id)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const { data: role } = await CommunityRepository.getMemberRole(community.id, guard.user.id)
  return NextResponse.json({ ok: true, role: role ?? null })
}
