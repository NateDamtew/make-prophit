'use client'

import type { CommunityTabContext, CommunityTabId } from './community-tabs/types'
import { Activity, Info, Scale, Star, TrendingUp, Users } from 'lucide-react'
import { useState } from 'react'
import { useTabIndicatorPosition } from '@/hooks/useTabIndicatorPosition'
import { cn } from '@/lib/utils'
import { AboutTab } from './community-tabs/AboutTab'
import { ActivityTab } from './community-tabs/ActivityTab'
import { JuryTab } from './community-tabs/JuryTab'
import { MarketsTab } from './community-tabs/MarketsTab'
import { MembersTab } from './community-tabs/MembersTab'
import { ReviewsTab } from './community-tabs/ReviewsTab'

const TABS: { id: CommunityTabId, label: string, icon: React.ElementType }[] = [
  { id: 'markets', label: 'Markets', icon: TrendingUp },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'jury', label: 'Jury', icon: Scale },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'about', label: 'About', icon: Info },
]

export default function CommunityTabs(props: CommunityTabContext) {
  const { community, members, markets, reviews, memberRole, currentUserId } = props

  const [activeTab, setActiveTab] = useState<CommunityTabId>('markets')
  const { tabRef, indicatorStyle, isInitialized } = useTabIndicatorPosition({
    tabs: TABS,
    activeTab,
  })

  const isJuror = memberRole === 'juror' || memberRole === 'admin'

  return (
    <div className="overflow-hidden rounded-2xl border">
      {/* Tab bar */}
      <div className="relative">
        <div className="flex items-center gap-1 overflow-x-auto px-4 pt-4 sm:gap-2">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/80" />
        <div
          className={cn(
            'pointer-events-none absolute bottom-0 h-0.5 bg-primary',
            { 'transition-all duration-300 ease-out': isInitialized },
          )}
          style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }}
        />
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'markets' && (
          <MarketsTab community={community} markets={markets} memberRole={memberRole} isJuror={isJuror} />
        )}
        {activeTab === 'activity' && <ActivityTab communityId={community.id} />}
        {activeTab === 'members' && (
          <MembersTab
            community={community}
            members={members}
            memberRole={memberRole}
            currentUserId={currentUserId}
          />
        )}
        {activeTab === 'jury' && (
          <JuryTab community={community} members={members} markets={markets} isJuror={isJuror} />
        )}
        {activeTab === 'reviews' && (
          <ReviewsTab community={community} reviews={reviews} memberRole={memberRole} />
        )}
        {activeTab === 'about' && <AboutTab community={community} />}
      </div>
    </div>
  )
}
