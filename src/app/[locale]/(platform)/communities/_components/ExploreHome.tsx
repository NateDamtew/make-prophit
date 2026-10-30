'use client'

import { useExtracted } from 'next-intl'

import type { ExploreData } from '@/lib/db/queries/community-explore'

import { CategoryTabs } from '@/components/communities/explore/CategoryTabs'
import { BusiestList, ClosingToday, LiveTicker, YourCommunities } from '@/components/communities/explore/ExploreSidebar'
import { LiveNowHero } from '@/components/communities/explore/LiveNowHero'
import { QuestionCard } from '@/components/communities/explore/QuestionCard'
import { RecordLegend } from '@/components/communities/explore/RecordLegend'
import { StartCommunityCta } from '@/components/communities/explore/StartCommunityCta'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { COMMUNITY_CATEGORIES } from '@/lib/communities/categories'

/**
 * Explore, option A of the board: the biggest live question up top with
 * the busiest communities beside it; your communities; then one section
 * per category with three cards each; closing today; how to read a
 * record; the call to lead one. On phones the side column folds in
 * after your communities.
 */
export default function ExploreHome({ data, signedIn, now }: { data: ExploreData; signedIn: boolean; now: number }) {
  const t = useExtracted()
  const { communities, openMarkets, yourCommunities } = data
  const live = openMarkets[0] ?? null
  const liveCommunity = live ? communities.find((community) => community.id === live.communityId) : null
  const byActivity = [...communities].sort((a, b) => {
    const staked = BigInt(b.staked7dMinor) - BigInt(a.staked7dMinor)
    if (staked !== 0n) {
      return staked > 0n ? 1 : -1
    }
    const volume = BigInt(b.volume30dMinor) - BigInt(a.volume30dMinor)
    if (volume !== 0n) {
      return volume > 0n ? 1 : -1
    }
    return b.memberCount - a.memberCount
  })
  const sections = COMMUNITY_CATEGORIES.map((category) => ({
    category,
    communities: byActivity.filter((community) => community.leaderType === category.leaderType),
  })).filter((section) => section.communities.length > 0)
  const uncategorised = byActivity.filter((community) => community.leaderType === null)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px]/tight font-bold">{t('Communities')}</h1>
            <p className="mt-1 max-w-2xl text-sm/relaxed text-muted-foreground">
              {t('Questions run by people you follow, decided by named jurors, paid in your money.')}
            </p>
          </div>
          <Button variant="secondary" nativeButton={false} render={<Link href="/communities/apply" />}>
            {t('Lead a community')}
          </Button>
        </div>
        <CategoryTabs current={null} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-8">
          {live && liveCommunity ? (
            <LiveNowHero
              market={live}
              record={liveCommunity.record}
              memberCount={liveCommunity.memberCount}
              more={openMarkets.filter((market) => market.communityId !== live.communityId).slice(0, 2)}
              now={now}
            />
          ) : null}

          <YourCommunities items={yourCommunities} signedIn={signedIn} now={now} />
          <ClosingToday markets={openMarkets} now={now} className="lg:hidden" />

          {communities.length === 0 ? (
            <EmptyState
              dashed
              title={t('No communities here yet')}
              body={t('Communities open as leaders are approved. Apply to lead one and yours can be first.')}
              action={
                <Button nativeButton={false} render={<Link href="/communities/apply" />}>
                  {t('Apply to lead')}
                </Button>
              }
            />
          ) : null}
          {sections.map(({ category, communities: items }) => (
            <section key={category.slug} className="flex flex-col gap-3" aria-label={category.title}>
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <h2 className="text-[17px] font-bold">{category.title}</h2>
                  <p className="text-[13px] text-muted-foreground">{category.tagline}</p>
                </div>
                <Link
                  href={`/communities/${category.slug}`}
                  className="shrink-0 text-[13px] font-semibold text-foreground hover:underline"
                >
                  {t('See all')}
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.slice(0, 3).map((community) => (
                  <QuestionCard key={community.id} community={community} />
                ))}
              </div>
            </section>
          ))}
          {uncategorised.length > 0 ? (
            <section className="flex flex-col gap-3" aria-label={t('More communities')}>
              <h2 className="text-[17px] font-bold">{t('More communities')}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {uncategorised.slice(0, 6).map((community) => (
                  <QuestionCard key={community.id} community={community} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <BusiestList
            communities={communities}
            title={t('Busiest this week')}
            subtitle={t('Money staked in the last 7 days')}
          />
          <LiveTicker markets={openMarkets} />
          <ClosingToday markets={openMarkets} now={now} className="hidden lg:block" />
          <RecordLegend noun={t("that community's")} />
        </aside>
      </div>

      <StartCommunityCta
        title={t('Got an audience?')}
        body={t('Newsrooms, fan pages, creators, chamas. Ask your people questions and earn a share of every pool.')}
        action={t('Start a community')}
      />

      {!signedIn ? (
        <p className="text-center text-xs text-muted-foreground">
          {t('Sign up to join a community and make your first call.')}
        </p>
      ) : null}
    </div>
  )
}
