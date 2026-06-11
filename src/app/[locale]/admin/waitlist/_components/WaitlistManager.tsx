'use client'

import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { ClipboardListIcon, DownloadIcon } from 'lucide-react'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { useWaitlistTable } from '@/app/[locale]/admin/waitlist/_hooks/useWaitlist'
import { EmptyState } from '@/components/admin-ui/EmptyState'
import { formatNumber } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { WAITLIST_STATUSES } from '@/lib/db/schema/waitlist/tables'
import { cn } from '@/lib/utils'
import { useWaitlistColumns } from './columns'

const FILTERS: Array<{ value: WaitlistStatus | 'all', label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'invited', label: 'Invited' },
  { value: 'joined', label: 'Joined' },
  { value: 'spam', label: 'Spam' },
]

export function WaitlistManager() {
  const table = useWaitlistTable()
  const columns = useWaitlistColumns({
    updateStatus: table.updateStatus,
    sendInvite: table.sendInvite,
    deleteEntry: table.deleteEntry,
  })

  const stats = table.stats
  const exportHref = `/admin/api/waitlist/export${table.status !== 'all' ? `?status=${table.status}` : ''}`

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Waitlist"
        description="Review signups, send early-access invites, and track who has joined."
        actions={(
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        )}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total" value={stats?.total} active={table.status === 'all'} onClick={() => table.setStatus('all')} />
        {WAITLIST_STATUSES.map(status => (
          <StatTile
            key={status}
            label={status[0].toUpperCase() + status.slice(1)}
            value={stats?.byStatus[status]}
            active={table.status === status}
            onClick={() => table.setStatus(status)}
          />
        ))}
      </div>

      {/* Status filter chips (mobile-friendly duplicate of the tiles' filter intent) */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(filter => (
          <Button
            key={filter.value}
            size="sm"
            variant={table.status === filter.value ? 'default' : 'outline'}
            onClick={() => table.setStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={table.entries}
        totalCount={table.totalCount}
        searchPlaceholder="Search email, name, country…"
        enableSelection
        enablePagination
        enableColumnVisibility
        isLoading={table.isLoading}
        error={table.error}
        onRetry={table.retry}
        emptyMessage="No signups found"
        emptyDescription="Nobody matches this filter yet."
        search={table.search}
        onSearchChange={table.handleSearchChange}
        sortBy={table.sortBy}
        sortOrder={table.sortOrder}
        onSortChange={table.handleSortChange}
        pageIndex={table.pageIndex}
        pageSize={table.pageSize}
        onPageChange={table.handlePageChange}
        onPageSizeChange={table.handlePageSizeChange}
      />

      {!table.isLoading && !table.error && table.totalCount === 0 && table.status === 'all' && !table.search && (
        <EmptyState
          icon={ClipboardListIcon}
          title="No one on the waitlist yet"
          description="Signups from your landing page will appear here, ready to invite."
        />
      )}
    </section>
  )
}

function StatTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value?: number
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-sm border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40',
        active ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {value === undefined ? '—' : formatNumber(value)}
      </p>
    </button>
  )
}
