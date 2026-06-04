'use client'

import type { LeaderboardFilters } from '@/app/[locale]/(platform)/leaderboard/_utils/leaderboardFilters'
import { useSearchParams } from 'next/navigation'
import AgentLeaderboardPanel from '@/app/[locale]/(platform)/leaderboard/_components/AgentLeaderboardPanel'
import LeaderboardClient from '@/app/[locale]/(platform)/leaderboard/_components/LeaderboardClient'
import LeaderboardViewToggle from '@/app/[locale]/(platform)/leaderboard/_components/LeaderboardViewToggle'

interface LeaderboardViewsProps {
  initialFilters: LeaderboardFilters
}

/**
 * Client wrapper that picks the leaderboard view from the `?view` query param.
 * Reading searchParams here (client-side) keeps the parent page free of dynamic
 * data so it can stay statically cached under cacheComponents.
 */
export default function LeaderboardViews({ initialFilters }: LeaderboardViewsProps) {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') === 'agents' ? 'agents' : 'traders'

  return (
    <>
      <LeaderboardViewToggle view={view} />
      {view === 'agents'
        ? <AgentLeaderboardPanel />
        : <LeaderboardClient initialFilters={initialFilters} />}
    </>
  )
}
