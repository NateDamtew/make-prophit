'use client'

import { useExtracted, useLocale } from 'next-intl'
import { useMemo } from 'react'

import type { PresetProps } from './types'

import PoolMarketCard from '../classic/PoolMarketCard'
import HappeningNow from '../home/HappeningNow'
import { groupByCloseDay } from '../home/market-groups'
import MarketSections from '../home/MarketSections'
import SignedOutPitch from '../home/SignedOutPitch'
import TopStakers from '../home/TopStakers'
import { useHomeData } from '../home/useHomeData'
import YourStakes from '../home/YourStakes'
import PinnedRules from '../shell/PinnedRules'

/**
 * Sports: what is closing now, then the fixtures grouped by day, with a
 * leaderboard beside them. For clubs, leagues and fan pages.
 */
export default function SportsPreset(props: PresetProps) {
  const t = useExtracted()
  const locale = useLocale()
  const { community, trust, home } = props
  const { groups, lead, isOwner, signedIn, iconUrl } = useHomeData(props)
  const fixtures = useMemo(() => groupByCloseDay([...groups.closing, ...groups.open], locale), [groups, locale])
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
        ) : null}
        <HappeningNow closing={groups.closing} deciding={groups.deciding} communitySlug={community.slug} />
        {fixtures.length > 0 ? (
          <div className="flex flex-col gap-8">
            {fixtures.map((day) => (
              <section key={day.key} className="flex flex-col gap-3">
                <h2 className="text-[17px] font-bold">{day.label}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {day.markets.map((market) => (
                    <PoolMarketCard
                      key={market.id}
                      market={market}
                      communitySlug={community.slug}
                      communityIconUrl={iconUrl}
                      jurySize={community.jury_size}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        <MarketSections
          groups={groups}
          communitySlug={community.slug}
          communityIconUrl={iconUrl}
          jurySize={community.jury_size}
          isOwner={isOwner}
          variant="grid"
          order={
            fixtures.length > 0 ? ['deciding', 'held', 'resolved'] : ['closing', 'open', 'deciding', 'held', 'resolved']
          }
        />
      </div>
      <aside className="flex flex-col gap-6">
        <TopStakers stakers={home.topStakers} currency={home.currency} title={t('Leaderboard')} />
        <YourStakes stakes={home.yourStakes} communitySlug={community.slug} signedIn={signedIn} />
        <PinnedRules slug={community.slug} trust={trust} jurySize={community.jury_size} />
      </aside>
    </div>
  )
}
