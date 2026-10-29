import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { reviewSuggestion, SuggestionError } from '@/lib/communities/suggestions'

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid date')
  .transform((value) => new Date(value))

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  edits: z
    .object({
      title: z.string().trim().min(10).max(300).optional(),
      description: z.string().trim().max(2_000).optional().nullable(),
      marketMode: z.enum(['binary', 'list']).optional(),
      outcomes: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
      resolutionRules: z.string().trim().max(4_000).optional().nullable(),
      resolutionSource: z.string().trim().max(500).optional().nullable(),
      sourceUrl: z.string().trim().url().optional().nullable(),
      closesAt: isoDate.optional().nullable(),
      eventAt: isoDate.optional().nullable(),
      mainCategorySlug: z.string().trim().max(100).optional().nullable(),
      categorySlugs: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    })
    .optional(),
  targetCommunityIds: z.array(z.string().length(26)).max(50).optional(),
  note: z.string().trim().max(1_000).optional().nullable(),
})

/** Approve a suggestion (with edits and the communities it is offered to) or reject it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
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
  try {
    const suggestion = await reviewSuggestion({
      id,
      adminId: actor.id,
      action: parsed.data.action,
      edits: parsed.data.edits ? { ...parsed.data.edits, title: parsed.data.edits.title ?? '' } : undefined,
      targetCommunityIds: parsed.data.targetCommunityIds,
      note: parsed.data.note,
    })
    await recordAuditEvent({
      actor,
      action: parsed.data.action === 'approve' ? 'community.suggestion_approved' : 'community.suggestion_rejected',
      targetType: 'market_suggestion',
      targetId: id,
      summary: `${parsed.data.action === 'approve' ? 'Approved' : 'Rejected'} "${suggestion.title}"${
        parsed.data.targetCommunityIds?.length ? ` for ${parsed.data.targetCommunityIds.length} communities` : ''
      }`,
    })
    return NextResponse.json({ data: suggestion })
  } catch (error) {
    if (error instanceof SuggestionError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'not_found' ? 404 : 400 })
    }
    console.error('Admin suggestion review error', error)
    return NextResponse.json({ error: 'Could not save the decision.' }, { status: 500 })
  }
}
