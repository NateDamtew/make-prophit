'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import type { AdminIntentRow } from '@/lib/admin-ui/mobile-money-admin'
import type { DataTableColumnDef } from '@/lib/data-table'

import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type StateFilter = 'all' | 'open' | 'stuck' | 'completed' | 'failed' | 'rejected'
type KindFilter = 'all' | 'deposit' | 'payout'

interface IntentDetail extends AdminIntentRow {
  lastRawStatus: Record<string, unknown> | null
  reservationId: string | null
  ledgerTransactionId: string | null
  callbackEvents: Array<{
    fingerprint: string
    status: string | null
    signatureVerified: boolean
    signatureKeyId: string | null
    receivedAt: string
    payload: unknown
  }>
}

function money(minor: string, currency: string) {
  const value = BigInt(minor)
  const whole = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % 100n).toString().padStart(2, '0')
  return `${whole}.${frac} ${currency}`
}

async function fetchIntents(params: {
  pageIndex: number
  pageSize: number
  search: string
  state: StateFilter
  kind: KindFilter
}) {
  const query = new URLSearchParams({ limit: String(params.pageSize), pageIndex: String(params.pageIndex) })
  if (params.search.trim()) {
    query.set('search', params.search.trim())
  }
  if (params.state !== 'all') {
    query.set('state', params.state)
  }
  if (params.kind !== 'all') {
    query.set('kind', params.kind)
  }
  const res = await fetch(`/admin/api/mobile-money/intents?${query.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load payments (${res.status})`)
  }
  return (await res.json()) as { data: AdminIntentRow[]; totalCount: number }
}

async function fetchIntent(id: string): Promise<IntentDetail> {
  const res = await fetch(`/admin/api/mobile-money/intents/${id}`)
  if (!res.ok) {
    throw new Error(`Failed to load payment (${res.status})`)
  }
  return ((await res.json()) as { data: IntentDetail }).data
}

const columns: DataTableColumnDef<AdminIntentRow>[] = [
  {
    accessorKey: 'kind',
    id: 'kind',
    header: () => <span className="text-muted-foreground">Type</span>,
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs capitalize">
        {row.original.kind}
      </Badge>
    ),
  },
  {
    accessorKey: 'state',
    id: 'state',
    header: () => <span className="text-muted-foreground">State</span>,
    cell: ({ row }) => <StatusBadge status={row.original.state} />,
  },
  {
    accessorKey: 'amountMinor',
    id: 'amount',
    header: () => <span className="text-muted-foreground">Amount</span>,
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {money(row.original.amountMinor, row.original.currency)}
        {row.original.kind === 'payout' && row.original.feeMinor !== '0' ? (
          <span className="text-xs text-muted-foreground">
            {' '}
            (fee {money(row.original.feeMinor, row.original.currency)})
          </span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: 'userLabel',
    id: 'user',
    header: () => <span className="text-muted-foreground">User</span>,
    cell: ({ row }) => (
      <div className="text-sm">
        <div>{row.original.userLabel}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {row.original.msisdn} · {row.original.provider}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'providerStatus',
    id: 'providerStatus',
    header: () => <span className="text-muted-foreground">pawaPay</span>,
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground">
        <div>{row.original.providerStatus ?? '—'}</div>
        {row.original.failureCode && <div className="text-destructive">{row.original.failureCode}</div>}
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    id: 'createdAt',
    header: () => <span className="text-muted-foreground">Created</span>,
    cell: ({ row }) => (
      <time
        dateTime={row.original.createdAt}
        title={formatAbsolute(row.original.createdAt)}
        className="text-sm text-muted-foreground"
      >
        {formatRelativeTime(row.original.createdAt)}
      </time>
    ),
  },
]

export function PaymentsManager() {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [state, setState] = useState<StateFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: useMemo(
      () => ['admin-payments', { pageIndex, pageSize, search, state, kind }],
      [pageIndex, pageSize, search, state, kind],
    ),
    queryFn: () => fetchIntents({ pageIndex, pageSize, search, state, kind }),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Payments"
        description="Every mobile-money deposit and withdrawal, with pawaPay's view of it and the actions you can take."
      />

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        totalCount={query.data?.totalCount ?? 0}
        searchPlaceholder="Search phone, user, pawaPay id…"
        enablePagination
        enableColumnVisibility
        isLoading={query.isLoading}
        error={query.error ? (query.error as Error).message : null}
        onRetry={() => void query.refetch()}
        emptyMessage="No payments yet"
        emptyDescription="Deposits and withdrawals will appear here as users make them."
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPageIndex(0)
        }}
        sortBy="createdAt"
        sortOrder="desc"
        onSortChange={() => {}}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPageChange={setPageIndex}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPageIndex(0)
        }}
        toolbarLeftContent={
          <div className="flex items-center gap-2">
            <Select
              value={state}
              onValueChange={(value) => {
                setState(value as StateFilter)
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="stuck">Stuck (&gt;24h)</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as KindFilter)
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="payout">Payouts</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        aboveTableContent={
          query.data && query.data.data.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Click a row id below to open details and actions:</span>
              {query.data.data.slice(0, 12).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="font-mono underline-offset-2 hover:underline"
                  onClick={() => setSelectedId(row.id)}
                >
                  {row.id.slice(-6)}
                </button>
              ))}
            </div>
          ) : null
        }
      />

      {selectedId && <IntentDetailCard id={selectedId} onClose={() => setSelectedId(null)} />}
    </section>
  )
}

function IntentDetailCard({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const detail = useQuery({ queryKey: ['admin-payment', id], queryFn: () => fetchIntent(id), staleTime: 5_000 })
  const action = useMutation({
    mutationFn: async (input: { action: string; reason?: string }) => {
      const res = await fetch(`/admin/api/mobile-money/intents/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Action failed')
      }
      return json
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-payment', id] })
      void queryClient.invalidateQueries({ queryKey: ['admin-payments'] })
    },
  })
  const row = detail.data
  const isOpen = row ? row.state === 'initiated' || row.state === 'pending' : false

  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">
            {row
              ? `${row.kind === 'deposit' ? 'Deposit' : 'Payout'} ${money(row.amountMinor, row.currency)}`
              : 'Loading…'}
          </h3>
          {row && (
            <p className="font-mono text-xs text-muted-foreground">
              intent {row.id} · pawaPay {row.providerRef}
              {row.providerTransactionId ? ` · provider tx ${row.providerTransactionId}` : ''}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {detail.error && <p className="text-sm text-destructive">{(detail.error as Error).message}</p>}

      {row && (
        <>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="State">
              <StatusBadge status={row.state} />
            </Item>
            <Item label="pawaPay status">{row.providerStatus ?? '—'}</Item>
            <Item label="User">{row.userLabel}</Item>
            <Item label="Number">
              {row.msisdn} · {row.provider}
            </Item>
            <Item label="Created">{formatAbsolute(row.createdAt)}</Item>
            <Item label="Completed">{row.completedAt ? formatAbsolute(row.completedAt) : '—'}</Item>
            <Item label="Callbacks / checks">
              {row.callbackCount} / {row.statusCheckCount}
              {row.lastStatusCheckAt ? ` (last ${formatRelativeTime(row.lastStatusCheckAt)})` : ''}
            </Item>
            <Item label="Failure">
              {row.failureCode ? `${row.failureCode}${row.failureMessage ? `: ${row.failureMessage}` : ''}` : '—'}
            </Item>
            <Item label="Ledger tx">{row.ledgerTransactionId ?? '—'}</Item>
            <Item label="Reservation">{row.reservationId ?? '—'}</Item>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ action: 'recheck' })}
            >
              Re-check with pawaPay
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending || !isOpen}
              onClick={() => action.mutate({ action: 'resend_callback' })}
            >
              Resend callback
            </Button>
            {row.kind === 'payout' && (
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending || row.providerStatus !== 'ENQUEUED'}
                onClick={() => action.mutate({ action: 'fail_enqueued' })}
              >
                Cancel enqueued payout
              </Button>
            )}
          </div>

          {isOpen && (
            <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">Manual override (finance)</p>
              <p className="text-xs text-muted-foreground">
                Only after confirming with pawaPay or the provider statement. Marking completed credits or debits the
                ledger; marking failed releases any hold. Both are audit-logged with your reason.
              </p>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (required, min 3 characters)"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={action.isPending || reason.trim().length < 3}
                  onClick={() => action.mutate({ action: 'mark_failed', reason: reason.trim() })}
                >
                  Mark failed
                </Button>
                <Button
                  size="sm"
                  disabled={action.isPending || reason.trim().length < 3}
                  onClick={() => action.mutate({ action: 'mark_completed', reason: reason.trim() })}
                >
                  Mark completed
                </Button>
              </div>
            </div>
          )}

          {action.error && <p className="text-sm text-destructive">{(action.error as Error).message}</p>}

          <div className="grid gap-2">
            <p className="text-sm font-medium">Callback events ({row.callbackEvents.length})</p>
            {row.callbackEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No callbacks received yet.</p>
            ) : (
              <ul className="divide-y divide-border/50 rounded-lg border border-border text-xs">
                {row.callbackEvents.map((event) => (
                  <li key={event.fingerprint} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono">{event.status ?? '—'}</span>
                    <span className={event.signatureVerified ? 'text-(--yes)' : 'text-amber-600'}>
                      {event.signatureVerified ? `signed (${event.signatureKeyId ?? 'key'})` : 'unsigned'}
                    </span>
                    <span className="text-muted-foreground">{formatAbsolute(event.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {row.lastRawStatus && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Last raw pawaPay status</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/40 p-3">
                {JSON.stringify(row.lastRawStatus, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </Card>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}
