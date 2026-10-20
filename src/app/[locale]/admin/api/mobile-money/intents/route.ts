import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import type { PaymentIntentKind, PaymentIntentState } from '@/lib/db/schema/ledger/tables'

import { getAdminActor } from '@/lib/admin-ui/guard'
import { listAdminIntents } from '@/lib/admin-ui/mobile-money-admin'
import { PAYMENT_INTENT_KINDS, PAYMENT_INTENT_STATES } from '@/lib/db/schema/ledger/tables'

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)
    const kindParam = searchParams.get('kind')
    const stateParam = searchParams.get('state')
    const kind = PAYMENT_INTENT_KINDS.includes(kindParam as PaymentIntentKind)
      ? (kindParam as PaymentIntentKind)
      : undefined
    const state =
      stateParam === 'open' || stateParam === 'stuck'
        ? stateParam
        : PAYMENT_INTENT_STATES.includes(stateParam as PaymentIntentState)
          ? (stateParam as PaymentIntentState)
          : undefined
    const { rows, totalCount } = await listAdminIntents({
      limit,
      offset: pageIndex * limit,
      search: searchParams.get('search') || undefined,
      kind,
      state,
      currency: searchParams.get('currency') || undefined,
    })
    return NextResponse.json({ data: rows, totalCount }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin payments list error', error)
    return NextResponse.json({ error: 'Failed to load payments.' }, { status: 500 })
  }
}
