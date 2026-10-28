import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { getAdminActor } from '@/lib/admin-ui/guard'
import { listApplicationsForAdmin } from '@/lib/db/queries/applications'
import { APPLICATION_STATUSES } from '@/lib/db/schema/communities/applications'

/** Admin list of leader applications, filtered by status (`?status=pending|more_info|approved|rejected|all`). */
export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const status = new URL(request.url).searchParams.get('status') ?? 'pending'
  if (status !== 'all' && !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
  }
  try {
    const data = await listApplicationsForAdmin(status as (typeof APPLICATION_STATUSES)[number] | 'all')
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Admin applications list error', error)
    return NextResponse.json({ error: 'Failed to load applications.' }, { status: 500 })
  }
}
