import type { NextRequest } from 'next/server'
import type { AgentStatus } from '@/lib/admin-ui/agent-status'
import { NextResponse } from 'next/server'
import { AGENT_STATUSES } from '@/lib/admin-ui/agent-status'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { AgentsAdminRepository } from '@/lib/db/queries/agents-admin'

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
    const status = statusRaw && (AGENT_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as AgentStatus)
      : 'all'

    const [{ rows, totalCount }, stats] = await Promise.all([
      AgentsAdminRepository.list({ limit, offset: pageIndex * limit, search, status }),
      AgentsAdminRepository.stats(),
    ])

    return NextResponse.json({ data: rows, totalCount, stats })
  }
  catch (error) {
    console.error('Admin agents list error', error)
    return NextResponse.json({ error: 'Failed to load agents.' }, { status: 500 })
  }
}
