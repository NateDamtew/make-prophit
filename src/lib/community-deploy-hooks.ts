/**
 * Hooks called from the event-creations cron worker to link
 * community-governed market deployments back to the community_markets row.
 *
 * The community admin → super admin approval flow creates an event_creations
 * draft with draft_payload.communityMarketId set. After the cron finishes
 * deploying, we call onCommunityDraftDeployed() to:
 *   - find the newly-created events row (by slug)
 *   - link community_markets.event_id ← events.id
 *   - mark events.community_id ← original community
 *   - mark conditions.community_governed = true so UMA sync skips it
 *   - clear community_markets.review_status (now live)
 *
 * On failure, onCommunityDraftFailed() increments deploy_attempts and
 * decides whether to retry or escalate to super admin.
 */

import { and, eq } from 'drizzle-orm'
import { CommunityRepository } from '@/lib/db/queries/community'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { conditions, events, markets } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'
import {
  notifyMarketDeployFailed,
  notifyMarketDeployed,
  notifySuperAdminsOfDeployFailure,
} from '@/lib/community-notifications'

interface DraftPayloadHints {
  communityMarketId?: string
  communityId?: string
}

function readPayloadHints(draftPayload: unknown): DraftPayloadHints {
  if (!draftPayload || typeof draftPayload !== 'object') {
    return {}
  }
  const obj = draftPayload as Record<string, unknown>
  return {
    communityMarketId: typeof obj.communityMarketId === 'string' ? obj.communityMarketId : undefined,
    communityId: typeof obj.communityId === 'string' ? obj.communityId : undefined,
  }
}

/**
 * Called when an event_creations draft finishes deploying successfully.
 * Links it back to the community if applicable.
 */
export async function onCommunityDraftDeployed(input: {
  draftId: string
  draftSlug: string | null
  draftPayload: unknown
}) {
  const hints = readPayloadHints(input.draftPayload)
  if (!hints.communityMarketId || !hints.communityId) {
    return // not a community-governed deploy
  }

  // Find the newly created event by slug
  if (!input.draftSlug) {
    console.error('[onCommunityDraftDeployed] Draft has no slug, cannot link.')
    return
  }

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, input.draftSlug))
    .limit(1)

  if (!event) {
    console.error(
      '[onCommunityDraftDeployed] Could not find deployed event by slug:',
      input.draftSlug,
    )
    return
  }

  try {
    // 1. Link community_markets → event, clear review status
    await CommunityRepository.setDeployStatus({
      marketId: hints.communityMarketId,
      status: 'deployed',
      eventId: event.id,
    })

    // 2. Mark the event as community-owned (visibility filter relies on this)
    await db
      .update(events)
      .set({ community_id: hints.communityId, updated_at: new Date() })
      .where(eq(events.id, event.id))

    // 3. Flag all conditions on this event as community-governed
    //    so UMA sync doesn't overwrite jury resolutions.
    const eventConditionIds = await db
      .select({ condition_id: markets.condition_id })
      .from(markets)
      .where(eq(markets.event_id, event.id))

    for (const { condition_id } of eventConditionIds) {
      await db
        .update(conditions)
        .set({ community_governed: true, updated_at: new Date() })
        .where(eq(conditions.id, condition_id))
    }

    console.log(
      `[onCommunityDraftDeployed] Linked community_market ${hints.communityMarketId} → event ${event.id}`,
    )

    // Notify the community admin who created this market
    const [marketRow] = await db
      .select({
        created_by: community_markets.created_by,
        title: community_markets.title,
        community_slug: communities.slug,
      })
      .from(community_markets)
      .innerJoin(communities, eq(community_markets.community_id, communities.id))
      .where(eq(community_markets.id, hints.communityMarketId))
      .limit(1)

    if (marketRow) {
      await notifyMarketDeployed({
        communityAdminId: marketRow.created_by,
        communitySlug: marketRow.community_slug,
        marketTitle: marketRow.title,
        eventSlug: input.draftSlug,
      })
    }
  }
  catch (err) {
    console.error('[onCommunityDraftDeployed] Failed to link:', err)
  }
}

/**
 * Called when an event_creations draft deployment fails.
 * Updates community_market status based on attempt count:
 *   - attempts 0 (first failure): mark 'deploy_retry' so admin sees auto-retry
 *   - attempts 1+ (after retry): mark 'deploy_failed' and notify super admin
 */
export async function onCommunityDraftFailed(input: {
  draftPayload: unknown
  error: string
  attemptsBefore: number
  exhausted: boolean
}) {
  const hints = readPayloadHints(input.draftPayload)
  if (!hints.communityMarketId) {
    return
  }

  // attempt 0 = first failure → retry
  // attempt >= 1 OR exhausted = give up, escalate
  const isFinalFailure = input.exhausted || input.attemptsBefore >= 1

  await CommunityRepository.setDeployStatus({
    marketId: hints.communityMarketId,
    status: isFinalFailure ? 'deploy_failed' : 'deploy_retry',
    error: input.error,
    incrementAttempts: true,
  })

  if (isFinalFailure) {
    console.warn(
      `[onCommunityDraftFailed] Final deploy failure for community_market ${hints.communityMarketId}: ${input.error}`,
    )

    // Look up the market + community for notification context
    const [marketRow] = await db
      .select({
        created_by: community_markets.created_by,
        title: community_markets.title,
        community_slug: communities.slug,
        community_name: communities.name,
      })
      .from(community_markets)
      .innerJoin(communities, eq(community_markets.community_id, communities.id))
      .where(eq(community_markets.id, hints.communityMarketId))
      .limit(1)

    if (marketRow) {
      // Notify community admin
      await notifyMarketDeployFailed({
        communityAdminId: marketRow.created_by,
        communitySlug: marketRow.community_slug,
        marketTitle: marketRow.title,
      })

      // Notify super admins
      await notifySuperAdminsOfDeployFailure({
        marketTitle: marketRow.title,
        communityName: marketRow.community_name,
        error: input.error,
      })
    }
  }
}

/**
 * Called when a community-governed draft is picked up by the cron and
 * deployment starts. Updates the community_market status so the community
 * admin sees 'Deploying' instead of 'Approved'.
 */
export async function onCommunityDraftDeploying(draftPayload: unknown) {
  const hints = readPayloadHints(draftPayload)
  if (!hints.communityMarketId) {
    return
  }

  // Only transition from 'approved' or 'deploy_retry' → 'deploying'
  const [market] = await db
    .select({ review_status: community_markets.review_status })
    .from(community_markets)
    .where(eq(community_markets.id, hints.communityMarketId))
    .limit(1)

  if (!market) {
    return
  }
  if (market.review_status === 'approved' || market.review_status === 'deploy_retry') {
    await CommunityRepository.setDeployStatus({
      marketId: hints.communityMarketId,
      status: 'deploying',
    })
  }
}
