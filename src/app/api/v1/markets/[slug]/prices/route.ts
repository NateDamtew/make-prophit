import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { DEFAULT_LOCALE } from '@/i18n/locales'
import { agentApiError, resolveAgent, withAgentApiCors } from '@/lib/agent-api'
import { OUTCOME_INDEX } from '@/lib/constants'
import { EventRepository } from '@/lib/db/queries/event'

const PRICE_FETCH_TIMEOUT_MS = 3000

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/markets/[slug]/prices
 *
 * Price history time-series for the YES side of the first market on the event,
 * sampled at the fidelity Polymarket-style CLOBs return. Public, CORS-enabled.
 *
 * Query params:
 *   - market: token id override (default: YES of the first market)
 *   - fidelity: bucket size in seconds (default 60 for short ranges, larger for long)
 *
 * The shape matches the CLOB's own response: { history: [{ t, p }, …] } where
 * t is unix seconds and p is the price in [0, 1].
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await resolveAgent(request)

    const { slug } = await params
    const { data: event, error } = await EventRepository.getEventBySlug(slug, '', DEFAULT_LOCALE)
    if (error || !event) {
      return agentApiError(error ?? 'Market not found.', 404)
    }

    const { searchParams } = new URL(request.url)
    const explicitToken = searchParams.get('market')?.trim() || ''
    const firstMarket = event.markets[0]
    if (!firstMarket) {
      return agentApiError('Market has no outcomes.', 404)
    }
    const yesOutcome = firstMarket.outcomes.find(o => o.outcome_index === OUTCOME_INDEX.YES)
      ?? firstMarket.outcomes[0]
    const tokenId = explicitToken || yesOutcome?.token_id || ''
    if (!tokenId) {
      return agentApiError('Token id not available for this market.', 404)
    }

    const clobUrl = process.env.CLOB_URL
    if (!clobUrl) {
      return agentApiError('Price history not configured.', 503)
    }

    const url = new URL(`${clobUrl}/prices-history`)
    url.searchParams.set('market', tokenId)
    const fidelity = searchParams.get('fidelity')
    if (fidelity) {
      url.searchParams.set('fidelity', fidelity)
    }
    const startTs = searchParams.get('startTs')
    if (startTs) {
      url.searchParams.set('startTs', startTs)
    }
    const endTs = searchParams.get('endTs')
    if (endTs) {
      url.searchParams.set('endTs', endTs)
    }

    const response = await fetch(url.toString(), {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return agentApiError(`Price history unavailable (${response.status}).`, 502)
    }

    const payload = await response.json() as { history?: Array<{ t: number, p: number }> }
    return withAgentApiCors(NextResponse.json({
      data: {
        market: slug,
        token_id: tokenId,
        history: payload.history ?? [],
      },
    }))
  }
  catch (error) {
    console.error('[/api/v1/markets/[slug]/prices] error', error)
    return agentApiError('Could not load price history.', 500)
  }
}
