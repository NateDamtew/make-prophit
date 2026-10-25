import { NextResponse } from 'next/server'

import { listPublicPolymarketCatalogue } from '@/lib/polymarket/public-catalogue'

/**
 * GET /api/public/polymarket/markets — the admin-curated Polymarket catalogue
 * with live prices and results, for the daily-call points game.
 *
 *   ?status=open|resolved|all   (default open)
 *   ?ids=<eventId>,<eventId>    only these events (any status)
 *   ?updatedSince=<ISO date>    only events changed since then
 *   ?limit=<n>                  up to 200
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const status = statusParam === 'resolved' || statusParam === 'all' ? statusParam : 'open'
  const eventIds = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9A-Z]{26}$/i.test(id))
  const updatedSinceRaw = url.searchParams.get('updatedSince')
  const updatedSince = updatedSinceRaw ? new Date(updatedSinceRaw) : undefined
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10)

  try {
    const events = await listPublicPolymarketCatalogue({
      status: eventIds.length > 0 ? 'all' : status,
      eventIds,
      updatedSince: updatedSince && !Number.isNaN(updatedSince.getTime()) ? updatedSince : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    })
    return NextResponse.json(
      { events, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    )
  } catch (error) {
    console.error('Failed to list public Polymarket catalogue', error)
    return NextResponse.json({ error: 'Catalogue unavailable.' }, { status: 500 })
  }
}
