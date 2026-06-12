import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { CommunityEventsRepository } from '@/lib/db/queries/community-events'

/**
 * Public read of a community's activity log. No auth required to *read* — the
 * activity feed is part of the community surface. Mutations to the events
 * table only happen server-side via {@link recordCommunityEvent}.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)
    const result = await CommunityEventsRepository.listForCommunity(communityId, limit, pageIndex * limit)
    return NextResponse.json(result)
  }
  catch (error) {
    console.error('List community events error', error)
    return NextResponse.json({ error: 'Failed to load activity.' }, { status: 500 })
  }
}
