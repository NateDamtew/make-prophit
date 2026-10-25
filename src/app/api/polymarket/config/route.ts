import { NextResponse } from 'next/server'

import { UserRepository } from '@/lib/db/queries/user'
import { getPolymarketBuilderCode, resolvePolymarketTradingAccess } from '@/lib/polymarket/trading-access'

/** GET /api/polymarket/config — whether the current user may trade Polymarket markets, and the builder code. */
export async function GET(request: Request) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  const access = resolvePolymarketTradingAccess(user, request.headers)
  const builderCode = getPolymarketBuilderCode()

  return NextResponse.json(
    {
      tradingEnabled: access.allowed && Boolean(builderCode),
      reason: builderCode ? access.reason : 'disabled',
      country: access.country,
      builderCode,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
