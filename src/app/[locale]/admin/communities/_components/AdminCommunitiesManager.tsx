'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheckIcon, SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { DataTableColumnDef } from '@/lib/data-table'

import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { formatAbsolute, formatNumber, formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

interface CommunityRow {
  id: string
  slug: string
  name: string
  member_count: number
  market_count: number
  is_verified: boolean
  community_fee_bps: number
  level: number
  status: string
  leader_type: string | null
  trust_score: number | null
  joins_paused: boolean
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
  return res.json() as Promise<{ data: CommunityRow[]; totalCount: number }>
}

export function AdminCommunitiesManager() {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['admin-communities', { pageIndex, pageSize, search }], [pageIndex, pageSize, search])

  const query = useQuery({ queryKey, queryFn: () => fetchCommunities(pageIndex, pageSize, search), staleTime: 15_000 })

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
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

  const columns: DataTableColumnDef<CommunityRow>[] = [
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
      accessorKey: 'level',
      id: 'ladder',
      header: () => <span className="text-muted-foreground">Ladder</span>,
      cell: ({ row }) => (
        <LadderEditor row={row.original} onSave={(body) => patch.mutateAsync({ id: row.original.id, body })} />
      ),
    },
    {
      accessorKey: 'is_verified',
      id: 'verified',
      header: () => <span className="text-muted-foreground">Verified</span>,
      cell: ({ row }) => (
        <Switch
          checked={row.original.is_verified}
          onCheckedChange={(next) => {
            void toast.promise(patch.mutateAsync({ id: row.original.id, body: { is_verified: next } }), {
              loading: 'Updating…',
              success: next ? 'Marked verified' : 'Verification removed',
              error: (err) => (err as Error).message,
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
      cell: ({ row }) => (
        <FeeEditor
          row={row.original}
          onSave={(bps) => patch.mutateAsync({ id: row.original.id, body: { community_fee_bps: bps } })}
        />
      ),
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
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/community/${row.original.slug}/insights`} />}
          >
            <SettingsIcon className="size-3.5" />
            Insights
          </Button>
        </div>
      ),
    },
  ]

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Communities"
        description="All communities on the platform. Set the trust level, pause or archive, toggle verification, set per-community revenue share, jump into Insights."
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

function FeeEditor({ row, onSave }: { row: CommunityRow; onSave: (bps: number) => Promise<unknown> }) {
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
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-foreground/80 tabular-nums hover:text-primary"
      >
        {(row.community_fee_bps / 100).toFixed(2)}%
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
        onChange={(e) => setValue(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void commit()
          } else if (e.key === 'Escape') {
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

const LEVEL_LABELS = ['0 · New', '1 · Proven', '2 · Established']
const STATUSES = ['active', 'paused', 'dormant', 'archived'] as const
const LEADER_TYPES = ['news', 'sports', 'creator', 'group', 'event'] as const

function LadderEditor({
  row,
  onSave,
}: {
  row: CommunityRow
  onSave: (body: Record<string, unknown>) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState(row.level)
  const [status, setStatus] = useState(row.status)
  const [leaderType, setLeaderType] = useState(row.leader_type ?? '')
  const [joinsPaused, setJoinsPaused] = useState(row.joins_paused)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function commit() {
    setSaving(true)
    try {
      await onSave({
        level,
        status,
        leader_type: leaderType || null,
        joins_paused: joinsPaused,
        reason: reason.trim() || null,
      })
      toast.success('Ladder updated')
      setOpen(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-sm hover:underline"
        title="Change level, status, leader type"
      >
        <span className="font-medium">L{row.level}</span>
        <span className="text-muted-foreground"> · {row.status}</span>
        {row.trust_score !== null ? <span className="text-muted-foreground"> · {row.trust_score}/100</span> : null}
        {row.joins_paused ? <span className="text-muted-foreground"> · joins paused</span> : null}
      </button>
    )
  }
  return (
    <div className="flex min-w-56 flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs">
      <label className="flex items-center justify-between gap-2">
        Level
        <select
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
          className="h-8 rounded-md border border-border bg-background px-1"
        >
          {LEVEL_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Status
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-1"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Leader
        <select
          value={leaderType}
          onChange={(event) => setLeaderType(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-1"
        >
          <option value="">—</option>
          {LEADER_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Joins paused
        <Switch checked={joinsPaused} onCheckedChange={setJoinsPaused} aria-label="Joins paused" />
      </label>
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (shown in the ladder log)"
        className="h-8 text-xs"
      />
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void commit()} disabled={saving}>
          Save
        </Button>
      </div>
    </div>
  )
}
