'use client'

import type { FeedItem } from '@/lib/db/queries/community-events'
import { useQuery } from '@tanstack/react-query'

async function fetchActivity(communityId: string, limit: number) {
  const params = new URLSearchParams({ limit: String(limit) })
  const res = await fetch(`/api/communities/${communityId}/events?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to load activity (${res.status})`)
  }
  return res.json() as Promise<{ items: FeedItem[], totalCount: number }>
}

export function useCommunityActivity(communityId: string, limit = 50) {
  return useQuery({
    queryKey: ['community-activity', communityId, limit],
    queryFn: () => fetchActivity(communityId, limit),
    staleTime: 10_000,
    refetchInterval: 30_000, // Cheap polling until Realtime is wired (step 7).
  })
}
