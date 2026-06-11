import type { NextRequest } from 'next/server'
import type { SyncJobStatus } from '@/lib/admin-ui/job-status'
import { NextResponse } from 'next/server'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { SYNC_JOB_STATUSES } from '@/lib/admin-ui/job-status'
import { JobsAdminRepository } from '@/lib/db/queries/jobs-admin'

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
    const statusRaw = searchParams.get('status')
    const status = statusRaw && (SYNC_JOB_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as SyncJobStatus)
      : 'all'

    const [{ rows, totalCount }, stats] = await Promise.all([
      JobsAdminRepository.list({ limit, offset: pageIndex * limit, search, status }),
      JobsAdminRepository.stats(),
    ])

    const data = rows.map(row => ({
      id: row.id,
      job_type: row.job_type,
      dedupe_key: row.dedupe_key,
      status: row.status,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      last_error: row.last_error,
      available_at: row.available_at?.toISOString() ?? null,
      updated_at: row.updated_at.toISOString(),
    }))

    return NextResponse.json({ data, totalCount, stats })
  }
  catch (error) {
    console.error('Admin sync-jobs list error', error)
    return NextResponse.json({ error: 'Failed to load jobs.' }, { status: 500 })
  }
}
