/**
 * Cron job: recover community markets where deploy succeeded but linking failed.
 *
 * The deploy hook (onCommunityDraftDeployed) looks up the new event by slug.
 * If it fires before the events row is written, or if a transient DB error
 * occurs, the community_market won't be linked to its event.
 *
 * This cron scans for community_markets that are in 'approved' or 'deploying'
 * status with an event_creation_draft_id but no event_id, and retries the
 * link by looking up the event by slug.
 */

import { eq, isNotNull, isNull, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth-cron'
import { onCommunityDraftDeployed } from '@/lib/community-deploy-hooks'
import { EventCreationRepository } from '@/lib/db/queries/event-creations'
import { community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

export const maxDuration = 60

async function runSync() {
  // Find community markets that should be linked but aren't yet.
  // Status 'deploying' = cron is processing
  // Status 'approved' = should be deploying
  const stuck = await db
    .select({
      id: community_markets.id,
      event_creation_draft_id: community_markets.event_creation_draft_id,
      review_status: community_markets.review_status,
    })
    .from(community_markets)
    .where(and(
      isNotNull(community_markets.event_creation_draft_id),
      isNull(community_markets.event_id),
    ))

  let linked = 0
  let stillPending = 0
  const errors: string[] = []

  for (const market of stuck) {
    if (!market.event_creation_draft_id) {
      continue
    }
    try {
      const draftResult = await EventCreationRepository.getDraftById({
        draftId: market.event_creation_draft_id,
      })
      if (draftResult.error || !draftResult.data) {
        continue
      }
      const draft = draftResult.data

      // Only retry linking if the draft has actually been deployed
      if (draft.status !== 'deployed') {
        stillPending += 1
        continue
      }

      await onCommunityDraftDeployed({
        draftId: draft.id,
        draftSlug: draft.slug,
        draftPayload: draft.draftPayload,
      })

      // Check if it was actually linked
      const [after] = await db
        .select({ event_id: community_markets.event_id })
        .from(community_markets)
        .where(eq(community_markets.id, market.id))
        .limit(1)

      if (after?.event_id) {
        linked += 1
      }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Market ${market.id}: ${msg}`)
    }
  }

  return {
    success: true,
    checked: stuck.length,
    linked,
    stillPending,
    errors,
  }
}

async function handle(request: Request) {
  const auth = request.headers.get('authorization')
  if (!isCronAuthorized(auth, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
  }
  try {
    const result = await runSync()
    return NextResponse.json(result)
  }
  catch (err) {
    console.error('[sync/community-deploy-recovery] Failed:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
