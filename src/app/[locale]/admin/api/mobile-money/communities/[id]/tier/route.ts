import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { setCommunityTierOverride } from '@/lib/pools/tiering'

const schema = z.object({
  override: z.enum(['pool', 'orderbook']).nullable(),
  reason: z.string().trim().min(3).max(300),
})

/**
 * Pin or unpin a community's engine tier. Pinning to orderbook requires the
 * on-chain push of jury verdicts to exist (see design §6.3); until then it
 * should only be used for communities whose markets go through the full
 * admin deploy flow.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const row = await setCommunityTierOverride(id, parsed.data.override)
  if (!row) {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
  }
  await recordAuditEvent({
    actor,
    action: 'mobile_money.community_tier_override',
    targetType: 'community',
    targetId: id,
    summary: `${parsed.data.override ? `Pinned tier to ${parsed.data.override}` : 'Removed tier override'}: ${parsed.data.reason}`,
    diff: { tier: row.tier, override: row.tier_override },
  })
  return NextResponse.json({ data: row })
}
