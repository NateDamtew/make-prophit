'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { AdminAgentRow, useAgentsTable } from '@/app/[locale]/admin/agents/_hooks/useAgents'
import { MoreHorizontalIcon, PauseIcon, PlayIcon, ShieldXIcon } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { formatRelativeTime } from '@/components/admin-ui/format'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SetStatus = ReturnType<typeof useAgentsTable>['setStatusMutation']

function usdCompact(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return '$0'
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function useAgentsColumns(setStatus: SetStatus): ColumnDef<AdminAgentRow>[] {
  function apply(id: string, status: 'active' | 'paused' | 'revoked', label: string) {
    toast.promise(setStatus.mutateAsync({ id, status }), {
      loading: 'Updating…',
      success: `Agent ${label}`,
      error: err => (err as Error).message,
    })
  }

  return [
    {
      accessorKey: 'name',
      id: 'name',
      header: () => <span className="text-muted-foreground">Agent</span>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: 'owner',
      id: 'owner',
      header: () => <span className="text-muted-foreground">Owner</span>,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.owner}</span>,
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: () => <span className="text-muted-foreground">Status</span>,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'total_volume_usd',
      id: 'volume',
      header: () => <span className="text-muted-foreground">Volume</span>,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{usdCompact(row.original.total_volume_usd)}</span>
      ),
    },
    {
      accessorKey: 'total_trades',
      id: 'trades',
      header: () => <span className="text-muted-foreground">Trades</span>,
      cell: ({ row }) => <span className="text-sm text-muted-foreground tabular-nums">{row.original.total_trades}</span>,
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: () => <span className="text-muted-foreground">Created</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatRelativeTime(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const agent = row.original
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Agent actions" />}>
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {agent.status !== 'active' && (
                  <DropdownMenuItem onClick={() => apply(agent.id, 'active', 'activated')}>
                    <PlayIcon className="size-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {agent.status !== 'paused' && (
                  <DropdownMenuItem onClick={() => apply(agent.id, 'paused', 'paused')}>
                    <PauseIcon className="size-4" />
                    Pause
                  </DropdownMenuItem>
                )}
                {agent.status !== 'revoked' && (
                  <DropdownMenuItem variant="destructive" onClick={() => apply(agent.id, 'revoked', 'revoked')}>
                    <ShieldXIcon className="size-4" />
                    Revoke
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
