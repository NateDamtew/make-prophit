import type { NextRequest } from 'next/server'

import { desc, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { AppealStatus } from '@/lib/db/schema/communities/appeals'

import { getAdminActor } from '@/lib/admin-ui/guard'
import { users } from '@/lib/db/schema/auth/tables'
import { market_appeals } from '@/lib/db/schema/communities/appeals'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

/**
 * The appeals desk list: every appeal with its market, community, filer
 * and where it stands. `?status=live|review|decided|all` (live = still
 * gathering backers; review = threshold met or under review).
 */
export interface AdminAppealRow {
  id: string
  status: AppealStatus
  marketId: string
  marketTitle: string
  communityId: string
  communityName: string
  communitySlug: string
  communityLevel: number
  filerUsername: string | null
  originalOutcome: 'yes' | 'no'
  claimedOutcome: 'yes' | 'no' | 'cancelled'
  backerCount: number
  backersNeeded: number
  escrowTotalMinor: string
  escrowTargetMinor: string
  currency: string
  windowEndsAt: string
  thresholdMetAt: string | null
  ruling: 'rejected' | 'upheld' | 'voided' | null
  ruledAt: string | null
  createdAt: string
}

const FILTERS: Record<string, AppealStatus[] | null> = {
  live: ['open'],
  review: ['threshold_met', 'under_review'],
  decided: ['rejected', 'upheld', 'voided', 'withdrawn', 'expired'],
  all: null,
}

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const status = new URL(request.url).searchParams.get('status') ?? 'review'
  if (!(status in FILTERS)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
  }
  const statuses = FILTERS[status]
  try {
    const rows = await db
      .select({
        id: market_appeals.id,
        status: market_appeals.status,
        marketId: market_appeals.community_market_id,
        marketTitle: community_markets.title,
        communityId: communities.id,
        communityName: communities.name,
        communitySlug: communities.slug,
        communityLevel: communities.level,
        filerUsername: users.username,
        originalOutcome: market_appeals.original_outcome,
        claimedOutcome: market_appeals.claimed_outcome,
        backerCount: market_appeals.backer_count,
        backersNeeded: market_appeals.backers_needed,
        escrowTotal: market_appeals.escrow_total,
        escrowTarget: market_appeals.escrow_target,
        currency: market_appeals.currency,
        windowEndsAt: market_appeals.window_ends_at,
        thresholdMetAt: market_appeals.threshold_met_at,
        ruling: market_appeals.ruling,
        ruledAt: market_appeals.ruled_at,
        createdAt: market_appeals.created_at,
      })
      .from(market_appeals)
      .innerJoin(community_markets, eq(community_markets.id, market_appeals.community_market_id))
      .innerJoin(communities, eq(communities.id, community_markets.community_id))
      .leftJoin(users, eq(users.id, market_appeals.filed_by))
      .where(statuses ? inArray(market_appeals.status, statuses) : undefined)
      .orderBy(desc(market_appeals.created_at))
      .limit(200)
    const [counts] = await db
      .select({
        live: sql<number>`count(*) FILTER (WHERE ${market_appeals.status} = 'open')::int`,
        review: sql<number>`count(*) FILTER (WHERE ${market_appeals.status} IN ('threshold_met', 'under_review'))::int`,
        overdue: sql<number>`count(*) FILTER (WHERE ${market_appeals.status} IN ('threshold_met', 'under_review') AND ${market_appeals.threshold_met_at} < now() - interval '48 hours')::int`,
        decided30d: sql<number>`count(*) FILTER (WHERE ${market_appeals.ruled_at} > now() - interval '30 days')::int`,
        upheld30d: sql<number>`count(*) FILTER (WHERE ${market_appeals.ruling} = 'upheld' AND ${market_appeals.ruled_at} > now() - interval '30 days')::int`,
      })
      .from(market_appeals)
    const data: AdminAppealRow[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      marketId: row.marketId,
      marketTitle: row.marketTitle,
      communityId: row.communityId,
      communityName: row.communityName,
      communitySlug: row.communitySlug,
      communityLevel: row.communityLevel,
      filerUsername: row.filerUsername,
      originalOutcome: row.originalOutcome,
      claimedOutcome: row.claimedOutcome,
      backerCount: row.backerCount,
      backersNeeded: row.backersNeeded,
      escrowTotalMinor: row.escrowTotal.toString(),
      escrowTargetMinor: row.escrowTarget.toString(),
      currency: row.currency,
      windowEndsAt: row.windowEndsAt.toISOString(),
      thresholdMetAt: row.thresholdMetAt?.toISOString() ?? null,
      ruling: row.ruling,
      ruledAt: row.ruledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    return NextResponse.json({ data, counts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin appeals list error', error)
    return NextResponse.json({ error: 'Failed to load appeals.' }, { status: 500 })
  }
}
