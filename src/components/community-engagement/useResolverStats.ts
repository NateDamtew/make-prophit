'use client'

import type { PublicResolverStats } from '@/app/api/users/resolver-stats/route'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

interface UseResolverStatsResult {
  /** Look up stats for a user. Returns null while loading or if the user isn't in the batch. */
  get: (userId: string) => PublicResolverStats | null
  isLoading: boolean
}

/**
 * Single batched fetch for the resolver track record of an array of users.
 * The members list and the jury tab both use this — one network round-trip
 * fills every badge.
 */
export function useResolverStats(userIds: string[]): UseResolverStatsResult {
  const stable = useMemo(() => Array.from(new Set(userIds)).sort(), [userIds])
  const query = useQuery({
    queryKey: ['resolver-stats', stable.join(',')],
    enabled: stable.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, PublicResolverStats>> => {
      const res = await fetch(`/api/users/resolver-stats?ids=${encodeURIComponent(stable.join(','))}`)
      if (!res.ok) {
        return new Map()
      }
      const body = await res.json() as { data: PublicResolverStats[] }
      return new Map((body.data ?? []).map(s => [s.user_id, s]))
    },
  })

  return {
    get: (userId: string) => query.data?.get(userId) ?? null,
    isLoading: query.isLoading,
  }
}
