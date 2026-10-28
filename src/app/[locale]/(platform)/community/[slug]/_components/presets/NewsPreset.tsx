'use client'

import { useExtracted } from 'next-intl'

import type { PresetProps } from './types'

import PoolMarketCard from '../classic/PoolMarketCard'
import MarketSections from '../home/MarketSections'
import SignedOutPitch from '../home/SignedOutPitch'
import TopStakers from '../home/TopStakers'
import { useHomeData } from '../home/useHomeData'
import YourStakes from '../home/YourStakes'
import PinnedRules from '../shell/PinnedRules'

/**
 * News: a lead story, then the latest questions, with the reader's stakes
 * and the rules beside it. For newsrooms, journalists and analysts.
 */
export default function NewsPreset(props: PresetProps) {
  const t = useExtracted()
  const { community, trust, home } = props
  const { groups, lead, isOwner, signedIn, iconUrl } = useHomeData(props)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
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
        ) : lead ? (
          <section className="flex flex-col gap-3" aria-label={t('Lead story')}>
            <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t('Lead story')}
            </h2>
            <PoolMarketCard
              market={lead}
              communitySlug={community.slug}
              communityIconUrl={iconUrl}
              jurySize={community.jury_size}
            />
          </section>
        ) : null}
        <MarketSections
          groups={groups}
          communitySlug={community.slug}
          communityIconUrl={iconUrl}
          jurySize={community.jury_size}
          isOwner={isOwner}
          variant="grid"
          skipLeadId={lead?.id ?? null}
        />
      </div>
      <aside className="flex flex-col gap-6">
        <YourStakes stakes={home.yourStakes} communitySlug={community.slug} signedIn={signedIn} />
        <PinnedRules slug={community.slug} trust={trust} jurySize={community.jury_size} />
        <TopStakers stakers={home.topStakers} currency={home.currency} />
      </aside>
    </div>
  )
}
