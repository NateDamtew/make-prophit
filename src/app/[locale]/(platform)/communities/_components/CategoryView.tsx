'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useMemo, useState } from 'react'

import type { CommunityCategory } from '@/lib/communities/categories'
import type { ExploreCommunityRow, ExploreData, ExploreMarket } from '@/lib/db/queries/community-explore'

import { CategoryTabs } from '@/components/communities/explore/CategoryTabs'
import { BusiestList, ClosingToday } from '@/components/communities/explore/ExploreSidebar'
import { LiveNowHero } from '@/components/communities/explore/LiveNowHero'
import { QuestionCard } from '@/components/communities/explore/QuestionCard'
import { RecordBars, recordSummary } from '@/components/communities/explore/RecordBars'
import { RecordLegend } from '@/components/communities/explore/RecordLegend'
import { StartCommunityCta } from '@/components/communities/explore/StartCommunityCta'
import { formatCloseLabel, initials } from '@/components/communities/format'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { countLabel } from '@/lib/communities/categories'
import { cn } from '@/lib/utils'

/**
 * One category of communities. The top of the page depends on the
 * category (a front page for news, fixtures for sports, a creators'
 * board, a group finder; anything else gets the live question), the rest
 * is the same everywhere: every community in the category with sort and
 * a verified filter, who is busiest, what closes today, how to read a
 * record, and the call to lead one.
 */

type Sort = 'record' | 'active' | 'newest'

function recordScore(community: ExploreCommunityRow): number {
  const decided = community.record.filter((mark) => mark !== 'pending')
  if (decided.length === 0) {
    return -1
  }
  const stood = decided.filter((mark) => mark === 'stood').length
  return stood / decided.length + decided.length / 100
}

function chipClass(active: boolean) {
  return cn(
    'h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors',
    active ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  )
}

function MarketRow({ market, now, lead }: { market: ExploreMarket; now: number; lead?: string }) {
  const t = useExtracted()
  const locale = useLocale()
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
        {market.closesAt ? formatCloseLabel(market.closesAt, locale, now) : t('Open')}
      </span>
      <span className="min-w-0 flex-1">
        <Link
          href={`/community/${market.communitySlug}/market/${market.id}`}
          className="line-clamp-2 text-sm font-semibold hover:underline"
        >
          {market.title}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {lead ?? market.communityName}
          {market.mainCategorySlug ? ` · ${market.mainCategorySlug}` : ''}
        </span>
      </span>
      <span className="shrink-0 rounded-[10px] bg-yes/15 px-2.5 py-1 text-xs font-bold text-yes tabular-nums">
        {t('Yes {pct}%', { pct: String(Math.round(market.yesChance * 100)) })}
      </span>
    </li>
  )
}

function NewsFrontPage({ data, now }: { data: ExploreData; now: number }) {
  const t = useExtracted()
  const [topic, setTopic] = useState<string | null>(null)
  const top = data.openMarkets[0] ?? null
  const topCommunity = top ? data.communities.find((community) => community.id === top.communityId) : null
  const topics = Array.from(
    new Set(data.openMarkets.map((market) => market.mainCategorySlug).filter((slug): slug is string => Boolean(slug))),
  )
  const rest = data.openMarkets
    .filter((market) => market.id !== top?.id && (!topic || market.mainCategorySlug === topic))
    .slice(0, 6)
  if (!top || !topCommunity) {
    return null
  }
  return (
    <section className="flex flex-col gap-4" aria-label={t("Today's front page")}>
      <h2 className="text-[17px] font-bold">{t("Today's front page")}</h2>
      <LiveNowHero
        market={top}
        record={topCommunity.record}
        memberCount={topCommunity.memberCount}
        more={[]}
        now={now}
        eyebrow={t('Top question, {name}', { name: top.communityName })}
      />
      {top.resolutionSource ? (
        <p className="-mt-2 text-xs text-muted-foreground">{t('Source: {source}', { source: top.resolutionSource })}</p>
      ) : null}
      {topics.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            type="button"
            onClick={() => setTopic(null)}
            aria-pressed={topic === null}
            className={chipClass(topic === null)}
          >
            {t('All topics')}
          </button>
          {topics.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTopic(item)}
              aria-pressed={topic === item}
              className={cn(chipClass(topic === item), 'capitalize')}
            >
              {item.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <ul className="grid gap-2">
          {rest.map((market) => (
            <MarketRow key={market.id} market={market} now={now} lead={market.communityName} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function SportsFixtures({ data, now }: { data: ExploreData; now: number }) {
  const t = useExtracted()
  const locale = useLocale()
  const [league, setLeague] = useState<string | null>(null)
  const leagues = Array.from(new Set(data.openMarkets.flatMap((market) => market.categorySlugs))).slice(0, 8)
  const fixtures = data.openMarkets
    .filter((market) => market.closesAt && (!league || market.categorySlugs.includes(league)))
    .sort((a, b) => (a.closesAt ?? '').localeCompare(b.closesAt ?? ''))
    .slice(0, 12)
  const days = new Map<string, ExploreMarket[]>()
  for (const market of fixtures) {
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(
      new Date(market.closesAt!),
    )
    days.set(day, [...(days.get(day) ?? []), market])
  }
  if (fixtures.length === 0 && !league) {
    return null
  }
  return (
    <section className="flex flex-col gap-4" aria-label={t('Fixtures')}>
      <div>
        <h2 className="text-[17px] font-bold">{t("This week's fixtures")}</h2>
        <p className="text-xs text-muted-foreground">{t('Stakes on every fixture close at kickoff.')}</p>
      </div>
      {leagues.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            type="button"
            onClick={() => setLeague(null)}
            aria-pressed={league === null}
            className={chipClass(league === null)}
          >
            {t('All')}
          </button>
          {leagues.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLeague(item)}
              aria-pressed={league === item}
              className={cn(chipClass(league === item), 'capitalize')}
            >
              {item.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
      ) : null}
      {Array.from(days.entries()).map(([day, markets]) => (
        <div key={day} className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">{day}</h3>
          <ul className="grid gap-2">
            {markets.map((market) => (
              <MarketRow key={market.id} market={market} now={now} />
            ))}
          </ul>
        </div>
      ))}
      {fixtures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('Nothing in that league this week.')}</p>
      ) : null}
    </section>
  )
}

function CreatorsBoard({ data }: { data: ExploreData }) {
  const t = useExtracted()
  const ranked = [...data.communities]
    .filter((community) => community.record.some((mark) => mark !== 'pending'))
    .sort((a, b) => recordScore(b) - recordScore(a))
    .slice(0, 5)
  if (ranked.length === 0) {
    return null
  }
  return (
    <section className="flex flex-col gap-3" aria-label={t('Beat the creator')}>
      <div>
        <h2 className="text-[17px] font-bold">{t('Beat the creator')}</h2>
        <p className="text-xs text-muted-foreground">{t('Ranked by how often their results stood')}</p>
      </div>
      <ol className="grid gap-2">
        {ranked.map((community, index) => (
          <li key={community.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="w-5 text-sm font-bold text-muted-foreground tabular-nums">{index + 1}</span>
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-xs font-bold text-muted-foreground">
              {community.iconUrl ? (
                <img src={community.iconUrl} alt="" className="size-full object-cover" />
              ) : (
                initials(community.name)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <Link href={`/community/${community.slug}`} className="block truncate text-sm font-bold hover:underline">
                {community.name}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">
                {community.topMarket ? community.topMarket.title : recordSummary(community.record)}
              </span>
            </span>
            <RecordBars record={community.record} size="md" />
          </li>
        ))}
      </ol>
    </section>
  )
}

function GroupFinder({ data, category }: { data: ExploreData; category: CommunityCategory }) {
  const t = useExtracted()
  const open = data.communities.filter(
    (community) => !community.joinsPaused && community.memberCount < community.maxMembers,
  )
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label={t('Find your group')}>
      <div className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold">{t('Find your group')}</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('No group is open to join right now.')}</p>
        ) : (
          <ul className="grid gap-2">
            {open.slice(0, 5).map((community) => (
              <li key={community.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-xs font-bold text-muted-foreground">
                  {community.iconUrl ? (
                    <img src={community.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(community.name)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/community/${community.slug}`}
                    className="block truncate text-sm font-bold hover:underline"
                  >
                    {community.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t('{count} members', { count: community.memberCount.toLocaleString('en-US') })}
                    {community.topMarket ? ` · ${community.topMarket.title}` : ''}
                  </span>
                </span>
                <Button size="sm" nativeButton={false} render={<Link href={`/community/${community.slug}`} />}>
                  {community.joined ? t('Open') : t('Join')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t(
            'Invited by a link? Open it from your group’s WhatsApp and you go straight in. Private groups never show up here.',
          )}
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="text-[17px] font-bold">{category.cta.title}</h3>
        <p className="text-sm text-muted-foreground">{category.cta.body}</p>
        <ul className="grid gap-1.5 text-sm">
          <li>· {t('Up to 200 members to start')}</li>
          <li>· {t('Private questions, seen by members only')}</li>
          <li>· {t('Takes about 5 minutes')}</li>
        </ul>
        <div>
          <Button nativeButton={false} render={<Link href="/communities/apply" />}>
            {category.cta.action}
          </Button>
        </div>
      </div>
    </section>
  )
}

export default function CategoryView({
  category,
  data,
  signedIn,
  now,
}: {
  category: CommunityCategory
  data: ExploreData
  signedIn: boolean
  now: number
}) {
  const t = useExtracted()
  const [sort, setSort] = useState<Sort>('active')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const { communities, openMarkets } = data

  const listed = useMemo(() => {
    const items = verifiedOnly ? communities.filter((community) => community.isVerified) : communities
    return [...items].sort((a, b) => {
      if (sort === 'newest') {
        return b.createdAt.localeCompare(a.createdAt)
      }
      if (sort === 'record') {
        return recordScore(b) - recordScore(a)
      }
      const staked = BigInt(b.staked7dMinor) - BigInt(a.staked7dMinor)
      if (staked !== 0n) {
        return staked > 0n ? 1 : -1
      }
      return b.openMarkets - a.openMarkets || b.memberCount - a.memberCount
    })
  }, [communities, sort, verifiedOnly])

  const openToJoin = communities.filter(
    (community) => !community.joinsPaused && community.memberCount < community.maxMembers,
  ).length
  const count =
    category.layout === 'groups'
      ? t('{count}, {open} open to join', { count: countLabel(category, communities.length), open: String(openToJoin) })
      : countLabel(category, communities.length)
  const live = openMarkets[0] ?? null
  const liveCommunity = live ? communities.find((community) => community.id === live.communityId) : null

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <CategoryTabs current={category.slug} />
        <div>
          <Link
            href="/communities"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
            {t('Communities')}
          </Link>
          <h1 className="mt-2 text-[26px]/tight font-bold">{category.title}</h1>
          <p className="mt-1 hidden max-w-2xl text-sm/relaxed text-muted-foreground sm:block">{category.blurb}</p>
          <p className="mt-1 text-sm/relaxed text-muted-foreground sm:hidden">{category.blurbShort}</p>
          <p className="mt-2 text-xs font-semibold text-muted-foreground tabular-nums">{count}</p>
        </div>
      </header>

      {category.layout === 'news' ? <NewsFrontPage data={data} now={now} /> : null}
      {category.layout === 'sports' ? <SportsFixtures data={data} now={now} /> : null}
      {category.layout === 'creators' ? <CreatorsBoard data={data} /> : null}
      {category.layout === 'groups' ? <GroupFinder data={data} category={category} /> : null}
      {category.layout === 'default' && live && liveCommunity ? (
        <LiveNowHero
          market={live}
          record={liveCommunity.record}
          memberCount={liveCommunity.memberCount}
          more={openMarkets.filter((market) => market.communityId !== live.communityId).slice(0, 2)}
          now={now}
          eyebrow={category.exploreTitle}
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex flex-col gap-4" aria-label={t('All {title}', { title: category.title.toLowerCase() })}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[17px] font-bold">{t('All {title}', { title: category.title.toLowerCase() })}</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(event) => setVerifiedOnly(event.target.checked)}
                  className="size-4"
                />
                {t('Verified only')}
              </label>
              <label className="inline-flex items-center gap-2">
                {t('Sort')}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                  className="h-9 rounded-[10px] border border-border bg-background px-2 text-sm"
                >
                  <option value="record">{t('Best record')}</option>
                  <option value="active">{t('Most active')}</option>
                  <option value="newest">{t('Newest')}</option>
                </select>
              </label>
            </div>
          </div>
          {listed.length === 0 ? (
            <EmptyState
              dashed
              title={verifiedOnly ? t('No verified ones yet') : t('None yet')}
              body={verifiedOnly ? t('Clear the filter to see every one.') : t('Be the first to lead one here.')}
              action={
                verifiedOnly ? (
                  <Button variant="secondary" onClick={() => setVerifiedOnly(false)}>
                    {t('Show all')}
                  </Button>
                ) : (
                  <Button nativeButton={false} render={<Link href="/communities/apply" />}>
                    {category.cta.action}
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {listed.map((community) => (
                <QuestionCard key={community.id} community={community} now={now} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <BusiestList
            communities={communities}
            title={t('Busiest {title}', { title: category.title.toLowerCase() })}
            subtitle={
              category.layout === 'groups'
                ? t('Money staked in the last 7 days. Private groups aren’t ranked.')
                : t('Money staked in the last 7 days')
            }
          />
          <ClosingToday markets={openMarkets} now={now} />
          <RecordLegend noun={category.recordNoun} />
        </aside>
      </div>

      {category.layout !== 'groups' ? (
        <StartCommunityCta title={category.cta.title} body={category.cta.body} action={category.cta.action} />
      ) : null}

      {!signedIn ? (
        <p className="text-center text-xs text-muted-foreground">
          {t('Sign up to join a community and make your first call.')}
        </p>
      ) : null}
    </div>
  )
}
