/**
 * Cron job: handle community markets that have passed their resolution date.
 *
 * For each active community market past its resolution_date:
 *   1. Call resolveMarket() — if jury has reached consensus, this resolves normally
 *   2. If 72h have passed without consensus → auto-cancel (refund holders)
 *
 * This prevents markets from staying "pending resolution" forever when
 * jurors don't vote.
 */

import { and, eq, isNotNull, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth-cron'
import { CommunityRepository } from '@/lib/db/queries/community'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

export const maxDuration = 120

const AUTO_CANCEL_GRACE_HOURS = 72

async function runSync() {
  const now = new Date()
  const cancelCutoff = new Date(now.getTime() - AUTO_CANCEL_GRACE_HOURS * 3600 * 1000)

  // Find markets past resolution_date that are still active
  const dueMarkets = await db
    .select({
      id: community_markets.id,
      title: community_markets.title,
      community_id: community_markets.community_id,
      resolution_date: community_markets.resolution_date,
      jury_size: communities.jury_size,
    })
    .from(community_markets)
    .innerJoin(communities, eq(community_markets.community_id, communities.id))
    .where(and(
      eq(community_markets.status, 'active'),
      isNotNull(community_markets.resolution_date),
      lte(community_markets.resolution_date, now),
    ))

  let resolved = 0
  let cancelled = 0
  const errors: string[] = []

  for (const market of dueMarkets) {
    try {
      // Try to resolve via jury consensus
      const result = await CommunityRepository.resolveMarket(market.id, market.jury_size)
      if (result.status === 'resolved') {
        resolved += 1
        continue
      }

      // No consensus yet — check if past grace period
      if (market.resolution_date && market.resolution_date <= cancelCutoff) {
        // Auto-cancel: members refunded, no winners
        await db
          .update(community_markets)
          .set({
            status: 'cancelled',
            resolved_outcome: 'cancelled',
            resolved_at: now,
            updated_at: now,
          })
          .where(eq(community_markets.id, market.id))
        cancelled += 1
      }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Market ${market.id}: ${msg}`)
    }
  }

  return {
    success: true,
    checked: dueMarkets.length,
    resolved,
    cancelled,
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
    console.error('[sync/community-resolutions] Failed:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
