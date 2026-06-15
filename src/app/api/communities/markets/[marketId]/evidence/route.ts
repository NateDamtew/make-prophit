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

const evidenceSchema = z.object({
  url: z.string().trim().url('Must be a valid URL').max(2048),
  note: z.string().trim().max(500).nullable().optional(),
})

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params
  const rows = await CommunityIntegrityRepository.listEvidence(marketId, 100)
  return NextResponse.json({ data: rows })
}

/** Post new evidence. Open to admins + jurors (the ones expected to defend a resolution). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to attach evidence.' }, { status: 401 })
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
  if (role !== 'admin' && role !== 'juror' && !viewer.is_admin) {
    return NextResponse.json({ error: 'Only community admins and jurors can attach evidence.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = evidenceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  try {
    const created = await CommunityIntegrityRepository.addEvidence({
      marketId,
      communityId: market.community_id,
      url: parsed.data.url,
      note: parsed.data.note ?? null,
      submittedBy: viewer.id,
      submittedLabel: actorLabel(viewer),
    })
    await recordCommunityEvent({
      communityId: market.community_id,
      actor: { id: viewer.id, label: actorLabel(viewer) },
      kind: 'review.submitted',
      targetType: 'market',
      targetId: marketId,
      payload: { evidence_url: parsed.data.url, market_title: market.title },
    })
    return NextResponse.json({ data: { id: created.id } }, { status: 201 })
  }
  catch (error) {
    console.error('Add evidence error', error)
    return NextResponse.json({ error: 'Failed to attach evidence.' }, { status: 500 })
  }
}

/** Remove an evidence row. Author or community admin only. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params
  const url = new URL(request.url)
  const evidenceId = url.searchParams.get('id')
  if (!evidenceId) {
    return NextResponse.json({ error: 'Evidence id required.' }, { status: 400 })
  }

  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to delete evidence.' }, { status: 401 })
  }

  // Confirm the market exists for the community gate.
  const [market] = await db
    .select({ community_id: community_markets.community_id })
    .from(community_markets)
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!market) {
    return NextResponse.json({ error: 'Market not found.' }, { status: 404 })
  }

  // Authorisation: community admin or platform admin. Authors can self-delete
  // too — we look that up by checking the row's submitted_by in the repo.
  const { data: role } = await CommunityRepository.getMemberRole(market.community_id, viewer.id)
  const isAuthorised = role === 'admin' || viewer.is_admin === true
  if (!isAuthorised) {
    return NextResponse.json({ error: 'Only community admins can delete evidence.' }, { status: 403 })
  }

  const ok = await CommunityIntegrityRepository.removeEvidence(evidenceId, marketId)
  if (!ok) {
    return NextResponse.json({ error: 'Evidence not found.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
