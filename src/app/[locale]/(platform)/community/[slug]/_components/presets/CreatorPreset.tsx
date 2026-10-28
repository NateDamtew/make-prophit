'use client'

import type { PresetProps } from './types'

import LeaderCard from '../home/LeaderCard'
import MarketSections from '../home/MarketSections'
import SignedOutPitch from '../home/SignedOutPitch'
import TopStakers from '../home/TopStakers'
import { useHomeData } from '../home/useHomeData'
import YourStakes from '../home/YourStakes'
import PinnedRules from '../shell/PinnedRules'

/**
 * Creator: the person first, then one question at a time in a single
 * column. For creators and commentators whose call is the draw.
 */
export default function CreatorPreset(props: PresetProps) {
  const { community, members, trust, home } = props
  const { groups, lead, isOwner, signedIn, iconUrl } = useHomeData(props)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <LeaderCard members={members} trust={trust} description={community.description} />
        {!signedIn ? (
          <SignedOutPitch
            market={lead}
            communityName={community.name}
            communitySlug={community.slug}
            communityIconUrl={iconUrl}
            trust={trust}
            currency={home.currency}
            volume30dMinor={home.volume30dMinor}
            jurySize={community.jury_size}
          />
        ) : null}
        <MarketSections
          groups={groups}
          communitySlug={community.slug}
          communityIconUrl={iconUrl}
          jurySize={community.jury_size}
          isOwner={isOwner}
          variant="list"
          skipLeadId={!signedIn ? (lead?.id ?? null) : null}
        />
      </div>
      <aside className="flex flex-col gap-6">
        <YourStakes stakes={home.yourStakes} communitySlug={community.slug} signedIn={signedIn} />
        <TopStakers stakers={home.topStakers} currency={home.currency} />
        <PinnedRules slug={community.slug} trust={trust} jurySize={community.jury_size} />
      </aside>
    </div>
  )
}
