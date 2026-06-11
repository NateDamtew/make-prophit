import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { JobsAdminRepository } from '@/lib/db/queries/jobs-admin'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await JobsAdminRepository.getById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const updated = await JobsAdminRepository.retry(id)
    await recordAuditEvent({
      actor,
      action: 'sync_job.retried',
      targetType: 'job',
      targetId: id,
      summary: `Re-queued ${existing.job_type} job`,
    })
    return NextResponse.json({ success: true, data: updated ? { id: updated.id, status: updated.status } : null })
  }
  catch (error) {
    console.error('Admin sync-job retry error', error)
    return NextResponse.json({ error: 'Failed to retry job.' }, { status: 500 })
  }
}
