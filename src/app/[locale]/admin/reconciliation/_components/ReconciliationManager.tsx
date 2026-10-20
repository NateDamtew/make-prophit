'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface CheckRow {
  id: string
  check: string
  currency: string | null
  status: 'ok' | 'warn' | 'fail' | 'skipped'
  expected: string | null
  actual: string | null
  delta: string | null
  details: Record<string, unknown> | null
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  note: string | null
}

interface RunRow {
  runId: string
  ranAt: string
  checks: CheckRow[]
}

const STATUS_LABEL: Record<CheckRow['status'], string> = {
  ok: 'completed',
  warn: 'paused',
  fail: 'failed',
  skipped: 'pending',
}

async function fetchRuns(): Promise<RunRow[]> {
  const res = await fetch('/admin/api/mobile-money/reconciliation?limit=20')
  if (!res.ok) {
    throw new Error(`Failed to load reconciliation runs (${res.status})`)
  }
  return ((await res.json()) as { data: RunRow[] }).data
}

export function ReconciliationManager() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin-reconciliation'], queryFn: fetchRuns, staleTime: 15_000 })
  const runNow = useMutation({
    mutationFn: async () => {
      const res = await fetch('/admin/api/mobile-money/reconciliation', { method: 'POST' })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Run failed')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-reconciliation'] }),
  })

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Reconciliation"
        description="Nightly checks that the ledger agrees with itself, with the pools, with payment intents and with pawaPay. A failed check pauses payouts and trading for that currency until resolved."
        actions={
          <Button size="sm" disabled={runNow.isPending} onClick={() => runNow.mutate()}>
            {runNow.isPending ? 'Running…' : 'Run now'}
          </Button>
        }
      />
      {query.error && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
      {runNow.error && <p className="text-sm text-destructive">{(runNow.error as Error).message}</p>}
      {query.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No runs yet. Run now or wait for the nightly job.</p>
      )}
      {query.data?.map((run) => (
        <RunCard key={run.runId} run={run} />
      ))}
    </section>
  )
}

function RunCard({ run }: { run: RunRow }) {
  const failed = run.checks.filter((check) => check.status === 'fail').length
  const warned = run.checks.filter((check) => check.status === 'warn').length
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-5 py-3">
        <div className="text-sm">
          <span className="font-medium">{formatAbsolute(run.ranAt)}</span>
          <span className="text-muted-foreground"> · {formatRelativeTime(run.ranAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          {failed > 0 ? (
            <StatusBadge status="failed" />
          ) : warned > 0 ? (
            <StatusBadge status="paused" />
          ) : (
            <StatusBadge status="completed" />
          )}
          <span className="font-mono text-xs text-muted-foreground">{run.runId.slice(-8)}</span>
        </div>
      </div>
      <ul className="divide-y divide-border/50">
        {run.checks.map((check) => (
          <CheckItem key={check.id} check={check} />
        ))}
      </ul>
    </Card>
  )
}

function CheckItem({ check }: { check: CheckRow }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const ack = useMutation({
    mutationFn: async () => {
      const res = await fetch('/admin/api/mobile-money/reconciliation', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: check.id, note: note.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Acknowledge failed')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-reconciliation'] }),
  })
  const needsAck = (check.status === 'fail' || check.status === 'warn') && !check.acknowledgedAt
  return (
    <li className="grid gap-2 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={STATUS_LABEL[check.status]} />
          <span className="font-medium">{check.check.replace(/_/g, ' ')}</span>
          {check.currency && <span className="font-mono text-xs text-muted-foreground">{check.currency}</span>}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {check.expected !== null && <span>expected {check.expected}</span>}
          {check.actual !== null && <span> · actual {check.actual}</span>}
          {check.delta !== null && <span> · Δ {check.delta}</span>}
        </div>
      </div>
      {check.details && Object.keys(check.details).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Details</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/40 p-3">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </details>
      )}
      {check.acknowledgedAt && (
        <p className="text-xs text-muted-foreground">
          Acknowledged {formatRelativeTime(check.acknowledgedAt)}: {check.note}
        </p>
      )}
      {needsAck && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What was found / done (required)"
            className="h-9 max-w-md"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={ack.isPending || note.trim().length < 3}
            onClick={() => ack.mutate()}
          >
            Acknowledge
          </Button>
          {ack.error && <span className="text-xs text-destructive">{(ack.error as Error).message}</span>}
        </div>
      )}
    </li>
  )
}
