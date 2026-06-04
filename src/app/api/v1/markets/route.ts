import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { buildEmbedEvent } from '@/app/api/embed/_utils'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { agentApiError, resolveAgent, withAgentApiCors } from '@/lib/agent-api'
import { EventRepository } from '@/lib/db/queries/event'

type SupportedLocale = typeof SUPPORTED_LOCALES[number]

function normalizeLocale(raw: string | null): SupportedLocale {
  const value = (raw ?? DEFAULT_LOCALE).trim()
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? value as SupportedLocale
    : DEFAULT_LOCALE
}

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25

function parseIntParam(value: string | null, fallback: number, max: number, min = 0) {
  if (value === null) {
    return fallback
  }
  const num = Number.parseInt(value, 10)
  if (!Number.isFinite(num) || num < min) {
    return fallback
  }
  return Math.min(num, max)
}

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/markets
 *
 * Public, CORS-enabled list of active prediction markets. Anonymous access is
 * fine; sending `Authorization: Bearer <agent_key>` enables per-agent attribution
 * (so we can later raise rate limits for known agents).
 *
 * Query params:
 *   - tag: filter by category slug (default: "trending")
 *   - search: text search across titles
 *   - limit: 1-100 (default 25)
 *   - offset: pagination offset
 *   - status: active | resolved | all (default active)
 *   - locale: i18n locale (default en)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth is optional. We still call resolveAgent so the agent's last-active
    // timestamp updates and (later) we can scope rate limits.
    await resolveAgent(request)

    const { searchParams } = new URL(request.url)
    const tag = (searchParams.get('tag') ?? 'trending').trim() || 'trending'
    const search = (searchParams.get('search') ?? '').trim()
    const limit = parseIntParam(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT, 1)
    const offset = parseIntParam(searchParams.get('offset'), 0, 10_000, 0)
    const rawStatus = (searchParams.get('status') ?? 'active').trim().toLowerCase()
    const status = rawStatus === 'resolved' || rawStatus === 'all'
      ? rawStatus
      : 'active'
    const locale = normalizeLocale(searchParams.get('locale'))

    const { data: events, error } = await EventRepository.listEvents({
      tag,
      search,
      limit,
      offset,
      status: status as 'active' | 'resolved' | 'all',
      locale,
    })

    if (error || !events) {
      return agentApiError(error ?? 'Could not load markets.', 500)
    }

    return withAgentApiCors(NextResponse.json({
      data: events.map(buildEmbedEvent),
      meta: {
        count: events.length,
        limit,
        offset,
        tag,
        status,
      },
    }))
  }
  catch (error) {
    console.error('[/api/v1/markets] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
