import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { CommunityIntegrityRepository } from '@/lib/db/queries/community-integrity'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'

const patchSchema = z.object({
  is_verified: z.boolean().optional(),
  community_fee_bps: z.number().int().min(0).max(1000).optional(),
  fee_payout_address: z.string().trim().max(255).nullable().optional(),
  white_label: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await CommunityMonetizationRepository.getFields(id)
  if (!existing) {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
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
    const ops: Promise<unknown>[] = []
    if (parsed.data.is_verified !== undefined && parsed.data.is_verified !== existing.is_verified) {
      ops.push(CommunityMonetizationRepository.setVerified(id, parsed.data.is_verified, actor.id))
    }
    if (parsed.data.community_fee_bps !== undefined && parsed.data.community_fee_bps !== existing.community_fee_bps) {
      ops.push(CommunityMonetizationRepository.setFeeBps(id, parsed.data.community_fee_bps))
    }
    if (parsed.data.fee_payout_address !== undefined && parsed.data.fee_payout_address !== existing.fee_payout_address) {
      ops.push(CommunityMonetizationRepository.setPayoutAddress(id, parsed.data.fee_payout_address))
    }
    if (parsed.data.white_label !== undefined) {
      ops.push(CommunityIntegrityRepository.setWhiteLabel(id, parsed.data.white_label))
    }
    await Promise.all(ops)

    const after = await CommunityMonetizationRepository.getFields(id)
    await recordAuditEvent({
      actor,
      action: 'community.admin_updated',
      targetType: 'community',
      targetId: id,
      summary: 'Updated community verification / fee',
      diff: { before: existing, after },
    })

    return NextResponse.json({ data: after })
  }
  catch (error) {
    console.error('Admin community update error', error)
    return NextResponse.json({ error: 'Failed to update community.' }, { status: 500 })
  }
}
