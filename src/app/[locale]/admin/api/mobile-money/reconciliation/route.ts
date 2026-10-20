import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { ReconciliationRepository, runReconciliation } from '@/lib/ledger/reconciliation'

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  const runs = await ReconciliationRepository.listRuns(limit)
  return NextResponse.json(
    {
      data: runs.map((run) => ({
        runId: run.runId,
        ranAt: run.ranAt.toISOString(),
        checks: run.checks.map((check) => ({
          id: check.id,
          check: check.check_name,
          currency: check.currency,
          status: check.status,
          expected: check.expected,
          actual: check.actual,
          delta: check.delta,
          details: check.details,
          acknowledgedBy: check.acknowledged_by,
          acknowledgedAt: check.acknowledged_at?.toISOString() ?? null,
          note: check.note,
        })),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** Run reconciliation now (same as the nightly cron). */
export async function POST() {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const report = await runReconciliation()
    await recordAuditEvent({
      actor,
      action: 'mobile_money.reconciliation_run',
      targetType: 'reconciliation',
      targetId: report.runId,
      summary:
        report.failed.length === 0
          ? 'Reconciliation passed'
          : `Reconciliation failed: ${report.failed.map((f) => f.check).join(', ')}`,
    })
    return NextResponse.json({
      data: { runId: report.runId, failed: report.failed.length, pausedCurrencies: report.pausedCurrencies },
    })
  } catch (error) {
    console.error('Admin reconciliation run error', error)
    return NextResponse.json({ error: 'Reconciliation failed to run.' }, { status: 500 })
  }
}

const ackSchema = z.object({ id: z.string().min(10).max(40), note: z.string().trim().min(3).max(500) })

export async function PATCH(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = ackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const row = await ReconciliationRepository.acknowledge(parsed.data.id, actor.id, parsed.data.note)
  if (!row) {
    return NextResponse.json({ error: 'Check not found.' }, { status: 404 })
  }
  await recordAuditEvent({
    actor,
    action: 'mobile_money.reconciliation_acknowledged',
    targetType: 'reconciliation',
    targetId: parsed.data.id,
    summary: `${row.check_name}${row.currency ? ` (${row.currency})` : ''}: ${parsed.data.note}`,
  })
  return NextResponse.json({ data: { id: row.id, acknowledgedAt: row.acknowledged_at?.toISOString() ?? null } })
}
