import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AGENT_STATUSES } from '@/lib/admin-ui/agent-status'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { AgentsAdminRepository } from '@/lib/db/queries/agents-admin'

const patchSchema = z.object({ status: z.enum(AGENT_STATUSES) })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params
  const name = await AgentsAdminRepository.getName(id)
  if (!name) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  try {
    await AgentsAdminRepository.setStatus(id, parsed.data.status)
    await recordAuditEvent({
      actor,
      action: 'agent.status_changed',
      targetType: 'agent',
      targetId: id,
      summary: `Set agent "${name}" to "${parsed.data.status}"`,
    })
    return NextResponse.json({ success: true })
  }
  catch (error) {
    console.error('Admin agent status error', error)
    return NextResponse.json({ error: 'Failed to update agent.' }, { status: 500 })
  }
}
