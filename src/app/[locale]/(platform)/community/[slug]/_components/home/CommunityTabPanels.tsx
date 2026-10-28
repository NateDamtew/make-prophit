'use client'

import type { PresetProps } from '../presets/types'
import type { CommunityTab } from '../shell/community-tabs'

import { AboutTab } from '../community-tabs/AboutTab'
import { ActivityTab } from '../community-tabs/ActivityTab'
import { JuryTab } from '../community-tabs/JuryTab'
import { MembersTab } from '../community-tabs/MembersTab'
import { ReviewsTab } from '../community-tabs/ReviewsTab'

/**
 * The non-market tabs, the same for every layout.
 */

export default function CommunityTabPanels({
  tab,
  community,
  members,
  markets,
  reviews,
  memberRole,
  currentUserId,
}: { tab: Exclude<CommunityTab, 'markets'> } & Pick<
  PresetProps,
  'community' | 'members' | 'markets' | 'reviews' | 'memberRole' | 'currentUserId'
>) {
  const isJuror = memberRole === 'juror' || memberRole === 'admin'
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      {tab === 'activity' && <ActivityTab communityId={community.id} />}
      {tab === 'members' && (
        <MembersTab community={community} members={members} memberRole={memberRole} currentUserId={currentUserId} />
      )}
      {tab === 'jury' && <JuryTab community={community} members={members} markets={markets} isJuror={isJuror} />}
      {tab === 'reviews' && <ReviewsTab community={community} reviews={reviews} memberRole={memberRole} />}
      {tab === 'about' && <AboutTab community={community} />}
    </div>
  )
}
