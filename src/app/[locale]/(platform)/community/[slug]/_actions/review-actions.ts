'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordCommunityEvent } from '@/lib/communities/events'
import {
  notifyMarketApproved,
  notifyMarketRejected,
  notifyMarketSubmitted,
} from '@/lib/community-notifications'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { CommunityRepository } from '@/lib/db/queries/community'
import { EventCreationRepository } from '@/lib/db/queries/event-creations'
import { UserRepository } from '@/lib/db/queries/user'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'
import { loadEventCreationSignersFromEnv } from '@/lib/event-creation-signers'

const SubmitForReviewSchema = z.object({
  mainCategorySlug: z.string().trim().optional(),
  categorySlugs: z.array(z.string().trim()).optional(),
})

/**
 * Community admin submits their draft market for super admin review.
 * Requires picking categories (needed for on-chain deployment).
 */
export async function submitMarketForReviewAction(
  marketId: string,
  communityId: string,
  communitySlug: string,
  input: z.input<typeof SubmitForReviewSchema>,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (memberRole.data !== 'admin') {
    return { error: 'Only the community owner can submit markets.', data: null }
  }

  const parsed = SubmitForReviewSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await CommunityRepository.submitForReview({
    marketId,
    mainCategorySlug: parsed.data.mainCategorySlug,
    categorySlugs: parsed.data.categorySlugs,
  })
  if (result.error) {
    return { error: result.error, data: null }
  }

  // In-app confirmation to the community admin
  if (result.data) {
    await notifyMarketSubmitted({
      communityAdminId: user.id,
      communitySlug,
      marketTitle: result.data.title,
    })
  }

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath('/admin/communities/review', 'layout')
  return { error: null, data: result.data }
}

/**
 * Super admin rejects a submitted market with feedback.
 * Market returns to draft so community admin can revise.
 */
export async function rejectMarketAction(
  marketId: string,
  communitySlug: string,
  feedback: string,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.is_admin) {
    return { error: 'Only platform admins can review markets.', data: null }
  }

  if (!feedback.trim()) {
    return { error: 'Feedback is required for rejection.', data: null }
  }

  const result = await CommunityRepository.setReviewRejected({
    marketId,
    reviewerId: user.id,
    feedback: feedback.trim(),
  })
  if (result.error) {
    return { error: result.error, data: null }
  }

  // Notify the community admin who submitted the market
  if (result.data) {
    await notifyMarketRejected({
      communityAdminId: result.data.created_by,
      communitySlug,
      marketTitle: result.data.title,
      feedback: feedback.trim(),
    })

    // Activity-feed event so the community sees rejection in their Activity
    // tab. Deliberately stays neutral in tone — feedback is private to the
    // submitting admin via the notification.
    await recordCommunityEvent({
      communityId: result.data.community_id,
      actor: {
        id: user.id,
        label: (user as any)?.username || (user as any)?.name || 'Super admin',
      },
      kind: 'market.disputed',
      targetType: 'market',
      targetId: result.data.id,
      payload: {
        stage: 'rejected',
        title: result.data.title,
      },
    })
  }

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath('/admin/communities/review', 'layout')
  return { error: null, data: result.data }
}

const ApproveSchema = z.object({
  title: z.string().trim().min(10).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  resolution_source: z.string().trim().max(500).optional(),
  resolution_rules: z.string().trim().min(20).max(2000).optional(),
  resolution_date: z.string().optional(),
})

/**
 * Super admin approves a pending market.
 * Creates an event_creations draft with status='draft' (no auto-deploy).
 * The super admin is then redirected to the admin event form to complete
 * Pre-sign + Sign & Create interactively.
 * Updates community_market.review_status='approved' and stores the draft id.
 */
export async function approveMarketAction(
  marketId: string,
  communitySlug: string,
  edits: z.input<typeof ApproveSchema> = {},
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.is_admin) {
    return { error: 'Only platform admins can approve markets.', data: null }
  }

  const parsedEdits = ApproveSchema.safeParse(edits)
  if (!parsedEdits.success) {
    return { error: parsedEdits.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  // Load the market
  const [market] = await db
    .select()
    .from(community_markets)
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!market) {
    return { error: 'Market not found.', data: null }
  }
  if (market.review_status !== 'pending') {
    return { error: 'Only pending markets can be approved.', data: null }
  }
  if (!market.main_category_slug || !market.category_slugs || market.category_slugs.length < 4) {
    return { error: 'Market is missing required categories.', data: null }
  }

  // Pick a signer wallet from configured pool
  const signers = loadEventCreationSignersFromEnv()
  if (signers.length === 0) {
    return { error: 'No deployment wallets configured. Contact infrastructure team.', data: null }
  }
  const signer = signers[0]

  // Merge edits over existing values
  const finalTitle = (parsedEdits.data.title ?? market.title).trim()
  const finalDescription = parsedEdits.data.description ?? market.description ?? ''
  const finalSource = parsedEdits.data.resolution_source ?? market.resolution_source ?? ''
  const finalRules = (parsedEdits.data.resolution_rules ?? market.resolution_rules ?? '').trim()
  const finalDate = parsedEdits.data.resolution_date
    ? new Date(parsedEdits.data.resolution_date)
    : market.resolution_date

  if (!finalDate) {
    return { error: 'Resolution date is required for deployment.', data: null }
  }

  // Build slug from title + market id suffix for uniqueness
  const baseSlug = finalTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  const slug = `${baseSlug}-${market.id.slice(-6).toLowerCase()}`

  // Build draft payload matching what the cron worker expects
  const draftPayload = {
    form: {
      title: finalTitle,
      slug,
      endDateIso: finalDate.toISOString(),
      mainCategorySlug: market.main_category_slug,
      categories: [
        { label: market.main_category_slug, slug: market.main_category_slug },
        ...market.category_slugs.map(s => ({ label: s, slug: s })),
      ],
      marketMode: 'binary',
      binaryQuestion: finalTitle,
      binaryOutcomeYes: 'Yes',
      binaryOutcomeNo: 'No',
      resolutionSource: finalSource,
      resolutionRules: finalRules,
    },
    walletAddress: signer.address,
    // Mark this as community-governed so deploy worker writes events.community_id
    // and conditions.community_governed=true after deploy
    communityMarketId: market.id,
    communityId: market.community_id,
  }

  // Create the event_creations draft (status='draft' — NOT scheduled).
  // The super admin will navigate to the admin event form and step
  // through Pre-sign + Sign & Create themselves on Polygon.
  const draftResult = await EventCreationRepository.createDraft({
    createdByUserId: user.id,
    creationMode: 'single',
    title: finalTitle,
    slug,
    deployAt: null, // no auto-deploy
    endDate: finalDate,
    draftPayload,
    mainCategorySlug: market.main_category_slug,
    categorySlugs: market.category_slugs,
  })

  if (draftResult.error || !draftResult.data) {
    return { error: draftResult.error ?? 'Failed to create deployment draft.', data: null }
  }
  // (intentionally no setExecutionState({status:'scheduled'}) here —
  // the super admin completes the deploy interactively via the admin form)

  // Mark community market as approved + link draft
  const result = await CommunityRepository.setReviewApproved({
    marketId,
    reviewerId: user.id,
    eventCreationDraftId: draftResult.data.id,
    edits: {
      title: finalTitle,
      description: finalDescription || undefined,
      resolution_source: finalSource || undefined,
      resolution_rules: finalRules,
      resolution_date: finalDate,
    },
  })

  if (result.error) {
    return { error: result.error, data: null }
  }

  // Notify the community admin
  await notifyMarketApproved({
    communityAdminId: market.created_by,
    communitySlug,
    marketTitle: finalTitle,
  })

  // Phase 1 activity feed: record the review-pipeline outcome so the
  // community's Activity tab reflects what's happening behind the scenes.
  await recordCommunityEvent({
    communityId: market.community_id,
    actor: {
      id: user.id,
      label: (user as any)?.username || (user as any)?.name || 'Super admin',
    },
    kind: 'market.created',
    targetType: 'market',
    targetId: market.id,
    payload: {
      stage: 'approved',
      title: finalTitle,
      submitted_at: market.submitted_at?.toISOString() ?? null,
    },
  })

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath('/admin/communities/review', 'layout')
  // Return the draftId so the UI can redirect the super admin to
  // /admin/events/calendar/new?draftId=XXX&mode=single&edit=1 where
  // they'll step through Pre-sign + Sign & Create.
  return {
    error: null,
    data: {
      market: result.data,
      eventCreationDraftId: draftResult.data.id,
    },
  }
}

/**
 * Super admin retries a failed deployment.
 */
export async function retryDeployAction(marketId: string, communitySlug: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.is_admin) {
    return { error: 'Only platform admins can retry deployments.', data: null }
  }

  const result = await CommunityRepository.retryDeploy(marketId)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath('/admin/communities/review', 'layout')
  return { error: null, data: result.data }
}
