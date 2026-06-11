import type { NextRequest } from 'next/server'
import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'
import { WAITLIST_STATUSES } from '@/lib/db/schema/waitlist/tables'

const patchSchema = z.object({
  status: z.enum(WAITLIST_STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  const existing = await WaitlistAdminRepository.getById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 })
  }

  try {
    let updated = existing

    if (parsed.data.status && parsed.data.status !== existing.status) {
      const next = parsed.data.status as WaitlistStatus
      updated = (await WaitlistAdminRepository.updateStatus(id, next, actor.label)) ?? updated
      await recordAuditEvent({
        actor,
        action: 'waitlist.status_changed',
        targetType: 'waitlist',
        targetId: id,
        summary: `Set ${existing.email} to "${next}"`,
        diff: { from: existing.status, to: next },
      })
    }

    if (parsed.data.notes !== undefined) {
      updated = (await WaitlistAdminRepository.setNotes(id, parsed.data.notes)) ?? updated
      await recordAuditEvent({
        actor,
        action: 'waitlist.notes_updated',
        targetType: 'waitlist',
        targetId: id,
        summary: `Updated notes for ${existing.email}`,
      })
    }

    return NextResponse.json({ data: serialize(updated) })
  }
  catch (error) {
    console.error('Admin waitlist patch error', error)
    return NextResponse.json({ error: 'Failed to update entry.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params
  const existing = await WaitlistAdminRepository.getById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 })
  }

  try {
    await WaitlistAdminRepository.remove(id)
    await recordAuditEvent({
      actor,
      action: 'waitlist.deleted',
      targetType: 'waitlist',
      targetId: id,
      summary: `Deleted ${existing.email} from the waitlist`,
    })
    return NextResponse.json({ success: true })
  }
  catch (error) {
    console.error('Admin waitlist delete error', error)
    return NextResponse.json({ error: 'Failed to delete entry.' }, { status: 500 })
  }
}

function serialize(row: Awaited<ReturnType<typeof WaitlistAdminRepository.getById>>) {
  if (!row) {
    return null
  }
  return {
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
  }
}
