import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import {
  AppealError,
  getAppealView,
  previewAppealRuling,
  ruleAppeal,
  startAppealReview,
} from '@/lib/communities/appeals-service'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review') }),
  z.object({
    action: z.literal('rule'),
    ruling: z.enum(['rejected', 'upheld', 'voided']),
    text: z.string().trim().min(20).max(4_000),
  }),
])

/**
 * One appeal for the appeals desk: the appeal as the page shows it, plus
 * what each ruling would do with the money.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const preview = await previewAppealRuling(id)
    const marketId = await marketIdOf(id)
    const appeal = marketId ? await getAppealView(marketId) : null
    return NextResponse.json({ data: { appeal, preview } })
  } catch (error) {
    if (error instanceof AppealError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'appeal_not_found' ? 404 : 409 })
    }
    console.error('Admin appeal preview error', error)
    return NextResponse.json({ error: 'Failed to load the appeal.' }, { status: 500 })
  }
}

/** Move an appeal to review (asks jurors from other communities), or rule on it. */
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }
  try {
    if (parsed.data.action === 'review') {
      const appeal = await startAppealReview({ appealId: id })
      await recordAuditEvent({
        actor,
        action: 'community.appeal.review',
        targetType: 'market_appeal',
        targetId: id,
        summary: `Appeal on market ${appeal.community_market_id} sent to review`,
      })
      return NextResponse.json({ data: { status: appeal.status } })
    }
    const appeal = await ruleAppeal({
      appealId: id,
      adminId: actor.id,
      ruling: parsed.data.ruling,
      text: parsed.data.text,
    })
    await recordAuditEvent({
      actor,
      action: 'community.appeal.rule',
      targetType: 'market_appeal',
      targetId: id,
      summary: `Appeal on market ${appeal.community_market_id} ruled ${parsed.data.ruling}`,
    })
    return NextResponse.json({ data: { status: appeal.status, ruling: appeal.ruling } })
  } catch (error) {
    if (error instanceof AppealError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'appeal_not_found' ? 404 : 409 })
    }
    console.error('Admin appeal ruling error', error)
    return NextResponse.json({ error: 'Failed to rule on the appeal.' }, { status: 500 })
  }
}

async function marketIdOf(appealId: string): Promise<string | null> {
  const { db } = await import('@/lib/drizzle')
  const { market_appeals } = await import('@/lib/db/schema/communities/appeals')
  const { eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ marketId: market_appeals.community_market_id })
    .from(market_appeals)
    .where(eq(market_appeals.id, appealId))
    .limit(1)
  return row?.marketId ?? null
}
