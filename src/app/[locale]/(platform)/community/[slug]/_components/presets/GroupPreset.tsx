'use client'

import { useExtracted } from 'next-intl'

import { initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'

import type { PresetProps } from './types'

import MarketSections from '../home/MarketSections'
import SignedOutPitch from '../home/SignedOutPitch'
import TopStakers from '../home/TopStakers'
import { useHomeData } from '../home/useHomeData'
import YourStakes from '../home/YourStakes'
import PinnedRules from '../shell/PinnedRules'

/**
 * Group: a plain grid of questions with your stakes and the members beside
 * it. For chamas, offices, classmates and friends.
 */
export default function GroupPreset(props: PresetProps) {
  const t = useExtracted()
  const { community, members, trust, home } = props
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
        ) : null}
        <MarketSections
          groups={groups}
          communitySlug={community.slug}
          communityIconUrl={iconUrl}
          jurySize={community.jury_size}
          isOwner={isOwner}
          variant="grid"
          skipLeadId={!signedIn ? (lead?.id ?? null) : null}
        />
      </div>
      <aside className="flex flex-col gap-6">
        <YourStakes stakes={home.yourStakes} communitySlug={community.slug} signedIn={signedIn} />
        <section className="flex flex-col gap-3" aria-label={t('Members')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold">{t('Members')}</h2>
            <Link
              href={`/community/${community.slug}?tab=members`}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {t('All {count}', { count: String(members.length) })}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.slice(0, 12).map((member) => (
              <span
                key={member.user_id}
                title={member.username ?? undefined}
                className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold"
              >
                {member.image ? (
                  <img src={member.image} alt="" className="size-full object-cover" />
                ) : (
                  initials(member.username)
                )}
              </span>
            ))}
          </div>
        </section>
        <TopStakers stakers={home.topStakers} currency={home.currency} />
        <PinnedRules slug={community.slug} trust={trust} jurySize={community.jury_size} />
      </aside>
    </div>
  )
}
