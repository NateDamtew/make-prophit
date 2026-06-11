'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { useWaitlistTable, WaitlistEntry } from '@/app/[locale]/admin/waitlist/_hooks/useWaitlist'

import { ArrowUpDownIcon } from 'lucide-react'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { WaitlistStatusBadge } from '@/components/admin-ui/WaitlistStatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { WaitlistRowActions } from './WaitlistRowActions'

type WaitlistActions = Pick<ReturnType<typeof useWaitlistTable>, 'updateStatus' | 'sendInvite' | 'deleteEntry'>

function SortHeader({ label, column }: { label: string, column: any }) {
  return (
    <Button
      variant="ghost"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDownIcon className="ml-1 size-3.5 opacity-60" />
    </Button>
  )
}

export function useWaitlistColumns(actions: WaitlistActions): ColumnDef<WaitlistEntry>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'email',
      id: 'email',
      header: ({ column }) => <SortHeader label="Email" column={column} />,
      cell: ({ row }) => {
        const entry = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{entry.email}</p>
            {entry.name && <p className="truncate text-xs text-muted-foreground">{entry.name}</p>}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: ({ column }) => <SortHeader label="Status" column={column} />,
      cell: ({ row }) => <WaitlistStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'country',
      id: 'country',
      header: () => <span className="text-muted-foreground">Country</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.country || '—'}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: ({ column }) => <SortHeader label="Signed up" column={column} />,
      cell: ({ row }) => (
        <time
          dateTime={row.original.created_at}
          title={formatAbsolute(row.original.created_at)}
          className="text-sm text-muted-foreground"
        >
          {formatRelativeTime(row.original.created_at)}
        </time>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <WaitlistRowActions entry={row.original} actions={actions} />
        </div>
      ),
    },
  ]
}
