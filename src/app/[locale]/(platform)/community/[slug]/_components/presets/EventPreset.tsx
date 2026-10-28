'use client'

import { useExtracted } from 'next-intl'

import { Countdown } from '@/components/communities/time/Countdown'

import type { PresetProps } from './types'

import HappeningNow from '../home/HappeningNow'
import MarketSections from '../home/MarketSections'
import SignedOutPitch from '../home/SignedOutPitch'
import TopStakers from '../home/TopStakers'
import { useHomeData } from '../home/useHomeData'
import YourStakes from '../home/YourStakes'
import PinnedRules from '../shell/PinnedRules'

/**
 * Event: a countdown to the day, the questions, then the results. For
 * elections, finals, launches and anything with one date.
 */
export default function EventPreset(props: PresetProps) {
  const t = useExtracted()
  const { community, trust, home } = props
  const { groups, lead, isOwner, signedIn, iconUrl, now } = useHomeData(props)
  const upcoming = [...groups.closing, ...groups.open]
    .map((market) => (market.resolution_date ? new Date(market.resolution_date).getTime() : null))
    .filter((time): time is number => time !== null && time > now)
    .sort((a, b) => a - b)
  const eventAt = upcoming[0] ?? null
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        {eventAt !== null ? (
          <section
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:p-5"
            aria-label={t('Event day')}
          >
            <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t('Next close')}
            </h2>
            <Countdown target={eventAt} verb={t('Closes')} className="text-base" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {t('{count} questions open', { count: String(groups.open.length + groups.closing.length) })}
            </p>
          </section>
        ) : null}
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
        <MarketSections
          groups={groups}
          communitySlug={community.slug}
          communityIconUrl={iconUrl}
          jurySize={community.jury_size}
          isOwner={isOwner}
          variant="list"
          order={['open', 'closing', 'deciding', 'held']}
          skipLeadId={!signedIn ? (lead?.id ?? null) : null}
        />
        {groups.resolved.length > 0 ? (
          <MarketSections
            groups={{ ...groups, open: [], closing: [], deciding: [], held: [] }}
            communitySlug={community.slug}
            communityIconUrl={iconUrl}
            jurySize={community.jury_size}
            isOwner={isOwner}
            variant="grid"
            order={['resolved']}
          />
        ) : null}
      </div>
      <aside className="flex flex-col gap-6">
        <YourStakes stakes={home.yourStakes} communitySlug={community.slug} signedIn={signedIn} />
        <PinnedRules slug={community.slug} trust={trust} jurySize={community.jury_size} />
        <TopStakers stakers={home.topStakers} currency={home.currency} />
      </aside>
    </div>
  )
}
