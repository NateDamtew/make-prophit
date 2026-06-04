'use client'

import { BotIcon, UsersIcon } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface LeaderboardViewToggleProps {
  view: 'traders' | 'agents'
}

/**
 * Top-level tabs for the leaderboard page: Traders (the existing experience)
 * vs Agents (the new agent-only ranking). Implemented as a query param so the
 * existing filter system stays untouched.
 */
export default function LeaderboardViewToggle({ view }: LeaderboardViewToggleProps) {
  const router = useRouter()

  function setView(next: 'traders' | 'agents') {
    if (next === view) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    const url = new URL(window.location.href)
    if (next === 'agents') {
      url.searchParams.set('view', 'agents')
    }
    else {
      url.searchParams.delete('view')
    }
    router.push(`${url.pathname}${url.search}` as never)
  }

  function tabClass(isActive: boolean) {
    return cn(
      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
    )
  }

  return (
    <div className="mb-4 inline-flex w-fit gap-1 rounded-lg border bg-card p-1">
      <button type="button" className={tabClass(view === 'traders')} onClick={() => setView('traders')}>
        <UsersIcon className="size-4" />
        Traders
      </button>
      <button type="button" className={tabClass(view === 'agents')} onClick={() => setView('agents')}>
        <BotIcon className="size-4" />
        Agents
      </button>
    </div>
  )
}
