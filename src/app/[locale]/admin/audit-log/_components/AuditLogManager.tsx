'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { AuditFeedItem } from '@/lib/admin-ui/audit'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Badge } from '@/components/ui/badge'

async function fetchAuditLog(pageIndex: number, pageSize: number, search: string) {
  const params = new URLSearchParams({ limit: String(pageSize), pageIndex: String(pageIndex) })
  if (search.trim()) {
    params.set('search', search.trim())
  }
  const res = await fetch(`/admin/api/audit-log?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load audit log (${res.status})`)
  }
  return res.json() as Promise<{ data: AuditFeedItem[], totalCount: number }>
}

const columns: ColumnDef<AuditFeedItem>[] = [
  {
    accessorKey: 'action',
    id: 'action',
    header: () => <span className="text-muted-foreground">Action</span>,
    cell: ({ row }) => <Badge variant="outline" className="font-mono text-xs">{row.original.action}</Badge>,
  },
  {
    accessorKey: 'summary',
    id: 'summary',
    header: () => <span className="text-muted-foreground">Details</span>,
    cell: ({ row }) => <span className="text-sm">{row.original.summary || '—'}</span>,
  },
  {
    accessorKey: 'actorLabel',
    id: 'actor',
    header: () => <span className="text-muted-foreground">Actor</span>,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.actorLabel}</span>,
  },
  {
    accessorKey: 'createdAt',
    id: 'createdAt',
    header: () => <span className="text-muted-foreground">When</span>,
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

export function AuditLogManager() {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')

  const query = useQuery({
    queryKey: useMemo(() => ['admin-audit-log', { pageIndex, pageSize, search }], [pageIndex, pageSize, search]),
    queryFn: () => fetchAuditLog(pageIndex, pageSize, search),
    staleTime: 15_000,
  })

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Audit Log"
        description="Every mutating admin action — who did what, and when."
      />

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        totalCount={query.data?.totalCount ?? 0}
        searchPlaceholder="Search action, actor, details…"
        enablePagination
        enableColumnVisibility
        isLoading={query.isLoading}
        error={query.error ? (query.error as Error).message : null}
        onRetry={() => void query.refetch()}
        emptyMessage="No audit events"
        emptyDescription="Admin actions will be recorded here."
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
      />
    </section>
  )
}
