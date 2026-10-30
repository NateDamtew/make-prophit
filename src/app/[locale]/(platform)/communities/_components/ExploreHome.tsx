'use client'

import { useExtracted } from 'next-intl'

import type { CommunityCategory } from '@/lib/communities/categories'
import type { ExploreCommunityRow, ExploreData } from '@/lib/db/queries/community-explore'
import type { HomeFeedLiveItem } from '@/lib/home-feed-types'

import HomeFeedLiveStrip from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedLiveStrip'
import { HomeFeedSectionHeading } from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { CategoryTabs } from '@/components/communities/explore/CategoryTabs'
import {
  BusiestList,
  ClosingToday,
  EXPLORE_ROW_CLASS,
  EXPLORE_ROW_ITEM_CLASS,
  LeadPanel,
  YourCommunities,
} from '@/components/communities/explore/ExploreSidebar'
import { FeaturedRotation } from '@/components/communities/explore/LiveNowHero'
import { QuestionCard } from '@/components/communities/explore/QuestionCard'
import { RecordLegend } from '@/components/communities/explore/RecordLegend'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { COMMUNITY_CATEGORIES } from '@/lib/communities/categories'

/**
 * Explore is the Trending page with community types in place of market
 * categories: the featured community beside who is busiest this week, a
 * live strip, then your communities and one card row per community type,
 * with closing today, the record key and the call to start a community
 * in the side column. On phones the rows scroll sideways.
 */

const CARDS_PER_ROW = 3

function byActivity(a: ExploreCommunityRow, b: ExploreCommunityRow) {
  const staked = BigInt(b.staked7dMinor) - BigInt(a.staked7dMinor)
  if (staked !== 0n) {
    return staked > 0n ? 1 : -1
  }
  const volume = BigInt(b.volume30dMinor) - BigInt(a.volume30dMinor)
  if (volume !== 0n) {
    return volume > 0n ? 1 : -1
  }
  return b.memberCount - a.memberCount
}

/** The Explore sections: one per category that has its own section, with the categories folded into it. */
function exploreSections(communities: ExploreCommunityRow[]) {
  return COMMUNITY_CATEGORIES.filter((category) => !category.exploreUnder).map((category) => {
    const types = [category.leaderType, ...(category.alsoLists?.leaderTypes ?? [])]
    return {
      category,
      title: category.alsoLists?.title ?? category.title,
      communities: communities.filter((community) => community.leaderType && types.includes(community.leaderType)),
    }
  })
}

export default function ExploreHome({ data, signedIn, now }: { data: ExploreData; signedIn: boolean; now: number }) {
  const t = useExtracted()
  const { communities, openMarkets, yourCommunities, featured } = data
  const ranked = [...communities].sort(byActivity)
  // A type gets a row only when it has a community with an open question; nothing is listed for its own sake.
  const sections = exploreSections(ranked).filter((section) =>
    section.communities.some((community) => community.topMarket),
  )
  const uncategorised = ranked.filter((community) => community.leaderType === null)
  const liveItems: HomeFeedLiveItem[] = openMarkets.slice(0, 12).map((market) => {
    const lead = market.outcomes?.[0]
    return {
      id: market.id,
      title: market.title,
      href: `/community/${market.communitySlug}/market/${market.id}`,
      iconUrl: market.communityIcon,
      chance: lead
        ? lead.chance * 100
        : market.yesChance >= 0.5
          ? market.yesChance * 100
          : (1 - market.yesChance) * 100,
      leadLabel: lead ? lead.label : market.yesChance >= 0.5 ? t('Yes') : t('No'),
      isUpDown: false,
      isLive: true,
    }
  })

  function row(items: ExploreCommunityRow[], seeAllHref?: string, category?: CommunityCategory) {
    return (
      <div className={EXPLORE_ROW_CLASS}>
        {items.slice(0, CARDS_PER_ROW).map((community) => (
          <QuestionCard key={community.id} community={community} className={EXPLORE_ROW_ITEM_CLASS} />
        ))}
        {seeAllHref && category ? (
          <Link
            href={seeAllHref}
            className={`${EXPLORE_ROW_ITEM_CLASS} flex items-center justify-center rounded-2xl border border-dashed border-muted-foreground/40 p-4 text-sm font-semibold text-muted-foreground sm:hidden`}
          >
            {t('See all {title}', { title: category.title.toLowerCase() })}
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">{t('Communities')}</h1>
      <CategoryTabs current={null} typeCounts={data.typeCounts} />

      {featured.length > 0 ? (
        <div className="flex flex-wrap items-stretch gap-6">
          <div className="min-w-0 flex-[999_1_560px]">
            <FeaturedRotation featured={featured} markets={openMarkets} communities={communities} now={now} />
          </div>
          <div className="hidden min-w-0 flex-[1_1_260px] lg:flex lg:max-w-[300px]">
            <BusiestList
              communities={communities}
              title={t('Busiest this week')}
              subtitle={t('Money staked in the last 7 days')}
              note={t(
                'Every community names who decides its results. Payouts wait 24 hours so anyone who staked can appeal.',
              )}
            />
          </div>
        </div>
      ) : null}

      <HomeFeedLiveStrip items={liveItems} />

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-12">
          {signedIn ? <YourCommunities items={yourCommunities} signedIn={signedIn} now={now} /> : null}
          <ClosingToday markets={openMarkets} now={now} className="lg:hidden" />

          {communities.length === 0 ? (
            <EmptyState
              dashed
              title={t('No communities here yet')}
              body={t('Communities open as they are approved. Start one and yours can be first.')}
              action={
                <Button nativeButton={false} render={<Link href="/communities/apply" />}>
                  {t('Start a community')}
                </Button>
              }
            />
          ) : null}

          {sections.map(({ category, title, communities: items }) => (
            <section key={category.slug} aria-labelledby={`explore-${category.slug}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <HomeFeedSectionHeading id={`explore-${category.slug}`} href={`/communities/${category.slug}`}>
                  {title}
                </HomeFeedSectionHeading>
                <p className="flex items-center gap-4 text-[13px] text-muted-foreground">
                  <span className="hidden sm:inline">{category.tagline}</span>
                  <Link
                    href={`/communities/${category.slug}`}
                    className="font-semibold text-foreground hover:text-primary"
                  >
                    {t('See all')}
                  </Link>
                </p>
              </div>
              {row(items, `/communities/${category.slug}`, category)}
            </section>
          ))}

          {uncategorised.length > 0 ? (
            <section aria-labelledby="explore-more">
              <div className="mb-4">
                <HomeFeedSectionHeading id="explore-more">{t('More communities')}</HomeFeedSectionHeading>
              </div>
              {row(uncategorised)}
            </section>
          ) : null}
        </div>

        <aside aria-label={t('Sidebar')} className="flex min-w-0 flex-[1_1_300px] flex-col gap-6 lg:max-w-[340px]">
          <ClosingToday markets={openMarkets} now={now} className="hidden lg:block" />
          <RecordLegend noun={t("that community's")} />
          <LeadPanel
            title={t('Got an audience?')}
            body={t(
              'Newsrooms, fan pages, creators, chamas. Ask your people questions and earn a share of every pool.',
            )}
            action={t('Start a community')}
          />
        </aside>
      </div>
    </div>
  )
}
