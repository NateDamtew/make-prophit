'use client'

import type { AgentStatus } from '@/app/[locale]/admin/agents/_hooks/useAgents'
import { RefreshCwIcon } from 'lucide-react'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { useAgentsTable } from '@/app/[locale]/admin/agents/_hooks/useAgents'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatFilterTiles } from '@/components/admin-ui/StatFilterTiles'
import { Button } from '@/components/ui/button'
import { AGENT_STATUSES } from '@/lib/admin-ui/agent-status'
import { useAgentsColumns } from './columns'

export function AgentsManager() {
  const table = useAgentsTable()
  const columns = useAgentsColumns(table.setStatusMutation)
  const stats = table.stats

  const tiles = [
    { key: 'all', label: 'Total', value: stats?.total },
    ...AGENT_STATUSES.map(s => ({ key: s, label: s[0].toUpperCase() + s.slice(1), value: stats?.byStatus[s] })),
  ]

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Agents"
        description="Every AI trading agent registered on the platform. Pause or revoke any agent."
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
        onSelect={key => table.setStatus(key as AgentStatus | 'all')}
      />

      <DataTable
        columns={columns}
        data={table.agents}
        totalCount={table.totalCount}
        searchPlaceholder="Search agent name or slug…"
        enablePagination
        enableColumnVisibility
        isLoading={table.isLoading}
        error={table.error}
        onRetry={table.refetch}
        emptyMessage="No agents found"
        emptyDescription="No agents match this filter."
        search={table.search}
        onSearchChange={table.handleSearchChange}
        sortBy="created_at"
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
