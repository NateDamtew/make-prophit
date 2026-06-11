'use client'

import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

export interface WaitlistEntry {
  id: string
  name: string | null
  email: string
  role: string | null
  country: string | null
  status: WaitlistStatus
  invited_at: string | null
  invited_by: string | null
  notes: string | null
  created_at: string
}

interface WaitlistStats {
  total: number
  byStatus: Record<WaitlistStatus, number>
}

interface WaitlistListResponse {
  data: WaitlistEntry[]
  totalCount: number
  stats: WaitlistStats
}

export type WaitlistSortField = 'email' | 'created_at' | 'status'

interface WaitlistQueryState {
  pageIndex: number
  pageSize: number
  search: string
  status: WaitlistStatus | 'all'
  sortBy: WaitlistSortField
  sortOrder: 'asc' | 'desc'
}

async function fetchWaitlist(state: WaitlistQueryState): Promise<WaitlistListResponse> {
  const params = new URLSearchParams({
    limit: String(state.pageSize),
    pageIndex: String(state.pageIndex),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  })
  if (state.search.trim()) {
    params.set('search', state.search.trim())
  }
  if (state.status !== 'all') {
    params.set('status', state.status)
  }

  const res = await fetch(`/admin/api/waitlist?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load waitlist (${res.status})`)
  }
  return res.json()
}

export function useWaitlistTable() {
  const queryClient = useQueryClient()
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WaitlistStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<WaitlistSortField>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const state = useMemo<WaitlistQueryState>(
    () => ({ pageIndex, pageSize, search, status, sortBy, sortOrder }),
    [pageIndex, pageSize, search, status, sortBy, sortOrder],
  )

  const queryKey = useMemo(() => ['admin-waitlist', state], [state])

  const query = useQuery({
    queryKey,
    queryFn: () => fetchWaitlist(state),
    staleTime: 15_000,
  })

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-waitlist'] })
  }, [queryClient])

  const updateStatus = useMutation({
    mutationFn: async ({ id, status: next }: { id: string, status: WaitlistStatus }) => {
      const res = await fetch(`/admin/api/waitlist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to update status')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  const sendInvite = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/admin/api/waitlist/${id}/invite`, { method: 'POST' })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to send invite')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/admin/api/waitlist/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to delete entry')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setPageIndex(0)
  }, [])

  const handleStatusChange = useCallback((value: WaitlistStatus | 'all') => {
    setStatus(value)
    setPageIndex(0)
  }, [])

  const handleSortChange = useCallback((column: string | null, order: 'asc' | 'desc' | null) => {
    if (!column || !order) {
      setSortBy('created_at')
      setSortOrder('desc')
    }
    else {
      const field = (['email', 'created_at', 'status'].includes(column) ? column : 'created_at') as WaitlistSortField
      setSortBy(field)
      setSortOrder(order)
    }
    setPageIndex(0)
  }, [])

  return {
    entries: query.data?.data ?? [],
    totalCount: query.data?.totalCount ?? 0,
    stats: query.data?.stats,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    retry: () => void query.refetch(),

    pageIndex,
    pageSize,
    search,
    status,
    sortBy,
    sortOrder,

    setStatus: handleStatusChange,
    handleSearchChange,
    handleSortChange,
    handlePageChange: setPageIndex,
    handlePageSizeChange: (size: number) => {
      setPageSize(size)
      setPageIndex(0)
    },

    updateStatus,
    sendInvite,
    deleteEntry,
  }
}
