'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { SyncJobRow, useSyncJobsTable } from '@/app/[locale]/admin/sync-jobs/_hooks/useSyncJobs'
import { RotateCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Button } from '@/components/ui/button'

type RetryMutation = ReturnType<typeof useSyncJobsTable>['retry']

export function useSyncJobsColumns(retry: RetryMutation): ColumnDef<SyncJobRow>[] {
  return [
    {
      accessorKey: 'job_type',
      id: 'job_type',
      header: () => <span className="text-muted-foreground">Job</span>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.job_type}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.dedupe_key}</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: () => <span className="text-muted-foreground">Status</span>,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'attempts',
      id: 'attempts',
      header: () => <span className="text-muted-foreground">Attempts</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.original.attempts}
          /
          {row.original.max_attempts}
        </span>
      ),
    },
    {
      accessorKey: 'last_error',
      id: 'last_error',
      header: () => <span className="text-muted-foreground">Last error</span>,
      cell: ({ row }) => (
        <span
          className="line-clamp-2 max-w-xs text-xs text-(--no)"
          title={row.original.last_error ?? undefined}
        >
          {row.original.last_error || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'updated_at',
      id: 'updated_at',
      header: () => <span className="text-muted-foreground">Updated</span>,
      cell: ({ row }) => (
        <time
          dateTime={row.original.updated_at}
          title={formatAbsolute(row.original.updated_at)}
          className="text-sm text-muted-foreground"
        >
          {formatRelativeTime(row.original.updated_at)}
        </time>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const job = row.original
        const canRetry = job.status === 'failed' || job.status === 'processing'
        if (!canRetry) {
          return null
        }
        return (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.promise(retry.mutateAsync(job.id), {
                  loading: 'Re-queuing…',
                  success: 'Job re-queued',
                  error: err => (err as Error).message,
                })
              }}
            >
              <RotateCwIcon className="size-3.5" />
              Retry
            </Button>
          </div>
        )
      },
    },
  ]
}
