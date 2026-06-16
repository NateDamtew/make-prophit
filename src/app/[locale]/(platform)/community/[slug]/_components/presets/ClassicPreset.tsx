'use client'

import type { PresetMarket, PresetProps } from './types'
import { Activity, ChevronDown, Info, Plus, Scale, Star, TrendingUp, Users } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTabIndicatorPosition } from '@/hooks/useTabIndicatorPosition'
import { cn } from '@/lib/utils'
import ClassicMarketCard from '../classic/ClassicMarketCard'
import ClassicSideRail from '../classic/ClassicSideRail'
import { AboutTab } from '../community-tabs/AboutTab'
import { ActivityTab } from '../community-tabs/ActivityTab'
import { JuryTab } from '../community-tabs/JuryTab'
import { MembersTab } from '../community-tabs/MembersTab'
import { ReviewsTab } from '../community-tabs/ReviewsTab'

type TabId = 'markets' | 'activity' | 'members' | 'jury' | 'reviews' | 'about'

const TABS: { id: TabId, label: string, icon: React.ElementType }[] = [
  { id: 'markets', label: 'Markets', icon: TrendingUp },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'jury', label: 'Jury', icon: Scale },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'about', label: 'About', icon: Info },
]

type SortKey = 'active' | 'newest' | 'ending' | 'resolved'
const SORT_LABELS: Record<SortKey, string> = {
  active: 'Most active',
  newest: 'Newest',
  ending: 'Ending soonest',
  resolved: 'Resolved first',
}

export default function ClassicPreset({ community, members, markets, reviews, memberRole, currentUserId }: PresetProps) {
  const [activeTab, setActiveTab] = useState<TabId>('markets')
  const [sort, setSort] = useState<SortKey>('active')
  const { tabRef, indicatorStyle, isInitialized } = useTabIndicatorPosition({ tabs: TABS, activeTab })
  const isJuror = memberRole === 'juror' || memberRole === 'admin'
  const isAdmin = memberRole === 'admin'

  const sortedMarkets = useMemo(() => sortMarkets(markets, sort), [markets, sort])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        {/* Tab strip + sort */}
        <div className="relative overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
              {TABS.map((tab, index) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    ref={(el) => { tabRef.current[index] = el }}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 pb-3 text-sm font-semibold transition-colors',
                      activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
            {activeTab === 'markets' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="
                      mb-3 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1
                      text-2xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors
                      hover:border-primary/40 hover:text-foreground
                    "
                  >
                    Sort:
                    {' '}
                    {SORT_LABELS[sort]}
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                    <DropdownMenuItem key={key} onClick={() => setSort(key)}>
                      {SORT_LABELS[key]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/80" />
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 h-0.5 bg-primary',
              { 'transition-all duration-300 ease-out': isInitialized },
            )}
            style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }}
          />
        </div>

        {/* Tab content */}
        {activeTab === 'markets' && (
          <MarketsGrid
            markets={sortedMarkets}
            communitySlug={community.slug}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'activity' && (
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <ActivityTab communityId={community.id} />
          </div>
        )}
        {activeTab === 'members' && (
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <MembersTab
              community={community as any}
              members={members as any}
              memberRole={memberRole}
              currentUserId={currentUserId}
            />
          </div>
        )}
        {activeTab === 'jury' && (
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <JuryTab community={community as any} members={members as any} markets={markets as any} isJuror={isJuror} />
          </div>
        )}
        {activeTab === 'reviews' && (
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <ReviewsTab community={community as any} reviews={reviews as any} memberRole={memberRole} />
          </div>
        )}
        {activeTab === 'about' && (
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <AboutTab community={community as any} />
          </div>
        )}
      </div>

      <ClassicSideRail communityId={community.id} markets={markets} />
    </div>
  )
}

function MarketsGrid({ markets, communitySlug, isAdmin }: { markets: PresetMarket[], communitySlug: string, isAdmin: boolean }) {
  if (markets.length === 0) {
    return (
      <div className="
        flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/50 py-16 text-center
      "
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <TrendingUp className="size-5" />
        </div>
        <div className="max-w-sm">
          <p className="text-lg font-semibold">No new proposals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? 'Stake your reputation and create the next prediction market for this community.'
              : 'The community admin is curating markets. Check back soon.'}
          </p>
        </div>
        {isAdmin && (
          <Button asChild size="sm">
            <Link href={`/community/${communitySlug}/markets/new` as any}>
              <Plus className="mr-1.5 size-3.5" />
              Create First Market
            </Link>
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {markets.map(m => (
        <ClassicMarketCard key={m.id} market={m} communitySlug={communitySlug} />
      ))}
    </div>
  )
}

function sortMarkets(markets: PresetMarket[], key: SortKey): PresetMarket[] {
  const copy = [...markets]
  if (key === 'active') {
    return copy.sort((a, b) => {
      const aV = (a.votes?.yes ?? 0) + (a.votes?.no ?? 0)
      const bV = (b.votes?.yes ?? 0) + (b.votes?.no ?? 0)
      if (bV !== aV) {
        return bV - aV
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }
  if (key === 'newest') {
    return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  if (key === 'ending') {
    return copy.sort((a, b) => {
      const aT = a.resolution_date ? new Date(a.resolution_date).getTime() : Infinity
      const bT = b.resolution_date ? new Date(b.resolution_date).getTime() : Infinity
      return aT - bT
    })
  }
  // resolved
  return copy.sort((a, b) => {
    const aR = a.status === 'resolved' || a.status === 'disputed' ? 0 : 1
    const bR = b.status === 'resolved' || b.status === 'disputed' ? 0 : 1
    if (aR !== bR) {
      return aR - bR
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
