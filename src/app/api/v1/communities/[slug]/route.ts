import type { NextRequest } from 'next/server'
import { inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { agentApiError, withAgentApiCors } from '@/lib/agent-api'
import { CommunityRepository } from '@/lib/db/queries/community'
import { events } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/communities/[slug]
 *
 * Public, CORS-enabled community detail + its publicly visible markets.
 * Deployed markets carry `eventSlug`, which links straight into the standard
 * market/trading surface; jury-only markets are display objects.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const { data: community } = await CommunityRepository.getBySlug(slug)
    if (!community || community.status !== 'active' || community.type !== 'public') {
      return agentApiError('Community not found.', 404)
    }

    const { data: markets } = await CommunityRepository.listMarkets(community.id)
    const visible = (markets ?? []).filter(m =>
      (m.status === 'active' || m.status === 'resolved')
      && m.review_status !== 'pending'
      && m.review_status !== 'rejected',
    )

    // Resolve event slugs for deployed markets so clients can link to trading.
    const eventIds = visible.map(m => m.event_id).filter((id): id is string => !!id)
    const eventRows = eventIds.length > 0
      ? await db.select({ id: events.id, slug: events.slug }).from(events).where(inArray(events.id, eventIds))
      : []
    const eventSlugById = new Map(eventRows.map(row => [row.id, row.slug]))

    return withAgentApiCors(NextResponse.json({
      data: {
        slug: community.slug,
        name: community.name,
        description: community.description,
        icon: community.icon_url,
        banner: community.banner_url,
        memberCount: community.member_count,
        jurySize: community.jury_size,
        rules: community.rules,
        markets: visible.map(m => ({
          id: m.id,
          title: m.title,
          image: m.image_url,
          description: m.description,
          status: m.status,
          mode: m.market_mode,
          resolvedOutcome: m.resolved_outcome,
          resolutionDate: m.resolution_date,
          eventSlug: m.event_id ? (eventSlugById.get(m.event_id) ?? null) : null,
        })),
      },
    }))
  }
  catch (error) {
    console.error('[/api/v1/communities/[slug]] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
