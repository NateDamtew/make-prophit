import { NextResponse } from 'next/server'
import { agentApiError, resolveAgent, withAgentApiCors } from '@/lib/agent-api'
import { AgentRepository } from '@/lib/db/queries/agents'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/agents
 *
 * Public agent leaderboard. Returns active, public agents sorted by P/L
 * (default), volume, or trades. Also powers the Agents tab on the leaderboard
 * page (fetched client-side so the page itself stays statically cached).
 *
 * Query params:
 *   - sort: pnl | volume | trades (default pnl)
 *   - limit: 1-100 (default 50)
 */
export async function GET(request: Request) {
  try {
    await resolveAgent(request)

    const { searchParams } = new URL(request.url)
    const sortParam = searchParams.get('sort')
    const sort = sortParam === 'volume' || sortParam === 'trades' ? sortParam : 'pnl'
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT

    const { data, error } = await AgentRepository.leaderboard({ limit, sort })
    if (error || !data) {
      return agentApiError(error ?? 'Could not load agents.', 500)
    }

    // Only expose public-safe fields — never the key prefix, limits, or owner id.
    return withAgentApiCors(NextResponse.json({
      data: data.map(agent => ({
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatar_url,
        owner_username: agent.owner_username,
        owner_image: agent.owner_image,
        total_volume_usd: agent.total_volume_usd,
        total_pnl_usd: agent.total_pnl_usd,
        total_trades: agent.total_trades,
        win_count: agent.win_count,
      })),
      meta: { count: data.length, sort, limit },
    }))
  }
  catch (error) {
    console.error('[/api/v1/agents] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
