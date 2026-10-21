import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { FxRateRepository, refreshFxSnapshots } from '@/lib/fx/rates'

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const currency = (searchParams.get('currency') || 'KES').toUpperCase()
  const history = await FxRateRepository.history(
    currency,
    Math.min(Number.parseInt(searchParams.get('limit') || '48', 10) || 48, 500),
  )
  return NextResponse.json(
    {
      data: history.map((row) => ({
        id: row.id,
        currency: row.currency,
        ratePerUsd: Number(row.rate_per_usd),
        source: row.source,
        isOverride: row.is_override,
        fetchedAt: row.fetched_at.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** Fetch the feed now (same as the cron). */
export async function POST() {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const result = await refreshFxSnapshots()
    await recordAuditEvent({
      actor,
      action: 'mobile_money.fx_refreshed',
      targetType: 'fx',
      summary: `Refreshed rates from ${result.source}: ${result.stored.map((s) => `${s.currency}=${s.ratePerUsd}`).join(', ') || 'none'}`,
    })
    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Admin FX refresh error', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Refresh failed.' }, { status: 502 })
  }
}
