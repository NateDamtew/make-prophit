'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { BadgeCheckIcon, SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { formatAbsolute, formatNumber, formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface CommunityRow {
  id: string
  slug: string
  name: string
  member_count: number
  market_count: number
  is_verified: boolean
  community_fee_bps: number
  created_at: string
}

async function fetchCommunities(pageIndex: number, pageSize: number, search: string) {
  const params = new URLSearchParams({ limit: String(pageSize), pageIndex: String(pageIndex) })
  if (search.trim()) {
    params.set('search', search.trim())
  }
  const res = await fetch(`/admin/api/communities?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load communities (${res.status})`)
  }
  return res.json() as Promise<{ data: CommunityRow[], totalCount: number }>
}

export function AdminCommunitiesManager() {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['admin-communities', { pageIndex, pageSize, search }], [pageIndex, pageSize, search])

  const query = useQuery({ queryKey, queryFn: () => fetchCommunities(pageIndex, pageSize, search), staleTime: 15_000 })

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string, body: Record<string, unknown> }) => {
      const res = await fetch(`/admin/api/communities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-communities'] }),
  })

  const columns: ColumnDef<CommunityRow>[] = [
    {
      accessorKey: 'name',
      id: 'community',
      header: () => <span className="text-muted-foreground">Community</span>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/community/${row.original.slug}`} className="truncate font-medium hover:underline">
              {row.original.name}
            </Link>
            {row.original.is_verified && <BadgeCheckIcon className="size-3.5 text-primary" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">@{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: 'member_count',
      id: 'members',
      header: () => <span className="text-muted-foreground">Members</span>,
      cell: ({ row }) => <span className="text-sm tabular-nums">{formatNumber(row.original.member_count)}</span>,
    },
    {
      accessorKey: 'market_count',
      id: 'markets',
      header: () => <span className="text-muted-foreground">Markets</span>,
      cell: ({ row }) => <span className="text-sm tabular-nums">{formatNumber(row.original.market_count)}</span>,
    },
    {
      accessorKey: 'is_verified',
      id: 'verified',
      header: () => <span className="text-muted-foreground">Verified</span>,
      cell: ({ row }) => (
        <Switch
          checked={row.original.is_verified}
          onCheckedChange={(next) => {
            toast.promise(patch.mutateAsync({ id: row.original.id, body: { is_verified: next } }), {
              loading: 'Updating…',
              success: next ? 'Marked verified' : 'Verification removed',
              error: err => (err as Error).message,
            })
          }}
          aria-label="Toggle verified"
        />
      ),
    },
    {
      accessorKey: 'community_fee_bps',
      id: 'fee',
      header: () => <span className="text-muted-foreground">Fee</span>,
      cell: ({ row }) => <FeeEditor row={row.original} onSave={bps => patch.mutateAsync({ id: row.original.id, body: { community_fee_bps: bps } })} />,
    },
    {
      accessorKey: 'created_at',
      id: 'created',
      header: () => <span className="text-muted-foreground">Created</span>,
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
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/community/${row.original.slug}/insights`}>
              <SettingsIcon className="size-3.5" />
              Insights
            </Link>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Communities"
        description="All communities on the platform. Toggle verification, set per-community revenue share, jump into Insights."
      />

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        totalCount={query.data?.totalCount ?? 0}
        searchPlaceholder="Search communities…"
        enablePagination
        enableColumnVisibility
        isLoading={query.isLoading}
        error={query.error ? (query.error as Error).message : null}
        onRetry={() => void query.refetch()}
        emptyMessage="No communities"
        emptyDescription="Once people start creating communities they'll show up here."
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPageIndex(0)
        }}
        sortBy="created_at"
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

function FeeEditor({ row, onSave }: { row: CommunityRow, onSave: (bps: number) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.community_fee_bps)
  const [saving, setSaving] = useState(false)

  async function commit() {
    if (value === row.community_fee_bps) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(value)
      toast.success(`Fee set to ${(value / 100).toFixed(2)}%`)
      setEditing(false)
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm tabular-nums text-foreground/80 hover:text-primary"
      >
        {(row.community_fee_bps / 100).toFixed(2)}
        %
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        max={1000}
        step={5}
        value={value}
        onChange={e => setValue(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void commit()
          }
          else if (e.key === 'Escape') {
            setEditing(false)
            setValue(row.community_fee_bps)
          }
        }}
        className="h-7 w-20 text-sm"
        autoFocus
      />
      <span className="text-2xs text-muted-foreground">bps</span>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={saving} onClick={commit}>
        Save
      </Button>
    </div>
  )
}
