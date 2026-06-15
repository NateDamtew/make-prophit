import type { PresetProps } from './types'
import CommunityTabs from '../CommunityTabs'

/** Classic = the existing 5-tab layout. Pure delegation to CommunityTabs. */
export default function ClassicPreset({ community, members, markets, reviews, memberRole, currentUserId }: PresetProps) {
  return (
    <CommunityTabs
      community={community as any}
      members={members as any}
      markets={markets as any}
      reviews={reviews as any}
      memberRole={memberRole}
      currentUserId={currentUserId}
    />
  )
}
