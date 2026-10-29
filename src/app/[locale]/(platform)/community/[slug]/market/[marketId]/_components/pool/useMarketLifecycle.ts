'use client'

import { useMemo } from 'react'

import type { PoolSummary } from '@/lib/pools/service'

import { useNowTimestamp } from '@/hooks/useNowTimestamp'

import type { LifecycleAppeal, MarketLifecycle } from './market-lifecycle'
import type { PoolJuryVote, PoolMarketRecord } from './pool-market-types'

import { deriveMarketLifecycle } from './market-lifecycle'

/**
 * The lifecycle for the page, recomputed as the clock ticks. Before the
 * client clock starts (and on the server) it uses the time the page was
 * rendered, so the first paint matches.
 */
export function useMarketLifecycle(input: {
  market: PoolMarketRecord
  summary: PoolSummary | null
  votes: PoolJuryVote[]
  jurySize: number
  juryRequired: number
  serverNow: number
  appeal?: LifecycleAppeal | null
}): { lifecycle: MarketLifecycle; now: number } {
  const tick = useNowTimestamp()
  const now = tick ?? input.serverNow
  const { market, summary, votes, jurySize, juryRequired, appeal = null } = input
  const lifecycle = useMemo(
    () => deriveMarketLifecycle({ market, summary, votes, jurySize, juryRequired, now, appeal }),
    [market, summary, votes, jurySize, juryRequired, now, appeal],
  )
  return { lifecycle, now }
}
