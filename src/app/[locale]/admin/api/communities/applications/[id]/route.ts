import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { getApplicationById, reviewApplication } from '@/lib/db/queries/applications'
import { CommunityRepository } from '@/lib/db/queries/community'

const bodySchema = z.object({
  action: z.enum(['approve', 'more_info', 'reject']),
  startLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  note: z.string().trim().max(1_000).optional().nullable(),
})

/**
 * Rule on a leader application. Approving creates the community at the
 * chosen level with the applicant as its leader (admin + juror seat).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
  const application = await getApplicationById(id)
  if (!application) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  }
  if (application.status !== 'pending' && application.status !== 'more_info') {
    return NextResponse.json({ error: 'This application has already been decided.' }, { status: 409 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const note = parsed.data.note?.trim() || null

  try {
    if (parsed.data.action === 'approve') {
      const taken = await CommunityRepository.getBySlug(application.slug)
      if (taken.data) {
        return NextResponse.json({ error: `The address /community/${application.slug} is taken.` }, { status: 409 })
      }
      const level = parsed.data.startLevel ?? 0
      const created = await CommunityRepository.create({
        name: application.name,
        slug: application.slug,
        description: application.description,
        type: 'public',
        jury_size: 3,
        creator_id: application.user_id,
        currency: application.currency,
        level,
        leader_type: application.leader_type,
      })
      if (created.error || !created.data) {
        return NextResponse.json({ error: created.error ?? 'Could not create the community.' }, { status: 500 })
      }
      await reviewApplication({
        id,
        status: 'approved',
        note,
        startLevel: level,
        communityId: created.data.id,
        reviewerId: actor.id,
      })
      await recordAuditEvent({
        actor,
        action: 'community.application_approved',
        targetType: 'community_application',
        targetId: id,
        summary: `Approved ${application.name} at Level ${level}`,
        diff: { communityId: created.data.id, slug: created.data.slug, level },
      })
      return NextResponse.json({ data: { communityId: created.data.id, slug: created.data.slug } })
    }

    if (parsed.data.action === 'more_info' && !note) {
      return NextResponse.json({ error: 'Say what you need from the applicant.' }, { status: 400 })
    }
    await reviewApplication({
      id,
      status: parsed.data.action === 'more_info' ? 'more_info' : 'rejected',
      note,
      startLevel: null,
      communityId: null,
      reviewerId: actor.id,
    })
    await recordAuditEvent({
      actor,
      action: parsed.data.action === 'more_info' ? 'community.application_more_info' : 'community.application_rejected',
      targetType: 'community_application',
      targetId: id,
      summary: note ?? application.name,
    })
    return NextResponse.json({ data: { status: parsed.data.action === 'more_info' ? 'more_info' : 'rejected' } })
  } catch (error) {
    console.error('Admin application review error', error)
    return NextResponse.json({ error: 'Failed to review the application.' }, { status: 500 })
  }
}
