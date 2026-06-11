'use client'

import type { SyncJobStatus } from '@/lib/admin-ui/job-status'
import { RefreshCwIcon } from 'lucide-react'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { useSyncJobsTable } from '@/app/[locale]/admin/sync-jobs/_hooks/useSyncJobs'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatFilterTiles } from '@/components/admin-ui/StatFilterTiles'
import { Button } from '@/components/ui/button'
import { SYNC_JOB_STATUSES } from '@/lib/admin-ui/job-status'
import { useSyncJobsColumns } from './columns'

export function SyncJobsManager() {
  const table = useSyncJobsTable()
  const columns = useSyncJobsColumns(table.retry)
  const stats = table.stats

  const tiles = [
    { key: 'all', label: 'Total', value: stats?.total },
    ...SYNC_JOB_STATUSES.map(s => ({ key: s, label: s[0].toUpperCase() + s.slice(1), value: stats?.byStatus[s] })),
  ]

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Sync Jobs"
        description="Background jobs that keep events, volume, translations, and resolutions in sync. Re-queue anything that failed."
        actions={(
          <Button variant="outline" onClick={table.refetch}>
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
        )}
      />

      <StatFilterTiles
        items={tiles}
        activeKey={table.status}
        onSelect={key => table.setStatus(key as SyncJobStatus | 'all')}
      />

      <DataTable
        columns={columns}
        data={table.jobs}
        totalCount={table.totalCount}
        searchPlaceholder="Search job type or key…"
        enablePagination
        enableColumnVisibility
        isLoading={table.isLoading}
        error={table.error}
        onRetry={table.refetch}
        emptyMessage="No jobs found"
        emptyDescription="No background jobs match this filter."
        search={table.search}
        onSearchChange={table.handleSearchChange}
        sortBy="updated_at"
        sortOrder="desc"
        onSortChange={() => {}}
        pageIndex={table.pageIndex}
        pageSize={table.pageSize}
        onPageChange={table.handlePageChange}
        onPageSizeChange={table.handlePageSizeChange}
      />
    </section>
  )
}
