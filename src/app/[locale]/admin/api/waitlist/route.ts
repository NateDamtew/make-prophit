import type { NextRequest } from 'next/server'
import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { NextResponse } from 'next/server'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'
import { WAITLIST_STATUSES } from '@/lib/db/schema/waitlist/tables'

function parseStatus(value: string | null): WaitlistStatus | 'all' {
  if (value && (WAITLIST_STATUSES as readonly string[]).includes(value)) {
    return value as WaitlistStatus
  }
  return 'all'
}

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)

    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)
    const offset = pageIndex * limit
    const search = searchParams.get('search') || undefined
    const status = parseStatus(searchParams.get('status'))
    const sortByRaw = searchParams.get('sortBy') || 'created_at'
    const sortBy = (['email', 'created_at', 'status'].includes(sortByRaw) ? sortByRaw : 'created_at') as
      'email' | 'created_at' | 'status'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    const [{ rows, totalCount }, stats] = await Promise.all([
      WaitlistAdminRepository.list({ limit, offset, search, status, sortBy, sortOrder }),
      WaitlistAdminRepository.stats(),
    ])

    const data = rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      country: row.country,
      status: row.status,
      invited_at: row.invited_at ? row.invited_at.toISOString() : null,
      invited_by: row.invited_by,
      notes: row.notes,
      created_at: row.created_at.toISOString(),
    }))

    return NextResponse.json({ data, totalCount, stats })
  }
  catch (error) {
    console.error('Admin waitlist list error', error)
    return NextResponse.json({ error: 'Failed to load waitlist.' }, { status: 500 })
  }
}
