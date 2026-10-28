'use client'

import { SearchIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useMemo, useState } from 'react'

import type { LeaderType } from '@/lib/communities/rules'
import type { ExploreCommunity } from '@/lib/db/queries/community-home'
import type { PoolCardSummary } from '@/lib/pools/activity'

import PoolMarketCard from '@/app/[locale]/(platform)/community/[slug]/_components/classic/PoolMarketCard'
import { CommunityCard } from '@/components/communities/cards/CommunityCard'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Explore: every public community, filtered by who leads it, with the
 * markets people are staking on right now up top. A leader can apply from
 * here.
 */

interface FeaturedMarket {
  id: string
  title: string
  description: string | null
  resolution_date: Date | null
  status: string
  created_at: Date
  event_id?: string | null
  image_url?: string | null
  resolved_outcome?: string | null
  pool?: PoolCardSummary | null
  community_id: string
  community_slug: string
  community_name: string
  community_icon: string | null
}

type Chip = 'all' | 'joined' | 'verified' | LeaderType

interface CommunitiesBrowseProps {
  communities: ExploreCommunity[]
  featuredMarkets: FeaturedMarket[]
  signedIn: boolean
}

export default function CommunitiesBrowse({ communities, featuredMarkets, signedIn }: CommunitiesBrowseProps) {
  const t = useExtracted()
  const [chip, setChip] = useState<Chip>('all')
  const [search, setSearch] = useState('')
  const joinedCount = communities.filter((community) => community.joined).length

  const chips: Array<{ id: Chip; label: string }> = [
    { id: 'all', label: t('All') },
    ...(joinedCount > 0 ? [{ id: 'joined' as const, label: t('Joined') }] : []),
    { id: 'verified', label: t('Verified') },
    { id: 'news', label: t('News') },
    { id: 'sports', label: t('Sports') },
    { id: 'creator', label: t('Creators') },
    { id: 'group', label: t('Groups') },
    { id: 'event', label: t('Events') },
  ]

  const filtered = useMemo(() => {
    let list = communities
    if (chip === 'joined') {
      list = list.filter((community) => community.joined)
    } else if (chip === 'verified') {
      list = list.filter((community) => community.isVerified)
    } else if (chip !== 'all') {
      list = list.filter((community) => community.leaderType === chip)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (community) => community.name.toLowerCase().includes(q) || community.description?.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => {
      const volume = BigInt(b.volume30dMinor) - BigInt(a.volume30dMinor)
      if (volume !== 0n) {
        return volume > 0n ? 1 : -1
      }
      if (b.openMarkets !== a.openMarkets) {
        return b.openMarkets - a.openMarkets
      }
      return b.memberCount - a.memberCount
    })
  }, [communities, chip, search])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px]/tight font-bold">{t('Communities')}</h1>
          <p className="mt-1 max-w-2xl text-sm/relaxed text-muted-foreground">
            {t('Questions run by people you follow, resolved by a jury that shows its work, paid in your money.')}
          </p>
        </div>
        <Button variant="secondary" nativeButton={false} render={<Link href="/communities/apply" />}>
          {t('Lead a community')}
        </Button>
      </div>

      {featuredMarkets.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label={t('Staking now')}>
          <h2 className="text-[17px] font-bold">{t('Staking now')}</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {featuredMarkets.slice(0, 6).map((market) => (
              <div key={market.id} className="w-80 shrink-0 lg:w-auto">
                <PoolMarketCard
                  market={{
                    ...market,
                    event_id: market.event_id ?? null,
                    resolved_outcome: market.resolved_outcome ?? null,
                    resolution_source: null,
                    resolution_rules: null,
                  }}
                  communitySlug={market.community_slug}
                  communityIconUrl={market.community_icon}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-label={t('All communities')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {chips.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChip(item.id)}
                aria-pressed={chip === item.id}
                className={cn(
                  'h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors',
                  chip === item.id
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <SearchIcon
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Search communities')}
              className="h-10 rounded-md pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            dashed
            title={
              search
                ? t('Nothing matches that search')
                : chip === 'joined'
                  ? t('You have not joined a community yet')
                  : t('No communities here yet')
            }
            body={
              chip === 'all' && !search
                ? t('Communities open as leaders are approved. Apply to lead one and yours can be first.')
                : t('Try another filter, or clear the search.')
            }
            action={
              chip === 'all' && !search ? (
                <Button nativeButton={false} render={<Link href="/communities/apply" />}>
                  {t('Apply to lead')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setChip('all')
                    setSearch('')
                  }}
                >
                  {t('Show all')}
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((community) => (
              <CommunityCard
                key={community.id}
                slug={community.slug}
                name={community.name}
                description={community.description}
                iconUrl={community.iconUrl}
                level={community.level}
                levelName={community.levelName}
                isVerified={community.isVerified}
                leaderType={community.leaderType}
                memberCount={community.memberCount}
                maxMembers={community.maxMembers}
                openMarkets={community.openMarkets}
                volume30dMinor={community.volume30dMinor}
                currency={community.currency}
                rating={community.rating}
                joined={community.joined}
                joinsPaused={community.joinsPaused}
              />
            ))}
          </div>
        )}
      </section>

      {!signedIn ? (
        <p className="text-center text-xs text-muted-foreground">
          {t('Sign up with your email to join a community and make your first call.')}
        </p>
      ) : null}
    </div>
  )
}
