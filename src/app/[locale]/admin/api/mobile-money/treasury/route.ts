import { NextResponse } from 'next/server'

import { getAdminActor } from '@/lib/admin-ui/guard'
import { getTreasurySummary } from '@/lib/admin-ui/mobile-money-admin'

export async function GET() {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const data = await getTreasurySummary()
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin treasury summary error', error)
    return NextResponse.json({ error: 'Failed to load treasury.' }, { status: 500 })
  }
}
