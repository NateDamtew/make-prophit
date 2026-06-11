import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { listAuditEvents } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)
    const search = searchParams.get('search') || undefined

    const { rows, totalCount } = await listAuditEvents({ limit, offset: pageIndex * limit, search })
    return NextResponse.json({ data: rows, totalCount })
  }
  catch (error) {
    console.error('Admin audit-log list error', error)
    return NextResponse.json({ error: 'Failed to load audit log.' }, { status: 500 })
  }
}
