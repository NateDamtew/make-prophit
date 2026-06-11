'use client'

import type { AgentStatus } from '@/lib/admin-ui/agent-status'
import type { AdminAgentRow } from '@/lib/db/queries/agents-admin'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

export type { AdminAgentRow, AgentStatus }

interface AgentStats {
  total: number
  byStatus: Record<AgentStatus, number>
}

interface QueryState {
  pageIndex: number
  pageSize: number
  search: string
  status: AgentStatus | 'all'
}

async function fetchAgents(state: QueryState) {
  const params = new URLSearchParams({ limit: String(state.pageSize), pageIndex: String(state.pageIndex) })
  if (state.search.trim()) {
    params.set('search', state.search.trim())
  }
  if (state.status !== 'all') {
    params.set('status', state.status)
  }
  const res = await fetch(`/admin/api/agents?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load agents (${res.status})`)
  }
  return res.json() as Promise<{ data: AdminAgentRow[], totalCount: number, stats: AgentStats }>
}

export function useAgentsTable() {
  const queryClient = useQueryClient()
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AgentStatus | 'all'>('all')

  const state = useMemo<QueryState>(() => ({ pageIndex, pageSize, search, status }), [pageIndex, pageSize, search, status])
  const query = useQuery({ queryKey: ['admin-agents', state], queryFn: () => fetchAgents(state), staleTime: 15_000 })

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status: next }: { id: string, status: AgentStatus }) => {
      const res = await fetch(`/admin/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to update agent')
      }
      return res.json()
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-agents'] }),
  })

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setPageIndex(0)
  }, [])

  const handleStatusChange = useCallback((value: AgentStatus | 'all') => {
    setStatus(value)
    setPageIndex(0)
  }, [])

  return {
    agents: query.data?.data ?? [],
    totalCount: query.data?.totalCount ?? 0,
    stats: query.data?.stats,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: () => void query.refetch(),
    setStatusMutation,
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
