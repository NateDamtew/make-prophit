import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { buildEmbedEvent } from '@/app/api/embed/_utils'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { agentApiError, resolveAgent, withAgentApiCors } from '@/lib/agent-api'
import { EventRepository } from '@/lib/db/queries/event'

type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/markets/[slug]
 *
 * Public detail view for a single event/market.
 *
 * Query params:
 *   - locale: i18n locale (default en)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await resolveAgent(request)

    const { slug } = await params
    const { searchParams } = new URL(request.url)
    const rawLocale = (searchParams.get('locale') ?? DEFAULT_LOCALE).trim()
    const locale: SupportedLocale = SUPPORTED_LOCALES.includes(rawLocale as SupportedLocale)
      ? rawLocale as SupportedLocale
      : DEFAULT_LOCALE

    const { data: event, error } = await EventRepository.getEventBySlug(slug, '', locale)
    if (error || !event) {
      return agentApiError(error ?? 'Market not found.', 404)
    }

    return withAgentApiCors(NextResponse.json({ data: buildEmbedEvent(event) }))
  }
  catch (error) {
    console.error('[/api/v1/markets/[slug]] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
