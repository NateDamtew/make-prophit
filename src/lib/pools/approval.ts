import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { recordCommunityEvent } from '@/lib/communities/events'
import { notifyMarketApproved } from '@/lib/community-notifications'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'
import { openPoolForMarket } from '@/lib/pools/service'

/**
 * Approval path for pool-tier communities: no on-chain draft, no signer wallet.
 * The market goes live immediately with a pool in the community's currency.
 */
export async function approveAsPoolMarket(params: {
  market: typeof community_markets.$inferSelect
  community: { id: string; slug: string; tier?: string | null; currency?: string | null }
  reviewer: { id: string; username?: string | null; name?: string | null }
  communitySlug: string
  edits: {
    title?: string
    description?: string
    resolution_source?: string
    resolution_rules?: string
    resolution_date?: string
  }
}) {
  const { market, reviewer, communitySlug, edits } = params
  const finalTitle = (edits.title ?? market.title).trim()
  const finalDate = edits.resolution_date ? new Date(edits.resolution_date) : market.resolution_date
  if (!finalDate) {
    return { error: 'Resolution date is required.', data: null }
  }

  const [updated] = await db
    .update(community_markets)
    .set({
      title: finalTitle,
      description: edits.description ?? market.description,
      resolution_source: edits.resolution_source ?? market.resolution_source,
      resolution_rules: (edits.resolution_rules ?? market.resolution_rules ?? '').trim() || null,
      resolution_date: finalDate,
      engine: 'pool',
      status: 'active',
      // Live immediately: no deploy stage for pools.
      review_status: null,
      reviewed_by: reviewer.id,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(community_markets.id, market.id))
    .returning()
  if (!updated) {
    return { error: 'Market not found.', data: null }
  }

  const pool = await openPoolForMarket({
    communityMarketId: market.id,
    communityId: market.community_id,
    closesAt: finalDate,
    currency: params.community.currency ?? undefined,
  })

  await notifyMarketApproved({ communityAdminId: market.created_by, communitySlug, marketTitle: finalTitle })
  await recordCommunityEvent({
    communityId: market.community_id,
    actor: { id: reviewer.id, label: reviewer.username || reviewer.name || 'Super admin' },
    kind: 'market.created',
    targetType: 'market',
    targetId: market.id,
    payload: {
      stage: 'approved',
      engine: 'pool',
      poolId: pool.id,
      title: finalTitle,
      submitted_at: market.submitted_at?.toISOString() ?? null,
    },
  })

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath('/admin/communities/review', 'layout')
  return { error: null, data: { market: updated, eventCreationDraftId: null, poolId: pool.id } }
}
