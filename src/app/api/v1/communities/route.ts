import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentApiError, withAgentApiCors } from '@/lib/agent-api'
import { CommunityDiscoveryRepository } from '@/lib/db/queries/community-discovery'

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/communities
 *
 * Public, CORS-enabled community discovery (mirrors the web /communities
 * surface). Query params:
 *   - category: filter by category slug (default: trending sort)
 *   - limit: 1-50 (default 30)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = (searchParams.get('category') ?? '').trim()
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 30

    const [rows, categories] = await Promise.all([
      category
        ? CommunityDiscoveryRepository.listByCategory(category, limit)
        : CommunityDiscoveryRepository.listTrending(limit),
      CommunityDiscoveryRepository.listCategories(20),
    ])

    return withAgentApiCors(NextResponse.json({
      data: rows.map(row => ({
        slug: row.slug,
        name: row.name,
        description: row.description,
        icon: row.icon_url,
        banner: row.banner_url,
        memberCount: row.member_count,
        marketCount: row.market_count,
        rating: row.average_rating ? Number(row.average_rating) : null,
        reviewCount: row.review_count,
        jurySize: row.jury_size,
        verified: row.is_verified,
        creator: row.creator_username
          ? { username: row.creator_username, image: row.creator_image }
          : null,
      })),
      categories: categories.map(c => ({
        slug: c.slug,
        communityCount: c.community_count,
        marketCount: c.market_count,
      })),
    }))
  }
  catch (error) {
    console.error('[/api/v1/communities] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
