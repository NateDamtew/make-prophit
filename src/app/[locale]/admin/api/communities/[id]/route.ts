import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import type { CommunityControlPatch } from '@/lib/communities/admin-controls'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { applyCommunityControls } from '@/lib/communities/admin-controls'
import { CommunityIntegrityRepository } from '@/lib/db/queries/community-integrity'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'

const patchSchema = z.object({
  is_verified: z.boolean().optional(),
  community_fee_bps: z.number().int().min(0).max(1000).optional(),
  fee_payout_address: z.string().trim().max(255).nullable().optional(),
  white_label: z.boolean().optional(),
  // Trust ladder controls (communities v1): every change writes a trust event.
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  status: z.enum(['active', 'paused', 'dormant', 'archived']).optional(),
  leader_type: z.enum(['news', 'sports', 'creator', 'show', 'group', 'event']).nullable().optional(),
  joins_paused: z.boolean().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
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
  } catch {
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
    if (
      parsed.data.fee_payout_address !== undefined &&
      parsed.data.fee_payout_address !== existing.fee_payout_address
    ) {
      ops.push(CommunityMonetizationRepository.setPayoutAddress(id, parsed.data.fee_payout_address))
    }
    if (parsed.data.white_label !== undefined) {
      ops.push(CommunityIntegrityRepository.setWhiteLabel(id, parsed.data.white_label))
    }
    await Promise.all(ops)

    const controls: CommunityControlPatch = {}
    if (parsed.data.level !== undefined) {
      controls.level = parsed.data.level
    }
    if (parsed.data.status !== undefined) {
      controls.status = parsed.data.status
    }
    if (parsed.data.leader_type !== undefined) {
      controls.leaderType = parsed.data.leader_type
    }
    if (parsed.data.joins_paused !== undefined) {
      controls.joinsPaused = parsed.data.joins_paused
    }
    if (Object.keys(controls).length > 0) {
      controls.reason = parsed.data.reason ?? null
      const changed = await applyCommunityControls(id, controls, actor.id)
      if (changed) {
        await recordAuditEvent({
          actor,
          action: 'community.trust_controls_updated',
          targetType: 'community',
          targetId: id,
          summary: parsed.data.reason ?? 'Updated level / status / leader type / joins',
          diff: changed,
        })
      }
    }

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
  } catch (error) {
    console.error('Admin community update error', error)
    return NextResponse.json({ error: 'Failed to update community.' }, { status: 500 })
  }
}
