'use client'

import type { SyncJobStatus } from '@/lib/admin-ui/job-status'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

export interface SyncJobRow {
  id: string
  job_type: string
  dedupe_key: string
  status: SyncJobStatus
  attempts: number
  max_attempts: number
  last_error: string | null
  available_at: string | null
  updated_at: string
}

interface SyncJobStats {
  total: number
  byStatus: Record<SyncJobStatus, number>
}

interface QueryState {
  pageIndex: number
  pageSize: number
  search: string
  status: SyncJobStatus | 'all'
}

async function fetchJobs(state: QueryState) {
  const params = new URLSearchParams({
    limit: String(state.pageSize),
    pageIndex: String(state.pageIndex),
  })
  if (state.search.trim()) {
    params.set('search', state.search.trim())
  }
  if (state.status !== 'all') {
    params.set('status', state.status)
  }
  const res = await fetch(`/admin/api/sync-jobs?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load jobs (${res.status})`)
  }
  return res.json() as Promise<{ data: SyncJobRow[], totalCount: number, stats: SyncJobStats }>
}

export function useSyncJobsTable() {
  const queryClient = useQueryClient()
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SyncJobStatus | 'all'>('all')

  const state = useMemo<QueryState>(() => ({ pageIndex, pageSize, search, status }), [pageIndex, pageSize, search, status])
  const query = useQuery({ queryKey: ['admin-sync-jobs', state], queryFn: () => fetchJobs(state), staleTime: 10_000 })

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/admin/api/sync-jobs/${id}/retry`, { method: 'POST' })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to retry job')
      }
      return res.json()
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-sync-jobs'] }),
  })

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setPageIndex(0)
  }, [])

  const handleStatusChange = useCallback((value: SyncJobStatus | 'all') => {
    setStatus(value)
    setPageIndex(0)
  }, [])

  return {
    jobs: query.data?.data ?? [],
    totalCount: query.data?.totalCount ?? 0,
    stats: query.data?.stats,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    retry,
    refetch: () => void query.refetch(),
    pageIndex,
    pageSize,
    search,
    status,
    setStatus: handleStatusChange,
    handleSearchChange,
    handlePageChange: setPageIndex,
    handlePageSizeChange: (size: number) => {
      setPageSize(size)
      setPageIndex(0)
    },
  }
}
