'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { PoolOutcome } from '@/lib/db/schema/pools/tables'
import type { PoolSummary } from '@/lib/pools/service'

import {
  getPoolActivityAction,
  getPoolHistoryAction,
  getPoolSummaryAction,
  getPoolTopHoldersAction,
} from '@/app/[locale]/(platform)/_actions/pool-stake'

/**
 * React Query wrappers around the pool server actions, so the order panel,
 * chart, header and tabs all read one cached summary and refresh together
 * after a stake.
 */

function poolQueryKey(marketId: string, part: 'summary' | 'history' | 'holders' | 'activity', extra?: string) {
  return extra ? (['pool', marketId, part, extra] as const) : (['pool', marketId, part] as const)
}

export function usePoolSummary(marketId: string, initialSummary: PoolSummary | null, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  return useQuery({
    queryKey: poolQueryKey(marketId, 'summary'),
    queryFn: async () => (await getPoolSummaryAction(marketId)).data,
    initialData: initialSummary ?? undefined,
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function usePoolHistory(marketId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: poolQueryKey(marketId, 'history'),
    queryFn: async () => (await getPoolHistoryAction(marketId)).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: options.enabled ?? true,
  })
}

export function usePoolHolders(marketId: string, enabled: boolean) {
  return useQuery({
    queryKey: poolQueryKey(marketId, 'holders'),
    queryFn: async () => (await getPoolTopHoldersAction(marketId)).data,
    enabled,
    staleTime: 30_000,
  })
}

export function usePoolActivity(marketId: string, outcome: PoolOutcome | null, enabled: boolean) {
  return useQuery({
    queryKey: poolQueryKey(marketId, 'activity', outcome ?? 'all'),
    queryFn: async () => (await getPoolActivityAction(marketId, outcome)).data,
    enabled,
    staleTime: 15_000,
  })
}

/** Invalidate everything derived from the pool after a stake lands. */
export function useInvalidatePool(marketId: string) {
  const queryClient = useQueryClient()
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['pool', marketId] }), [marketId, queryClient])
}
