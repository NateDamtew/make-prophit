import type { NextRequest } from 'next/server'
import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'
import { WAITLIST_STATUSES } from '@/lib/db/schema/waitlist/tables'

function csvCell(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status')
  const status: WaitlistStatus | 'all'
    = statusParam && (WAITLIST_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as WaitlistStatus)
      : 'all'

  try {
    const rows = await WaitlistAdminRepository.allForExport(status)

    const header = ['email', 'name', 'role', 'country', 'status', 'invited_at', 'invited_by', 'created_at']
    const lines = [header.join(',')]
    for (const row of rows) {
      lines.push([
        csvCell(row.email),
        csvCell(row.name),
        csvCell(row.role),
        csvCell(row.country),
        csvCell(row.status),
        csvCell(row.invited_at ? row.invited_at.toISOString() : ''),
        csvCell(row.invited_by),
        csvCell(row.created_at.toISOString()),
      ].join(','))
    }

    await recordAuditEvent({
      actor,
      action: 'waitlist.exported',
      targetType: 'waitlist',
      summary: `Exported ${rows.length} waitlist rows (${status})`,
    })

    const filename = `waitlist-${status}-${new Date().toISOString().slice(0, 10)}.csv`
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }
  catch (error) {
    console.error('Admin waitlist export error', error)
    return new Response('Failed to export waitlist', { status: 500 })
  }
}
